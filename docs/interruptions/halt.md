# Interruptions - Halt

Halt methods allow you to stop task execution early with a clear outcome. Use them to signal that a task should not continue normally.

## skip()

Use `skip()` when the task cannot or should not proceed, but this is not an error condition:

```typescript
class ProcessPayment extends Task {
  override async work() {
    const order = await Order.findById(this.orderId);

    if (order.isPaid) {
      this.skip('Order already paid');
      return;
    }

    if (order.isCancelled) {
      this.skip('Order was cancelled');
      return;
    }

    await this.processPayment(order);
  }
}
```

### Skip with Metadata

Attach additional information to skipped results:

```typescript
class SyncInventory extends Task {
  override async work() {
    const lastSync = await getLastSyncTime();
    const now = new Date();

    if (now.getTime() - lastSync.getTime() < 60000) {
      this.skip('Recently synced', {
        lastSync: lastSync.toISOString(),
        nextSyncIn: 60000 - (now.getTime() - lastSync.getTime()),
      });
      return;
    }

    await this.performSync();
  }
}

const result = await SyncInventory.execute();
if (result.skipped) {
  console.log(result.reason);              // "Recently synced"
  console.log(result.metadata.lastSync);   // "2026-01-22T10:00:00.000Z"
  console.log(result.metadata.nextSyncIn); // 45000
}
```

### Skip Result

```typescript
const result = await MyTask.execute();

result.skipped;     // true
result.success;     // false
result.failed;      // false
result.state;       // "interrupted"
result.status;      // "skipped"
result.reason;      // "Order already paid"
result.metadata;    // { ...custom metadata }
```

## fail()

Use `fail()` when the task encounters an error condition that prevents completion:

```typescript
class CreateUser extends Task {
  override async work() {
    const existingUser = await User.findByEmail(this.email);

    if (existingUser) {
      this.fail('Email already registered');
      return;
    }

    if (!this.isValidPassword(this.password)) {
      this.fail('Password does not meet requirements');
      return;
    }

    await User.create({ email: this.email, password: this.password });
  }
}
```

### Fail with Metadata

Attach error details to failed results:

```typescript
class ValidateDocument extends Task {
  override async work() {
    const errors = await this.validate(this.document);

    if (errors.length > 0) {
      this.fail('Document validation failed', {
        errorCount: errors.length,
        errors: errors,
        documentId: this.document.id,
      });
      return;
    }

    this.context.set('validated', true);
  }
}

const result = await ValidateDocument.execute({ document });
if (result.failed) {
  console.log(result.reason);            // "Document validation failed"
  console.log(result.metadata.errors);   // [...validation errors]
}
```

### Fail with Error Code

Use metadata for structured error handling:

```typescript
class AuthenticateUser extends Task {
  override async work() {
    const user = await User.findByEmail(this.email);

    if (!user) {
      this.fail('User not found', { code: 'USER_NOT_FOUND', status: 404 });
      return;
    }

    if (!await user.verifyPassword(this.password)) {
      this.fail('Invalid password', { code: 'INVALID_PASSWORD', status: 401 });
      return;
    }

    this.context.set('user', user);
  }
}

const result = await AuthenticateUser.execute({ email, password });
if (result.failed) {
  switch (result.metadata.code) {
    case 'USER_NOT_FOUND':
      showNotFoundError();
      break;
    case 'INVALID_PASSWORD':
      showAuthError();
      break;
  }
}
```

### Fail Result

```typescript
const result = await MyTask.execute();

result.failed;      // true
result.success;     // false
result.skipped;     // false
result.state;       // "interrupted"
result.status;      // "failed"
result.reason;      // "Email already registered"
result.metadata;    // { code: 'DUPLICATE_EMAIL', ... }
```

## throw()

Use `throw()` to propagate a child task's failure:

```typescript
class OrderWorkflow extends Task {
  override async work() {
    // Execute child task
    const validationResult = await ValidateOrder.execute({
      orderId: this.orderId,
    });

    // Propagate failure if validation failed
    if (!validationResult.success) {
      this.throw(validationResult);
      return;
    }

    // Continue with order processing
    await this.processOrder();
  }
}
```

### Throw with Additional Metadata

Add context when propagating:

```typescript
class PaymentWorkflow extends Task {
  override async work() {
    const chargeResult = await ChargeCard.execute({
      amount: this.amount,
      cardId: this.cardId,
    });

    if (chargeResult.failed) {
      this.throw(chargeResult, {
        stage: 'payment',
        orderId: this.orderId,
        attemptNumber: this.attemptNumber,
      });
      return;
    }

    this.context.set('payment', chargeResult.context.payment);
  }
}
```

### Throw vs Fail

| Use `throw()` when... | Use `fail()` when... |
| ---------------------- | --------------------- |
| Propagating a child task's failure | Task itself encounters an error |
| Preserving the original error chain | Creating a new error |
| Maintaining correlation for debugging | The error originates in this task |

```typescript
class CompositeTask extends Task {
  override async work() {
    // Use throw() - propagating child failure
    const childResult = await ChildTask.execute();
    if (childResult.failed) {
      this.throw(childResult);
      return;
    }

    // Use fail() - this task's own error
    if (!this.validateOutput(childResult.context)) {
      this.fail('Output validation failed');
      return;
    }
  }
}
```

## Halt in Workflows

In workflows, halts affect the entire pipeline based on breakpoints:

```typescript
class OrderWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,     // If fails → workflow stops
    CalculateTotal,    // If skips → workflow continues (default)
    ProcessPayment,
    SendConfirmation,
  ];
}

// With custom breakpoints
class StrictWorkflow extends Workflow {
  static override settings = {
    workflowBreakpoints: ['failed', 'skipped'],  // Stop on skip too
  };

  static override tasks = [
    Step1,
    Step2,  // If skipped → workflow stops
    Step3,
  ];
}
```

## Execution After Halt

Code after `skip()`, `fail()`, or `throw()` still executes:

```typescript
class MyTask extends Task {
  override async work() {
    if (condition) {
      this.fail('Failed');
      // This code STILL RUNS - skip/fail don't throw
      console.log('This will be logged');
    }

    // Use return to stop execution
    if (condition) {
      this.fail('Failed');
      return;  // Now execution stops
    }

    // This won't run
    console.log('This will not be logged');
  }
}
```

## Best Practices

### 1. Always Return After Halting

```typescript
// Good
if (error) {
  this.fail('Error occurred');
  return;
}

// Bad - execution continues
if (error) {
  this.fail('Error occurred');
}
doMoreWork();  // Still runs!
```

### 2. Use Appropriate Halt Method

```typescript
// Skip - not an error, just can't/shouldn't proceed
if (alreadyProcessed) {
  this.skip('Already processed');
  return;
}

// Fail - error condition
if (!isValid) {
  this.fail('Validation failed');
  return;
}

// Throw - propagate child failure
if (childResult.failed) {
  this.throw(childResult);
  return;
}
```

### 3. Provide Meaningful Messages

```typescript
// Good - descriptive message
this.fail('Payment declined: insufficient funds', { code: 'INSUFFICIENT_FUNDS' });

// Bad - vague message
this.fail('Error');
```

### 4. Include Useful Metadata

```typescript
// Good - actionable metadata
this.fail('Rate limit exceeded', {
  limit: 100,
  current: 105,
  resetAt: new Date(Date.now() + 60000),
});

// Bad - no context
this.fail('Rate limit exceeded');
```
