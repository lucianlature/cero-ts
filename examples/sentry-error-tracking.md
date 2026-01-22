# Sentry Error Tracking

Report unhandled exceptions and task failures to Sentry with detailed context.

[Sentry Node.js SDK](https://docs.sentry.io/platforms/javascript/guides/node/)

## Installation

```bash
npm install @sentry/node
```

## Setup

Create a middleware that integrates with Sentry:

```typescript
// lib/sentry-middleware.ts
import * as Sentry from '@sentry/node';
import { Task, Result } from 'cero-ts';

interface SentryMiddlewareOptions {
  /** Report logical failures (not just exceptions) */
  reportOn?: ('failed' | 'skipped')[];
  /** Additional tags to add to Sentry scope */
  tags?: Record<string, string>;
  /** Include context data in Sentry extras */
  includeContext?: boolean;
}

export class SentryMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: SentryMiddlewareOptions,
    next: () => Promise<Result>
  ): Promise<Result> {
    return Sentry.withScope(async (scope) => {
      // Set task information as tags
      scope.setTag('task', task.constructor.name);
      scope.setTag('taskId', task.id);
      scope.setTag('chainId', task.chainId);

      // Add custom tags
      if (options.tags) {
        for (const [key, value] of Object.entries(options.tags)) {
          scope.setTag(key, value);
        }
      }

      // Add user context if available
      const userId = task.context.get('userId') || task.context.get('currentUserId');
      if (userId) {
        scope.setUser({ id: String(userId) });
      }

      try {
        const result = await next();

        // Optionally report logical failures
        const reportOn = options.reportOn ?? [];
        if (reportOn.includes(result.status as 'failed' | 'skipped')) {
          const level = result.failed ? 'error' : 'warning';

          Sentry.captureMessage(
            `Task ${result.status}: ${result.reason || 'No reason provided'}`,
            {
              level,
              tags: {
                taskStatus: result.status,
                taskState: result.state,
              },
              extra: {
                taskClass: task.constructor.name,
                metadata: result.metadata,
                ...(options.includeContext ? { context: result.context.toObject() } : {}),
              },
            }
          );
        }

        return result;
      } catch (error) {
        // Capture unexpected exceptions
        Sentry.captureException(error, {
          tags: {
            taskClass: task.constructor.name,
          },
          extra: {
            taskId: task.id,
            chainId: task.chainId,
            ...(options.includeContext ? { context: task.context.toObject() } : {}),
          },
        });

        // Re-throw to let cero-ts handle it
        throw error;
      }
    });
  }
}
```

## Usage

### Basic Usage

```typescript
import { Task } from 'cero-ts';
import { SentryMiddleware } from './lib/sentry-middleware';

class ProcessPayment extends Task {
  static override middlewares = [
    // Report only exceptions (default)
    SentryMiddleware,
  ];

  override async work() {
    // If an exception is thrown, it will be reported to Sentry
    await this.chargeCard();
  }
}
```

### Report Logical Failures

```typescript
class ProcessCriticalOrder extends Task {
  static override middlewares = [
    // Also report failed and skipped tasks
    [SentryMiddleware, { reportOn: ['failed', 'skipped'] }],
  ];

  override async work() {
    if (!this.isValid()) {
      // This failure will be reported to Sentry
      this.fail('Order validation failed', { code: 'INVALID_ORDER' });
      return;
    }
  }
}
```

### With Custom Tags

```typescript
class BillingTask extends Task {
  static override middlewares = [
    [SentryMiddleware, {
      tags: {
        service: 'billing',
        environment: process.env.NODE_ENV || 'development',
      },
    }],
  ];
}
```

### Include Context Data

```typescript
class DebugTask extends Task {
  static override middlewares = [
    [SentryMiddleware, {
      reportOn: ['failed'],
      includeContext: true,  // Include task context in Sentry extras
    }],
  ];
}
```

## Global Configuration

Register Sentry middleware for all tasks:

```typescript
// config/cero.ts
import { configure } from 'cero-ts';
import { SentryMiddleware } from './lib/sentry-middleware';

configure((config) => {
  // Only in production
  if (process.env.NODE_ENV === 'production') {
    config.middlewares.register(SentryMiddleware, {
      reportOn: ['failed'],
    });
  }
});
```

## Alternative: Callback-Based Approach

Use callbacks instead of middleware for simpler integration:

```typescript
import * as Sentry from '@sentry/node';
import { configure } from 'cero-ts';

configure((config) => {
  config.callbacks.register('onFailed', (task) => {
    Sentry.captureMessage(`Task failed: ${task.result?.reason}`, {
      level: 'error',
      tags: {
        task: task.constructor.name,
      },
      extra: {
        metadata: task.result?.metadata,
      },
    });
  });

  // Capture exceptions that caused failures
  config.callbacks.register('onFailed', (task) => {
    if (task.result?.cause) {
      Sentry.captureException(task.result.cause, {
        tags: { task: task.constructor.name },
      });
    }
  });
});
```

## Sentry Breadcrumbs

Add breadcrumbs for task execution tracking:

```typescript
import * as Sentry from '@sentry/node';

class BreadcrumbMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    Sentry.addBreadcrumb({
      category: 'task',
      message: `Starting ${task.constructor.name}`,
      level: 'info',
      data: {
        taskId: task.id,
        chainId: task.chainId,
      },
    });

    const result = await next();

    Sentry.addBreadcrumb({
      category: 'task',
      message: `Completed ${task.constructor.name}`,
      level: result.failed ? 'error' : 'info',
      data: {
        status: result.status,
        reason: result.reason,
      },
    });

    return result;
  }
}
```

## Performance Monitoring

Track task performance with Sentry transactions:

```typescript
import * as Sentry from '@sentry/node';

class SentryPerformanceMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: Record<string, unknown>,
    next: () => Promise<Result>
  ): Promise<Result> {
    const transaction = Sentry.startTransaction({
      name: task.constructor.name,
      op: 'task',
    });

    Sentry.getCurrentHub().configureScope((scope) => {
      scope.setSpan(transaction);
    });

    try {
      const result = await next();

      transaction.setStatus(result.success ? 'ok' : 'internal_error');
      transaction.setData('status', result.status);

      return result;
    } catch (error) {
      transaction.setStatus('internal_error');
      throw error;
    } finally {
      transaction.finish();
    }
  }
}
```
