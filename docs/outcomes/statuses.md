# Outcomes - Statuses

Statuses represent the business outcome of a task execution. Every task ends with one of three statuses: `success`, `skipped`, or `failed`.

## Status Values

| Status | Description | Boolean Property |
| -------- | ------------- | ------------------ |
| `success` | Task completed successfully | `result.success` |
| `skipped` | Task was intentionally bypassed | `result.skipped` |
| `failed` | Task encountered an error | `result.failed` |

## Success Status

A task achieves `success` status when `work()` completes without calling `skip()`, `fail()`, or `throw()`:

```typescript
class CreateUser extends Task {
  override async work() {
    const user = await User.create({
      email: this.email,
      name: this.name,
    });
    this.context.set('user', user);
    // Method ends normally → success
  }
}

const result = await CreateUser.execute({ email: 'test@example.com', name: 'Alice' });
result.success;  // true
result.status;   // "success"
result.state;    // "complete"
```

### Success Characteristics

- `work()` completed without interruption
- No validation errors occurred
- No `skip()`, `fail()`, or `throw()` was called
- Context contains task output

```typescript
if (result.success) {
  // Safe to access task output
  const user = result.context.get('user');
  const token = result.context.get('token');
}
```

## Skipped Status

A task achieves `skipped` status when `skip()` is called:

```typescript
class ProcessOrder extends Task {
  override async work() {
    const order = await Order.findById(this.orderId);

    if (order.isPaid) {
      this.skip('Order already paid');
      return;
    }

    if (order.isCancelled) {
      this.skip('Order was cancelled', { cancelledAt: order.cancelledAt });
      return;
    }

    await this.processPayment(order);
  }
}

const result = await ProcessOrder.execute({ orderId: 123 });
result.skipped;  // true
result.status;   // "skipped"
result.state;    // "interrupted"
result.reason;   // "Order already paid"
```

### When to Skip

Use `skip()` when:
- The task cannot proceed but this is not an error
- A prerequisite is not met
- The operation was already performed
- External conditions prevent execution

```typescript
// Already processed
if (await this.isProcessed()) {
  this.skip('Already processed');
  return;
}

// Feature disabled
if (!this.featureEnabled()) {
  this.skip('Feature not enabled for this account');
  return;
}

// No work to do
if (this.items.length === 0) {
  this.skip('No items to process');
  return;
}
```

### Skipped vs Failed

| Skipped | Failed |
|---------|--------|
| Not an error condition | Error condition |
| Expected/acceptable | Unexpected/problematic |
| May retry later | Needs investigation |
| Business decision | Technical or validation issue |

## Failed Status

A task achieves `failed` status when:
- `fail()` is called
- `throw()` is called (propagating a failure)
- Attribute validation fails
- An unhandled exception occurs

```typescript
class ValidateDocument extends Task {
  override async work() {
    const errors = await this.validate(this.document);

    if (errors.length > 0) {
      this.fail('Document validation failed', {
        errorCount: errors.length,
        errors: errors,
      });
      return;
    }

    this.context.set('validated', true);
  }
}

const result = await ValidateDocument.execute({ document });
result.failed;   // true
result.status;   // "failed"
result.state;    // "interrupted"
result.reason;   // "Document validation failed"
```

### Failed from Validation

```typescript
class CreateUser extends Task {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  };
}

const result = await CreateUser.execute({ email: 'invalid' });
result.failed;             // true
result.reason;             // "Invalid"
result.metadata.errors;    // { messages: { email: ['format is invalid'] } }
```

### Failed from Exception

```typescript
class RiskyTask extends Task {
  override async work() {
    throw new Error('Something went wrong');
  }
}

const result = await RiskyTask.execute();
result.failed;  // true
result.reason;  // "[Error] Something went wrong"
result.cause;   // Error instance
```

## Status Callbacks

Register callbacks based on status:

```typescript
class MyTask extends Task {
  static override callbacks = {
    onSuccess: ['handleSuccess', 'sendNotification'],
    onSkipped: ['logSkip'],
    onFailed: ['handleFailure', 'alertAdmin'],
  };

  private handleSuccess() {
    Metrics.increment('task.success');
  }

  private logSkip() {
    console.log('Task skipped:', this.result?.reason);
  }

  private handleFailure() {
    Metrics.increment('task.failure');
  }

  private alertAdmin() {
    AlertService.notify('Task failed', this.result?.reason);
  }
}
```

## Outcome Classification

### Good vs Bad

Simplified outcome checking:

```typescript
// Good = success OR skipped (not an error)
if (result.good) {
  console.log('No error occurred');
}

// Bad = failed (error condition)
if (result.bad) {
  console.error('Error occurred:', result.reason);
}
```

### Outcome Callbacks

```typescript
static override callbacks = {
  onGood: ['recordSuccess'],  // Called for success AND skipped
  onBad: ['recordFailure'],   // Called for failed only
};
```

## Status in Workflows

Workflow behavior depends on task status:

```typescript
class OrderWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,    // If failed → workflow stops
    ApplyDiscount,    // If skipped → workflow continues
    ProcessPayment,   // If failed → workflow stops
    SendConfirmation,
  ];
}
```

### Breakpoint Configuration

```typescript
// Default: only 'failed' stops workflow
static override settings = {
  workflowBreakpoints: ['failed'],
};

// Stop on both failed and skipped
static override settings = {
  workflowBreakpoints: ['failed', 'skipped'],
};

// Never stop (continue through all tasks)
static override settings = {
  workflowBreakpoints: [],
};
```

## Checking Status

### Boolean Properties

```typescript
if (result.success) {
  // Handle success
} else if (result.skipped) {
  // Handle skip
} else if (result.failed) {
  // Handle failure
}
```

### Status Property

```typescript
switch (result.status) {
  case 'success':
    return handleSuccess(result);
  case 'skipped':
    return handleSkipped(result);
  case 'failed':
    return handleFailed(result);
}
```

### Fluent Handlers

```typescript
result
  .on('success', r => console.log('Success:', r.context))
  .on('skipped', r => console.log('Skipped:', r.reason))
  .on('failed', r => console.error('Failed:', r.reason));
```

## Status in Logging

Statuses appear in structured logs with appropriate log levels:

```
I, [2026-01-22T10:30:00.000Z] INFO -- cero: class="CreateUser" status="success"
I, [2026-01-22T10:30:01.000Z] INFO -- cero: class="CheckInventory" status="skipped" reason="Out of stock"
E, [2026-01-22T10:30:02.000Z] ERROR -- cero: class="ProcessPayment" status="failed" reason="Payment declined"
```

## Best Practices

### 1. Handle All Statuses

```typescript
const result = await MyTask.execute();

if (result.success) {
  // Happy path
} else if (result.skipped) {
  // May need different handling than failure
} else if (result.failed) {
  // Error handling
}
```

### 2. Use Skip Appropriately

```typescript
// Good - clear reason, expected condition
if (order.isPaid) {
  this.skip('Order already paid');
  return;
}

// Bad - using skip for errors
if (!order) {
  this.skip('Order not found');  // Should be fail()
  return;
}
```

### 3. Provide Clear Reasons

```typescript
// Good - specific reason
this.fail('Payment declined: insufficient funds', { code: 'INSUFFICIENT_FUNDS' });
this.skip('User has disabled notifications', { preference: 'email_off' });

// Bad - vague reason
this.fail('Error');
this.skip('Skipped');
```

### 4. Use Metadata for Details

```typescript
this.fail('Validation failed', {
  field: 'email',
  value: this.email,
  rule: 'format',
  expected: 'valid email address',
});

this.skip('Rate limit exceeded', {
  limit: 100,
  current: 105,
  resetAt: new Date(Date.now() + 60000),
});
```
