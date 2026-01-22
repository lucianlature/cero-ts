# Outcomes - Result

Every task execution returns a `Result` object that encapsulates the outcome, context, and metadata of the execution.

## Result Structure

```typescript
const result = await MyTask.execute({ data: 'value' });

// State and Status
result.state;      // "complete" | "interrupted"
result.status;     // "success" | "skipped" | "failed"

// Boolean Helpers
result.success;    // true if status === "success"
result.skipped;    // true if status === "skipped"
result.failed;     // true if status === "failed"
result.complete;   // true if state === "complete"
result.interrupted; // true if state === "interrupted"

// Outcome Classification
result.good;       // true if success OR skipped
result.bad;        // true if failed

// Execution Data
result.context;    // Context object with execution data
result.reason;     // String reason (for skipped/failed)
result.metadata;   // Additional metadata object
result.cause;      // Error that caused failure (if any)

// Chain Information
result.id;         // Unique task instance ID
result.chainId;    // Execution chain ID
result.index;      // Position in execution chain
result.type;       // "Task" | "Workflow"
result.class;      // Task class name
```

## Checking Results

### Boolean Properties

```typescript
const result = await ProcessOrder.execute({ orderId: 123 });

if (result.success) {
  console.log('Order processed:', result.context.get('order'));
}

if (result.skipped) {
  console.log('Skipped:', result.reason);
}

if (result.failed) {
  console.error('Failed:', result.reason);
  console.error('Error:', result.cause);
}
```

### State vs Status

- **State**: Execution lifecycle (`complete` or `interrupted`)
- **Status**: Business outcome (`success`, `skipped`, `failed`)

```typescript
// Successful execution
result.state;   // "complete"
result.status;  // "success"

// Skipped execution
result.state;   // "interrupted"
result.status;  // "skipped"

// Failed execution
result.state;   // "interrupted"
result.status;  // "failed"
```

### Good vs Bad

Simplified outcome classification:

```typescript
// Good: success OR skipped (not an error)
if (result.good) {
  // Task either succeeded or intentionally skipped
}

// Bad: failed (error condition)
if (result.bad) {
  // Task encountered an error
}
```

## Fluent Handlers

Use the `on()` method for fluent result handling:

```typescript
const result = await ProcessOrder.execute({ orderId: 123 });

result
  .on('success', (r) => {
    console.log('Order completed:', r.context.get('orderId'));
    redirectToConfirmation(r.context.get('confirmationCode'));
  })
  .on('skipped', (r) => {
    console.log('Order skipped:', r.reason);
    showNotice(r.reason);
  })
  .on('failed', (r) => {
    console.error('Order failed:', r.reason);
    showError(r.reason, r.metadata.code);
  });
```

### Available Event Types

```typescript
result
  // Status-based
  .on('success', handler)
  .on('skipped', handler)
  .on('failed', handler)

  // State-based
  .on('complete', handler)
  .on('interrupted', handler)

  // Outcome-based
  .on('good', handler)
  .on('bad', handler);
```

### Chaining Handlers

Handlers can be chained and multiple handlers for the same event are supported:

```typescript
result
  .on('success', logSuccess)
  .on('success', notifyUser)
  .on('failed', logFailure)
  .on('failed', alertAdmin);
```

## Accessing Context

The result contains the execution context:

```typescript
const result = await CreateUser.execute({
  email: 'user@example.com',
  name: 'Alice',
});

if (result.success) {
  // Access context values
  const user = result.context.get('user');
  const token = result.context.get('token');

  // Or with typed context
  // result.context.user (if using Task<UserContext>)
}
```

## Metadata

Access additional execution metadata:

```typescript
const result = await ProcessPayment.execute({ amount: 99.99 });

// Task-specific metadata
console.log(result.metadata.transactionId);
console.log(result.metadata.processingTime);

// Error metadata
if (result.failed) {
  console.log(result.metadata.errorCode);
  console.log(result.metadata.retryable);
}

// Middleware-added metadata
console.log(result.metadata.runtime);        // From RuntimeMiddleware
console.log(result.metadata.correlationId);  // From CorrelateMiddleware
```

