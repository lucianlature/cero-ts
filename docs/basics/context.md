# Context

The Context object is a mutable state container that holds data during task execution. It provides a type-safe way to share data between tasks in workflows and store results from task execution.

## Basic Usage

### Getting and Setting Values

```typescript
class ProcessOrder extends Task {
  override async work() {
    // Set values
    this.context.set('orderId', 123);
    this.context.set('items', [{ sku: 'ABC', qty: 2 }]);

    // Get values
    const orderId = this.context.get('orderId');  // 123
    const items = this.context.get('items');      // [{ sku: 'ABC', qty: 2 }]

    // Check if key exists
    if (this.context.has('discount')) {
      const discount = this.context.get('discount');
    }
  }
}
```

### Direct Property Access

Context values can also be accessed as properties when using typed contexts:

```typescript
interface OrderContext {
  orderId: number;
  total: number;
  items: OrderItem[];
}

class ProcessOrder extends Task<OrderContext> {
  override async work() {
    // Direct property access (type-safe)
    this.context.orderId = 123;
    this.context.total = 99.99;

    console.log(this.context.orderId);  // 123
    console.log(this.context.total);    // 99.99
  }
}
```

## Type-Safe Contexts

Define an interface for your context to get full TypeScript support:

```typescript
interface UserRegistrationContext {
  email: string;
  user: User;
  token: string;
  welcomeEmailSent: boolean;
}

class RegisterUser extends Task<UserRegistrationContext> {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
    password: required({ length: { min: 8 } }),
  };

  declare email: string;
  declare password: string;

  override async work() {
    // TypeScript knows about context properties
    this.context.user = await User.create({
      email: this.email,
      password: this.password,
    });

    this.context.token = generateToken(this.context.user);
    this.context.welcomeEmailSent = false;
  }
}

// Result context is typed
const result = await RegisterUser.execute({
  email: 'test@example.com',
  password: 'secure123',
});

if (result.success) {
  console.log(result.context.user.id);    // TypeScript knows this exists
  console.log(result.context.token);       // Also typed
}
```

## Context Methods

### set(key, value)

Set a value in the context:

```typescript
this.context.set('key', 'value');
this.context.set('user', { id: 1, name: 'Alice' });
this.context.set('count', 42);
```

### get(key)

Get a value from the context:

```typescript
const value = this.context.get('key');
const user = this.context.get('user');

// Returns undefined if key doesn't exist
const missing = this.context.get('nonexistent');  // undefined
```

### has(key)

Check if a key exists:

```typescript
if (this.context.has('user')) {
  const user = this.context.get('user');
}
```

### delete(key)

Remove a key from the context:

```typescript
this.context.delete('temporaryData');
```

### keys()

Get all keys in the context:

```typescript
const allKeys = this.context.keys();
// ['orderId', 'items', 'total']
```

### toObject()

Convert context to a plain object:

```typescript
const obj = this.context.toObject();
// { orderId: 123, items: [...], total: 99.99 }
```

### merge(data)

Merge an object into the context:

```typescript
this.context.merge({
  status: 'processed',
  processedAt: new Date(),
});
```

### clone()

Create a shallow copy of the context:

```typescript
const copy = this.context.clone();
```

### deepClone()

Create a deep copy of the context:

```typescript
const deepCopy = this.context.deepClone();
```

## Context in Workflows

Tasks in a workflow share the same context, enabling data flow:

```typescript
class OrderWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,
    CalculateTotal,
    ProcessPayment,
    SendConfirmation,
  ];
}

class ValidateOrder extends Task {
  override async work() {
    const order = await Order.findById(this.context.get('orderId'));
    this.context.set('order', order);
    this.context.set('items', order.items);
  }
}

class CalculateTotal extends Task {
  override async work() {
    const items = this.context.get('items');
    const total = items.reduce((sum, item) => sum + item.price, 0);
    this.context.set('total', total);
  }
}

class ProcessPayment extends Task {
  override async work() {
    const total = this.context.get('total');
    const payment = await PaymentService.charge(total);
    this.context.set('payment', payment);
  }
}

class SendConfirmation extends Task {
  override async work() {
    const order = this.context.get('order');
    const payment = this.context.get('payment');
    await EmailService.sendOrderConfirmation(order, payment);
    this.context.set('confirmationSent', true);
  }
}
```

## Initial Context

Pass initial values when executing a task:

```typescript
// Context values are passed as arguments
const result = await ProcessOrder.execute({
  orderId: 123,
  userId: 456,
  priority: 'high',
});

// In the task
class ProcessOrder extends Task {
  override async work() {
    const orderId = this.context.get('orderId');  // 123
    const userId = this.context.get('userId');    // 456
    const priority = this.context.get('priority'); // 'high'
  }
}
```

## Context vs Attributes

| Aspect | Context | Attributes |
| -------- | --------- | ------------ |
| Purpose | Runtime state | Input parameters |
| Validation | No | Yes |
| Coercion | No | Yes |
| Declaration | None needed | Static definition |
| Mutability | Read/write | Read-only |

Use **attributes** for validated inputs:

```typescript
class CreateUser extends Task {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  };

  declare email: string;  // Validated and coerced
}
```

Use **context** for runtime state:

```typescript
class CreateUser extends Task {
  override async work() {
    this.context.set('user', await User.create({ email: this.email }));
    this.context.set('createdAt', new Date());
  }
}
```

## Best Practices

### Use Typed Contexts

```typescript
// Good: Type-safe context
interface PaymentContext {
  amount: number;
  currency: string;
  transactionId: string;
}

class ProcessPayment extends Task<PaymentContext> { }

// Avoid: Untyped context
class ProcessPayment extends Task { }
```

### Use Consistent Key Names

```typescript
// Good: Consistent naming convention
this.context.set('userId', 123);
this.context.set('orderId', 456);
this.context.set('paymentId', 789);

// Avoid: Inconsistent naming
this.context.set('user_id', 123);
this.context.set('OrderID', 456);
this.context.set('payment', 789);
```

### Document Context Dependencies

```typescript
/**
 * Processes a payment for an order.
 *
 * Requires in context:
 * - orderId: number
 * - total: number
 *
 * Sets in context:
 * - payment: PaymentRecord
 * - transactionId: string
 */
class ProcessPayment extends Task {
  override async work() {
    // ...
  }
}
```
