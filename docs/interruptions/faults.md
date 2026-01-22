# Interruptions - Faults

Faults are exceptions raised by `executeStrict()` when tasks halt. They carry rich context about execution state, enabling sophisticated error handling patterns.

## Fault Types

| Type | Triggered By | Use Case |
| ------ | -------------- | ---------- |
| `Fault` | Base class | Catch-all for any interruption |
| `SkipFault` | `skip()` method | Optional processing, early returns |
| `FailFault` | `fail()` method | Validation errors, processing failures |

> **Note:** All faults inherit from `Fault` and expose result, task, context, and chain data.

## Basic Fault Handling

```typescript
import { FailFault, SkipFault, Fault } from 'cero-ts';

try {
  const result = await ProcessTicket.executeStrict({ ticketId: 456 });
  // Only reached on success
  console.log('Ticket processed:', result.context);
} catch (error) {
  if (error instanceof SkipFault) {
    console.log('Ticket skipped:', error.message);
    scheduleRetry(error.result.context.get('ticketId'));
  } else if (error instanceof FailFault) {
    console.error('Ticket failed:', error.message);
    notifyAdmin(error.result.metadata.errorCode);
  } else if (error instanceof Fault) {
    console.warn('Ticket interrupted:', error.message);
    rollbackChanges();
  } else {
    // Unexpected error (not from cero-ts)
    throw error;
  }
}
```

## Accessing Fault Data

Faults provide rich execution context:

```typescript
try {
  await LicenseActivation.executeStrict({
    licenseKey: key,
    machineId: machine,
  });
} catch (error) {
  if (error instanceof Fault) {
    // Result information
    console.log(error.result.state);     // "interrupted"
    console.log(error.result.status);    // "failed" or "skipped"
    console.log(error.result.reason);    // "License key already activated"
    console.log(error.result.metadata);  // { code: 'ALREADY_ACTIVATED' }

    // Task information
    console.log(error.task.constructor.name);  // "LicenseActivation"
    console.log(error.task.id);                // "abc123..."

    // Context data
    console.log(error.result.context.get('licenseKey'));  // "ABC-123"
    console.log(error.result.context.get('machineId'));   // "machine-456"

    // Chain information
    console.log(error.result.chainId);  // "def456..."
    console.log(error.result.index);    // 0
  }
}
```

## SkipFault

Raised when a task calls `skip()`:

```typescript
class CheckInventory extends Task {
  override async work() {
    const stock = await getStock(this.productId);

    if (stock === 0) {
      this.skip('Product out of stock', { productId: this.productId });
      return;
    }

    this.context.set('availableStock', stock);
  }
}

try {
  await CheckInventory.executeStrict({ productId: 'SKU-123' });
} catch (error) {
  if (error instanceof SkipFault) {
    // Handle skip - maybe queue for later
    console.log('Skipped:', error.result.reason);
    console.log('Product:', error.result.metadata.productId);
  }
}
```

## FailFault

Raised when a task calls `fail()`:

```typescript
class ProcessPayment extends Task {
  override async work() {
    const result = await chargeCard(this.cardId, this.amount);

    if (!result.success) {
      this.fail('Payment declined', {
        code: result.errorCode,
        declineReason: result.declineReason,
      });
      return;
    }

    this.context.set('transactionId', result.transactionId);
  }
}

try {
  await ProcessPayment.executeStrict({ cardId: 'card_123', amount: 99.99 });
} catch (error) {
  if (error instanceof FailFault) {
    console.error('Payment failed:', error.result.reason);
    console.error('Code:', error.result.metadata.code);
    console.error('Reason:', error.result.metadata.declineReason);
  }
}
```

## Task-Specific Matching

Handle faults only from specific tasks using the static `for()` method:

```typescript
try {
  await DocumentWorkflow.executeStrict({ documentData: data });
} catch (error) {
  // Only catch failures from specific tasks
  if (FailFault.for(FormatValidator, ContentProcessor).matches(error)) {
    // Handle document-related failures
    retryWithAlternateParser(error.result.context);
  } else if (SkipFault.for(VirusScanner, ContentFilter).matches(error)) {
    // Handle security-related skips
    quarantineForReview(error.result.context.get('documentId'));
  } else {
    throw error;
  }
}
```

### Creating Fault Matchers

```typescript
// Create a reusable matcher
const paymentFaults = FailFault.for(ChargeCard, RefundPayment, ValidateCard);

try {
  await OrderWorkflow.executeStrict({ orderId });
} catch (error) {
  if (paymentFaults.matches(error)) {
    handlePaymentFailure(error);
  } else {
    throw error;
  }
}
```

