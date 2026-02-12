/**
 * cero-ts/durable — Durable workflow execution with event sourcing and checkpoints.
 *
 * Provides persistence, resumability, and deterministic replay for
 * long-running workflows that need to survive process restarts.
 *
 * @example
 * ```typescript
 * import {
 *   DurableWorkflow,
 *   InMemoryWorkflowStore,
 *   WorkflowRecovery,
 * } from 'cero-ts/durable';
 * ```
 */

// Workflow
export { DurableWorkflow } from './workflow.js';

// Handle
export { DurableWorkflowHandle } from './handle.js';

// Execution (internal, but exported for advanced use)
export { DurableExecution } from './execution.js';

// Store
export { InMemoryWorkflowStore } from './store.js';

// Recovery
export { WorkflowRecovery } from './recovery.js';

// Types
export type {
  // Events
  WorkflowEvent,
  WorkflowEventData,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  StepScheduledEvent,
  StepCompletedEvent,
  StepFailedEvent,
  SignalReceivedEvent,
  ConditionScheduledEvent,
  ConditionSatisfiedEvent,
  ConditionTimeoutEvent,
  SleepScheduledEvent,
  SleepCompletedEvent,

  // Checkpoint
  WorkflowCheckpoint,

  // Store
  WorkflowStore,
  ActiveWorkflowInfo,

  // Config
  DurableStartOptions,
  DurableRecoverOptions,
  WorkflowRegistry,
  DurableWorkflowClass,
} from './types.js';
