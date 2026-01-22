# Middlewares

Wrap task execution with middleware for cross-cutting concerns like authentication, caching, timeouts, and monitoring. Think Express middleware, but for your business logic.

## Execution Order

Middleware wraps task execution in layers, like an onion:

> **Note:** First registered = outermost wrapper. They execute in registration order.

```typescript
class ProcessCampaign extends Task {
  static override middlewares = [
    AuditMiddleware,           // 1st: outermost wrapper
    AuthorizationMiddleware,   // 2nd: middle wrapper
    CacheMiddleware,           // 3rd: innermost wrapper
  ];

  override async work() {
    // Your logic here...
  }
}

// Execution flow:
// 1. AuditMiddleware (before)
// 2.   AuthorizationMiddleware (before)
// 3.     CacheMiddleware (before)
// 4.       [task execution]
// 5.     CacheMiddleware (after)
// 6.   AuthorizationMiddleware (after)
// 7. AuditMiddleware (after)
```

## Declarations

### Arrow Functions

Use arrow functions for simple middleware logic:

```typescript
class ProcessCampaign extends Task {
  static override middlewares = [
    async (task, options, next) => {
      const result = await next();
      Analytics.track(result.status);
      return result;
    },
  ];
}
```

### Class-Based Middleware

For complex middleware logic, use classes:

```typescript
class TelemetryMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    const start = performance.now();
    try {
      const result = await next();
      Telemetry.record(result.status, performance.now() - start);
      return result;
    } catch (error) {
      Telemetry.recordError(error);
      throw error;
    }
  }
}

class ProcessCampaign extends Task {
  static override middlewares = [
    TelemetryMiddleware,
    new TelemetryMiddleware(), // Instance also works
  ];
}
```

### Middleware with Options

Pass options to middleware using tuple syntax:

```typescript
class ProcessCampaign extends Task {
  static override middlewares = [
    [TimeoutMiddleware, { seconds: 30 }],
    [CorrelateMiddleware, { id: () => getCurrentRequestId() }],
  ];
}
```

## Built-in Middleware

### TimeoutMiddleware

Prevent tasks from running too long:

```typescript
import { Task } from 'cero-ts';
import { TimeoutMiddleware } from 'cero-ts/middleware';

class ProcessReport extends Task {
  static override middlewares = [
    // Default timeout: 30 seconds
    TimeoutMiddleware,

    // Custom timeout in seconds
    [TimeoutMiddleware, { seconds: 10 }],

    // Dynamic timeout from task method
    [TimeoutMiddleware, { seconds: 'maxProcessingTime' }],

    // Dynamic timeout from function
    [TimeoutMiddleware, { seconds: (task) => task.context.get('timeout') || 30 }],
  ];

  override async work() {
    // Your logic here...
  }

  maxProcessingTime() {
    return process.env.NODE_ENV === 'production' ? 2 : 10;
  }
}

// Timeout result
const result = await ProcessReport.execute();
if (result.failed) {
  result.reason;   // "[TimeoutError] execution exceeded 10 seconds"
  result.cause;    // TimeoutError instance
  result.metadata; // { timeout: 10 }
}
```

### CorrelateMiddleware

Add correlation IDs for distributed tracing and request tracking:

```typescript
import { Task } from 'cero-ts';
import { CorrelateMiddleware } from 'cero-ts/middleware';

class ProcessExport extends Task {
  static override middlewares = [
    // Default: generates UUID
    CorrelateMiddleware,

    // Custom correlation ID
    [CorrelateMiddleware, { id: () => getCurrentRequestId() }],

    // From task context
    [CorrelateMiddleware, { id: (task) => task.context.get('sessionId') }],
  ];

  override async work() {
    // Your logic here...
  }
}

const result = await ProcessExport.execute();
result.metadata; // { correlationId: "550e8400-e29b-41d4-a716-446655440000" }
```

### RuntimeMiddleware

Track task execution time in milliseconds:

```typescript
import { Task } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';

class ProcessExport extends Task {
  static override middlewares = [RuntimeMiddleware];
}

const result = await ProcessExport.execute();
result.metadata; // { runtime: 1247 } (ms)
```

## Custom Middleware

### Basic Pattern

```typescript
import { Task, Result } from 'cero-ts';

class LoggingMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    console.log(`Starting: ${task.constructor.name}`);
    const start = Date.now();

    const result = await next();

    console.log(`Finished: ${task.constructor.name} in ${Date.now() - start}ms`);
    return result;
  }
}
```

### Authentication Middleware

```typescript
class AuthMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: { roles?: string[] },
    next: () => Promise<Result>
  ): Promise<Result> {
    const user = task.context.get('currentUser');

    if (!user) {
      return Result.failed(task, 'Authentication required', { code: 401 });
    }

    if (options.roles && !options.roles.some(r => user.roles.includes(r))) {
      return Result.failed(task, 'Insufficient permissions', { code: 403 });
    }

    return next();
  }
}

class AdminTask extends Task {
  static override middlewares = [
    [AuthMiddleware, { roles: ['admin'] }],
  ];
}
```

### Retry Middleware

```typescript
class RetryMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: { maxAttempts?: number; delay?: number },
    next: () => Promise<Result>
  ): Promise<Result> {
    const maxAttempts = options.maxAttempts ?? 3;
    const delay = options.delay ?? 1000;

    let lastResult: Result;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResult = await next();

      if (lastResult.success || lastResult.skipped) {
        return lastResult;
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }

    return lastResult!;
  }
}
```

## Global Middleware

Register middleware that runs for all tasks:

```typescript
import { configure } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';

configure((config) => {
  config.middlewares.register(RuntimeMiddleware);
  config.middlewares.register(new LoggingMiddleware());
});
```

## Middleware vs Callbacks

| Aspect | Middleware | Callbacks |
|--------|------------|-----------|
| Wraps execution | Yes | No |
| Can short-circuit | Yes | No |
| Access to result | During/after | After only |
| Use case | Cross-cutting concerns | Side effects |

Use middleware when you need to:
- Transform or intercept the result
- Short-circuit execution (auth, caching)
- Measure timing around execution
- Add try/catch error handling

Use callbacks when you need to:
- React to outcomes (notifications, logging)
- Perform cleanup
- Trigger side effects after completion
