/**
 * Workflow Pipeline - Sequential and parallel task composition
 * with interactive message passing (Signals, Queries, Conditions).
 */

import { Task, type TaskClass, type TaskSettings, type ExecuteOptions } from '../task.js';
import { createContext } from '../context.js';
import type { Result } from '../result.js';
import type { Status } from '../result.js';
import type {
  SignalDefinition,
  QueryDefinition,
  SignalHandler,
  QueryHandler,
} from './messages.js';
import {
  type Duration,
  type ConditionWaiter,
  createConditionWaiter,
  evaluateConditions,
  cancelAllConditions,
} from './condition.js';
import { WorkflowHandle, type MessageReceiver } from './handle.js';

/**
 * Task entry in a workflow
 */
export interface TaskEntry<T extends Record<string, unknown> = Record<string, unknown>> {
  task: TaskClass<T>;
  if?: string | ((workflow: Workflow) => boolean);
  unless?: string | ((workflow: Workflow) => boolean);
  breakpoints?: Status[];
}

/**
 * Task group entry in a workflow
 */
export interface TaskGroupEntry<T extends Record<string, unknown> = Record<string, unknown>> {
  tasks: TaskClass<T>[];
  if?: string | ((workflow: Workflow) => boolean);
  unless?: string | ((workflow: Workflow) => boolean);
  breakpoints?: Status[];
  strategy?: 'sequential' | 'parallel';
}

/**
 * Workflow task definition (can be class, entry, or group)
 */
export type WorkflowTaskDefinition<T extends Record<string, unknown> = Record<string, unknown>> =
  | TaskClass<T>
  | TaskEntry<T>
  | TaskGroupEntry<T>;

/**
 * Check if definition is a task entry
 */
function isTaskEntry<T extends Record<string, unknown>>(
  def: WorkflowTaskDefinition<T>
): def is TaskEntry<T> {
  return typeof def === 'object' && 'task' in def;
}

/**
 * Check if definition is a task group entry
 */
function isTaskGroupEntry<T extends Record<string, unknown>>(
  def: WorkflowTaskDefinition<T>
): def is TaskGroupEntry<T> {
  return typeof def === 'object' && 'tasks' in def;
}

/**
 * Workflow class for composing multiple tasks into interactive pipelines.
 *
 * Supports two execution modes:
 * - **Pipeline mode** (`execute`/`executeStrict`): Fire-and-forget, runs static `tasks` array.
 * - **Interactive mode** (`start`): Returns a `WorkflowHandle` for sending Signals,
 *   executing Queries, and using `condition()` to wait for external events.
 *
 * @example Pipeline mode (backward-compatible)
 * ```typescript
 * class OnboardingWorkflow extends Workflow {
 *   static tasks = [
 *     CreateUserProfile,
 *     SetupAccountPreferences,
 *     { task: SendWelcomeEmail, if: 'emailConfigured' },
 *   ];
 * }
 *
 * const result = await OnboardingWorkflow.execute({ userId: 1 });
 * ```
 *
 * @example Interactive mode (Signals, Queries, Conditions)
 * ```typescript
 * const approvalSignal = defineSignal<[{ approved: boolean }]>('approval');
 * const statusQuery = defineQuery<string>('status');
 *
 * class ApprovalWorkflow extends Workflow<ApprovalContext> {
 *   async work() {
 *     let status = 'pending';
 *     let approval: { approved: boolean } | undefined;
 *
 *     this.setHandler(approvalSignal, (input) => {
 *       approval = input;
 *       status = input.approved ? 'approved' : 'rejected';
 *     });
 *     this.setHandler(statusQuery, () => status);
 *
 *     // Run prerequisite tasks
 *     await this.runTasks();
 *
 *     // Wait for external approval (with timeout)
 *     const received = await this.condition(() => approval !== undefined, '24h');
 *     if (!received) this.fail('Approval timed out');
 *     if (!approval!.approved) this.skip('Request rejected');
 *   }
 * }
 *
 * const handle = await ApprovalWorkflow.start({ requestId: '123' });
 * handle.query(statusQuery);  // 'pending'
 * handle.signal(approvalSignal, { approved: true });
 * const result = await handle.result();
 * ```
 */
export abstract class Workflow<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> extends Task<TContext> implements MessageReceiver {
  /** Task definitions for this workflow */
  static tasks: WorkflowTaskDefinition[] = [];

  /** Results from individual tasks */
  private _taskResults: Result[] = [];

  /** The task that caused a failure (if any) */
  private _causedFailure?: Result;

