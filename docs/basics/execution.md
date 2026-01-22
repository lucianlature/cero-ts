# Execution

cero-ts provides multiple ways to execute tasks, each with different error handling semantics.

## execute()

The standard execution method. Always returns a `Result` object, never throws.

```typescript
const result = await MyTask.execute({ data: 'value' });

// Check the outcome
if (result.success) {
  console.log('Task succeeded:', result.context);
} else if (result.failed) {
  console.log('Task failed:', result.reason);
} else if (result.skipped) {
  console.log('Task skipped:', result.reason);
}
```

### Arguments

Pass arguments as an object:

```typescript
const result = await ProcessOrder.execute({
  orderId: 123,
  priority: 'high',
  userId: 456,
});
```

Arguments become available as:

1. **Attributes** (if declared) - validated and coerced
2. **Context values** - accessible via `this.context.get()`

```typescript
class ProcessOrder extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
    priority: optional({ default: 'normal' }),
  };

  declare orderId: number;
  declare priority: string;

  override async work() {
    // Declared attributes
    console.log(this.orderId);   // 123 (validated, coerced to integer)
    console.log(this.priority);  // 'high'

    // Non-declared args in context
    console.log(this.context.get('userId'));  // 456
  }
}
```

### Options

Pass execution options as a second argument:

```typescript
const result = await MyTask.execute(
  { data: 'value' },
  {
    dryRun: true,           // Don't actually execute, just validate
    context: existingContext, // Use existing context
  }
);
```

## executeStrict()

Throws `Fault` exceptions instead of returning failed results. Use when you want to handle failures with try/catch.

```typescript
import { FailFault, SkipFault } from 'cero-ts';

try {
  const result = await ProcessPayment.executeStrict({
    orderId: 123,
    amount: 99.99,
  });

  // Only reaches here on success
  console.log('Payment processed:', result.context);
} catch (error) {
  if (error instanceof FailFault) {
    console.error('Payment failed:', error.result.reason);
    console.error('Error code:', error.result.metadata.code);
  } else if (error instanceof SkipFault) {
    console.log('Payment skipped:', error.result.reason);
  } else {
    // Unexpected error
    throw error;
  }
}
```

### When to Use executeStrict()

Use `executeStrict()` when:

- You want exceptions to bubble up
- You're in an async context that catches errors
- You want cleaner code without result checking

```typescript
// With execute() - explicit checking
const result = await ProcessPayment.execute({ orderId });
if (result.failed) {
  throw new Error(result.reason);
}
const payment = result.context.payment;

// With executeStrict() - exception-based
const result = await ProcessPayment.executeStrict({ orderId });
const payment = result.context.payment;  // Only reached on success
```

## Execution Lifecycle

Every execution follows this lifecycle:

```text
1. Instantiate task
2. Set up context with arguments
3. Run beforeValidation callbacks
4. Validate attributes
5. Run beforeExecution callbacks
6. Execute middlewares (wrapping work)
7. Execute work()
8. Run state callbacks (onComplete/onInterrupted)
9. Run onExecuted callback
10. Run status callbacks (onSuccess/onFailed/onSkipped)
11. Run outcome callbacks (onGood/onBad)
12. Return result
```

### Validation Phase

Attributes are validated before `work()` runs:

```typescript
class CreateUser extends Task {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
    age: optional({ numeric: { min: 0, max: 150 } }),
  };

  override async work() {
    // Only reached if validation passes
  }
}

// Validation failure
const result = await CreateUser.execute({ email: 'invalid' });
result.failed;  // true
result.reason;  // "Invalid"
result.metadata.errors;  // { email: ['format is invalid'] }
```

### Middleware Phase

Middlewares wrap the `work()` execution:

```typescript
class MyTask extends Task {
  static override middlewares = [
    async (task, options, next) => {
      console.log('Before work');
      const result = await next();
      console.log('After work');
      return result;
    },
  ];

  override async work() {
    console.log('During work');
  }
}

// Output:
// Before work
// During work
// After work
```

## Dry Run Mode

Execute without side effects for testing:

```typescript
const result = await ProcessOrder.execute(
  { orderId: 123 },
  { dryRun: true }
);

// Task is validated but work() doesn't run
result.metadata.dryRun;  // true
```

Implement dry-run aware logic:

```typescript
class SendEmail extends Task {
  override async work() {
    if (this.dryRun) {
      console.log('Would send email to:', this.email);
      return;
    }

    await EmailService.send(this.email, this.template);
  }
}
```

## Calling Tasks from Tasks

Tasks can call other tasks:

```typescript
class ParentTask extends Task {
  override async work() {
    // Call child task
    const childResult = await ChildTask.execute({
      parentId: this.id,
    });

    if (childResult.failed) {
      // Propagate the failure
      this.throw(childResult);
    }

    // Use child result
    this.context.set('childData', childResult.context.data);
  }
}
```

### Propagating Failures

Use `this.throw()` to propagate child task failures:

```typescript
class OrderWorkflow extends Task {
  override async work() {
    const validation = await ValidateOrder.execute({ orderId: this.orderId });

    // Propagate any failure
    this.throw(validation);

    const payment = await ProcessPayment.execute({
      amount: validation.context.total,
    });

    // Propagate with additional metadata
    if (payment.failed) {
      this.throw(payment, { stage: 'payment' });
    }
  }
}
```

## Batch Execution

Execute multiple tasks:

```typescript
// Sequential execution
const results = [];
for (const item of items) {
  results.push(await ProcessItem.execute({ item }));
}

// Parallel execution
const results = await Promise.all(
  items.map(item => ProcessItem.execute({ item }))
);

// Check all results
const allSucceeded = results.every(r => r.success);
const failures = results.filter(r => r.failed);
```

## Error Handling Patterns

### Pattern 1: Result Checking

```typescript
const result = await ProcessOrder.execute({ orderId });

if (result.success) {
  redirect('/success');
} else if (result.failed) {
  showError(result.reason);
} else if (result.skipped) {
  showNotice(result.reason);
}
```

### Pattern 2: Fluent Handlers

```typescript
await ProcessOrder.execute({ orderId })
  .then(result => result
    .on('success', r => redirect('/success', r.context))
    .on('failed', r => showError(r.reason))
    .on('skipped', r => showNotice(r.reason))
  );
```

### Pattern 3: Exception-Based

```typescript
try {
  const result = await ProcessOrder.executeStrict({ orderId });
  redirect('/success', result.context);
} catch (error) {
  if (error instanceof FailFault) {
    showError(error.result.reason);
  } else if (error instanceof SkipFault) {
    showNotice(error.result.reason);
  } else {
    throw error;
  }
}
```

### Pattern 4: Early Return

```typescript
async function handleOrder(orderId: number) {
  const result = await ProcessOrder.execute({ orderId });

  if (!result.success) {
    return { error: result.reason };
  }

  return { order: result.context.order };
}
```
