/**
 * DurableExecution - Manages the event log, replay, and checkpoints
 * for a single durable workflow run.
 *
 * Operates in two modes:
 * - **Replay mode**: Reads from the event log, skipping already-completed
 *   steps, delivering recorded signals, and resolving conditions from history.
 * - **Live mode**: Executes steps normally, persisting events and checkpoints
 *   as the workflow progresses.
 *
 * Transitions from replay → live automatically when the event log is exhausted.
 */

import { parseDuration, type Duration } from '../workflow/condition.js';
import type {
  WorkflowEvent,
  WorkflowEventData,
  WorkflowCheckpoint,
  WorkflowStore,
} from './types.js';

/**
 * Internal interface for the workflow instance during replay.
 * Used to deliver replayed signals without circular imports.
 */
export interface ReplayableWorkflow {
  _receiveSignal(name: string, args: unknown[]): void;
  context: { toObject(): Record<string, unknown> };
}

export class DurableExecution {
  /** The workflow this execution belongs to */
  private _workflow?: ReplayableWorkflow;

  /** Persisted events for replay */
  private readonly _replayEvents: WorkflowEvent[];

  /** Current position in the replay event log */
  private _replayCursor = 0;

  /** Whether we're currently in replay mode */
  private _replaying: boolean;

  /** Whether we're currently delivering signals during replay */
  private _deliveringReplaySignals = false;

  /** Storage backend */
  private readonly _store: WorkflowStore;

  /** Workflow identity */
  readonly workflowId: string;
  readonly workflowType: string;

  /** Monotonically increasing event sequence */
  private _sequence: number;

  /** Counter for deterministic condition keys */
  private _conditionCounter: number;

  /** Counter for deterministic sleep keys */
  private _sleepCounter: number;

  /** Set of completed step names (for fast lookup) */
  private readonly _completedSteps = new Set<string>();

  constructor(config: {
    workflowId: string;
    workflowType: string;
    store: WorkflowStore;
    events?: WorkflowEvent[];
    checkpoint?: WorkflowCheckpoint | null;
  }) {
    this.workflowId = config.workflowId;
    this.workflowType = config.workflowType;
    this._store = config.store;
    this._replayEvents = config.events ?? [];
    this._replaying = this._replayEvents.length > 0;

    // Initialize sequence from the last event or checkpoint
    const lastEvent = this._replayEvents[this._replayEvents.length - 1];
    const checkpoint = config.checkpoint;

    this._sequence = lastEvent?.sequence ?? checkpoint?.sequence ?? 0;

    // Restore counters from checkpoint
    this._conditionCounter = checkpoint?.conditionCounter ?? 0;
    this._sleepCounter = checkpoint?.sleepCounter ?? 0;

    // Restore completed steps from checkpoint
    if (checkpoint?.completedSteps) {
      for (const step of checkpoint.completedSteps) {
        this._completedSteps.add(step);
      }
    }
  }

  // ============================================
  // State Accessors
  // ============================================

  /** Whether the execution is currently replaying from the event log */
  get isReplaying(): boolean {
    return this._replaying && this._replayCursor < this._replayEvents.length;
  }

  /** Whether the execution is currently delivering replay signals */
  get isDeliveringReplaySignals(): boolean {
    return this._deliveringReplaySignals;
  }

  /** Set the workflow reference (must be called after workflow construction) */
  setWorkflow(workflow: ReplayableWorkflow): void {
    this._workflow = workflow;
  }

  /** Get the current event sequence number */
  get sequence(): number {
    return this._sequence;
  }

  /** Get the set of completed step names */
  get completedSteps(): ReadonlySet<string> {
    return this._completedSteps;
  }

  // ============================================
  // Event Persistence
  // ============================================

  /**
   * Append an event to the workflow's durable event log.
   * Assigns a monotonically increasing sequence number and timestamp.
   */
  async appendEvent(data: WorkflowEventData): Promise<WorkflowEvent> {
    const event: WorkflowEvent = {
      ...data,
      sequence: ++this._sequence,
      timestamp: Date.now(),
    } as WorkflowEvent;

    await this._store.appendEvent(this.workflowId, event);
    return event;
  }

  // ============================================
  // Durable Step Execution
  // ============================================