  /** The task that threw a failure (if any) */
  private _threwFailure?: Result;

  // ============================================
  // Signal & Query handlers
  // ============================================

  /** Registered signal handlers keyed by signal name */
  private _signalHandlers: Map<string, SignalHandler<unknown[]>> = new Map();

  /** Registered query handlers keyed by query name */
  private _queryHandlers: Map<string, QueryHandler<unknown, unknown[]>> = new Map();

  /** Buffered signals received before a handler was registered */
  private _signalBuffer: Map<string, unknown[][]> = new Map();

  // ============================================
  // Condition waiters
  // ============================================

  /** Pending condition waiters */
  private _conditionWaiters: ConditionWaiter[] = [];

  // ============================================
  // Static start method (interactive mode)
  // ============================================

  /**
   * Start an interactive workflow execution and return a handle.
   *
   * Unlike `execute()`, which runs to completion and returns a `Result`,
   * `start()` begins execution and immediately returns a `WorkflowHandle`
   * that can be used to send Signals, execute Queries, and await the result.
   *
   * @param args - Initial arguments merged into context
   * @param options - Execution options (context, chain)
   * @returns A `WorkflowHandle` for interacting with the running workflow
   *
   * @example
   * ```typescript
   * const handle = await ApprovalWorkflow.start({ orderId: 42 });
   * handle.signal(approveSignal, { approved: true });
   * const result = await handle.result();
   * ```
   */
  static start<T extends Record<string, unknown>>(
    this: new () => Workflow<T>,
    args?: Record<string, unknown>,
    options?: ExecuteOptions,
  ): WorkflowHandle<T> {
    // biome-ignore lint/complexity/noThisInStatic: required for polymorphic static method pattern
    const instance = new this();

    // Start execution (runs in background via microtask)
    const resultPromise = (instance as unknown as { _execute: (args?: Record<string, unknown>, options?: ExecuteOptions) => Promise<Result<T>> })
      ._execute(args, options);

    // Ensure conditions are cleaned up when the workflow completes
    const wrappedPromise = resultPromise.then((result) => {
      cancelAllConditions(instance._conditionWaiters);
      return result;
    });

    return new WorkflowHandle<T>(
      instance.id,
      instance as unknown as MessageReceiver,
      wrappedPromise,
    );
  }

  // ============================================
  // Message handler registration
  // ============================================

  /**
   * Register a handler for a Signal or Query.
   *
   * For Signals: The handler is called each time the signal is received.
   *              Handlers may be async and can mutate workflow state.
   *              After the handler runs, all pending conditions are re-evaluated.
   *
   * For Queries: The handler is called synchronously to return current state.
   *              Handlers must NOT mutate state.
   *
   * @param definition - A SignalDefinition or QueryDefinition
   * @param handler - The handler function
   *
   * @example
   * ```typescript
   * this.setHandler(approvalSignal, (input) => {
   *   approval = input;
   * });
   *
   * this.setHandler(statusQuery, () => currentStatus);
   * ```
   */
  protected setHandler<Args extends unknown[]>(
    definition: SignalDefinition<Args>,
    handler: SignalHandler<Args>,
  ): void;
  protected setHandler<TResult, Args extends unknown[]>(
    definition: QueryDefinition<TResult, Args>,
    handler: QueryHandler<TResult, Args>,
  ): void;
  protected setHandler(
    definition: SignalDefinition<unknown[]> | QueryDefinition<unknown, unknown[]>,
    handler: SignalHandler<unknown[]> | QueryHandler<unknown, unknown[]>,
  ): void {
    if (definition._brand === 'Signal') {
      this._signalHandlers.set(
        definition.name,
        handler as SignalHandler<unknown[]>,
      );
      // Flush any buffered signals for this handler
      this._flushSignalBuffer(definition.name);
    } else {
      this._queryHandlers.set(
        definition.name,
        handler as QueryHandler<unknown, unknown[]>,
      );
    }
  }

  // ============================================
  // Condition primitive
  // ============================================

