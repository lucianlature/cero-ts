# Zod Schema Validation

Use Zod for powerful, type-safe schema validation in your tasks. Zod provides excellent TypeScript integration and detailed error messages.

[Zod Documentation](https://zod.dev)

## Installation

```bash
npm install zod
```

## Setup

### Custom Validator Registry

Register Zod schemas as validators:

```typescript
// lib/zod-validator.ts
import { z } from 'zod';
import { configure } from 'cero-ts';

/**
 * Register a Zod schema as a cero-ts validator
 */
export function registerZodValidator(name: string, schema: z.ZodSchema) {
  configure((config) => {
    config.validators.register(name, (value, options) => {
      const result = schema.safeParse(value);

      if (result.success) {
        return true;
      }

      // Format Zod errors
      const errors = result.error.errors.map((e) => e.message);
      return errors.join('; ');
    });
  });
}

/**
 * Create a validator from a Zod schema inline
 */
export function zodValidator(schema: z.ZodSchema) {
  return (value: unknown) => {
    const result = schema.safeParse(value);
    if (result.success) return true;
    return result.error.errors.map((e) => e.message).join('; ');
  };
}
```

## Usage

### Basic Schema Validation

```typescript
import { Task, required, optional } from 'cero-ts';
import { z } from 'zod';
import { zodValidator } from './lib/zod-validator';

// Define Zod schema
const emailSchema = z.string().email('Invalid email format');
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain uppercase letter')
  .regex(/[a-z]/, 'Password must contain lowercase letter')
  .regex(/\d/, 'Password must contain a number');

class CreateUser extends Task {
  static override attributes = {
    email: required({ validate: zodValidator(emailSchema) }),
    password: required({ validate: zodValidator(passwordSchema) }),
    name: required({ length: { min: 1, max: 100 } }),
  };

  declare email: string;
  declare password: string;
  declare name: string;

  override async work() {
    // Attributes are validated before work() runs
    this.context.set('user', {
      id: `user_${Date.now()}`,
      email: this.email,
      name: this.name,
    });
  }
}

// Invalid email
const result1 = await CreateUser.execute({
  email: 'not-an-email',
  password: 'Test1234',
  name: 'Alice',
});
console.log(result1.failed); // true
console.log(result1.metadata.errors); // { email: ['Invalid email format'] }

// Weak password
const result2 = await CreateUser.execute({
  email: 'alice@example.com',
  password: '123',
  name: 'Alice',
});
console.log(result2.metadata.errors);
// { password: ['Password must be at least 8 characters; ...'] }
```

### Object Schema Validation

Validate complex nested objects:

```typescript
import { z } from 'zod';

// Define address schema
const addressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be 2 characters'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  country: z.string().default('US'),
});

// Define order schema
const orderSchema = z.object({
  items: z.array(z.object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
    price: z.number().positive(),
  })).min(1, 'Order must have at least one item'),
  shipping: addressSchema,
  billing: addressSchema.optional(),
  notes: z.string().max(500).optional(),
});

type Order = z.infer<typeof orderSchema>;

class ProcessOrder extends Task {
  static override attributes = {
    order: required({ validate: zodValidator(orderSchema) }),
  };

  declare order: Order;

  override async work() {
    const total = this.order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    this.context.set('total', total);
    this.context.set('itemCount', this.order.items.length);
  }
}
```

### Reusable Schema Validators

Create a library of reusable validators:

```typescript
// lib/validators.ts
import { z } from 'zod';
import { zodValidator } from './zod-validator';

// Common schemas
export const schemas = {
  email: z.string().email(),
  phone: z.string().regex(/^\+?[\d\s-()]{10,}$/, 'Invalid phone number'),
  url: z.string().url(),
  uuid: z.string().uuid(),
  date: z.coerce.date(),
  positiveInt: z.number().int().positive(),
  currency: z.number().positive().multipleOf(0.01),
  percentage: z.number().min(0).max(100),
};

// Common validators
export const validators = {
  email: zodValidator(schemas.email),
  phone: zodValidator(schemas.phone),
  url: zodValidator(schemas.url),
  uuid: zodValidator(schemas.uuid),
  positiveInt: zodValidator(schemas.positiveInt),
  currency: zodValidator(schemas.currency),
  percentage: zodValidator(schemas.percentage),
};

// Usage
class MyTask extends Task {
  static override attributes = {
    email: required({ validate: validators.email }),
    phone: optional({ validate: validators.phone }),
    amount: required({ validate: validators.currency }),
  };
}
```

### Transform and Validate

Use Zod transforms for coercion with validation:

```typescript
import { z } from 'zod';

// Schema that transforms and validates
const priceSchema = z
  .union([z.string(), z.number()])
  .transform((val) => {
    if (typeof val === 'string') {
      return parseFloat(val.replace(/[$,]/g, ''));
    }
    return val;
  })
  .pipe(z.number().positive('Price must be positive'));

const dateSchema = z
  .union([z.string(), z.date()])
  .transform((val) => (typeof val === 'string' ? new Date(val) : val))
  .pipe(z.date().min(new Date(), 'Date must be in the future'));

class SchedulePayment extends Task {
  static override attributes = {
    amount: required({ validate: zodValidator(priceSchema) }),
    scheduledDate: required({ validate: zodValidator(dateSchema) }),
  };
}
```

### Conditional Validation

Validate based on other field values:

```typescript
import { z } from 'zod';

const paymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('card'),
    cardNumber: z.string().regex(/^\d{16}$/),
    expiry: z.string().regex(/^\d{2}\/\d{2}$/),
    cvv: z.string().regex(/^\d{3,4}$/),
  }),
  z.object({
    method: z.literal('bank'),
    accountNumber: z.string().min(8),
    routingNumber: z.string().length(9),
  }),
  z.object({
    method: z.literal('paypal'),
    email: z.string().email(),
  }),
]);

class ProcessPayment extends Task {
  static override attributes = {
    payment: required({ validate: zodValidator(paymentSchema) }),
    amount: required({ type: 'float', numeric: { min: 0.01 } }),
  };

  declare payment: z.infer<typeof paymentSchema>;
  declare amount: number;

  override async work() {
    switch (this.payment.method) {
      case 'card':
        await this.chargeCard(this.payment);
        break;
      case 'bank':
        await this.chargeBank(this.payment);
        break;
      case 'paypal':
        await this.chargePayPal(this.payment);
        break;
    }
  }
}
```

### Custom Error Messages

Customize error messages for better UX:

```typescript
import { z } from 'zod';

const userSchema = z.object({
  username: z.string({
    required_error: 'Username is required',
    invalid_type_error: 'Username must be a string',
  })
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),

  age: z.number({
    required_error: 'Age is required',
    invalid_type_error: 'Age must be a number',
  })
    .int('Age must be a whole number')
    .min(13, 'You must be at least 13 years old')
    .max(120, 'Invalid age'),

  website: z.string()
    .url('Please enter a valid URL')
    .optional(),
});
```

### Validation Middleware

Create middleware for schema validation:

```typescript
import { z } from 'zod';
import { Task, Result } from 'cero-ts';

interface ZodMiddlewareOptions {
  schema: z.ZodSchema;
  /** Validate context instead of attributes */
  validateContext?: boolean;
}

class ZodValidationMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: ZodMiddlewareOptions,
    next: () => Promise<Result>
  ): Promise<Result> {
    const data = options.validateContext
      ? task.context.toObject()
      : task.context.toObject(); // Or gather attributes

    const result = options.schema.safeParse(data);

    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const error of result.error.errors) {
        const path = error.path.join('.');
        if (!errors[path]) errors[path] = [];
        errors[path].push(error.message);
      }

      return Result.failed(task, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors,
      });
    }

    return next();
  }
}

// Usage
class MyTask extends Task {
  static override middlewares = [
    [new ZodValidationMiddleware(), {
      schema: z.object({
        userId: z.number().int().positive(),
        action: z.enum(['create', 'update', 'delete']),
      }),
    }],
  ];
}
```

### Type Inference

Use Zod for both validation and type inference:

```typescript
import { z } from 'zod';

// Define schema
const CreateOrderInput = z.object({
  customerId: z.number().int().positive(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })),
  couponCode: z.string().optional(),
});

// Infer TypeScript type from schema
type CreateOrderInputType = z.infer<typeof CreateOrderInput>;

// Use in task
class CreateOrder extends Task {
  static override attributes = {
    input: required({ validate: zodValidator(CreateOrderInput) }),
  };

  // Type is inferred from Zod schema
  declare input: CreateOrderInputType;

  override async work() {
    // Full type safety
    const { customerId, items, couponCode } = this.input;

    for (const item of items) {
      console.log(item.productId, item.quantity);
    }
  }
}
```

### Global Schema Registry

Register common schemas globally:

```typescript
// config/schemas.ts
import { z } from 'zod';
import { configure } from 'cero-ts';
import { zodValidator } from '../lib/zod-validator';

// Define common schemas
export const CommonSchemas = {
  email: z.string().email(),
  phone: z.string().regex(/^\+?[\d\s-]{10,}$/),
  uuid: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  url: z.string().url(),
  money: z.number().positive().multipleOf(0.01),
};

// Register as validators
configure((config) => {
  config.validators.register('email', zodValidator(CommonSchemas.email));
  config.validators.register('phone', zodValidator(CommonSchemas.phone));
  config.validators.register('uuid', zodValidator(CommonSchemas.uuid));
  config.validators.register('slug', zodValidator(CommonSchemas.slug));
  config.validators.register('url', zodValidator(CommonSchemas.url));
  config.validators.register('money', zodValidator(CommonSchemas.money));
});

// Usage in tasks
class MyTask extends Task {
  static override attributes = {
    email: required({ email: true }),     // Uses registered validator
    phone: optional({ phone: true }),
    amount: required({ money: true }),
  };
}
```