  /**
   * Execute a named durable step.
   *
   * - **Replay**: If the step has a recorded result, returns it without executing.
   * - **Live**: Executes the function, persists the result, and saves a checkpoint.
   *
   * Step names must be unique within a workflow execution.
   * Step results must be JSON-serializable.
   *
   * @param name - Unique step identifier
   * @param fn - The function to execute (skipped during replay)
   * @returns The step's return value (recorded or live)
   */
  async executeStep<R>(name: string, fn: () => R | Promise<R>): Promise<R> {
    if (this.isReplaying) {
      // Deliver any pending signals before this step
      this._deliverReplaySignals();

      const event = this._peekReplay();

      // Expect step.scheduled followed by step.completed or step.failed
      if (event?.type === 'step.scheduled' && event.step === name) {
        this._advanceReplay(); // consume step.scheduled

        const resultEvent = this._peekReplay();

        if (resultEvent?.type === 'step.completed' && resultEvent.step === name) {
          this._advanceReplay();
          this._completedSteps.add(name);
          return resultEvent.result as R;
        }

        if (resultEvent?.type === 'step.failed' && resultEvent.step === name) {
          this._advanceReplay();
          throw new Error(resultEvent.error);
        }
      }

      // No matching replay event — transition to live mode
      this._replaying = false;
    }

    // Live execution
    if (this._completedSteps.has(name)) {
      throw new Error(
        `Durable step '${name}' has already been executed in workflow '${this.workflowId}'. Step names must be unique.`,
      );
    }

    await this.appendEvent({ type: 'step.scheduled', step: name });

    try {
      const result = await fn();
      await this.appendEvent({
        type: 'step.completed',
        step: name,
        result: result ?? null,
      });
      this._completedSteps.add(name);

      // Checkpoint after each completed step
      await this._saveCheckpoint();

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.appendEvent({
        type: 'step.failed',
        step: name,
        error: errorMessage,
      });
      throw error;
    }
  }

  // ============================================
  // Durable Condition
  // ============================================

  /**
   * Durable condition — survives process restarts.
   *
   * - **Replay**: Delivers logged signals, then resolves from the event log.
   * - **Live**: Creates a real condition with event logging.
   *
   * @param createCondition - Factory to create the real condition (calls super.condition)
   * @param predicate - The condition predicate
   * @param timeout - Optional timeout duration
   * @returns true if satisfied, false if timed out
   */
  async conditionDurable(
    createCondition: (predicate: () => boolean, timeout?: Duration) => Promise<boolean>,
    predicate: () => boolean,
    timeout?: Duration,
  ): Promise<boolean> {
    const key = `condition_${this._conditionCounter++}`;

    if (this.isReplaying) {
      // Deliver pending signals up to the condition event
      this._deliverReplaySignals();

      const event = this._peekReplay();

      if (event?.type === 'condition.scheduled' && event.key === key) {
        this._advanceReplay();

        // Deliver signals between condition.scheduled and its resolution
        while (this._replayCursor < this._replayEvents.length) {
          const next = this._peekReplay();

          if (next?.type === 'signal.received') {
            this._advanceReplay();
            this._deliverSignal(next.signal, next.payload);
          } else if (next?.type === 'condition.satisfied' && next.key === key) {
            this._advanceReplay();
            await this._saveCheckpoint();
            return true;
          } else if (next?.type === 'condition.timeout' && next.key === key) {
            this._advanceReplay();
            await this._saveCheckpoint();
            return false;
          } else {
            // Unexpected event — break out and switch to live
            break;
          }
        }
      }

      // Event log exhausted or mismatch — switch to live mode
      this._replaying = false;

      // Recalculate remaining timeout based on the scheduled deadline
      if (timeout !== undefined) {
        const scheduledEvent = this._findLastEvent('condition.scheduled', key);
        if (scheduledEvent?.type === 'condition.scheduled' && scheduledEvent.deadline) {
          const remaining = scheduledEvent.deadline - Date.now();
          if (remaining <= 0) {
            // Deadline already passed
            await this.appendEvent({ type: 'condition.timeout', key });
            await this._saveCheckpoint();
            return false;
          }
          // Use remaining time for the live condition
          timeout = remaining;
        }
      }
    }

    // Live execution
    const timeoutMs = timeout !== undefined ? parseDuration(timeout) : undefined;
    await this.appendEvent({
      type: 'condition.scheduled',
      key,
      timeoutMs,
      deadline: timeoutMs !== undefined ? Date.now() + timeoutMs : undefined,
    });

    // Delegate to the real condition mechanism
    const result = await createCondition(predicate, timeout);

    if (result) {
      await this.appendEvent({ type: 'condition.satisfied', key });
    } else {
      await this.appendEvent({ type: 'condition.timeout', key });
    }

    await this._saveCheckpoint();
    return result;
  }

