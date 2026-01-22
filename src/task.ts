/**
 * Task - Base class for building maintainable business processes
 */

import { generateTimeOrderedUUID } from './utils/uuid.js';
import { Context, createContext } from './context.js';
import { Chain, createChain } from './chain.js';
import {
  Result,
  createResult,
  successResult,
  skippedResult,
  failedResult,
  type State,
  type Status,
  type ResultMetadata,
} from './result.js';
import { Fault, SkipFault, FailFault } from './interruptions/faults.js';
import { ErrorCollection } from './errors.js';

/**
 * Attribute definition for required/optional helpers
 */
export interface AttributeDefinition {
  required?: boolean;
  type?: string | string[];
  default?: unknown | (() => unknown);
  source?: string | ((task: Task) => unknown);
  description?: string;
  // Validation options
  presence?: boolean | { message?: string };
  absence?: boolean | { message?: string };
  format?: RegExp | { with?: RegExp; without?: RegExp; message?: string };
  length?: {
    min?: number;
    max?: number;
    is?: number;
    within?: [number, number];
    message?: string;
  };
  numeric?: {
    min?: number;
    max?: number;
    is?: number;
    within?: [number, number];
    message?: string;
  };
  inclusion?: { in: unknown[]; message?: string };
  exclusion?: { in: unknown[]; message?: string };
  // Conditional required
  if?: string | ((task: Task) => boolean);
  unless?: string | ((task: Task) => boolean);
}

/**
 * Attributes schema type
 */
export type AttributesSchema = Record<string, AttributeDefinition>;

/**
 * Task settings configuration
 */
export interface TaskSettings {
  // Breakpoints
  taskBreakpoints?: Status[];
  workflowBreakpoints?: Status[];
  breakpoints?: Status[];

  // Logging
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  tags?: string[];

  // Retries
  retries?: number;
  retryOn?: (new (...args: unknown[]) => Error)[];
  retryJitter?: number | string | ((retryCount: number) => number);

  // Rollback
  rollbackOn?: Status[];

  // Misc
  deprecated?: boolean | string;
  dryRun?: boolean;
}

/**
 * Callback types
 */
export type CallbackType =
  | 'beforeValidation'
  | 'beforeExecution'
  | 'onComplete'
  | 'onInterrupted'
  | 'onExecuted'
  | 'onSuccess'
  | 'onSkipped'
  | 'onFailed'
  | 'onGood'
  | 'onBad';

/**
 * Callback definition
 */
export type CallbackDefinition =
  | string
  | ((task: Task) => void | Promise<void>)
  | { call: (task: Task) => void | Promise<void> };

/**
 * Callbacks configuration
 */
export type CallbacksConfig = Partial<Record<CallbackType, CallbackDefinition[]>>;

/**
 * Middleware function type
 */
export type MiddlewareFunction<T extends Record<string, unknown> = Record<string, unknown>> = (
  task: Task<T>,
  options: Record<string, unknown>,
  next: () => Promise<Result<T>>
) => Promise<Result<T>>;

/**
 * Middleware definition
 */
export type MiddlewareDefinition =
  | MiddlewareFunction
  | [MiddlewareFunction | { call: MiddlewareFunction }, Record<string, unknown>?]
  | { call: MiddlewareFunction };

/**
 * Task class type for static methods
 */
export interface TaskClass<T extends Record<string, unknown> = Record<string, unknown>> {
  new (): Task<T>;
  attributes?: AttributesSchema;
  settings?: TaskSettings;
  callbacks?: CallbacksConfig;
  middlewares?: MiddlewareDefinition[];

  execute(
    args?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<Result<T>>;

  executeStrict(
    args?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<Result<T>>;
}

/**
 * Execute options
 */
export interface ExecuteOptions {
  context?: Context;
  chain?: Chain;
}

/**
 * Internal halt signal for skip/fail
 */
class HaltSignal extends Error {
  readonly status: 'skipped' | 'failed';
  readonly reason: string;
  readonly metadata: Record<string, unknown>;

  constructor(
    status: 'skipped' | 'failed',
    reason: string,
    metadata: Record<string, unknown> = {}
  ) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.metadata = metadata;
  }
}

/**
 * Base Task class for building maintainable business processes.
 *
 * @example
 * ```typescript
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
export abstract class Task<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Unique identifier for this task instance */
  readonly id: string;

