/**
 * Result - Immutable outcome of task execution
 */

import type { Chain } from './chain.js';
import type { Context } from './context.js';
import type { Task } from './task.js';

/**
 * Execution states
 */
export type State = 'initialized' | 'executing' | 'complete' | 'interrupted';

/**
 * Execution statuses
 */
export type Status = 'success' | 'skipped' | 'failed';

/**
 * Outcome combines state and status for pattern matching
 */
export type Outcome = 'success' | 'skipped' | 'failed' | 'interrupted';

/**
 * Handler types for fluent result handling
 */
export type HandlerType =
  | Status
  | 'complete'
  | 'interrupted'
  | 'executed'
  | 'good'
  | 'bad';

/**
 * Result handler function
 */
export type ResultHandler<T extends Record<string, unknown>> = (
  result: Result<T>
) => void | Promise<void>;

/**
 * Result metadata
 */
export interface ResultMetadata {
  [key: string]: unknown;
  errors?: {
    fullMessage: string;
    messages: Record<string, string[]>;
  };
  runtime?: number;
  correlationId?: string;
}

/**
 * Options for creating a result
 */
export interface ResultOptions<T extends Record<string, unknown>> {
  task: Task<T>;
  context: Context<T>;
  chain: Chain;
  index: number;
  state?: State;
  status?: Status;
  reason?: string;
  cause?: Error;
  metadata?: ResultMetadata;
  retries?: number;
  rolledBack?: boolean;
}

/**
 * Immutable result object representing the outcome of task execution.
 */