  // ============================================
  // Durable Sleep
  // ============================================

  /**
   * Durable sleep — survives process restarts.
   *
   * - **Replay**: If the sleep already completed, resolves immediately.
   *   If the deadline hasn't passed, sleeps for the remaining duration.
   * - **Live**: Sleeps for the full duration with event logging.
   *
   * @param duration - How long to sleep
   */
  async sleepDurable(duration: Duration): Promise<void> {
    const key = `sleep_${this._sleepCounter++}`;
    const durationMs = parseDuration(duration);

    if (this.isReplaying) {
      this._deliverReplaySignals();

      const event = this._peekReplay();

      if (event?.type === 'sleep.scheduled' && event.key === key) {
        this._advanceReplay();

        const completedEvent = this._peekReplay();
        if (completedEvent?.type === 'sleep.completed' && completedEvent.key === key) {
          this._advanceReplay();
          await this._saveCheckpoint();
          return;
        }

        // Sleep was scheduled but not completed — calculate remaining time
        this._replaying = false;
        const remaining = event.deadline - Date.now();

        if (remaining > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        }

        await this.appendEvent({ type: 'sleep.completed', key });
        await this._saveCheckpoint();
        return;
      }

      // No matching event — switch to live
      this._replaying = false;
    }

    // Live execution
    const deadline = Date.now() + durationMs;
    await this.appendEvent({
      type: 'sleep.scheduled',
      key,
      durationMs,
      deadline,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));

    await this.appendEvent({ type: 'sleep.completed', key });
    await this._saveCheckpoint();
  }

  // ============================================
  // Replay Internals
  // ============================================

  /** Peek at the current replay event without consuming it */
  private _peekReplay(): WorkflowEvent | undefined {
    return this._replayEvents[this._replayCursor];
  }

  /** Consume and return the current replay event */
  private _advanceReplay(): WorkflowEvent | undefined {
    return this._replayEvents[this._replayCursor++];
  }

  /**
   * Deliver all pending signal events from the replay log.
   * Signals are delivered in order until a non-signal event is encountered.
   */
  private _deliverReplaySignals(): void {
    this._deliveringReplaySignals = true;

    try {
      while (this._replayCursor < this._replayEvents.length) {
        const event = this._peekReplay();

        if (event?.type === 'signal.received') {
          this._advanceReplay();
          this._deliverSignal(event.signal, event.payload);
        } else {
          break;
        }
      }
    } finally {
      this._deliveringReplaySignals = false;
    }
  }

  /** Deliver a signal to the workflow instance */
  private _deliverSignal(name: string, payload: unknown[]): void {
    if (!this._workflow) {
      throw new Error('Workflow reference not set on DurableExecution');
    }
    this._workflow._receiveSignal(name, payload);
  }

  /** Find the last event of a specific type and key in the replay log */
  private _findLastEvent(type: string, key: string): WorkflowEvent | undefined {
    for (let i = this._replayEvents.length - 1; i >= 0; i--) {
      const event = this._replayEvents[i];
      if (event && event.type === type && 'key' in event && (event as { key: string }).key === key) {
        return event;
      }
    }
    return undefined;
  }

  // ============================================
  // Checkpoint Management
  // ============================================

  /** Save a checkpoint of the current workflow state */
  private async _saveCheckpoint(): Promise<void> {
    if (!this._workflow) return;

    const checkpoint: WorkflowCheckpoint = {
      workflowId: this.workflowId,
      workflowType: this.workflowType,
      sequence: this._sequence,
      context: this._workflow.context.toObject(),
      status: 'running',
      completedSteps: [...this._completedSteps],
      conditionCounter: this._conditionCounter,
      sleepCounter: this._sleepCounter,
      createdAt: Date.now(),
    };

    await this._store.saveCheckpoint(this.workflowId, checkpoint);
  }

  /**
   * Save a final checkpoint marking the workflow as completed or failed.
   */
  async saveFinalCheckpoint(status: 'completed' | 'failed'): Promise<void> {
    if (!this._workflow) return;

    const checkpoint: WorkflowCheckpoint = {
      workflowId: this.workflowId,
      workflowType: this.workflowType,
      sequence: this._sequence,
      context: this._workflow.context.toObject(),
      status,
      completedSteps: [...this._completedSteps],
      conditionCounter: this._conditionCounter,
      sleepCounter: this._sleepCounter,
      createdAt: Date.now(),
    };

    await this._store.saveCheckpoint(this.workflowId, checkpoint);
    await this._store.markCompleted(this.workflowId);
  }
}