## Error Information

When a task fails, access error details:

```typescript
if (result.failed) {
  // Human-readable reason
  console.log(result.reason);  // "Payment declined"

  // Structured metadata
  console.log(result.metadata.code);    // "INSUFFICIENT_FUNDS"
  console.log(result.metadata.details); // { available: 50, required: 100 }

  // Original error (if any)
  if (result.cause) {
    console.error(result.cause.stack);
  }
}
```

## Chain Information

Track execution in workflows:

```typescript
const result = await OrderWorkflow.execute({ orderId: 123 });

// This result
console.log(result.id);       // Unique ID for this execution
console.log(result.chainId);  // Shared chain ID across workflow
console.log(result.index);    // Position (0 for workflow itself)
console.log(result.type);     // "Workflow"
console.log(result.class);    // "OrderWorkflow"

// Failure chain analysis
if (result.failed) {
  // Original failure
  const caused = result.causedFailure;
  if (caused) {
    console.log('Original failure:', caused.class);
    console.log('Reason:', caused.reason);
  }

  // Task that propagated failure
  const threw = result.threwFailure;
  if (threw) {
    console.log('Propagated by:', threw.class);
  }
}
```

## Converting Results

### toJSON()

Convert result to a plain object:

```typescript
const result = await MyTask.execute();
const json = result.toJSON();

// {
//   id: "task-uuid",
//   chainId: "chain-uuid",
//   index: 0,
//   type: "Task",
//   class: "MyTask",
//   state: "complete",
//   status: "success",
//   context: { ... },
//   metadata: { ... }
// }
```

### Serialization

Results can be serialized for logging or storage:

```typescript
const result = await MyTask.execute();

// For logging
console.log(JSON.stringify(result.toJSON()));

// For storage
await db.executionLogs.insert({
  taskId: result.id,
  chainId: result.chainId,
  status: result.status,
  context: result.context.toObject(),
  metadata: result.metadata,
  timestamp: new Date(),
});
```

## Result Patterns

### Pattern 1: Early Return

```typescript
async function handleOrder(orderId: number) {
  const result = await ProcessOrder.execute({ orderId });

  if (!result.success) {
    return { error: result.reason, code: result.metadata.code };
  }

  return { order: result.context.get('order') };
}
```

### Pattern 2: Switch Statement

```typescript
const result = await ProcessOrder.execute({ orderId });

switch (result.status) {
  case 'success':
    return redirect('/success');
  case 'skipped':
    return showNotice(result.reason);
  case 'failed':
    return showError(result.reason);
}
```

### Pattern 3: Fluent Chain

```typescript
await ProcessOrder.execute({ orderId })
  .then(result => result
    .on('success', r => redirect('/success', r.context))
    .on('failed', r => showError(r.reason))
  );
```

### Pattern 4: Destructuring

```typescript
const { success, failed, reason, context, metadata } = await ProcessOrder.execute({ orderId });

if (success) {
  console.log('Order:', context.get('order'));
} else if (failed) {
  console.error('Error:', reason, metadata.code);
}
```

## Best Practices

### 1. Always Check Results

```typescript
// Good
const result = await MyTask.execute();
if (result.failed) {
  handleError(result);
}

// Bad - ignoring result
await MyTask.execute();
```

### 2. Use Appropriate Checks

```typescript
// Check success explicitly
if (result.success) { ... }

// Check for any non-error
if (result.good) { ... }  // success OR skipped

// Check for errors
if (result.failed) { ... }
if (result.bad) { ... }    // same as failed
```

### 3. Access Metadata Safely

```typescript
// Safe access with defaults
const code = result.metadata.code ?? 'UNKNOWN';
const retryable = result.metadata.retryable ?? false;

// Check existence
if ('transactionId' in result.metadata) {
  saveTransaction(result.metadata.transactionId);
}
```

### 4. Log Results Appropriately

```typescript
import { Logger } from 'cero-ts/logging';

const logger = new Logger();
const result = await MyTask.execute();

// Log the result
logger.log(result);

// Or with custom tags
logger.log(result, { tags: ['critical', 'payment'] });
```
