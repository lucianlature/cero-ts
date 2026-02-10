/**
 * Condition Tests - Duration parsing, condition waiters, evaluation
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseDuration,
  createConditionWaiter,
  evaluateConditions,
  cancelAllConditions,
  type ConditionWaiter,
} from './condition.js';

// ============================================
// parseDuration
// ============================================

describe('parseDuration', () => {
  describe('numeric input', () => {
    it('should return numbers as-is', () => {
      expect(parseDuration(5000)).toBe(5000);
      expect(parseDuration(0)).toBe(0);
      expect(parseDuration(100)).toBe(100);
    });

    it('should parse numeric strings', () => {
      expect(parseDuration('5000')).toBe(5000);
      expect(parseDuration('0')).toBe(0);
    });
  });

  describe('single unit strings', () => {
    it('should parse milliseconds', () => {
      expect(parseDuration('100ms')).toBe(100);
    });

    it('should parse seconds', () => {
      expect(parseDuration('30s')).toBe(30_000);
      expect(parseDuration('30sec')).toBe(30_000);
      expect(parseDuration('1second')).toBe(1_000);
      expect(parseDuration('5seconds')).toBe(5_000);
    });

    it('should parse minutes', () => {
      expect(parseDuration('5m')).toBe(300_000);
      expect(parseDuration('5min')).toBe(300_000);
      expect(parseDuration('1minute')).toBe(60_000);
      expect(parseDuration('5minutes')).toBe(300_000);
    });

    it('should parse hours', () => {
      expect(parseDuration('1h')).toBe(3_600_000);
      expect(parseDuration('2hr')).toBe(7_200_000);
      expect(parseDuration('1hour')).toBe(3_600_000);
      expect(parseDuration('24hours')).toBe(86_400_000);
    });

    it('should parse days', () => {
      expect(parseDuration('1d')).toBe(86_400_000);
      expect(parseDuration('1day')).toBe(86_400_000);
      expect(parseDuration('7days')).toBe(604_800_000);
    });

    it('should parse weeks', () => {
      expect(parseDuration('1w')).toBe(604_800_000);
      expect(parseDuration('1week')).toBe(604_800_000);
      expect(parseDuration('2weeks')).toBe(1_209_600_000);
    });

    it('should be case-insensitive', () => {
      expect(parseDuration('30S')).toBe(30_000);
      expect(parseDuration('5M')).toBe(300_000);
      expect(parseDuration('1H')).toBe(3_600_000);
    });
  });

  describe('compound strings', () => {
    it('should parse hours and minutes', () => {
      expect(parseDuration('1h 30m')).toBe(5_400_000);
    });

    it('should parse days and hours', () => {
      expect(parseDuration('2d 12h')).toBe(216_000_000);
    });

    it('should parse complex durations', () => {
      expect(parseDuration('1d 2h 30m 15s')).toBe(
        86_400_000 + 7_200_000 + 1_800_000 + 15_000,
      );
    });
  });

  describe('fractional values', () => {
    it('should parse fractional seconds', () => {
      expect(parseDuration('1.5s')).toBe(1_500);
    });

    it('should parse fractional minutes', () => {
      expect(parseDuration('0.5m')).toBe(30_000);
    });
  });

  describe('error cases', () => {
    it('should throw on unknown units', () => {
      expect(() => parseDuration('5x')).toThrow("Unknown duration unit: 'x'");
    });

    it('should throw on unparseable strings', () => {
      expect(() => parseDuration('abc')).toThrow("Unable to parse duration: 'abc'");
    });

    it('should throw on empty strings', () => {
      expect(() => parseDuration('')).toThrow('Unable to parse duration');
    });
  });
});

// ============================================
// createConditionWaiter
// ============================================

describe('createConditionWaiter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve immediately if predicate is already true', async () => {
    const { promise, waiter } = createConditionWaiter(() => true);

    const result = await promise;

    expect(result).toBe(true);
    expect(waiter.resolved).toBe(true);
  });

  it('should create a pending waiter for false predicate', () => {
    const { waiter } = createConditionWaiter(() => false);

    expect(waiter.resolved).toBe(false);
  });

  it('should resolve with false on timeout', async () => {
    vi.useFakeTimers();

    const { promise, waiter } = createConditionWaiter(() => false, 100);

    expect(waiter.resolved).toBe(false);

    vi.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toBe(false);
    expect(waiter.resolved).toBe(true);

    vi.useRealTimers();
  });

  it('should resolve with false on timeout using string duration', async () => {
    vi.useFakeTimers();

    const { promise } = createConditionWaiter(() => false, '1s');

    vi.advanceTimersByTime(1000);

    const result = await promise;
    expect(result).toBe(false);

    vi.useRealTimers();
  });

  it('should be cancellable', async () => {
    const { promise, cancel } = createConditionWaiter(() => false);

    cancel();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('should be cancellable with timeout (clears timeout)', async () => {
    vi.useFakeTimers();

    const { promise, waiter, cancel } = createConditionWaiter(() => false, '10s');

    expect(waiter.timeoutId).toBeDefined();
    cancel();

    const result = await promise;
    expect(result).toBe(false);
    expect(waiter.resolved).toBe(true);

    vi.useRealTimers();
  });

  it('cancel should be idempotent', async () => {
    const { promise, cancel } = createConditionWaiter(() => false);

    cancel();
    cancel(); // Second call should be a no-op

    const result = await promise;
    expect(result).toBe(false);
  });
});

// ============================================
// evaluateConditions
// ============================================

describe('evaluateConditions', () => {
  it('should resolve waiters whose predicates are now true', async () => {
    let flag = false;
    const { promise, waiter } = createConditionWaiter(() => flag);
    const waiters: ConditionWaiter[] = [waiter];

    // First evaluation — predicate still false
    let satisfied = evaluateConditions(waiters);
    expect(satisfied).toBe(0);
    expect(waiters.length).toBe(1);

    // Mutate state
    flag = true;

    // Second evaluation — predicate now true
    satisfied = evaluateConditions(waiters);
    expect(satisfied).toBe(1);
    expect(waiters.length).toBe(0);

    const result = await promise;
    expect(result).toBe(true);
  });

  it('should handle multiple waiters', async () => {
    let a = false;
    let b = false;

    const w1 = createConditionWaiter(() => a);
    const w2 = createConditionWaiter(() => b);
    const waiters: ConditionWaiter[] = [w1.waiter, w2.waiter];

    // Only a becomes true
    a = true;
    let satisfied = evaluateConditions(waiters);
    expect(satisfied).toBe(1);
    expect(waiters.length).toBe(1);

    const r1 = await w1.promise;
    expect(r1).toBe(true);

    // Now b becomes true
    b = true;
    satisfied = evaluateConditions(waiters);
    expect(satisfied).toBe(1);
    expect(waiters.length).toBe(0);

    const r2 = await w2.promise;
    expect(r2).toBe(true);
  });

  it('should skip already-resolved waiters', async () => {
    const { waiter, cancel } = createConditionWaiter(() => false);
    const waiters: ConditionWaiter[] = [waiter];

    cancel(); // Resolve it externally

    const satisfied = evaluateConditions(waiters);
    expect(satisfied).toBe(0);
    expect(waiters.length).toBe(0); // Cleaned up
  });

  it('should survive predicate exceptions', async () => {
    let shouldThrow = true;
    const { promise, waiter } = createConditionWaiter(() => {
      if (shouldThrow) throw new Error('boom');
      return true;
    });
    const waiters: ConditionWaiter[] = [waiter];

    // First call — predicate throws, waiter kept alive
    const satisfied = evaluateConditions(waiters);
    expect(satisfied).toBe(0);
    expect(waiters.length).toBe(1);

    // Fix the predicate
    shouldThrow = false;
    const satisfied2 = evaluateConditions(waiters);
    expect(satisfied2).toBe(1);

    const result = await promise;
    expect(result).toBe(true);
  });

  it('should clear timeout when resolving via evaluation', async () => {
    vi.useFakeTimers();

    let flag = false;
    const { promise, waiter } = createConditionWaiter(() => flag, '10s');
    const waiters: ConditionWaiter[] = [waiter];

    flag = true;
    evaluateConditions(waiters);

    const result = await promise;
    expect(result).toBe(true);

    vi.useRealTimers();
  });

  it('should return 0 for empty array', () => {
    expect(evaluateConditions([])).toBe(0);
  });
});

// ============================================
// cancelAllConditions
// ============================================

describe('cancelAllConditions', () => {
  it('should cancel all pending waiters', async () => {
    const w1 = createConditionWaiter(() => false);
    const w2 = createConditionWaiter(() => false);
    const waiters: ConditionWaiter[] = [w1.waiter, w2.waiter];

    cancelAllConditions(waiters);

    expect(waiters.length).toBe(0);
    expect(w1.waiter.resolved).toBe(true);
    expect(w2.waiter.resolved).toBe(true);

    expect(await w1.promise).toBe(false);
    expect(await w2.promise).toBe(false);
  });

  it('should skip already-resolved waiters', async () => {
    const w1 = createConditionWaiter(() => true); // resolved immediately
    const w2 = createConditionWaiter(() => false);
    const waiters: ConditionWaiter[] = [w1.waiter, w2.waiter];

    cancelAllConditions(waiters);

    expect(waiters.length).toBe(0);
    expect(await w2.promise).toBe(false);
  });

  it('should handle empty array', () => {
    const waiters: ConditionWaiter[] = [];
    cancelAllConditions(waiters);
    expect(waiters.length).toBe(0);
  });
});
