# Redis Idempotency

Prevent duplicate task executions using Redis-based idempotency keys. This ensures that tasks are executed exactly once, even when retried.

[ioredis - Redis client for Node.js](https://github.com/redis/ioredis)

## Installation

```bash
npm install ioredis
```

## Setup

Create an idempotency middleware:

```typescript
// lib/idempotency-middleware.ts
import Redis from 'ioredis';
import { Task, Result } from 'cero-ts';

interface IdempotencyOptions {
  /** Function to generate idempotency key */
  key: string | ((task: Task) => string);
  /** TTL for the idempotency key in seconds (default: 24 hours) */
  ttl?: number;
  /** What to return on duplicate (default: skip) */
  onDuplicate?: 'skip' | 'fail' | 'return-cached';
  /** Redis key prefix */
  prefix?: string;
}

interface CachedResult {
  status: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export class IdempotencyMiddleware {
  private redis: Redis;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl);
  }

  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: IdempotencyOptions,
    next: () => Promise<Result>
  ): Promise<Result> {
    const prefix = options.prefix ?? 'idempotency';
    const ttl = options.ttl ?? 86400; // 24 hours
    const onDuplicate = options.onDuplicate ?? 'skip';

    // Generate the idempotency key
    const keyValue = typeof options.key === 'function'
      ? options.key(task)
      : options.key;
    const redisKey = `${prefix}:${task.constructor.name}:${keyValue}`;

    // Try to acquire the lock
    const lockKey = `${redisKey}:lock`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 60, 'NX');

    if (!lockAcquired) {
      // Another execution is in progress, wait and check result
      return this.waitForResult(redisKey, task, onDuplicate, ttl);
    }

    try {
      // Check if already executed
      const cached = await this.redis.get(redisKey);
      if (cached) {
        return this.handleDuplicate(task, JSON.parse(cached), onDuplicate);
      }

      // Execute the task
      const result = await next();

      // Cache the result
      const cacheData: CachedResult = {
        status: result.status,
        reason: result.reason,
        metadata: result.metadata,
        context: result.context.toObject(),
      };
      await this.redis.setex(redisKey, ttl, JSON.stringify(cacheData));

      return result;
    } finally {
      // Release the lock
      await this.redis.del(lockKey);
    }
  }

  private async waitForResult<T extends Record<string, unknown>>(
    redisKey: string,
    task: Task<T>,
    onDuplicate: 'skip' | 'fail' | 'return-cached',
    ttl: number
  ): Promise<Result> {
    // Poll for result (simple implementation)
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const cached = await this.redis.get(redisKey);
      if (cached) {
        return this.handleDuplicate(task, JSON.parse(cached), onDuplicate);
      }
    }

    // Timeout waiting for other execution
    return Result.failed(task, 'Timeout waiting for concurrent execution', {
      code: 'IDEMPOTENCY_TIMEOUT',
    });
  }

  private handleDuplicate<T extends Record<string, unknown>>(
    task: Task<T>,
    cached: CachedResult,
    onDuplicate: 'skip' | 'fail' | 'return-cached'
  ): Result {
    switch (onDuplicate) {
      case 'skip':
        return Result.skipped(task, 'Duplicate execution prevented', {
          idempotent: true,
          originalStatus: cached.status,
        });

      case 'fail':
        return Result.failed(task, 'Duplicate execution not allowed', {
          code: 'DUPLICATE_EXECUTION',
          originalStatus: cached.status,
        });

      case 'return-cached':
        // Reconstruct result from cache
        if (cached.context) {
          for (const [key, value] of Object.entries(cached.context)) {
            task.context.set(key, value);
          }
        }
        if (cached.status === 'success') {
          return Result.success(task, cached.metadata);
        } else if (cached.status === 'skipped') {
          return Result.skipped(task, cached.reason, cached.metadata);
        } else {
          return Result.failed(task, cached.reason, cached.metadata);
        }
    }
  }
}

// Singleton instance
let middleware: IdempotencyMiddleware | null = null;

export function getIdempotencyMiddleware(redisUrl?: string): IdempotencyMiddleware {
  if (!middleware) {
    middleware = new IdempotencyMiddleware(redisUrl);
  }
  return middleware;
}
```

## Usage

### Basic Usage

```typescript
import { Task, required } from 'cero-ts';
import { getIdempotencyMiddleware } from './lib/idempotency-middleware';

class ProcessPayment extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
    amount: required({ type: 'float' }),
  };

  declare orderId: number;
  declare amount: number;

  static override middlewares = [
    // Use orderId as the idempotency key
    [getIdempotencyMiddleware(), { key: (task) => String(task.context.get('orderId')) }],
  ];

  override async work() {
    // This will only execute once per orderId
    await this.chargeCustomer(this.amount);
    this.context.set('paymentId', `pay_${Date.now()}`);
  }
}

// First call executes
const result1 = await ProcessPayment.execute({ orderId: 123, amount: 99.99 });
console.log(result1.status); // "success"

// Second call is idempotent (skipped)
const result2 = await ProcessPayment.execute({ orderId: 123, amount: 99.99 });
console.log(result2.status); // "skipped"
console.log(result2.metadata.idempotent); // true
```

### With Request ID

Use a client-provided idempotency key:

```typescript
class CreateOrder extends Task {
  static override attributes = {
    idempotencyKey: required(),
    items: required(),
  };

  declare idempotencyKey: string;

  static override middlewares = [
    [getIdempotencyMiddleware(), {
      key: (task) => task.context.get('idempotencyKey') as string,
      ttl: 3600, // 1 hour
    }],
  ];
}

// Client provides idempotency key
await CreateOrder.execute({
  idempotencyKey: 'client-request-abc123',
  items: [{ sku: 'ITEM-1', qty: 2 }],
});
```

### Return Cached Result

Get the original result on duplicate calls:

```typescript
class ProcessWebhook extends Task {
  static override attributes = {
    webhookId: required(),
    payload: required(),
  };

  declare webhookId: string;

  static override middlewares = [
    [getIdempotencyMiddleware(), {
      key: (task) => task.context.get('webhookId') as string,
      onDuplicate: 'return-cached',  // Return original result
      ttl: 86400 * 7, // 7 days
    }],
  ];

  override async work() {
    // Process webhook
    this.context.set('processed', true);
    this.context.set('processedAt', new Date().toISOString());
  }
}

// First call
const result1 = await ProcessWebhook.execute({
  webhookId: 'wh_123',
  payload: { event: 'order.created' },
});
console.log(result1.context.get('processedAt')); // "2026-01-22T10:00:00.000Z"

// Second call returns cached result
const result2 = await ProcessWebhook.execute({
  webhookId: 'wh_123',
  payload: { event: 'order.created' },
});
console.log(result2.context.get('processedAt')); // Same as above
```

### Fail on Duplicate

Reject duplicate requests:

```typescript
class SubmitVote extends Task {
  static override attributes = {
    userId: required({ type: 'integer' }),
    pollId: required({ type: 'integer' }),
    choice: required(),
  };

  declare userId: number;
  declare pollId: number;

  static override middlewares = [
    [getIdempotencyMiddleware(), {
      key: (task) => `${task.context.get('userId')}-${task.context.get('pollId')}`,
      onDuplicate: 'fail',  // Reject duplicates
    }],
  ];
}

// First vote succeeds
await SubmitVote.execute({ userId: 1, pollId: 100, choice: 'A' });

// Second vote fails
const result = await SubmitVote.execute({ userId: 1, pollId: 100, choice: 'B' });
console.log(result.status); // "failed"
console.log(result.metadata.code); // "DUPLICATE_EXECUTION"
```

## Composite Keys

Generate keys from multiple attributes:

```typescript
class TransferFunds extends Task {
  static override attributes = {
    fromAccount: required(),
    toAccount: required(),
    amount: required({ type: 'float' }),
    reference: required(),
  };

  static override middlewares = [
    [getIdempotencyMiddleware(), {
      key: (task) => {
        const from = task.context.get('fromAccount');
        const to = task.context.get('toAccount');
        const amount = task.context.get('amount');
        const ref = task.context.get('reference');
        return `${from}-${to}-${amount}-${ref}`;
      },
    }],
  ];
}
```

## Key Generation Utilities

```typescript
// lib/idempotency-keys.ts
import crypto from 'node:crypto';

/**
 * Generate a hash-based key from multiple values
 */
export function hashKey(...values: unknown[]): string {
  const data = JSON.stringify(values);
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * Generate a key from context values
 */
export function contextKey(...keys: string[]) {
  return (task: Task) => {
    const values = keys.map((k) => task.context.get(k));
    return hashKey(...values);
  };
}

// Usage
class MyTask extends Task {
  static override middlewares = [
    [getIdempotencyMiddleware(), {
      key: contextKey('userId', 'action', 'resourceId'),
    }],
  ];
}
```

## Testing

Mock the Redis client for testing:

```typescript
import { jest } from '@jest/globals';

// Mock Redis
jest.mock('ioredis', () => {
  const store = new Map<string, string>();
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key) => Promise.resolve(store.get(key) || null)),
    set: jest.fn((key, value, ...args) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    setex: jest.fn((key, ttl, value) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
  }));
});
```