  /** Shared context for this execution */
  readonly context: Context<TContext> & TContext;

  /** Execution chain */
  readonly chain: Chain;

  /** Error collection for validation errors */
  readonly errors: ErrorCollection;

  /** Current execution state */
  private _state: State = 'initialized';

  /** Current execution status */
  private _status: Status = 'success';

  /** Halt reason if interrupted */
  private _reason?: string;

  /** Halt cause if exception */
  private _cause?: Error;

  /** Additional metadata */
  private _metadata: ResultMetadata = {};

  /** Retry count */
  private _retries = 0;

  /** Whether rollback was executed */
  private _rolledBack = false;

  /** Index in chain */
  private _index = 0;

  // Static configuration (override in subclasses)
  static attributes?: AttributesSchema;
  static settings?: TaskSettings;
  static callbacks?: CallbacksConfig;
  static middlewares?: MiddlewareDefinition[];

  constructor(context?: Context<TContext>, chain?: Chain) {
    this.id = generateTimeOrderedUUID();
    this.context = (context ?? createContext()) as Context<TContext> & TContext;
    this.chain = chain ?? createChain();
    this.errors = new ErrorCollection();
  }

  /**
   * The main work method to be implemented by subclasses.
   * This is where your business logic goes.
   */
  abstract work(): void | Promise<void>;

  /**
   * Optional rollback method called when execution fails.
   */
  rollback?(): void | Promise<void>;

  // ============================================
  // Interruption methods
  // ============================================

  /**
   * Skip task execution with optional reason and metadata.
   * @throws HaltSignal (caught internally)
   */
  protected skip(reason?: string, metadata?: Record<string, unknown>): never {
    throw new HaltSignal('skipped', reason ?? 'Unspecified', metadata);
  }

  /**
   * Fail task execution with optional reason and metadata.
   * @throws HaltSignal (caught internally)
   */
  protected fail(reason?: string, metadata?: Record<string, unknown>): never {
    throw new HaltSignal('failed', reason ?? 'Unspecified', metadata);
  }

  /**
   * Throw a result from a sub-task execution.
   * Re-throws if the result is failed or skipped based on status.
   */
  protected throw(result: Result, metadata?: Record<string, unknown>): void {
    if (result.failed) {
      throw new HaltSignal('failed', result.reason ?? 'Unspecified', {
        ...result.metadata,
        ...metadata,
      });
    }
    if (result.skipped) {
      throw new HaltSignal('skipped', result.reason ?? 'Unspecified', {
        ...result.metadata,
        ...metadata,
      });
    }
  }

  // ============================================
  // Attribute accessors
  // ============================================

  /**
   * Get task class
   */
  get taskClass(): TaskClass<TContext> {
    return this.constructor as TaskClass<TContext>;
  }

  /**
   * Get attributes schema
   */
  get attributesSchema(): AttributesSchema {
    return this.taskClass.attributes ?? {};
  }

  /**
   * Get settings
   */
  get settings(): TaskSettings {
    return this.taskClass.settings ?? {};
  }

  // ============================================
  // Static execution methods
  // ============================================

