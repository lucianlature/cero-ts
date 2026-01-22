/**
 * Middleware Integration Example
 *
 * This example demonstrates middleware patterns:
 * - Built-in middleware (Timeout, Correlate, Runtime)
 * - Custom middleware
 * - Middleware with options
 * - Middleware ordering
 * - Global middleware registration
 */

import { Task, required, optional, configure, Result } from 'cero-ts';
import { TimeoutMiddleware, RuntimeMiddleware, CorrelateMiddleware } from 'cero-ts/middleware';

// =============================================================================
// Example 1: Built-in Middleware
// =============================================================================

interface ProcessingContext extends Record<string, unknown> {
  result: string;
}

class ProcessWithBuiltinMiddleware extends Task<ProcessingContext> {
  static override middlewares = [
    // Track execution time
    RuntimeMiddleware,

    // Add correlation ID
    CorrelateMiddleware,

    // Timeout after 5 seconds
    [TimeoutMiddleware, { seconds: 5 }],
  ];

  override async work() {
    console.log('Processing...');
    await delay(100);
    this.context.result = 'processed';
    console.log('Done processing');
  }
}

async function runBuiltinMiddleware() {
  const result = await ProcessWithBuiltinMiddleware.execute();

  if (result.success) {
    console.log('Result:', result.context.result);
    console.log('Runtime:', result.metadata.runtime, 'ms');
    console.log('Correlation ID:', result.metadata.correlationId);
  }
}

// =============================================================================
// Example 2: Custom Middleware - Logging
// =============================================================================

/**
 * Middleware that logs task execution
 */
class LoggingMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    _options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    const taskName = task.constructor.name;
    const startTime = new Date().toISOString();

    console.log(`[${startTime}] START: ${taskName}`);

    const result = await next();

    const endTime = new Date().toISOString();
    console.log(`[${endTime}] END: ${taskName} - ${result.status}`);

    return result;
  }
}

class LoggedTask extends Task {
  static override middlewares = [LoggingMiddleware];

  override async work() {
    await delay(50);
    this.context.set('logged', true);
  }
}

async function runLoggingMiddleware() {
  await LoggedTask.execute();
}

// =============================================================================
// Example 3: Custom Middleware - Authentication
// =============================================================================

interface AuthUser {
  id: string;
  name: string;
  roles: string[];
}

/**
 * Middleware that checks authentication and authorization
 */
class AuthMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: { roles?: string[] },
    next: () => Promise<Result>
  ): Promise<Result> {
    const currentUser = task.context.get('currentUser') as AuthUser | undefined;

    // Check authentication
    if (!currentUser) {
      return Result.failed(task, 'Authentication required', { code: 'AUTH_REQUIRED' });
    }

    // Check authorization if roles specified
    if (options.roles && options.roles.length > 0) {
      const hasRole = options.roles.some((role) => currentUser.roles.includes(role));
      if (!hasRole) {
        return Result.failed(task, 'Insufficient permissions', {
          code: 'FORBIDDEN',
          requiredRoles: options.roles,
          userRoles: currentUser.roles,
        });
      }
    }

    // User authenticated and authorized
    return next();
  }
}

class AdminTask extends Task {
  static override middlewares = [[AuthMiddleware, { roles: ['admin'] }]];

  override async work() {
    console.log('Performing admin operation...');
    this.context.set('adminAction', true);
  }
}

class UserTask extends Task {
  static override middlewares = [[AuthMiddleware, { roles: ['user', 'admin'] }]];

  override async work() {
    console.log('Performing user operation...');
    this.context.set('userAction', true);
  }
}

async function runAuthMiddleware() {
  // No user - should fail
  console.log('--- No user ---');
  const noUser = await AdminTask.execute();
  console.log('Result:', noUser.status, noUser.reason ?? '');

  // Regular user trying admin task - should fail
  console.log('\n--- Regular user on admin task ---');
  const regularUser = await AdminTask.execute({
    currentUser: { id: '1', name: 'Alice', roles: ['user'] },
  });
  console.log('Result:', regularUser.status, regularUser.reason ?? '');

  // Admin user - should succeed
  console.log('\n--- Admin user ---');
  const adminUser = await AdminTask.execute({
    currentUser: { id: '2', name: 'Bob', roles: ['admin'] },
  });
  console.log('Result:', adminUser.status);

  // Regular user on user task - should succeed
  console.log('\n--- Regular user on user task ---');
  const userOnUserTask = await UserTask.execute({
    currentUser: { id: '1', name: 'Alice', roles: ['user'] },
  });
  console.log('Result:', userOnUserTask.status);
}

// =============================================================================
// Example 4: Custom Middleware - Retry
// =============================================================================

/**
 * Middleware that retries failed tasks
 */
class RetryMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: { maxAttempts?: number; delay?: number; retryOn?: string[] },
    next: () => Promise<Result>
  ): Promise<Result> {
    const maxAttempts = options.maxAttempts ?? 3;
    const delayMs = options.delay ?? 1000;
    const retryOn = options.retryOn ?? ['failed'];

    let lastResult: Result | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Attempt ${attempt}/${maxAttempts}`);

      lastResult = await next();

      // Check if we should retry
      if (!retryOn.includes(lastResult.status)) {
        return lastResult;
      }

      // Check if retryable
      if (lastResult.metadata.retryable === false) {
        console.log('Not retryable, stopping');
        return lastResult;
      }

      if (attempt < maxAttempts) {
        console.log(`Retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
    }

    return lastResult!;
  }
}