  /**
   * Block execution until a predicate function returns true,
   * or an optional timeout expires.
   *
   * Returns `true` if the predicate was satisfied, `false` if
   * the timeout expired. Without a timeout, blocks indefinitely
   * until the predicate is satisfied (typically by a Signal mutating state).
   *
   * @param predicate - Function that returns true when the condition is met
   * @param timeout - Optional timeout as Duration ('30s', '5m', '1h', or ms)
   * @returns `true` if satisfied, `false` if timed out
   *
   * @example
   * ```typescript
   * // Wait indefinitely
   * await this.condition(() => approved !== undefined);
   *
   * // Wait with timeout
   * const received = await this.condition(() => approved !== undefined, '1h');
   * if (!received) this.fail('Timed out waiting for approval');
   * ```
   */
  protected condition(
    predicate: () => boolean,
    timeout?: Duration,
  ): Promise<boolean> {
    const { promise, waiter } = createConditionWaiter(predicate, timeout);
    if (!waiter.resolved) {
      this._conditionWaiters.push(waiter);
    }
    return promise;
  }

  // ============================================
  // Run static tasks (for interactive workflows)
  // ============================================

  /**
   * Execute the static `tasks` array within an interactive workflow.
   *
   * In interactive mode (when you override `work()`), call this method
   * to run the declarative task pipeline at any point in your workflow logic.
   *
   * @example
   * ```typescript
   * async work() {
   *   this.setHandler(approvalSignal, (input) => { ... });
   *
   *   // Run the static task pipeline first
   *   await this.runTasks();
   *
   *   // Then wait for interactive input
   *   await this.condition(() => approved);
   * }
   * ```
   */
  protected async runTasks(): Promise<void> {
    const workflowClass = this.constructor as typeof Workflow;
    const taskDefs = workflowClass.tasks;

    const defaultBreakpoints = this.settings.workflowBreakpoints ??
      this.settings.breakpoints ?? ['failed'];

    for (const def of taskDefs) {
      const result = await this._executeTaskDefinition(def, defaultBreakpoints);

      if (result) {
        this._taskResults.push(result);

        // Check breakpoints
        const breakpoints = this._getBreakpoints(def, defaultBreakpoints);
        if (breakpoints.includes(result.status)) {
          this._causedFailure = result;
          this._threwFailure = result;

          if (result.status === 'skipped') {
            this.skip(result.reason, { ...result.metadata });
          } else {
            this.fail(result.reason, { ...result.metadata });
          }
        }
      }
    }
  }

  // ============================================
  // Default work() — pipeline mode
  // ============================================

  /**
   * Workflow work method - executes all tasks in sequence.
   *
   * Override this method for interactive workflows that use Signals,
   * Queries, and Conditions. For pure pipeline workflows, leave this
   * as-is and define the static `tasks` array instead.
   */
  async work(): Promise<void> {
    await this.runTasks();
  }

  // ============================================
  // MessageReceiver implementation (internal)
  // ============================================

  /**
   * Receive a signal from external code (via WorkflowHandle).
   * @internal
   */
  _receiveSignal(name: string, args: unknown[]): void {
    const handler = this._signalHandlers.get(name);

    if (handler) {
      // Run handler synchronously (fire-and-forget for async handlers)
      const maybePromise = handler(...args);

      // If the handler returns a promise, evaluate conditions after it resolves
      if (maybePromise && typeof maybePromise === 'object' && 'then' in maybePromise) {
        void (maybePromise as Promise<void>).then(() => {
          evaluateConditions(this._conditionWaiters);
        });
      } else {
        // Synchronous handler — evaluate conditions immediately
        evaluateConditions(this._conditionWaiters);
      }
    } else {
      // Buffer the signal for later delivery
      const buffer = this._signalBuffer.get(name) ?? [];
      buffer.push(args);
      this._signalBuffer.set(name, buffer);
    }
  }

  /**
   * Receive a query from external code (via WorkflowHandle).
   * @internal
   */
  _receiveQuery(name: string, args: unknown[]): unknown {
    const handler = this._queryHandlers.get(name);

    if (!handler) {
      throw new Error(
        `No handler registered for query '${name}' in workflow '${this.constructor.name}'`,
      );
    }

    return handler(...args);
  }

  // ============================================
  // Signal buffer management
  // ============================================

  /**
   * Flush buffered signals for a newly registered handler.
   */
  private _flushSignalBuffer(name: string): void {
    const buffered = this._signalBuffer.get(name);
    if (!buffered || buffered.length === 0) return;

    this._signalBuffer.delete(name);
    const handler = this._signalHandlers.get(name);
    if (!handler) return;

    for (const args of buffered) {
      const maybePromise = handler(...args);
      if (maybePromise && typeof maybePromise === 'object' && 'then' in maybePromise) {
        void (maybePromise as Promise<void>).then(() => {
          evaluateConditions(this._conditionWaiters);
        });
      } else {
        evaluateConditions(this._conditionWaiters);
      }
    }
  }

