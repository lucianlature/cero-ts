/**
 * DurableWorkflow - Workflow subclass with built-in durability.
 *
 * Extends the base Workflow with:
 * - **Durable steps** (`step()`) — named, checkpointed operations that survive restarts
 * - **Durable conditions** — `condition()` with persistent timers
 * - **Durable sleep** — `sleep()` with persistent deadlines
 * - **Signal logging** — all received signals are persisted to the event log
 * - **Automatic checkpoints** — state snapshots after each step/condition for fast recovery
 *
 * During replay (recovery), completed steps are skipped, signals are re-delivered
 * from the event log, and conditions resolve from recorded history. The workflow's
 * `work()` method must be **deterministic** — it must make the same sequence of
 * `step()`, `condition()`, and `sleep()` calls on every execution.
 *
 * @example
 * ```typescript
 * import { DurableWorkflow, InMemoryWorkflowStore } from 'cero-ts/durable';
 *
 * const store = new InMemoryWorkflowStore();
 *
 * class OrderSaga extends DurableWorkflow<OrderContext> {
 *   async work() {
 *     this.setHandler(inventorySignal, (payload) => {
 *       this.inventoryReserved = true;
 *     });
 *
 *     await this.step('reserve_inventory', async () => {
 *       await publishCommand('inventory.reserve', { orderId: this.context.orderId });
 *     });
 *
 *     const received = await this.condition(() => this.inventoryReserved, '30s');
 *     if (!received) this.fail('Inventory reservation timed out');
 *
 *     await this.step('capture_payment', async () => {
 *       await publishCommand('payment.capture', { orderId: this.context.orderId });
 *     });
 *   }
 * }
 *
 * const handle = OrderSaga.startDurable({ orderId: '123' }, { store });
 * ```
 */

import { Workflow } from '../workflow/pipeline.js';
import { WorkflowHandle, type MessageReceiver } from '../workflow/handle.js';
import { cancelAllConditions } from '../workflow/condition.js';
import type { Duration } from '../workflow/condition.js';
import { parseDuration } from '../workflow/condition.js';
import type { Result } from '../result.js';
import type { ExecuteOptions } from '../task.js';
import { DurableExecution } from './execution.js';
import { DurableWorkflowHandle } from './handle.js';
import type { DurableStartOptions, DurableRecoverOptions, WorkflowEvent } from './types.js';

export abstract class DurableWorkflow<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> extends Workflow<TContext> {
  /**
   * The durable execution context.
   * Present when running in durable mode (startDurable/recover).
   * @internal
   */
  _execution?: DurableExecution;

  // ============================================
  // Durable Step Execution
  // ============================================

  /**
   * Execute a named, durable step.
   *
   * During **live** execution, the function runs normally and its result
   * is persisted to the event log. A checkpoint is saved after completion.
   *
   * During **replay** (recovery), completed steps are skipped and the
   * recorded result is returned without executing the function.
   *
   * Step names must be unique within a workflow execution.
   * Step results must be JSON-serializable (they're persisted).
   *
   * @param name - Unique identifier for this step
   * @param fn - The function to execute
   * @returns The function's return value
   *
   * @example
   * ```typescript
   * const orderId = await this.step('create_order', async () => {
   *   return await db.orders.create({ amount: 100 });
   * });
   * ```
   */
  protected async step<R>(name: string, fn: () => R | Promise<R>): Promise<R> {
    if (this._execution) {
      return this._execution.executeStep(name, fn);
    }
    // Not in durable mode — execute directly
    return fn();
  }

  // ============================================
  // Durable Sleep
  // ============================================

