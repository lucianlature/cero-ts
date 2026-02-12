/**
 * Durable Workflow Types
 *
 * Core type definitions for the durable workflow system including
 * event sourcing, checkpoints, and pluggable storage.
 */

// ============================================
// Workflow Events (Event Log)
// ============================================

/**
 * Discriminated union of all workflow event data types.
 * Events form the source of truth for workflow execution history.
 */
export type WorkflowEventData =
  | WorkflowStartedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | StepScheduledEvent
  | StepCompletedEvent
  | StepFailedEvent
  | SignalReceivedEvent
  | ConditionScheduledEvent
  | ConditionSatisfiedEvent
  | ConditionTimeoutEvent
  | SleepScheduledEvent
  | SleepCompletedEvent;

export interface WorkflowStartedEvent {
  readonly type: 'workflow.started';
  readonly workflowType: string;
  readonly args: Record<string, unknown>;
}

export interface WorkflowCompletedEvent {
  readonly type: 'workflow.completed';
  readonly result: Record<string, unknown>;
}

export interface WorkflowFailedEvent {
  readonly type: 'workflow.failed';
  readonly error: string;
}

export interface StepScheduledEvent {
  readonly type: 'step.scheduled';
  readonly step: string;
}

export interface StepCompletedEvent {
  readonly type: 'step.completed';
  readonly step: string;
  readonly result: unknown;
}

export interface StepFailedEvent {
  readonly type: 'step.failed';
  readonly step: string;
  readonly error: string;
}

export interface SignalReceivedEvent {
  readonly type: 'signal.received';
  readonly signal: string;
  readonly payload: unknown[];
}

export interface ConditionScheduledEvent {
  readonly type: 'condition.scheduled';
  readonly key: string;
  readonly timeoutMs?: number;
  readonly deadline?: number;
}

export interface ConditionSatisfiedEvent {
  readonly type: 'condition.satisfied';
  readonly key: string;
}

export interface ConditionTimeoutEvent {
  readonly type: 'condition.timeout';
  readonly key: string;
}

export interface SleepScheduledEvent {
  readonly type: 'sleep.scheduled';
  readonly key: string;
  readonly durationMs: number;
  readonly deadline: number;
}

export interface SleepCompletedEvent {
  readonly type: 'sleep.completed';
  readonly key: string;
}

/**
 * A persisted workflow event with sequence number and timestamp.
 *
 * Events are append-only and form an immutable audit trail of
 * every state transition in the workflow.
 */
export type WorkflowEvent = WorkflowEventData & {
  /** Monotonically increasing sequence number within this workflow */
  readonly sequence: number;
  /** Unix timestamp (ms) when the event was created */
  readonly timestamp: number;
};

// ============================================
// Checkpoints (Snapshots)
// ============================================

/**
 * A point-in-time snapshot of workflow state.
 *
 * Checkpoints are an optimization for recovery — instead of replaying
 * all events from the beginning, we restore from the latest checkpoint
 * and only replay events after it.
 */
export interface WorkflowCheckpoint {
  /** The workflow instance ID */
  readonly workflowId: string;
  /** The workflow class name */
  readonly workflowType: string;
  /** Last event sequence this checkpoint covers */
  readonly sequence: number;
  /** Serialized context state at checkpoint time */
  readonly context: Record<string, unknown>;
  /** Current workflow execution status */
  readonly status: 'running' | 'completed' | 'failed';
  /** Names of completed durable steps */
  readonly completedSteps: string[];
  /** The condition counter at checkpoint time (for deterministic replay) */
  readonly conditionCounter: number;
  /** The sleep counter at checkpoint time */
  readonly sleepCounter: number;
  /** Unix timestamp (ms) when checkpoint was created */
  readonly createdAt: number;
}

// ============================================
// Workflow Store (Pluggable Persistence)
// ============================================

/**
 * Pluggable storage backend for durable workflow state.
 *
 * Implementations must guarantee:
 * - `appendEvent` writes are atomic and durable before returning
 * - `getEvents` returns events in sequence order
 * - `listActiveWorkflows` only returns workflows not yet marked completed
 *
 * @example In-memory (testing)
 * ```typescript
 * const store = new InMemoryWorkflowStore();
 * ```
 *
 * @example SQLite (production)
 * ```typescript
 * const store = new SqliteWorkflowStore('./workflows.db');
 * ```
 */
export interface WorkflowStore {
  /**
   * Append an event to the workflow's event log.
   * Must be atomic and durable before the promise resolves.
   */
  appendEvent(workflowId: string, event: WorkflowEvent): Promise<void>;

  /**
   * Get all events for a workflow, optionally after a sequence number.
   * Events must be returned in sequence order.
   */
  getEvents(workflowId: string, afterSequence?: number): Promise<WorkflowEvent[]>;

  /**
   * Save a checkpoint snapshot for fast recovery.
   * May overwrite previous checkpoints for the same workflow.
   */
  saveCheckpoint(workflowId: string, checkpoint: WorkflowCheckpoint): Promise<void>;

  /**
   * Get the most recent checkpoint for a workflow, or null if none exists.
   */
  getLatestCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null>;

  /**
   * List all workflows that have not been marked as completed.
   * Used by WorkflowRecovery to find in-flight workflows on startup.
   */
  listActiveWorkflows(): Promise<ActiveWorkflowInfo[]>;

  /**
   * Mark a workflow as completed (removes from active list).
   * Called when a workflow finishes execution (success or failure).
   */
  markCompleted(workflowId: string): Promise<void>;
}

/**
 * Info about an active (in-flight) workflow for recovery.
 */
export interface ActiveWorkflowInfo {
  readonly workflowId: string;
  readonly workflowType: string;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Options for starting a durable workflow.
 */
export interface DurableStartOptions {
  /** The workflow store for persistence (required) */
  readonly store: WorkflowStore;
  /** Optional workflow ID override (default: auto-generated) */
  readonly workflowId?: string;
}

/**
 * Options for recovering a durable workflow.
 */
export interface DurableRecoverOptions {
  /** The workflow store to recover from */
  readonly store: WorkflowStore;
  /** The workflow ID to recover */
  readonly workflowId: string;
  /** Pre-loaded events (optimization to avoid re-fetching) */
  readonly events?: WorkflowEvent[];
  /** Pre-loaded checkpoint (optimization to avoid re-fetching) */
  readonly checkpoint?: WorkflowCheckpoint | null;
}

/**
 * Registry mapping workflow type names to their class constructors.
 * Used by WorkflowRecovery to instantiate the correct class on recovery.
 */
export type WorkflowRegistry = Map<string, DurableWorkflowClass>;

/**
 * Constructor type for DurableWorkflow subclasses.
 */
export interface DurableWorkflowClass<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  new (): import('./workflow.js').DurableWorkflow<T>;
}