let attemptCount = 0;

class FlakyTask extends Task {
  static override middlewares = [[RetryMiddleware, { maxAttempts: 3, delay: 100 }]];

  override async work() {
    attemptCount++;

    // Fail first 2 attempts
    if (attemptCount < 3) {
      this.fail(`Attempt ${attemptCount} failed`, { retryable: true });
      return;
    }

    console.log('Finally succeeded!');
    this.context.set('attempts', attemptCount);
  }
}

async function runRetryMiddleware() {
  attemptCount = 0;
  const result = await FlakyTask.execute();

  console.log('Final status:', result.status);
  if (result.success) {
    console.log('Total attempts:', result.context.get('attempts'));
  }
}

// =============================================================================
// Example 5: Custom Middleware - Caching
// =============================================================================

const cache = new Map<string, { result: Result; expiry: number }>();

/**
 * Middleware that caches task results
 */
class CacheMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: { key?: string | ((task: Task<T>) => string); ttl?: number },
    next: () => Promise<Result>
  ): Promise<Result> {
    // Generate cache key
    let cacheKey: string;
    if (typeof options.key === 'function') {
      cacheKey = options.key(task);
    } else if (options.key) {
      cacheKey = options.key;
    } else {
      cacheKey = `${task.constructor.name}:${JSON.stringify(task.context.toObject())}`;
    }

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log('Cache HIT:', cacheKey);
      return cached.result;
    }

    console.log('Cache MISS:', cacheKey);

    // Execute and cache
    const result = await next();

    if (result.success) {
      const ttl = options.ttl ?? 60000; // Default 1 minute
      cache.set(cacheKey, {
        result,
        expiry: Date.now() + ttl,
      });
    }

    return result;
  }
}

class ExpensiveCalculation extends Task {
  static override attributes = {
    input: required(),
  };

  declare input: string;

  static override middlewares = [
    [CacheMiddleware, { key: (task: Task) => `calc:${task.context.get('input')}`, ttl: 5000 }],
    RuntimeMiddleware,
  ];

  override async work() {
    console.log('Performing expensive calculation...');
    await delay(500); // Simulate expensive operation
    this.context.set('output', `result_of_${this.input}`);
  }
}

async function runCacheMiddleware() {
  console.log('First call (cache miss):');
  const first = await ExpensiveCalculation.execute({ input: 'test' });
  console.log('Runtime:', first.metadata.runtime, 'ms');

  console.log('\nSecond call (cache hit):');
  const second = await ExpensiveCalculation.execute({ input: 'test' });
  console.log('Runtime:', second.metadata.runtime ?? 0, 'ms');

  console.log('\nDifferent input (cache miss):');
  const different = await ExpensiveCalculation.execute({ input: 'other' });
  console.log('Runtime:', different.metadata.runtime, 'ms');
}

// =============================================================================
// Example 6: Middleware Ordering
// =============================================================================

class OrderDemoMiddleware1 {
  async call<T extends Record<string, unknown>>(
    _task: Task<T>,
    _options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    console.log('Middleware 1: BEFORE');
    const result = await next();
    console.log('Middleware 1: AFTER');
    return result;
  }
}

class OrderDemoMiddleware2 {
  async call<T extends Record<string, unknown>>(
    _task: Task<T>,
    _options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    console.log('Middleware 2: BEFORE');
    const result = await next();
    console.log('Middleware 2: AFTER');
    return result;
  }
}

class OrderDemoMiddleware3 {
  async call<T extends Record<string, unknown>>(
    _task: Task<T>,
    _options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    console.log('Middleware 3: BEFORE');
    const result = await next();
    console.log('Middleware 3: AFTER');
    return result;
  }
}

class OrderDemoTask extends Task {
  static override middlewares = [
    OrderDemoMiddleware1, // Outermost
    OrderDemoMiddleware2, // Middle
    OrderDemoMiddleware3, // Innermost
  ];

  override async work() {
    console.log('>>> TASK EXECUTION <<<');
  }
}

async function runMiddlewareOrdering() {
  await OrderDemoTask.execute();
}

// =============================================================================
// Example 7: Global Middleware Registration
// =============================================================================

// Register global middleware
configure((config) => {
  // This would run for ALL tasks
  // config.middlewares.register(RuntimeMiddleware);

  // For demo, we'll just log that it's configured
  console.log('Global middleware configured');
});

// =============================================================================
// Helper function
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Run all examples
// =============================================================================

async function main() {
  console.log('=== Example 1: Built-in Middleware ===\n');
  await runBuiltinMiddleware();

  console.log('\n\n=== Example 2: Logging Middleware ===\n');
  await runLoggingMiddleware();

  console.log('\n\n=== Example 3: Auth Middleware ===\n');
  await runAuthMiddleware();

  console.log('\n\n=== Example 4: Retry Middleware ===\n');
  await runRetryMiddleware();

  console.log('\n\n=== Example 5: Cache Middleware ===\n');
  await runCacheMiddleware();

  console.log('\n\n=== Example 6: Middleware Ordering ===\n');
  await runMiddlewareOrdering();
}

main().catch(console.error);
