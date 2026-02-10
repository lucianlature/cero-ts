/**
 * cero-ts Workflow
 *
 * Compose multiple tasks into powerful, interactive pipelines
 * with Signals, Queries, and Conditions.
 */

// Pipeline & Workflow
export {
  Workflow,
  defineWorkflow,
  type TaskEntry,
  type TaskGroupEntry,
  type WorkflowTaskDefinition,
} from './pipeline.js';

// Signals & Queries
export {
  defineSignal,
  defineQuery,
  isSignalDefinition,
  isQueryDefinition,
  type SignalDefinition,
  type QueryDefinition,
  type SignalHandler,
  type QueryHandler,
} from './messages.js';

// Condition
export {
  parseDuration,
  type Duration,
} from './condition.js';

// Handle
export {
  WorkflowHandle,
} from './handle.js';
