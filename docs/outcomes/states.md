# Outcomes - States

States represent the execution lifecycle of a task. A task is either `complete` or `interrupted`.

## State Values

| State | Description | Triggered By |
| ------- | ------------- | -------------- |
| `complete` | Task finished normally | `work()` completed without halt |
| `interrupted` | Task was halted early | `skip()`, `fail()`, `throw()`, validation error |

## Complete State

A task reaches the `complete` state when `work()` finishes without any interruption:

```typescript
class SuccessfulTask extends Task {
  override async work() {
    // Do some work
    this.context.set('result', 'done');
    // Method ends normally → complete state
  }
}

const result = await SuccessfulTask.execute();
result.state;     // "complete"
result.complete;  // true
result.status;    // "success"
```

### Complete + Success

The most common outcome - task completed and succeeded:

```typescript
result.state === 'complete';   // true
result.status === 'success';   // true
result.complete;               // true
result.success;                // true
```

## Interrupted State

A task reaches the `interrupted` state when execution is halted early:

### Via skip()

```typescript
class SkippedTask extends Task {
  override async work() {
    if (alreadyProcessed) {
      this.skip('Already processed');
      return;
    }
  }
}

const result = await SkippedTask.execute();
result.state;       // "interrupted"
result.interrupted; // true
result.status;      // "skipped"
```

### Via fail()

```typescript
class FailedTask extends Task {
  override async work() {
    if (!valid) {
      this.fail('Validation failed');
      return;
    }
  }
}

const result = await FailedTask.execute();
result.state;       // "interrupted"
result.interrupted; // true
result.status;      // "failed"
```

### Via throw()

```typescript
class PropagatingTask extends Task {
  override async work() {
    const child = await ChildTask.execute();
    if (child.failed) {
      this.throw(child);
      return;
    }
  }
}

const result = await PropagatingTask.execute();
result.state;       // "interrupted"
result.interrupted; // true
result.status;      // "failed" (or "skipped", depending on child)
```

### Via Validation Error

```typescript
class ValidatedTask extends Task {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
  };
}

const result = await ValidatedTask.execute({ email: 'invalid' });
result.state;       // "interrupted"
result.interrupted; // true
result.status;      // "failed"
result.reason;      // "Invalid"
```

## State Callbacks

Register callbacks based on state:

```typescript
class MyTask extends Task {
  static override callbacks = {
    onComplete: ['handleComplete'],
    onInterrupted: ['handleInterrupted'],
  };

  private handleComplete() {
    console.log('Task completed normally');
  }

  private handleInterrupted() {
    console.log('Task was interrupted');
  }
}
```

## State in Workflows

Workflow behavior depends on task states:

```typescript
class OrderWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,    // If interrupted (failed) → workflow stops
    CalculateTax,     // If interrupted (skipped) → workflow continues*
    ProcessPayment,
    SendConfirmation,
  ];
}

// * Default behavior - skipped doesn't stop workflow
// Configure with breakpoints to change this
```

### Custom Breakpoints

```typescript
class StrictWorkflow extends Workflow {
  static override settings = {
    // Stop on any interruption
    workflowBreakpoints: ['failed', 'skipped'],
  };

  static override tasks = [
    Step1,  // If skipped → workflow stops
    Step2,
    Step3,
  ];
}
```

## State vs Status

| Aspect | State | Status |
| -------- | ------- | -------- |
| Question | Did the task finish? | What was the outcome? |
| Values | `complete`, `interrupted` | `success`, `skipped`, `failed` |
| Focus | Execution lifecycle | Business outcome |

### State/Status Combinations

| State | Status | Meaning |
| ------- | -------- | --------- |
| `complete` | `success` | Task finished successfully |
| `interrupted` | `skipped` | Task was intentionally skipped |
| `interrupted` | `failed` | Task encountered an error |

> **Note:** `complete` state always has `success` status. `interrupted` state can have either `skipped` or `failed` status.

## Checking State

### Boolean Properties

```typescript
const result = await MyTask.execute();

if (result.complete) {
  console.log('Task finished normally');
}

if (result.interrupted) {
  console.log('Task was halted:', result.reason);
}
```

### Fluent Handlers

```typescript
result
  .on('complete', r => console.log('Completed'))
  .on('interrupted', r => console.log('Interrupted:', r.reason));
```

## State in Logging

States appear in structured logs:

```shell
I, [2026-01-22T10:30:00.000Z] INFO -- cero: class="MyTask" state="complete" status="success"
I, [2026-01-22T10:30:01.000Z] INFO -- cero: class="MyTask" state="interrupted" status="skipped" reason="Already processed"
E, [2026-01-22T10:30:02.000Z] ERROR -- cero: class="MyTask" state="interrupted" status="failed" reason="Validation failed"
```

## Best Practices

### 1. Use Status for Business Logic

```typescript
// Good - check business outcome
if (result.success) {
  processOrder();
} else if (result.failed) {
  handleError();
}

// Less common - check lifecycle state
if (result.interrupted) {
  logInterruption();
}
```

### 2. Use State for Cleanup

```typescript
class MyTask extends Task {
  static override callbacks = {
    // Cleanup on any interruption
    onInterrupted: ['cleanup'],

    // Status-specific handling
    onFailed: ['notifyAdmin'],
    onSkipped: ['logSkip'],
  };

  private cleanup() {
    // Release resources on any interruption
    this.releaseResources();
  }
}
```

### 3. Understand Workflow Breakpoints

```typescript
// Default: only 'failed' stops workflow
// 'skipped' tasks don't stop the workflow

class MyWorkflow extends Workflow {
  static override tasks = [
    OptionalStep,  // If skipped → continue
    CriticalStep,  // If failed → stop
  ];
}
```