## Custom Fault Matching

Match faults based on custom criteria:

```typescript
try {
  await ReportGenerator.executeStrict({ reportId });
} catch (error) {
  if (error instanceof Fault) {
    // Match by metadata
    if (error.result.metadata.code === 'TIMEOUT') {
      increaseTimeoutAndRetry(error);
    }
    // Match by context
    else if (error.result.context.get('dataSize') > 10000) {
      escalateLargeDatasetFailure(error);
    }
    // Match by attempt count
    else if (error.result.metadata.attemptCount > 3) {
      abandonAndNotify(error);
    }
    else {
      throw error;
    }
  }
}
```

## Fault Propagation

When using `throw()` to propagate failures, the fault carries the complete chain:

```typescript
class ParentTask extends Task {
  override async work() {
    const childResult = await ChildTask.execute();

    if (childResult.failed) {
      this.throw(childResult, { parentContext: 'additional info' });
      return;
    }
  }
}

try {
  await ParentTask.executeStrict();
} catch (error) {
  if (error instanceof FailFault) {
    // Access the original failure
    console.log('Failed in:', error.task.constructor.name);

    // Check chain information
    console.log('Chain ID:', error.result.chainId);

    // Access propagation metadata
    console.log('Parent context:', error.result.metadata.parentContext);
  }
}
```

## Chain Analysis

Analyze fault origins in complex workflows:

```typescript
try {
  await ComplexWorkflow.executeStrict({ data });
} catch (error) {
  if (error instanceof Fault) {
    // Find the original failure
    const causedFailure = error.result.causedFailure;
    if (causedFailure) {
      console.log('Original failure in:', causedFailure.class);
      console.log('Original reason:', causedFailure.reason);
    }

    // Find what propagated the failure
    const threwFailure = error.result.threwFailure;
    if (threwFailure) {
      console.log('Propagated by:', threwFailure.class);
    }

    // Analyze failure type
    if (error.result.causedFailure) {
      console.log('This task was the original source');
    } else if (error.result.threwFailure) {
      console.log('This task propagated a failure');
    }
  }
}
```

## execute() vs executeStrict()

| Aspect | `execute()` | `executeStrict()` |
| -------- | ------------- | ------------------- |
| Returns | Always `Result` | `Result` on success |
| On failure | Returns failed `Result` | Throws `FailFault` |
| On skip | Returns skipped `Result` | Throws `SkipFault` |
| Error handling | Check `result.failed` | try/catch |
| Use case | Explicit result handling | Exception-based flow |

```typescript
// execute() pattern
const result = await MyTask.execute({ data });
if (result.failed) {
  handleFailure(result);
}

// executeStrict() pattern
try {
  const result = await MyTask.executeStrict({ data });
  // Only reached on success
} catch (error) {
  if (error instanceof FailFault) {
    handleFailure(error.result);
  }
}
```

## Best Practices

### 1. Catch Specific Faults First

```typescript
try {
  await MyTask.executeStrict();
} catch (error) {
  // Most specific first
  if (error instanceof FailFault) {
    handleFailure(error);
  } else if (error instanceof SkipFault) {
    handleSkip(error);
  } else if (error instanceof Fault) {
    handleGenericFault(error);
  } else {
    // Not a cero-ts fault
    throw error;
  }
}
```

### 2. Re-throw Unknown Errors

```typescript
try {
  await MyTask.executeStrict();
} catch (error) {
  if (error instanceof Fault) {
    // Handle cero-ts faults
    logFault(error);
  } else {
    // Re-throw unexpected errors
    throw error;
  }
}
```

### 3. Use Matchers for Complex Workflows

```typescript
const criticalFaults = FailFault.for(PaymentTask, ShippingTask);
const optionalFaults = SkipFault.for(NotificationTask, AnalyticsTask);

try {
  await OrderWorkflow.executeStrict({ orderId });
} catch (error) {
  if (criticalFaults.matches(error)) {
    await rollbackOrder(orderId);
    notifySupport(error);
  } else if (optionalFaults.matches(error)) {
    // Log but don't fail the order
    logSkippedTask(error);
  } else {
    throw error;
  }
}
```

### 4. Extract Useful Information

```typescript
function logFault(fault: Fault) {
  console.error({
    task: fault.task.constructor.name,
    reason: fault.result.reason,
    metadata: fault.result.metadata,
    chainId: fault.result.chainId,
    context: fault.result.context.toObject(),
  });
}
```
