# Attributes - Coercions

Coercions automatically convert input values to the expected type. This ensures your task receives properly typed data regardless of how it was provided.

## Built-in Coercions

### string

Converts values to strings:

```typescript
static override attributes = {
  name: required({ type: 'string' }),
};

// All convert to "123"
await MyTask.execute({ name: 123 });
await MyTask.execute({ name: '123' });
await MyTask.execute({ name: true });  // "true"
```

### integer

Converts to whole numbers:

```typescript
static override attributes = {
  count: required({ type: 'integer' }),
};

// Conversions
await MyTask.execute({ count: '42' });    // 42
await MyTask.execute({ count: 42.7 });    // 42 (truncated)
await MyTask.execute({ count: '42.9' });  // 42
await MyTask.execute({ count: true });    // 1
await MyTask.execute({ count: false });   // 0
```

### float

Converts to floating-point numbers:

```typescript
static override attributes = {
  amount: required({ type: 'float' }),
};

// Conversions
await MyTask.execute({ amount: '99.99' });  // 99.99
await MyTask.execute({ amount: 100 });      // 100.0
await MyTask.execute({ amount: '1e2' });    // 100.0
```

### boolean

Converts to boolean values:

```typescript
static override attributes = {
  active: required({ type: 'boolean' }),
};

// Truthy values → true
await MyTask.execute({ active: true });
await MyTask.execute({ active: 'true' });
await MyTask.execute({ active: '1' });
await MyTask.execute({ active: 1 });
await MyTask.execute({ active: 'yes' });

// Falsy values → false
await MyTask.execute({ active: false });
await MyTask.execute({ active: 'false' });
await MyTask.execute({ active: '0' });
await MyTask.execute({ active: 0 });
await MyTask.execute({ active: 'no' });
await MyTask.execute({ active: '' });
await MyTask.execute({ active: null });
```

### date

Converts to Date objects (date only, no time):

```typescript
static override attributes = {
  birthDate: required({ type: 'date' }),
};

// Conversions
await MyTask.execute({ birthDate: '2026-01-22' });           // Date
await MyTask.execute({ birthDate: '01/22/2026' });           // Date
await MyTask.execute({ birthDate: new Date() });             // Date
await MyTask.execute({ birthDate: 1737532800000 });          // Date (from timestamp)
```

### datetime

Converts to Date objects with time:

```typescript
static override attributes = {
  createdAt: required({ type: 'datetime' }),
};

// Conversions
await MyTask.execute({ createdAt: '2026-01-22T10:30:00Z' });  // Date with time
await MyTask.execute({ createdAt: '2026-01-22 10:30:00' });   // Date with time
await MyTask.execute({ createdAt: new Date() });              // Date
await MyTask.execute({ createdAt: 1737536800000 });           // Date (from timestamp)
```

### time

Converts to time strings (HH:MM:SS):

```typescript
static override attributes = {
  startTime: required({ type: 'time' }),
};

// Conversions
await MyTask.execute({ startTime: '10:30' });      // "10:30:00"
await MyTask.execute({ startTime: '10:30:45' });   // "10:30:45"
await MyTask.execute({ startTime: new Date() });   // Extracts time portion
```

### array

Converts to arrays:

```typescript
static override attributes = {
  tags: required({ type: 'array' }),
};

// Conversions
await MyTask.execute({ tags: ['a', 'b', 'c'] });   // ['a', 'b', 'c']
await MyTask.execute({ tags: 'a,b,c' });           // ['a', 'b', 'c'] (split by comma)
await MyTask.execute({ tags: 'single' });          // ['single']
await MyTask.execute({ tags: null });              // []
```

### object / hash

Converts to plain objects:

```typescript
static override attributes = {
  metadata: required({ type: 'object' }),
  // or
  config: required({ type: 'hash' }),
};

// Conversions
await MyTask.execute({ metadata: { key: 'value' } });  // { key: 'value' }
await MyTask.execute({ metadata: '{"key":"value"}' }); // { key: 'value' } (JSON parsed)
```

### bigint

Converts to BigInt:

```typescript
static override attributes = {
  largeNumber: required({ type: 'bigint' }),
};

// Conversions
await MyTask.execute({ largeNumber: '9007199254740993' });  // 9007199254740993n
await MyTask.execute({ largeNumber: 123 });                  // 123n
```

