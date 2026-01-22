# Attributes - Definitions

Attributes define your task's interface with automatic validation, type coercion, and accessor generation. They're the contract between callers and your business logic.

## Declarations

Use `required()` and `optional()` helpers to define attributes:

```typescript
import { Task, required, optional } from 'cero-ts';

class ScheduleEvent extends Task {
  static override attributes = {
    // Required attributes must be provided
    title: required(),
    startDate: required({ type: 'datetime' }),

    // Optional attributes can be omitted
    description: optional(),
    duration: optional({ default: 60 }),
    location: optional(),
  };

  // Declare types for TypeScript
  declare title: string;
  declare startDate: Date;
  declare description?: string;
  declare duration: number;
  declare location?: string;

  override async work() {
    console.log(this.title);       // "Team Standup"
    console.log(this.startDate);   // Date object
    console.log(this.duration);    // 60 (default)
    console.log(this.location);    // undefined
  }
}

ScheduleEvent.execute({
  title: 'Team Standup',
  startDate: '2026-01-22T10:00:00Z',
});
```

## Required Attributes

Required attributes must be provided when executing the task:

```typescript
class PublishArticle extends Task {
  static override attributes = {
    title: required(),
    content: required(),
    authorId: required({ type: 'integer' }),
  };

  declare title: string;
  declare content: string;
  declare authorId: number;
}

// Missing required attribute
const result = await PublishArticle.execute({ title: 'Hello' });
result.failed;  // true
result.reason;  // "Invalid"
result.metadata.errors;
// {
//   messages: {
//     content: ['is required'],
//     authorId: ['is required']
//   }
// }
```

### Conditional Requirements

Make attributes conditionally required:

```typescript
class CreateSubscription extends Task {
  static override attributes = {
    plan: required(),
    paymentMethod: required({
      if: (task) => task.context.get('plan') !== 'free',
    }),
    couponCode: optional(),
  };
}

// Free plan - paymentMethod not required
await CreateSubscription.execute({ plan: 'free' });  // Success

// Paid plan - paymentMethod required
await CreateSubscription.execute({ plan: 'premium' });  // Fails
```

## Optional Attributes

Optional attributes return `undefined` when not provided (unless they have a default):

```typescript
class SendNotification extends Task {
  static override attributes = {
    userId: required(),
    message: required(),
    channel: optional(),           // undefined if not provided
    priority: optional({ default: 'normal' }),  // 'normal' if not provided
  };

  declare userId: number;
  declare message: string;
  declare channel?: string;
  declare priority: string;

  override async work() {
    console.log(this.channel);   // undefined
    console.log(this.priority);  // 'normal'
  }
}
```

## Type Declarations

Use TypeScript's `declare` keyword to get type checking:

```typescript
interface User {
  id: number;
  email: string;
}

class UpdateUser extends Task {
  static override attributes = {
    userId: required({ type: 'integer' }),
    email: optional({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
    age: optional({ type: 'integer', numeric: { min: 0 } }),
    roles: optional({ type: 'array' }),
  };

  // TypeScript declarations
  declare userId: number;
  declare email?: string;
  declare age?: number;
  declare roles?: string[];

  override async work() {
    // TypeScript knows the types
    const id: number = this.userId;
    const email: string | undefined = this.email;
  }
}
```

## Attribute Options

### type

Specify the expected type for coercion:

```typescript
static override attributes = {
  count: required({ type: 'integer' }),
  amount: required({ type: 'float' }),
  active: required({ type: 'boolean' }),
  tags: optional({ type: 'array' }),
  startDate: optional({ type: 'date' }),
};
```

See [Coercions](coercions.md) for all available types.

### default

Provide a default value for optional attributes:

```typescript
static override attributes = {
  status: optional({ default: 'pending' }),
  retries: optional({ default: 3 }),
  tags: optional({ default: [] }),
  // Callable default
  createdAt: optional({ default: () => new Date() }),
};
```

