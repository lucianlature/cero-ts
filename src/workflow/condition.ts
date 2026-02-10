/**
 * Condition - Block workflow execution until a predicate is satisfied
 *
 * Provides the `condition()` primitive that pauses a workflow until:
 * - A predicate function returns true (typically after a Signal mutates state), or
 * - An optional timeout expires
 *
 * Inspired by Temporal's `condition()` API.
 *
 * @example
 * ```typescript
 * // Wait indefinitely for approval
 * await this.condition(() => approved === true);
 *
 * // Wait with timeout — returns false if timeout expires
 * const received = await this.condition(() => approved === true, '30s');
 * if (!received) this.fail('Approval timed out');
 * ```
 */

// ============================================
// Duration Parsing
// ============================================

/**
 * Duration can be specified as:
 * - A number (milliseconds)
 * - A string with unit: '5s', '30s', '5m', '1h', '2d', '1w'
 * - A compound string: '1h 30m', '2d 12h'
 */
export type Duration = number | string;

/** Duration unit multipliers in milliseconds */
const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  sec: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;

/**
 * Parse a duration value into milliseconds.
 *
 * @param duration - Duration as number (ms) or string ('30s', '5m', '1h 30m')
 * @returns Duration in milliseconds
 * @throws {Error} If duration string is unparseable
 *
 * @example
 * ```typescript
 * parseDuration(5000);        // 5000
 * parseDuration('30s');       // 30000
 * parseDuration('5m');        // 300000
 * parseDuration('1h 30m');    // 5400000
 * parseDuration('2d');        // 172800000
 * ```
 */
export function parseDuration(duration: Duration): number {
  if (typeof duration === 'number') {
    return duration;
  }

  // Try parsing as plain number string (but not empty string)
  if (duration.trim().length > 0) {
    const numericValue = Number(duration);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }
  }

  let totalMs = 0;
  let matched = false;

  for (const match of duration.matchAll(DURATION_PATTERN)) {
    const value = Number.parseFloat(match[1] ?? '0');
    const unit = (match[2] ?? '').toLowerCase();
    const multiplier = DURATION_UNITS[unit];

    if (multiplier === undefined) {
      throw new Error(`Unknown duration unit: '${unit}' in '${duration}'`);
    }

    totalMs += value * multiplier;
    matched = true;
  }

  if (!matched) {
    throw new Error(`Unable to parse duration: '${duration}'`);
  }

  return totalMs;
}

// ============================================
// Condition Waiter
// ============================================

/**
 * Internal representation of a pending condition.
 * Created by `condition()`, resolved when predicate is true or timeout expires.
 */
export interface ConditionWaiter {
  /** The predicate to evaluate */
  readonly predicate: () => boolean;
  /** Resolve the condition promise (true = satisfied, false = timeout) */
  readonly resolve: (value: boolean) => void;
  /** Timeout handle for cleanup */
  timeoutId?: ReturnType<typeof setTimeout>;
  /** Whether this waiter has been resolved */
  resolved: boolean;
}

/**
 * Create a new condition waiter that resolves when the predicate is true
 * or the timeout expires.
 *
 * The returned promise resolves to:
 * - `true` if the predicate was satisfied
 * - `false` if the timeout expired before the predicate was satisfied
 *
 * Without a timeout, the promise only resolves when the predicate becomes true.
 *
 * @param predicate - Function that returns true when the condition is met
 * @param timeout - Optional timeout duration
 * @returns Object with the promise, the waiter (for external evaluation), and a cancel function
 */
export function createConditionWaiter(
  predicate: () => boolean,
  timeout?: Duration,
): { promise: Promise<boolean>; waiter: ConditionWaiter; cancel: () => void } {
  // Fast path: predicate already satisfied
  try {
    if (predicate()) {
      const waiter: ConditionWaiter = {
        predicate,
        resolve: () => {},
        resolved: true,
      };
      return {
        promise: Promise.resolve(true),
        waiter,
        cancel: () => {},
      };
    }
  } catch {
    // Predicate threw on initial check — fall through to create a pending waiter
  }

  const waiter: ConditionWaiter = {
    predicate,
    resolve: () => {},
    resolved: false,
  };

  const promise = new Promise<boolean>((resolve) => {
    (waiter as { resolve: (value: boolean) => void }).resolve = resolve;

    // Set up timeout if provided
    if (timeout !== undefined) {
      const timeoutMs = parseDuration(timeout);
      waiter.timeoutId = setTimeout(() => {
        if (!waiter.resolved) {
          waiter.resolved = true;
          resolve(false);
        }
      }, timeoutMs);
    }
  });

  const cancel = () => {
    if (!waiter.resolved) {
      waiter.resolved = true;
      if (waiter.timeoutId !== undefined) {
        clearTimeout(waiter.timeoutId);
      }
      waiter.resolve(false);
    }
  };

  return { promise, waiter, cancel };
}

/**
 * Evaluate all pending condition waiters and resolve any whose predicates are now true.
 * Returns the number of conditions that were satisfied.
 *
 * @param waiters - Mutable array of pending condition waiters
 * @returns Number of newly satisfied conditions
 */
export function evaluateConditions(waiters: ConditionWaiter[]): number {
  let satisfiedCount = 0;
  let writeIdx = 0;

  for (let i = 0; i < waiters.length; i++) {
    const waiter = waiters[i];
    if (!waiter) continue;

    // Skip already-resolved waiters
    if (waiter.resolved) {
      continue;
    }

    try {
      if (waiter.predicate()) {
        waiter.resolved = true;
        if (waiter.timeoutId !== undefined) {
          clearTimeout(waiter.timeoutId);
        }
        waiter.resolve(true);
        satisfiedCount++;
        continue;
      }
    } catch {
      // Predicate threw — keep the waiter alive, it may resolve later
    }

    // Keep unsatisfied waiters
    waiters[writeIdx] = waiter;
    writeIdx++;
  }

  // Trim the array in-place
  waiters.length = writeIdx;

  return satisfiedCount;
}

/**
 * Cancel all pending condition waiters.
 * Each waiter resolves with `false`.
 *
 * @param waiters - Array of pending condition waiters to cancel
 */
export function cancelAllConditions(waiters: ConditionWaiter[]): void {
  for (const waiter of waiters) {
    if (!waiter.resolved) {
      waiter.resolved = true;
      if (waiter.timeoutId !== undefined) {
        clearTimeout(waiter.timeoutId);
      }
      waiter.resolve(false);
    }
  }
  waiters.length = 0;
}