  /**
   * Execute the task and return a Result (never throws on business logic errors).
   */
  static async execute<T extends Record<string, unknown>>(
    this: TaskClass<T>,
    args?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<Result<T>> {
    const task = new this();
    return task._execute(args, options);
  }

  /**
   * Execute the task and throw Fault on failure/skip based on breakpoints.
   */
  static async executeStrict<T extends Record<string, unknown>>(
    this: TaskClass<T>,
    args?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<Result<T>> {
    const task = new this();
    const result = await task._execute(args, options);

    const breakpoints = task.settings.taskBreakpoints ??
      task.settings.breakpoints ?? ['failed'];

    if (breakpoints.includes(result.status)) {
      if (result.status === 'skipped') {
        throw new SkipFault(result);
      }
      throw new FailFault(result);
    }

    return result;
  }

  // ============================================
  // Internal execution
  // ============================================

  /**
   * Internal execution method
   */
  private async _execute(
    args?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<Result<TContext>> {
    // Setup
    if (options?.context) {
      (this as { context: Context<TContext> }).context = options.context as Context<TContext> & TContext;
    }
    if (options?.chain) {
      (this as { chain: Chain }).chain = options.chain;
    }

    this._index = this.chain.nextIndex();

    // Merge args into context
    if (args) {
      this.context.merge(args as Partial<TContext>);
    }

    // Apply attribute defaults and bind to instance
    this._applyAttributes(args ?? {});

    // Run with middleware stack
    const result = await this._executeWithMiddleware();

    // Add result to chain
    this.chain.addResult(result);

    return result;
  }

  /**
   * Execute with middleware stack
   */
  private async _executeWithMiddleware(): Promise<Result<TContext>> {
    const middlewares = this.taskClass.middlewares ?? [];

    // Build middleware chain
    const executeCore = async (): Promise<Result<TContext>> => {
      return this._executeCore();
    };

    let next = executeCore;

    // Wrap in middleware (reverse order so first middleware is outermost)
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i]!;
      const currentNext = next;

      let fn: MiddlewareFunction<TContext>;
      let opts: Record<string, unknown> = {};

      if (typeof middleware === 'function') {
        fn = middleware as MiddlewareFunction<TContext>;
      } else if (Array.isArray(middleware)) {
        const [mw, options] = middleware;
        fn = typeof mw === 'function' ? mw as MiddlewareFunction<TContext> : mw.call.bind(mw) as MiddlewareFunction<TContext>;
        opts = options ?? {};
      } else {
        fn = middleware.call.bind(middleware) as MiddlewareFunction<TContext>;
      }

      next = async () => fn(this, opts, currentNext);
    }

    return next();
  }

  /**
   * Core execution logic
   */
  private async _executeCore(): Promise<Result<TContext>> {
    try {
      // Run callbacks: beforeValidation
      await this._runCallbacks('beforeValidation');

      // Validate attributes
      this._validateAttributes();

      if (!this.errors.isEmpty) {
        this._state = 'interrupted';
        this._status = 'failed';
        this._reason = 'Invalid';
        this._metadata.errors = {
          fullMessage: this.errors.fullMessage,
          messages: this.errors.messages,
        };
        return this._createResult();
      }

      // Run callbacks: beforeExecution
      await this._runCallbacks('beforeExecution');

      // Execute work with retry logic
      this._state = 'executing';
      await this._executeWithRetry();

      // Success path
      this._state = 'complete';
      this._status = 'success';
    } catch (error) {
      if (error instanceof HaltSignal) {
        // Intentional halt (skip/fail)
        this._state = 'interrupted';
        this._status = error.status;
        this._reason = error.reason;
        this._metadata = { ...this._metadata, ...error.metadata };
      } else if (error instanceof Error) {
        // Unexpected exception
        this._state = 'interrupted';
        this._status = 'failed';
        this._reason = `[${error.name}] ${error.message}`;
        this._cause = error;
      } else {
        // Unknown error
        this._state = 'interrupted';
        this._status = 'failed';
        this._reason = String(error);
      }

      // Run rollback if configured
      const rollbackOn = this.settings.rollbackOn ?? ['failed'];
      if (rollbackOn.includes(this._status) && this.rollback) {
        try {
          await this.rollback();
          this._rolledBack = true;
        } catch {
          // Rollback failed - log but don't change result
        }
      }
    }

    // Run lifecycle callbacks
    await this._runLifecycleCallbacks();

    return this._createResult();
  }

  /**
   * Execute work with retry logic
   */
  private async _executeWithRetry(): Promise<void> {
    const maxRetries = this.settings.retries ?? 0;
    const retryOn = this.settings.retryOn ?? [Error];

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.work();
        return; // Success
      } catch (error) {
        if (error instanceof HaltSignal) {
          throw error; // Don't retry intentional halts
        }

        if (!(error instanceof Error)) {
          throw error;
        }

        // Check if we should retry this error type
        const shouldRetry = retryOn.some((cls) => error instanceof cls);
        if (!shouldRetry || attempt === maxRetries) {
          throw error;
        }

        lastError = error;
        this._retries = attempt + 1;

        // Apply jitter delay
        const jitter = this.settings.retryJitter;
        if (jitter !== undefined) {
          const delay = this._calculateJitter(jitter, attempt + 1);
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay * 1000));
          }
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Calculate retry jitter delay
   */
  private _calculateJitter(
    jitter: number | string | ((retryCount: number) => number),
    retryCount: number
  ): number {
    if (typeof jitter === 'number') {
      return jitter * retryCount;
    }
    if (typeof jitter === 'function') {
      return jitter(retryCount);
    }
    if (typeof jitter === 'string') {
      const method = (this as Record<string, unknown>)[jitter];
      if (typeof method === 'function') {
        return (method as (count: number) => number).call(this, retryCount);
      }
    }
    return 0;
  }