  /**
   * Sleep for a specified duration (durable — survives restarts).
   *
   * During **replay**, if the timer has already elapsed, resolves immediately.
   * If partially elapsed, sleeps only for the remaining time.
   *
   * @param duration - How long to sleep ('30s', '5m', '1h', '2d', etc.)
   *
   * @example
   * ```typescript
   * await this.sleep('1h'); // Survives process restarts
   * ```
   */
  protected async sleep(duration: Duration): Promise<void> {
    if (this._execution) {
      return this._execution.sleepDurable(duration);
    }
    // Not in durable mode — plain setTimeout
    const ms = parseDuration(duration);
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // Durable Condition (override)
  // ============================================

  /**
   * Block until a predicate is true, or timeout expires (durable).
   *
   * In durable mode, the condition's timer deadline is persisted.
   * On recovery, remaining time is recalculated from the stored deadline.
   * Signals received between scheduling and resolution are replayed
   * to reconstruct the correct state.
   */
  protected override condition(
    predicate: () => boolean,
    timeout?: Duration,
  ): Promise<boolean> {
    if (this._execution) {
      return this._execution.conditionDurable(
        // Pass a factory that calls the real (parent) condition
        (pred, tout) => super.condition(pred, tout),
        predicate,
        timeout,
      );
    }
    return super.condition(predicate, timeout);
  }

  // ============================================
  // Signal Interception
  // ============================================

  /**
   * Receive a signal — logs to event store in durable mode.
   * @internal
   */
  override _receiveSignal(name: string, args: unknown[]): void {
    // Log the signal if we're in live mode (not replaying signals from log)
    if (this._execution && !this._execution.isReplaying && !this._execution.isDeliveringReplaySignals) {
      void this._execution.appendEvent({
        type: 'signal.received',
        signal: name,
        payload: args,
      });
    }

    super._receiveSignal(name, args);
  }

  // ============================================
  // Static: Start Durable Workflow
  // ============================================

  /**
   * Start a new durable workflow execution.
   *
   * Unlike `start()`, this persists all events and checkpoints to the
   * provided WorkflowStore, enabling recovery after process restarts.
   *
   * @param args - Initial arguments merged into context
   * @param options - Durable options (store is required)
   * @returns A DurableWorkflowHandle for interacting with the running workflow
   *
   * @example
   * ```typescript
   * const store = new InMemoryWorkflowStore();
   * const handle = OrderSaga.startDurable({ orderId: '123' }, { store });
   *
   * handle.signal(approvalSignal, { approved: true });
   * const result = await handle.result();
   * ```
   */
  static startDurable<T extends Record<string, unknown>>(
    this: new () => DurableWorkflow<T>,
    args?: Record<string, unknown>,
    options?: DurableStartOptions,
  ): DurableWorkflowHandle<T> {
    if (!options?.store) {
      throw new Error('WorkflowStore is required for durable workflows. Pass { store } in options.');
    }

    // biome-ignore lint/complexity/noThisInStatic: required for polymorphic static pattern
    const instance = new this();

    // Override ID if provided
    if (options.workflowId) {
      Object.defineProperty(instance, 'id', {
        value: options.workflowId,
        writable: false,
        configurable: true,
      });
    }

    const workflowType = instance.constructor.name;

    // Create the durable execution context
    const execution = new DurableExecution({
      workflowId: instance.id,
      workflowType,
      store: options.store,
    });

    instance._execution = execution;
    execution.setWorkflow(instance);

    // Log workflow start event
    void execution.appendEvent({
      type: 'workflow.started',
      workflowType,
      args: args ?? {},
    });

    // Start execution (runs in background via microtask)
    const resultPromise = (
      instance as unknown as {
        _execute: (args?: Record<string, unknown>, options?: ExecuteOptions) => Promise<Result<T>>;
      }
    )._execute(args);

    // Handle completion: log final event and mark completed
    const wrappedPromise = resultPromise.then(async (result) => {
      // Cancel any pending conditions
      cancelAllConditions(
        (instance as unknown as { _conditionWaiters: import('../workflow/condition.js').ConditionWaiter[] })
          ._conditionWaiters,
      );

      if (result.success) {
        await execution.appendEvent({
          type: 'workflow.completed',
          result: { ...result.toJSON() },
        });
        await execution.saveFinalCheckpoint('completed');
      } else {
        await execution.appendEvent({
          type: 'workflow.failed',
          error: result.reason ?? 'Unknown error',
        });
        await execution.saveFinalCheckpoint('failed');
      }

      return result;
    });

    return new DurableWorkflowHandle<T>(
      instance.id,
      instance as unknown as MessageReceiver,
      wrappedPromise,
      execution,
    );
  }

  // ============================================
  // Static: Recover Durable Workflow
  // ============================================

  /**
   * Recover a previously running workflow from the store.
   *
   * Loads events and checkpoint, creates a new instance, and replays
   * the workflow from the last checkpoint. Completed steps are skipped,
   * signals are re-delivered, and execution resumes from where it left off.
   *
   * @param options - Recovery options (store and workflowId required)
   * @returns A DurableWorkflowHandle for the recovered workflow
   *
   * @example
   * ```typescript
   * const handle = await OrderSaga.recover({
   *   store,
   *   workflowId: 'wf_abc123',
   * });
   *
   * const result = await handle.result();
   * ```
   */
  static async recover<T extends Record<string, unknown>>(
    this: new () => DurableWorkflow<T>,
    options: DurableRecoverOptions,
  ): Promise<DurableWorkflowHandle<T>> {
    const { store, workflowId } = options;

    // Load events and checkpoint
    const checkpoint = options.checkpoint !== undefined
      ? options.checkpoint
      : await store.getLatestCheckpoint(workflowId);

    const allEvents = options.events ?? await store.getEvents(workflowId);

    // Filter to events after checkpoint (for replay)
    const replayEvents = checkpoint
      ? allEvents.filter((e) => e.sequence > checkpoint.sequence)
      : allEvents;

    // Extract original args from the workflow.started event
    const startEvent = allEvents.find((e) => e.type === 'workflow.started');
    const originalArgs = startEvent?.type === 'workflow.started'
      ? startEvent.args
      : {};

    // Create the execution context in replay mode
    const workflowType = (this as unknown as { name: string }).name;
    const execution = new DurableExecution({
      workflowId,
      workflowType,
      store,
      events: replayEvents,
      checkpoint,
    });

    // Create a new instance of the workflow class
    // biome-ignore lint/complexity/noThisInStatic: required for polymorphic static pattern
    const instance = new this();

    // Override the auto-generated ID with the recovered one
    Object.defineProperty(instance, 'id', {
      value: workflowId,
      writable: false,
      configurable: true,
    });

    instance._execution = execution;
    execution.setWorkflow(instance);

    // Restore context from checkpoint if available
    if (checkpoint) {
      instance.context.merge(checkpoint.context as Partial<T>);
    }

    // Start execution — work() will replay completed steps and resume
    const resultPromise = (
      instance as unknown as {
        _execute: (args?: Record<string, unknown>, options?: ExecuteOptions) => Promise<Result<T>>;
      }
    )._execute(originalArgs);

    // Handle completion
    const wrappedPromise = resultPromise.then(async (result) => {
      cancelAllConditions(
        (instance as unknown as { _conditionWaiters: import('../workflow/condition.js').ConditionWaiter[] })
          ._conditionWaiters,
      );

      if (result.success) {
        await execution.appendEvent({
          type: 'workflow.completed',
          result: { ...result.toJSON() },
        });
        await execution.saveFinalCheckpoint('completed');
      } else {
        await execution.appendEvent({
          type: 'workflow.failed',
          error: result.reason ?? 'Unknown error',
        });
        await execution.saveFinalCheckpoint('failed');
      }

      return result;
    });

    return new DurableWorkflowHandle<T>(
      instance.id,
      instance as unknown as MessageReceiver,
      wrappedPromise,
      execution,
    );
  }
}