  // ============================================
  // Task execution (internal)
  // ============================================

  /**
   * Execute a single task definition
   */
  private async _executeTaskDefinition(
    def: WorkflowTaskDefinition,
    defaultBreakpoints: Status[]
  ): Promise<Result | null> {
    // Check conditions
    if (isTaskEntry(def) || isTaskGroupEntry(def)) {
      if (def.if !== undefined) {
        const shouldRun = this._evaluateTaskCondition(def.if);
        if (!shouldRun) return null;
      }
      if (def.unless !== undefined) {
        const shouldSkip = this._evaluateTaskCondition(def.unless);
        if (shouldSkip) return null;
      }
    }

    if (isTaskGroupEntry(def)) {
      return this._executeTaskGroup(def, defaultBreakpoints);
    }

    const TaskClass = isTaskEntry(def) ? def.task : def;
    return TaskClass.execute({}, { context: this.context, chain: this.chain });
  }

  /**
   * Execute a task group
   */
  private async _executeTaskGroup(
    group: TaskGroupEntry,
    defaultBreakpoints: Status[]
  ): Promise<Result | null> {
    const strategy = group.strategy ?? 'sequential';
    const breakpoints = group.breakpoints ?? defaultBreakpoints;

    if (strategy === 'parallel') {
      return this._executeParallel(group.tasks, breakpoints);
    }

    return this._executeSequential(group.tasks, breakpoints);
  }

  /**
   * Execute tasks sequentially
   */
  private async _executeSequential(
    tasks: TaskClass[],
    breakpoints: Status[]
  ): Promise<Result | null> {
    let lastResult: Result | null = null;

    for (const TaskClass of tasks) {
      const result = await TaskClass.execute({}, { context: this.context, chain: this.chain });
      this._taskResults.push(result);
      lastResult = result;

      if (breakpoints.includes(result.status)) {
        return result;
      }
    }

    return lastResult;
  }

  /**
   * Execute tasks in parallel
   */
  private async _executeParallel(
    tasks: TaskClass[],
    breakpoints: Status[]
  ): Promise<Result | null> {
    // Create a snapshot of context for parallel execution (read-only)
    const contextSnapshot = this.context.toObject();

    const results = await Promise.all(
      tasks.map(async (TaskClass) => {
        // Each parallel task gets a clone of context
        const taskContext = createContext(contextSnapshot);
        return TaskClass.execute({}, { context: taskContext, chain: this.chain });
      })
    );

    this._taskResults.push(...results);

    // Check for failures
    const failedResult = results.find((r) => breakpoints.includes(r.status));
    if (failedResult) {
      return failedResult;
    }

    // Return last result
    return results[results.length - 1] ?? null;
  }

  /**
   * Evaluate a task conditional (if/unless)
   */
  private _evaluateTaskCondition(
    condition: string | ((workflow: Workflow) => boolean)
  ): boolean {
    if (typeof condition === 'function') {
      return condition(this);
    }
    const method = (this as Record<string, unknown>)[condition];
    if (typeof method === 'function') {
      return !!(method as () => boolean).call(this);
    }
    return !!method;
  }

  /**
   * Get breakpoints for a definition
   */
  private _getBreakpoints(
    def: WorkflowTaskDefinition,
    defaultBreakpoints: Status[]
  ): Status[] {
    if (isTaskEntry(def) || isTaskGroupEntry(def)) {
      return def.breakpoints ?? defaultBreakpoints;
    }
    return defaultBreakpoints;
  }

  // ============================================
  // Result accessors
  // ============================================

  /**
   * Get all task results from this workflow
   */
  get taskResults(): readonly Result[] {
    return this._taskResults;
  }

  /**
   * Get the result that caused a failure
   */
  get causedFailure(): Result | undefined {
    return this._causedFailure;
  }

  /**
   * Get the result that threw a failure
   */
  get threwFailure(): Result | undefined {
    return this._threwFailure;
  }
}

/**
 * Define a workflow using a functional style
 */
export function defineWorkflow<TContext extends Record<string, unknown>>(config: {
  name: string;
  tasks: WorkflowTaskDefinition<TContext>[];
  settings?: TaskSettings;
}): TaskClass<TContext> {
  const { name, tasks, settings } = config;

  // Create a dynamic class
  const WorkflowClass = class extends Workflow<TContext> {
    static override tasks = tasks;
    static override settings = settings;
  };

  // Set the name
  Object.defineProperty(WorkflowClass, 'name', { value: name });

  return WorkflowClass as unknown as TaskClass<TContext>;
}