  /**
   * Apply attribute defaults and bind to instance
   */
  private _applyAttributes(args: Record<string, unknown>): void {
    const schema = this.attributesSchema;

    for (const [name, def] of Object.entries(schema)) {
      let value: unknown;

      // Get value from args or context
      if (name in args) {
        value = args[name];
      } else if (this.context.has(name)) {
        value = this.context.get(name);
      } else if (def.source) {
        // Get from source
        if (typeof def.source === 'function') {
          value = def.source(this);
        } else if (typeof def.source === 'string') {
          const source = (this as Record<string, unknown>)[def.source];
          if (typeof source === 'function') {
            value = (source as () => unknown).call(this);
          } else {
            value = source;
          }
        }
      }

      // Apply default if undefined
      if (value === undefined && def.default !== undefined) {
        value = typeof def.default === 'function' ? def.default() : def.default;
      }

      // TODO: Apply coercion

      // Bind to instance and context
      (this as Record<string, unknown>)[name] = value;
      this.context.set(name, value);
    }
  }

  /**
   * Validate attributes
   */
  private _validateAttributes(): void {
    const schema = this.attributesSchema;

    for (const [name, def] of Object.entries(schema)) {
      const value = (this as Record<string, unknown>)[name];

      // Check required
      if (def.required) {
        // Check conditional required
        let isRequired = true;
        if (def.if) {
          isRequired = this._evaluateCondition(def.if);
        }
        if (def.unless) {
          isRequired = isRequired && !this._evaluateCondition(def.unless);
        }

        if (isRequired && (value === undefined || value === null)) {
          this.errors.add(name, 'is required');
          continue;
        }
      }

      // Skip other validations if value is undefined/null
      if (value === undefined || value === null) {
        continue;
      }

      // Presence validation
      if (def.presence) {
        if (value === '' || (typeof value === 'string' && value.trim() === '')) {
          const msg = typeof def.presence === 'object' ? def.presence.message : undefined;
          this.errors.add(name, msg ?? "can't be blank");
        }
      }

      // Absence validation
      if (def.absence) {
        if (value !== '' && !(typeof value === 'string' && value.trim() === '')) {
          const msg = typeof def.absence === 'object' ? def.absence.message : undefined;
          this.errors.add(name, msg ?? 'must be blank');
        }
      }

      // Format validation
      if (def.format) {
        const strValue = String(value);
        if (def.format instanceof RegExp) {
          if (!def.format.test(strValue)) {
            this.errors.add(name, 'is invalid');
          }
        } else {
          if (def.format.with && !def.format.with.test(strValue)) {
            this.errors.add(name, def.format.message ?? 'is invalid');
          }
          if (def.format.without && def.format.without.test(strValue)) {
            this.errors.add(name, def.format.message ?? 'is invalid');
          }
        }
      }

      // Length validation
      if (def.length) {
        const len = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0;
        const { min, max, is, within, message } = def.length;

        if (min !== undefined && len < min) {
          this.errors.add(name, message ?? `is too short (minimum is ${min} characters)`);
        }
        if (max !== undefined && len > max) {
          this.errors.add(name, message ?? `is too long (maximum is ${max} characters)`);
        }
        if (is !== undefined && len !== is) {
          this.errors.add(name, message ?? `is the wrong length (should be ${is} characters)`);
        }
        if (within && (len < within[0] || len > within[1])) {
          this.errors.add(name, message ?? `length must be between ${within[0]} and ${within[1]}`);
        }
      }

      // Numeric validation
      if (def.numeric && typeof value === 'number') {
        const { min, max, is, within, message } = def.numeric;

        if (min !== undefined && value < min) {
          this.errors.add(name, message ?? `must be greater than or equal to ${min}`);
        }
        if (max !== undefined && value > max) {
          this.errors.add(name, message ?? `must be less than or equal to ${max}`);
        }
        if (is !== undefined && value !== is) {
          this.errors.add(name, message ?? `must be equal to ${is}`);
        }
        if (within && (value < within[0] || value > within[1])) {
          this.errors.add(name, message ?? `must be between ${within[0]} and ${within[1]}`);
        }
      }

      // Inclusion validation
      if (def.inclusion) {
        if (!def.inclusion.in.includes(value)) {
          this.errors.add(name, def.inclusion.message ?? 'is not included in the list');
        }
      }

      // Exclusion validation
      if (def.exclusion) {
        if (def.exclusion.in.includes(value)) {
          this.errors.add(name, def.exclusion.message ?? 'is reserved');
        }
      }
    }
  }

