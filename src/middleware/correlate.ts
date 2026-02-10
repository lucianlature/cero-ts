/**
 * Correlate Middleware - Add correlation IDs for distributed tracing
 */

import { generateTimeOrderedUUID } from '../utils/uuid.js';
import type { Task } from '../task.js';
import type { Result } from '../result.js';

export interface CorrelateOptions {
  /** Correlation ID or function to generate one */
  id?: unknown | string | ((task: Task) => string);
  /** Condition to apply correlation */
  if?: string | ((task: Task) => boolean);
  /** Condition to skip correlation */
  unless?: string | ((task: Task) => boolean);
}

/**
 * Middleware that adds correlation IDs to task metadata for distributed tracing.
 *
 * @example
 * ```typescript
 * class ProcessExport extends Task {
 *   static middlewares = [
 *     [CorrelateMiddleware, { id: () => getCurrentRequestId() }],
 *   ];
 * }
 * ```
 */
export async function CorrelateMiddleware<T extends Record<string, unknown>>(
  task: Task<T>,
  options: CorrelateOptions,
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

  // Generate or resolve correlation ID
  const correlationId = resolveCorrelationId(task, options.id);

  // Execute task
  const result = await next();

  // Add correlation ID to metadata
  // Note: Result is immutable, so we need to create a new result with updated metadata
  // For now, we'll mutate the metadata object before it's frozen (during execution)
  // This is a known limitation - proper implementation would require result transformation
  const metadata = result.metadata as Record<string, unknown>;
  metadata.correlationId = correlationId;

  return result;
}

function resolveCorrelationId<T extends Record<string, unknown>>(
  task: Task<T>,
  value?: unknown | string | ((task: Task<T>) => string)
): string {
  if (value === undefined) {
    return generateTimeOrderedUUID();
  }

  if (typeof value === 'function') {
    return value(task);
  }
  
  if (typeof value === 'string') {
    const taskAny = task as unknown as Record<string, unknown>;
    const method = taskAny[value];
    if (typeof method === 'function') {
      return (method as () => string).call(task);
    }
    return value;
  }
  return String(value);
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
