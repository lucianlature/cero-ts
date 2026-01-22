# Attributes - Defaults

Default values ensure optional attributes always have a predictable value when not provided.

## Static Defaults

Provide a literal value as the default:

```typescript
static override attributes = {
  // String default
  status: optional({ default: 'pending' }),

  // Number default
  retries: optional({ default: 3 }),

  // Boolean default
  active: optional({ default: true }),

  // Array default
  tags: optional({ default: [] }),

  // Object default
  options: optional({ default: {} }),
};
```

### Usage

```typescript
class CreateOrder extends Task {
  static override attributes = {
    items: required(),
    priority: optional({ default: 'normal' }),
    expressShipping: optional({ default: false }),
  };

  declare items: OrderItem[];
  declare priority: string;
  declare expressShipping: boolean;

  override async work() {
    console.log(this.priority);        // 'normal' (default)
    console.log(this.expressShipping); // false (default)
  }
}

// No priority or expressShipping provided
await CreateOrder.execute({ items: [{ sku: 'ABC', qty: 1 }] });
```

## Callable Defaults

Use a function to compute the default at execution time:

```typescript
static override attributes = {
  // Current timestamp
  createdAt: optional({ default: () => new Date() }),

  // Random ID
  requestId: optional({ default: () => crypto.randomUUID() }),

  // Environment-based
  timeout: optional({
    default: () => process.env.NODE_ENV === 'production' ? 30 : 300,
  }),
};
```

### Dynamic Defaults

Callable defaults receive the task instance for context-aware defaults:

```typescript
static override attributes = {
  userId: required(),

  // Default based on another attribute
  username: optional({
    default: (task) => `user_${task.context.get('userId')}`,
  }),

  // Default from context
  tenantId: optional({
    default: (task) => task.context.get('currentTenant')?.id,
  }),
};
```

## Default with Type Coercion

Defaults are applied before coercion:

```typescript
static override attributes = {
  count: optional({
    type: 'integer',
    default: '5',  // String default, coerced to integer 5
  }),

  active: optional({
    type: 'boolean',
    default: 'true',  // String default, coerced to boolean true
  }),
};
```

## Default with Validation

Defaults are validated like any other value:

```typescript
static override attributes = {
  priority: optional({
    default: 'normal',
    inclusion: { in: ['low', 'normal', 'high'] },  // Default must pass this
  }),

  retries: optional({
    default: 3,
    numeric: { min: 0, max: 10 },  // Default must be in range
  }),
};
```

## Null vs Undefined

Understanding how defaults interact with null and undefined:

```typescript
static override attributes = {
  name: optional({ default: 'Anonymous' }),
};

// Default applied - attribute not provided
await MyTask.execute({});
// this.name = 'Anonymous'

// Default applied - explicit undefined
await MyTask.execute({ name: undefined });
// this.name = 'Anonymous'

// Default NOT applied - explicit null
await MyTask.execute({ name: null });
// this.name = null  (null is a valid value)

// Default NOT applied - empty string
await MyTask.execute({ name: '' });
// this.name = ''  (empty string is a valid value)
```

## Mutable Default Warning

Be careful with mutable defaults like arrays and objects:

```typescript
// DANGER: Same array instance shared across executions
static override attributes = {
  items: optional({ default: [] }),  // ⚠️ Shared reference
};

// SAFE: New array for each execution
static override attributes = {
  items: optional({ default: () => [] }),  // ✅ Fresh array each time
};

// SAFE: New object for each execution
static override attributes = {
  config: optional({ default: () => ({}) }),  // ✅ Fresh object each time
};
```

## Complex Defaults

Build complex default structures:

```typescript
static override attributes = {
  settings: optional({
    default: () => ({
      notifications: {
        email: true,
        sms: false,
        push: true,
      },
      theme: 'light',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  }),
};
```

## Conditional Defaults

Use callable defaults for conditional logic:

```typescript
static override attributes = {
  plan: required(),

  // Different default based on plan
  maxUsers: optional({
    default: (task) => {
      const plan = task.context.get('plan');
      switch (plan) {
        case 'enterprise': return 1000;
        case 'business': return 100;
        case 'starter': return 10;
        default: return 1;
      }
    },
  }),
};
```

## Environment-Based Defaults

Configure defaults based on environment:

```typescript
static override attributes = {
  apiUrl: optional({
    default: () => {
      if (process.env.NODE_ENV === 'production') {
        return 'https://api.production.com';
      } else if (process.env.NODE_ENV === 'staging') {
        return 'https://api.staging.com';
      }
      return 'http://localhost:3000';
    },
  }),

  debugMode: optional({
    default: () => process.env.NODE_ENV !== 'production',
  }),
};
```

## Default Evaluation Timing

Defaults are evaluated at the start of task execution:

```typescript
static override attributes = {
  timestamp: optional({ default: () => new Date() }),
};

// Each execution gets a fresh timestamp
await MyTask.execute({});  // timestamp = 2026-01-22T10:00:00
await MyTask.execute({});  // timestamp = 2026-01-22T10:00:05
```

## Best Practices

### 1. Always Use Callable Defaults for Mutable Values

```typescript
// Good
items: optional({ default: () => [] }),
config: optional({ default: () => ({}) }),

// Bad - shared reference
items: optional({ default: [] }),
config: optional({ default: {} }),
```

### 2. Use Meaningful Defaults

```typescript
// Good - sensible default
retries: optional({ default: 3 }),
timeout: optional({ default: 30 }),

// Avoid - arbitrary default
retries: optional({ default: 0 }),
timeout: optional({ default: 0 }),
```

### 3. Document Non-Obvious Defaults

```typescript
static override attributes = {
  /**
   * Maximum number of items to process per batch.
   * Default: 100 (optimized for memory usage)
   */
  batchSize: optional({ default: 100 }),
};
```

### 4. Consider Required vs Optional with Default

```typescript
// Required: Caller must always provide
priority: required(),

// Optional with default: Has a sensible fallback
priority: optional({ default: 'normal' }),

// Optional without default: Truly optional, may be undefined
priority: optional(),
```