export class Result<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The task that produced this result */
  readonly task: Task<T>;

  /** The context at the time of result creation */
  readonly context: Context<T>;

  /** The execution chain */
  readonly chain: Chain;

  /** Position in the execution sequence */
  readonly index: number;

  /** Execution lifecycle state */
  readonly state: State;

  /** Business outcome status */
  readonly status: Status;

  /** Reason for interruption (skip/fail) */
  readonly reason?: string;

  /** The exception that caused the interruption */
  readonly cause?: Error;

  /** Additional metadata */
  readonly metadata: ResultMetadata;

  /** Number of retry attempts made */
  readonly retries: number;

  /** Whether rollback was executed */
  readonly rolledBack: boolean;

  constructor(options: ResultOptions<T>) {
    this.task = options.task;
    this.context = options.context;
    this.chain = options.chain;
    this.index = options.index;
    this.state = options.state ?? 'initialized';
    this.status = options.status ?? 'success';
    this.reason = options.reason;
    this.cause = options.cause;
    this.metadata = options.metadata ?? {};
    this.retries = options.retries ?? 0;
    this.rolledBack = options.rolledBack ?? false;

    // Freeze the result to make it immutable
    Object.freeze(this);
    Object.freeze(this.metadata);
  }

  // ============================================
  // State predicates
  // ============================================

  /** Check if task was initialized but not executed */
  get initialized(): boolean {
    return this.state === 'initialized';
  }

  /** Check if task is currently executing */
  get executing(): boolean {
    return this.state === 'executing';
  }

  /** Check if task completed successfully */
  get complete(): boolean {
    return this.state === 'complete';
  }

  /** Check if task was interrupted */
  get interrupted(): boolean {
    return this.state === 'interrupted';
  }

  /** Check if task has finished execution (complete or interrupted) */
  get executed(): boolean {
    return this.state === 'complete' || this.state === 'interrupted';
  }

  // ============================================
  // Status predicates
  // ============================================

  /** Check if task succeeded */
  get success(): boolean {
    return this.status === 'success';
  }

  /** Check if task was skipped */
  get skipped(): boolean {
    return this.status === 'skipped';
  }

  /** Check if task failed */
  get failed(): boolean {
    return this.status === 'failed';
  }

  // ============================================
  // Outcome categorization
  // ============================================

  /** Check if outcome is good (success or skipped) */
  get good(): boolean {
    return this.status === 'success' || this.status === 'skipped';
  }

  /** Check if outcome is bad (skipped or failed) */
  get bad(): boolean {
    return this.status === 'skipped' || this.status === 'failed';
  }

  /** Get unified outcome string */
  get outcome(): Outcome {
    if (this.state === 'interrupted') {
      return this.status === 'skipped' ? 'skipped' : 'interrupted';
    }
    return this.status;
  }

  // ============================================
  // Retry status
  // ============================================

  /** Check if task was retried */
  get retried(): boolean {
    return this.retries > 0;
  }

  // ============================================
  // Chain analysis
  // ============================================

  /** Result that originally caused the failure (in workflows) */
  causedFailure?: Result<T>;

  /** Result that threw/propagated the failure */
  threwFailure?: Result<T>;

  /** Check if this result was the original cause of failure */
  get causedFailureFlag(): boolean {
    return this.causedFailure === this;
  }

  /** Check if this result threw a failure */
  get threwFailureFlag(): boolean {
    return this.threwFailure !== undefined && this.threwFailure !== this;
  }

  /** Check if this result received a thrown failure */
  get thrownFailureFlag(): boolean {
    return this.causedFailure !== undefined && this.causedFailure !== this;
  }

  // ============================================
  // Fluent handlers
  // ============================================

  /** Handle result based on type */
  on(type: HandlerType, handler: ResultHandler<T>): this {
    const shouldHandle = this.shouldHandle(type);
    if (shouldHandle) {
      void handler(this);
    }
    return this;
  }

  /** Async handler that awaits */
  async onAsync(type: HandlerType, handler: ResultHandler<T>): Promise<this> {
    const shouldHandle = this.shouldHandle(type);
    if (shouldHandle) {
      await handler(this);
    }
    return this;
  }

  private shouldHandle(type: HandlerType): boolean {
    switch (type) {
      case 'success':
        return this.success;
      case 'skipped':
        return this.skipped;
      case 'failed':
        return this.failed;
      case 'complete':
        return this.complete;
      case 'interrupted':
        return this.interrupted;
      case 'executed':
        return this.executed;
      case 'good':
        return this.good;
      case 'bad':
        return this.bad;
      default:
        return false;
    }
  }

  // ============================================
  // Pattern matching support
  // ============================================

  /** Deconstruct as array [state, status] for pattern matching */
  [Symbol.iterator](): IterableIterator<string> {
    return [this.state, this.status][Symbol.iterator]();
  }

  /** Convert to JSON for serialization */
  toJSON(): ResultJSON {
    return {
      index: this.index,
      chainId: this.chain.id,
      type: this.task.constructor.name,
      taskId: this.task.id,
      state: this.state,
      status: this.status,
      outcome: this.outcome,
      reason: this.reason,
      metadata: this.metadata,
      retries: this.retries,
      rolledBack: this.rolledBack,
    };
  }

  [Symbol.toStringTag] = 'Result';
}

/**
 * JSON representation of a result
 */
export interface ResultJSON {
  index: number;
  chainId: string;
  type: string;
  taskId: string;
  state: State;
  status: Status;
  outcome: Outcome;
  reason?: string;
  metadata: ResultMetadata;
  retries: number;
  rolledBack: boolean;
}

/**
 * Create a new result
 */
export function createResult<T extends Record<string, unknown>>(
  options: ResultOptions<T>
): Result<T> {
  return new Result(options);
}

/**
 * Create a success result
 */
export function successResult<T extends Record<string, unknown>>(
  options: Omit<ResultOptions<T>, 'state' | 'status'>
): Result<T> {
  return new Result({ ...options, state: 'complete', status: 'success' });
}

/**
 * Create a skipped result
 */
export function skippedResult<T extends Record<string, unknown>>(
  options: Omit<ResultOptions<T>, 'state' | 'status'> & { reason?: string }
): Result<T> {
  return new Result({
    ...options,
    state: 'interrupted',
    status: 'skipped',
    reason: options.reason ?? 'Unspecified',
  });
}

/**
 * Create a failed result
 */
export function failedResult<T extends Record<string, unknown>>(
  options: Omit<ResultOptions<T>, 'state' | 'status'> & { reason?: string; cause?: Error }
): Result<T> {
  return new Result({
    ...options,
    state: 'interrupted',
    status: 'failed',
    reason: options.reason ?? 'Unspecified',
  });
}
