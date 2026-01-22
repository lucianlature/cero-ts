/**
 * Fault classes for task interruptions
 */

import type { Chain } from '../chain.js';
import type { Context } from '../context.js';
import type { Result, ResultMetadata } from '../result.js';
import type { Task, TaskClass } from '../task.js';

/**
 * Base fault class for task interruptions.
 * Thrown by execute!() when tasks halt based on breakpoints configuration.
 */
export class Fault<T extends Record<string, unknown> = Record<string, unknown>> extends Error {
  /** The result that caused this fault */
  readonly result: Result<T>;

  constructor(result: Result<T>, message?: string) {
    super(message ?? result.reason ?? 'Task interrupted');
    this.name = 'Fault';
    this.result = result;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /** Get the task that caused this fault */
  get task(): Task<T> {
    return this.result.task;
  }

  /** Get the context at fault time */
  get context(): Context<T> {
    return this.result.context;
  }

  /** Get the execution chain */
  get chain(): Chain {
    return this.result.chain;
  }

  /** Get fault metadata */
  get metadata(): ResultMetadata {
    return this.result.metadata;
  }

  /**
   * Create a matcher function for catching faults from specific task classes.
   * Usage: catch (SkipFault.for(TaskA, TaskB))
   */
  static for<T extends Record<string, unknown>>(
    ...taskClasses: TaskClass<T>[]
  ): FaultMatcher<T> {
    return new FaultMatcher(this as FaultConstructor<T>, taskClasses);
  }

  /**
   * Create a matcher function with custom predicate.
   * Usage: catch (Fault.matches(f => f.context.userId > 100))
   */
  static matches<T extends Record<string, unknown>>(
    predicate: (fault: Fault<T>) => boolean
  ): FaultPredicate<T> {
    return new FaultPredicate(this as FaultConstructor<T>, predicate);
  }
}

/**
 * Fault thrown when task is skipped via skip!()
 */
export class SkipFault<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends Fault<T> {
  constructor(result: Result<T>, message?: string) {
    super(result, message);
    this.name = 'SkipFault';
  }
}

/**
 * Fault thrown when task fails via fail!() or exception
 */
export class FailFault<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends Fault<T> {
  constructor(result: Result<T>, message?: string) {
    super(result, message);
    this.name = 'FailFault';
  }
}

/**
 * Fault constructor type
 */
export type FaultConstructor<T extends Record<string, unknown>> = new (
  result: Result<T>,
  message?: string
) => Fault<T>;

/**
 * Matcher for filtering faults by task class.
 * Implements Symbol.hasInstance for use with instanceof.
 */
export class FaultMatcher<T extends Record<string, unknown>> {
  private readonly faultClass: FaultConstructor<T>;
  private readonly taskClasses: TaskClass<T>[];

  constructor(faultClass: FaultConstructor<T>, taskClasses: TaskClass<T>[]) {
    this.faultClass = faultClass;
    this.taskClasses = taskClasses;
  }

  /**
   * Check if a value matches this matcher
   */
  matches(value: unknown): value is Fault<T> {
    if (!(value instanceof this.faultClass)) {
      return false;
    }
    if (this.taskClasses.length === 0) {
      return true;
    }
    const fault = value as Fault<T>;
    const taskConstructor = Object.getPrototypeOf(fault.task).constructor;
    return this.taskClasses.some(
      (cls) => fault.task instanceof cls || taskConstructor === cls
    );
  }

  /**
   * Support instanceof checks
   */
  [Symbol.hasInstance](value: unknown): boolean {
    return this.matches(value);
  }
}

/**
 * Predicate-based fault matcher.
 * Implements Symbol.hasInstance for use with instanceof.
 */
export class FaultPredicate<T extends Record<string, unknown>> {
  private readonly faultClass: FaultConstructor<T>;
  private readonly predicate: (fault: Fault<T>) => boolean;

  constructor(
    faultClass: FaultConstructor<T>,
    predicate: (fault: Fault<T>) => boolean
  ) {
    this.faultClass = faultClass;
    this.predicate = predicate;
  }

  /**
   * Check if a value matches this predicate
   */
  matches(value: unknown): value is Fault<T> {
    if (!(value instanceof this.faultClass)) {
      return false;
    }
    return this.predicate(value as Fault<T>);
  }

  /**
   * Support instanceof checks
   */
  [Symbol.hasInstance](value: unknown): boolean {
    return this.matches(value);
  }
}

/**
 * Type guard for Fault
 */
export function isFault<T extends Record<string, unknown>>(
  value: unknown
): value is Fault<T> {
  return value instanceof Fault;
}

/**
 * Type guard for SkipFault
 */
export function isSkipFault<T extends Record<string, unknown>>(
  value: unknown
): value is SkipFault<T> {
  return value instanceof SkipFault;
}

/**
 * Type guard for FailFault
 */
export function isFailFault<T extends Record<string, unknown>>(
  value: unknown
): value is FailFault<T> {
  return value instanceof FailFault;
}
