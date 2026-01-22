/**
 * Timeout Middleware - Prevent tasks from running too long
 */

import { TimeoutError } from '../errors.js';
import type { Task } from '../task.js';
import type { Result } from '../result.js';

export interface TimeoutOptions {
  /** Timeout in seconds (default: 3) */
  seconds?: number | string | ((task: Task) => number);
  /** Condition to apply timeout */
  if?: string | ((task: Task) => boolean);
  /** Condition to skip timeout */
  unless?: string | ((task: Task) => boolean);
}

const DEFAULT_TIMEOUT_SECONDS = 3;

/**
 * Middleware that enforces a timeout on task execution.
 *
 * @example
 * ```typescript
 * class ProcessReport extends Task {
 *   static middlewares = [
 *     [TimeoutMiddleware, { seconds: 5 }],
 *   ];
 * }
 * ```
 */
export async function TimeoutMiddleware<T extends Record<string, unknown>>(
  task: Task<T>,
  options: TimeoutOptions,
  next: () => Promise<Result<T>>
): Promise<Result<T>> {
  // Check conditions
  if (options.if !== undefined) {
    const shouldApply = evaluateCondition(task, options.if);
    if (!shouldApply) {
      return next();
    }
  }

  if (options.unless !== undefined) {
    const shouldSkip = evaluateCondition(task, options.unless);
    if (shouldSkip) {
      return next();
    }
  }

  // Get timeout value
  const seconds = resolveTimeout(task, options.seconds ?? DEFAULT_TIMEOUT_SECONDS);
  const timeoutMs = seconds * 1000;

  // Execute with timeout
  return Promise.race([
    next(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(seconds, `Execution exceeded ${seconds} seconds`));
      }, timeoutMs);
    }),
  ]);
}

function resolveTimeout<T extends Record<string, unknown>>(
  task: Task<T>,
  value: number | string | ((task: Task<T>) => number)
): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'function') {
    return value(task);
  }
  if (typeof value === 'string') {
    const taskAny = task as unknown as Record<string, unknown>;
    const method = taskAny[value];
    if (typeof method === 'function') {
      return (method as () => number).call(task);
    }
    const numValue = Number(method);
    return Number.isNaN(numValue) ? DEFAULT_TIMEOUT_SECONDS : numValue;
  }
  return DEFAULT_TIMEOUT_SECONDS;
}

function evaluateCondition<T extends Record<string, unknown>>(
  task: Task<T>,
  condition: string | ((task: Task<T>) => boolean)
): boolean {
  if (typeof condition === 'function') {
    return condition(task);
  }
  const taskAny = task as unknown as Record<string, unknown>;
  const method = taskAny[condition];
  if (typeof method === 'function') {
    return !!(method as () => boolean).call(task);
  }
  return !!method;
}