  /**
   * Evaluate a condition (if/unless)
   */
  private _evaluateCondition(
    condition: string | ((task: Task) => boolean)
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
   * Run callbacks of a specific type
   */
  private async _runCallbacks(type: CallbackType): Promise<void> {
    const callbacks = this.taskClass.callbacks?.[type] ?? [];

    for (const callback of callbacks) {
      if (typeof callback === 'string') {
        const method = (this as Record<string, unknown>)[callback];
        if (typeof method === 'function') {
          await (method as () => void | Promise<void>).call(this);
        }
      } else if (typeof callback === 'function') {
        await callback(this);
      } else if ('call' in callback) {
        await callback.call(this);
      }
    }
  }

  /**
   * Run lifecycle callbacks based on result state/status
   */
  private async _runLifecycleCallbacks(): Promise<void> {
    // State-based
    if (this._state === 'complete') {
      await this._runCallbacks('onComplete');
    } else if (this._state === 'interrupted') {
      await this._runCallbacks('onInterrupted');
    }

    // Always run onExecuted
    await this._runCallbacks('onExecuted');

    // Status-based
    if (this._status === 'success') {
      await this._runCallbacks('onSuccess');
    } else if (this._status === 'skipped') {
      await this._runCallbacks('onSkipped');
    } else if (this._status === 'failed') {
      await this._runCallbacks('onFailed');
    }

    // Outcome-based
    if (this._status === 'success' || this._status === 'skipped') {
      await this._runCallbacks('onGood');
    }
    if (this._status === 'skipped' || this._status === 'failed') {
      await this._runCallbacks('onBad');
    }
  }

  /**
   * Create the result object
   */
  private _createResult(): Result<TContext> {
    return createResult({
      task: this,
      context: this.context,
      chain: this.chain,
      index: this._index,
      state: this._state,
      status: this._status,
      reason: this._reason,
      cause: this._cause,
      metadata: this._metadata,
      retries: this._retries,
      rolledBack: this._rolledBack,
    });
  }

  [Symbol.toStringTag] = 'Task';
}

// ============================================
// Attribute definition helpers
// ============================================

/**
 * Define a required attribute
 */
export function required(options: Omit<AttributeDefinition, 'required'> = {}): AttributeDefinition {
  return { ...options, required: true };
}

/**
 * Define an optional attribute
 */
export function optional(options: Omit<AttributeDefinition, 'required'> = {}): AttributeDefinition {
  return { ...options, required: false };
}