See [Defaults](defaults.md) for more default patterns.

### Validation Options

Add validation rules:

```typescript
static override attributes = {
  email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  age: optional({ numeric: { min: 0, max: 150 } }),
  role: required({ inclusion: { in: ['admin', 'user', 'guest'] } }),
  name: required({ length: { min: 1, max: 100 } }),
};
```

See [Validations](validations.md) for all validation options.

## Nested Attributes

Build complex structures with nested attributes:

```typescript
class ConfigureServer extends Task {
  static override attributes = {
    serverId: required(),

    // Nested object
    networkConfig: required({
      nested: {
        hostname: required(),
        port: required({ type: 'integer' }),
        protocol: optional({ default: 'https' }),
      },
    }),

    // Optional nested object
    sslConfig: optional({
      nested: {
        certificatePath: required(),
        privateKeyPath: required(),
        enableHttp2: optional({ default: true }),
      },
    }),
  };

  declare serverId: string;
  declare networkConfig: {
    hostname: string;
    port: number;
    protocol: string;
  };
  declare sslConfig?: {
    certificatePath: string;
    privateKeyPath: string;
    enableHttp2: boolean;
  };
}

await ConfigureServer.execute({
  serverId: 'srv-001',
  networkConfig: {
    hostname: 'api.example.com',
    port: 443,
  },
  sslConfig: {
    certificatePath: '/etc/ssl/cert.pem',
    privateKeyPath: '/etc/ssl/key.pem',
  },
});
```

### Nested Validation

Child attributes are only validated when the parent is provided:

```typescript
// sslConfig not provided - no validation of children
await ConfigureServer.execute({
  serverId: 'srv-001',
  networkConfig: { hostname: 'api.example.com', port: 443 },
});  // Success

// sslConfig provided but missing required children
await ConfigureServer.execute({
  serverId: 'srv-001',
  networkConfig: { hostname: 'api.example.com', port: 443 },
  sslConfig: { certificatePath: '/etc/ssl/cert.pem' },  // Missing privateKeyPath
});  // Fails
```

## Error Messages

Validation failures provide structured error messages:

```typescript
const result = await CreateUser.execute({
  email: 'invalid',
  age: -5,
});

result.failed;  // true
result.reason;  // "Invalid"
result.metadata.errors;
// {
//   fullMessage: "email format is invalid. age must be at least 0.",
//   messages: {
//     email: ["format is invalid"],
//     age: ["must be at least 0"]
//   }
// }
```

## Attribute Order

Attributes are processed in declaration order. This matters when:

- Using conditional requirements that depend on other attributes
- Using attribute values as sources for other attributes

```typescript
static override attributes = {
  // Processed first
  plan: required(),

  // Can reference 'plan' in condition
  paymentMethod: required({
    if: (task) => task.context.get('plan') !== 'free',
  }),
};
```

## Best Practices

### 1. Always Declare Types

```typescript
// Good
declare email: string;
declare age?: number;

// Avoid - no type safety
// (just using this.context.get())
```

### 2. Use Descriptive Names

```typescript
// Good
static override attributes = {
  recipientEmail: required(),
  senderName: required(),
  messageBody: required(),
};

// Avoid
static override attributes = {
  email: required(),
  name: required(),
  body: required(),
};
```

### 3. Group Related Attributes

```typescript
static override attributes = {
  // User info
  userId: required({ type: 'integer' }),
  userEmail: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),

  // Order info
  orderId: required({ type: 'integer' }),
  orderTotal: required({ type: 'float' }),

  // Options
  sendConfirmation: optional({ default: true }),
  priority: optional({ default: 'normal' }),
};
```

### 4. Validate Early

Put validation rules on attributes rather than in `work()`:

```typescript
// Good - fails fast
static override attributes = {
  amount: required({ type: 'float', numeric: { min: 0 } }),
};

// Avoid - validation in work()
override async work() {
  if (this.amount < 0) {
    this.fail('Amount must be positive');
  }
}
```