### symbol

Converts to symbols:

```typescript
static override attributes = {
  status: required({ type: 'symbol' }),
};

// Conversions
await MyTask.execute({ status: 'active' });  // Symbol('active')
await MyTask.execute({ status: Symbol('active') });  // Symbol('active')
```

## Coercion Errors

Invalid coercions result in task failure:

```typescript
static override attributes = {
  count: required({ type: 'integer' }),
};

const result = await MyTask.execute({ count: 'not a number' });
result.failed;  // true
result.reason;  // "Invalid"
result.metadata.errors;
// { messages: { count: ['could not be coerced to integer'] } }
```

## No Coercion

Omit `type` to skip coercion and accept any value:

```typescript
static override attributes = {
  data: required(),  // No coercion, accepts any type
};

await MyTask.execute({ data: { complex: 'object' } });
await MyTask.execute({ data: [1, 2, 3] });
await MyTask.execute({ data: 'string' });
```

## Custom Coercions

Register custom coercions globally:

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  // Register a 'money' coercion
  config.coercions.register('money', (value) => {
    if (typeof value === 'string') {
      // Remove currency symbols and commas
      const cleaned = value.replace(/[$€£,]/g, '');
      return parseFloat(cleaned);
    }
    return parseFloat(value);
  });

  // Register a 'uuid' coercion
  config.coercions.register('uuid', (value) => {
    const str = String(value).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)) {
      throw new Error('Invalid UUID format');
    }
    return str;
  });
});

// Usage
class ProcessPayment extends Task {
  static override attributes = {
    amount: required({ type: 'money' }),
    transactionId: required({ type: 'uuid' }),
  };
}

await ProcessPayment.execute({
  amount: '$1,234.56',  // Coerced to 1234.56
  transactionId: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',  // Lowercased
});
```

## Coercion with Options

Custom coercions can accept options:

```typescript
configure((config) => {
  config.coercions.register('decimal', (value, options) => {
    const num = parseFloat(value);
    const precision = options?.precision ?? 2;
    return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
  });
});

class CalculateTotal extends Task {
  static override attributes = {
    subtotal: required({ type: 'decimal', precision: 2 }),
    tax: required({ type: 'decimal', precision: 4 }),
  };
}
```

## Coercion Order

Coercion happens before validation:

```typescript
static override attributes = {
  age: required({
    type: 'integer',           // 1. First: coerce "25" → 25
    numeric: { min: 0 },       // 2. Then: validate 25 >= 0
  }),
};

await MyTask.execute({ age: '25' });
// 1. "25" coerced to 25
// 2. 25 validated against numeric: { min: 0 }
// 3. this.age = 25
```

## Nullable Values

By default, `null` and `undefined` skip coercion for optional attributes:

```typescript
static override attributes = {
  name: optional({ type: 'string' }),
};

await MyTask.execute({ name: null });       // this.name = undefined
await MyTask.execute({ name: undefined });  // this.name = undefined
await MyTask.execute({});                   // this.name = undefined
```

For required attributes, `null` triggers a validation error:

```typescript
static override attributes = {
  name: required({ type: 'string' }),
};

const result = await MyTask.execute({ name: null });
result.failed;  // true
result.metadata.errors;  // { messages: { name: ['is required'] } }
```

## Best Practices

### 1. Always Specify Types for External Input

```typescript
// Good - explicit coercion for API input
static override attributes = {
  userId: required({ type: 'integer' }),
  amount: required({ type: 'float' }),
  active: required({ type: 'boolean' }),
};

// Avoid - relying on caller to provide correct types
static override attributes = {
  userId: required(),
  amount: required(),
  active: required(),
};
```

### 2. Use Appropriate Types

```typescript
// Good - integer for IDs
count: required({ type: 'integer' }),

// Good - float for money
amount: required({ type: 'float' }),

// Good - datetime for timestamps
createdAt: required({ type: 'datetime' }),
```

### 3. Combine with Validation

```typescript
static override attributes = {
  email: required({
    type: 'string',
    format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  }),
  age: required({
    type: 'integer',
    numeric: { min: 0, max: 150 },
  }),
};
```
