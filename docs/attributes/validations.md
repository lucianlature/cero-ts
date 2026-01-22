# Attributes - Validations

Validations ensure attribute values meet your requirements before task execution begins.

## Built-in Validators

### presence

Requires a non-empty value:

```typescript
static override attributes = {
  name: required({ presence: true }),
};

// Fails
await MyTask.execute({ name: '' });      // Empty string
await MyTask.execute({ name: '   ' });   // Whitespace only
await MyTask.execute({ name: null });    // Null
await MyTask.execute({ name: [] });      // Empty array

// Passes
await MyTask.execute({ name: 'Alice' });
await MyTask.execute({ name: ['a'] });
```

### absence

Requires the value to be empty or not provided:

```typescript
static override attributes = {
  legacyField: optional({ absence: true }),
};

// Passes
await MyTask.execute({ legacyField: '' });
await MyTask.execute({ legacyField: null });
await MyTask.execute({});

// Fails
await MyTask.execute({ legacyField: 'value' });
```

### format

Validates against a regular expression:

```typescript
static override attributes = {
  email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  phone: optional({ format: /^\+?[\d\s-]{10,}$/ }),
  slug: required({ format: /^[a-z0-9-]+$/ }),
};

// Passes
await MyTask.execute({
  email: 'user@example.com',
  phone: '+1-555-123-4567',
  slug: 'my-article-title',
});

// Fails
await MyTask.execute({ email: 'invalid' });
// Error: "format is invalid"
```

### length

Validates string or array length:

```typescript
static override attributes = {
  // Exact length
  code: required({ length: { is: 6 } }),

  // Minimum length
  password: required({ length: { min: 8 } }),

  // Maximum length
  bio: optional({ length: { max: 500 } }),

  // Range
  username: required({ length: { min: 3, max: 20 } }),

  // Within range (alias)
  tags: optional({ length: { within: [1, 10] } }),
};
```

Error messages:

- `is: 6` → "length must be exactly 6"
- `min: 8` → "length must be at least 8"
- `max: 500` → "length must be at most 500"
- `min: 3, max: 20` → "length must be between 3 and 20"

### numeric

Validates numeric values:

```typescript
static override attributes = {
  // Exact value
  answer: required({ numeric: { is: 42 } }),

  // Minimum
  age: required({ numeric: { min: 0 } }),

  // Maximum
  discount: required({ numeric: { max: 100 } }),

  // Range
  rating: required({ numeric: { min: 1, max: 5 } }),

  // Within range (alias)
  temperature: required({ numeric: { within: [-40, 120] } }),

  // Greater than (exclusive)
  amount: required({ numeric: { greaterThan: 0 } }),

  // Less than (exclusive)
  percentage: required({ numeric: { lessThan: 100 } }),
};
```

Error messages:

- `is: 42` → "must be exactly 42"
- `min: 0` → "must be at least 0"
- `max: 100` → "must be at most 100"
- `greaterThan: 0` → "must be greater than 0"
- `lessThan: 100` → "must be less than 100"

### inclusion

Requires the value to be in a list:

```typescript
static override attributes = {
  status: required({ inclusion: { in: ['pending', 'active', 'completed'] } }),
  priority: optional({ inclusion: { in: [1, 2, 3, 4, 5] } }),
  role: required({ inclusion: { in: ['admin', 'user', 'guest'] } }),
};

// Passes
await MyTask.execute({ status: 'active', role: 'user' });

// Fails
await MyTask.execute({ status: 'unknown' });
// Error: "is not included in the list"
```

### exclusion

Requires the value to NOT be in a list:

```typescript
static override attributes = {
  username: required({ exclusion: { in: ['admin', 'root', 'system'] } }),
  domain: required({ exclusion: { in: ['example.com', 'test.com'] } }),
};

// Passes
await MyTask.execute({ username: 'alice', domain: 'mysite.com' });

// Fails
await MyTask.execute({ username: 'admin' });
// Error: "is reserved"
```

## Combining Validators

Apply multiple validators to a single attribute:

```typescript
static override attributes = {
  password: required({
    length: { min: 8, max: 128 },
    format: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,  // lowercase, uppercase, digit
  }),

  username: required({
    length: { min: 3, max: 20 },
    format: /^[a-zA-Z][a-zA-Z0-9_]*$/,
    exclusion: { in: ['admin', 'root'] },
  }),

  age: optional({
    type: 'integer',
    numeric: { min: 0, max: 150 },
  }),
};
```

## Validation Errors

Failed validations provide detailed error information:

```typescript
const result = await CreateUser.execute({
  email: 'invalid',
  password: '123',
  age: -5,
});

result.failed;   // true
result.reason;   // "Invalid"
result.metadata.errors;
// {
//   fullMessage: "email format is invalid. password length must be at least 8. age must be at least 0.",
//   messages: {
//     email: ["format is invalid"],
//     password: ["length must be at least 8"],
//     age: ["must be at least 0"]
//   }
// }
```

## Custom Validators

Register custom validators globally:

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  // Simple validator
  config.validators.register('email', (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? true : 'is not a valid email';
  });

  // Validator with options
  config.validators.register('creditCard', (value, options) => {
    const cleaned = String(value).replace(/\D/g, '');

    // Luhn algorithm
    let sum = 0;
    let isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }

    if (sum % 10 !== 0) {
      return 'is not a valid credit card number';
    }

    // Check card type if specified
    if (options?.type === 'visa' && !cleaned.startsWith('4')) {
      return 'is not a valid Visa card';
    }

    return true;
  });
});

// Usage
class ProcessPayment extends Task {
  static override attributes = {
    email: required({ email: true }),
    cardNumber: required({ creditCard: true }),
    visaCard: optional({ creditCard: { type: 'visa' } }),
  };
}
```

## Conditional Validation

Validate only under certain conditions:

```typescript
static override attributes = {
  paymentMethod: required(),

  // Only validate if payment method is 'card'
  cardNumber: optional({
    if: (task) => task.context.get('paymentMethod') === 'card',
    format: /^\d{16}$/,
  }),

  // Only validate if NOT free plan
  billingAddress: optional({
    unless: (task) => task.context.get('plan') === 'free',
    presence: true,
  }),
};
```

## Validation Order

1. Type coercion runs first
2. Then validators run in declaration order
3. All validators run (not short-circuit)
4. All errors are collected and returned together

```typescript
static override attributes = {
  age: required({
    type: 'integer',      // 1. Coerce to integer
    numeric: { min: 0 },  // 2. Validate minimum
    numeric: { max: 150 }, // 3. Validate maximum
  }),
};
```

## Validation on Optional Attributes

Validators only run if the optional attribute is provided:

```typescript
static override attributes = {
  nickname: optional({
    length: { min: 3, max: 20 },
  }),
};

// No validation - attribute not provided
await MyTask.execute({});  // Passes

// Validation runs
await MyTask.execute({ nickname: 'ab' });  // Fails - too short
await MyTask.execute({ nickname: 'alice' });  // Passes
```

## Best Practices

### 1. Validate at the Boundary

```typescript
// Good - validate inputs before processing
static override attributes = {
  email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  amount: required({ type: 'float', numeric: { min: 0 } }),
};

// Avoid - validating in work()
override async work() {
  if (!this.email.includes('@')) {
    this.fail('Invalid email');
  }
}
```

### 2. Use Specific Error Messages

```typescript
configure((config) => {
  config.validators.register('strongPassword', (value) => {
    if (value.length < 8) return 'must be at least 8 characters';
    if (!/[a-z]/.test(value)) return 'must contain a lowercase letter';
    if (!/[A-Z]/.test(value)) return 'must contain an uppercase letter';
    if (!/\d/.test(value)) return 'must contain a number';
    return true;
  });
});
```

### 3. Combine Type and Validation

```typescript
static override attributes = {
  // Coerce then validate
  age: required({
    type: 'integer',           // Coerce "25" → 25
    numeric: { min: 0, max: 150 },  // Then validate range
  }),
};
```

### 4. Keep Validations Simple

```typescript
// Good - simple, focused validations
static override attributes = {
  email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
};

// Avoid - complex logic in validators
// Move complex validation to work() or separate task
```
