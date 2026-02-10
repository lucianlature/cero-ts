/**
 * cero-ts - Framework for building maintainable business processes
 *
 * @example
 * ```typescript
 * import { Task, required, optional } from 'cero-ts';
 *
 * class AnalyzeMetrics extends Task<{ result: Analysis }> {
 *   static attributes = {
 *     datasetId: required({ type: 'integer', numeric: { min: 1 } }),
 *     analysisType: optional({ default: 'standard' }),
 *   };
 *
 *   declare datasetId: number;
 *   declare analysisType: string;
 *
 *   async work() {
 *     const dataset = await Dataset.findById(this.datasetId);
 *     if (!dataset) {
 *       this.fail('Dataset not found', { code: 404 });
 *     }
 *     this.context.result = await analyze(dataset);
 *   }
 * }
 *
 * const result = await AnalyzeMetrics.execute({ datasetId: 123 });
 * ```
 */

// Core
export {
  Task,
  required,
  optional,
  type TaskClass,
  type TaskSettings,
  type AttributeDefinition,
  type AttributesSchema,
  type CallbackType,
  type CallbackDefinition,
  type CallbacksConfig,
  type MiddlewareFunction,
  type MiddlewareDefinition,
  type ExecuteOptions,
} from './task.js';

export {
  Context,
  createContext,
} from './context.js';

export {
  Result,
  createResult,
  successResult,
  skippedResult,
  failedResult,
  type State,
  type Status,
  type Outcome,
  type HandlerType,
  type ResultHandler,
  type ResultMetadata,
  type ResultOptions,
  type ResultJSON,
} from './result.js';

export {
  Chain,
  createChain,
  type ChainJSON,
} from './chain.js';

// Interruptions
export {
  Fault,
  SkipFault,
  FailFault,
  FaultMatcher,
  FaultPredicate,
  isFault,
  isSkipFault,
  isFailFault,
} from './interruptions/index.js';

// Errors
export {
  CeroError,
  CMDxError,
  CoercionError,
  ValidationError,
  TimeoutError,
  ErrorCollection,
} from './errors.js';

// Utilities
export {
  generateUUID,
  generateTimeOrderedUUID,
} from './utils/uuid.js';

export {
  isPlainObject,
  isPromise,
  deepMerge,
  resolveCallable,
  type Callable,
  type Constructor,
  type AnyFunction,
  type AsyncFunction,
} from './utils/types.js';

// Workflow
export {
  Workflow,
  defineWorkflow,
  type TaskEntry,
  type TaskGroupEntry,
  type WorkflowTaskDefinition,
} from './workflow/index.js';

// Workflow Messages (Signals & Queries)
export {
  defineSignal,
  defineQuery,
  isSignalDefinition,
  isQueryDefinition,
  type SignalDefinition,
  type QueryDefinition,
  type SignalHandler,
  type QueryHandler,
} from './workflow/index.js';

// Workflow Condition & Handle
export {
  WorkflowHandle,
  parseDuration,
  type Duration,
} from './workflow/index.js';

// Attributes
export {
  coercions,
  coerce,
  registerCoercion,
  deregisterCoercion,
  validators,
  validate,
  registerValidator,
  deregisterValidator,
  type CoercionFunction,
  type ValidationFunction,
} from './attributes/index.js';

// Configuration
export {
  Cero,
  CMDx,
  configure,
  getConfiguration,
  resetConfiguration,
  MiddlewareRegistry,
  CallbackRegistry,
  CoercionRegistry,
  ValidatorRegistry,
  type CeroConfiguration,
} from './config.js';
