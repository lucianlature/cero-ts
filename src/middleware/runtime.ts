/**
 * Runtime Middleware - Track task execution time
 */

import { performance } from 'node:perf_hooks';
import type { Task } from '../task.js';
import type { Result } from '../result.js';

export interface RuntimeOptions {
  /** Condition to apply runtime tracking */
  if?: string | ((task: Task) => boolean);
  /** Condition to skip runtime tracking */
  unless?: string | ((task: Task) => boolean);
}

/**
 * Middleware that tracks task execution time in milliseconds using a monotonic clock.
 *
 * @example
 * ```typescript
 * class ProcessExport extends Task {
 *   static middlewares = [
 *     RuntimeMiddleware,
 *   ];
 * }
 * ```
 */
export async function RuntimeMiddleware<T extends Record<string, unknown>>(
  task: Task<T>,
  options: RuntimeOptions,
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

  // Measure execution time
  const startTime = performance.now();
  const result = await next();
  const endTime = performance.now();

  // Result and its metadata are frozen (immutable). Create a new Result
  // with the runtime value merged into metadata.
  const runtime = Math.round(endTime - startTime);
  const { Result: ResultClass } = await import('../result.js');
  return new ResultClass<T>({
    task: result.task,
    context: result.context,
    chain: result.chain,
    index: result.index,
    state: result.state,
    status: result.status,
    reason: result.reason,
    cause: result.cause,
    metadata: { ...result.metadata, runtime },
    retries: result.retries,
    rolledBack: result.rolledBack,
  });
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
