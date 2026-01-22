# Chain

The Chain object manages execution correlation and tracking. Every task execution is part of a chain, enabling distributed tracing and debugging across complex workflows.

## Chain IDs

Every task execution gets assigned to a chain with a unique ID:

```typescript
const result = await MyTask.execute({ data: 'value' });

console.log(result.chainId);  // "018c2b95-b764-7615-a924-cc5b910ed1e5"
console.log(result.index);    // 0 (first task in chain)
```

### Chain Structure

When tasks call other tasks, they share the same chain:

```typescript
class OuterTask extends Task {
  override async work() {
    // This task's result will have index=0
    const inner = await InnerTask.execute();
    // InnerTask's result has index=1, same chain_id
  }
}

const result = await OuterTask.execute();
// result.chainId = "018c2b95-..."
// result.index = 0

// Logs show:
// index=1 chain_id="018c2b95-..." class="InnerTask"
// index=0 chain_id="018c2b95-..." class="OuterTask"
```

## Correlation IDs

Use the `CorrelateMiddleware` to add custom correlation IDs for request tracking:

```typescript
import { Task } from 'cero-ts';
import { CorrelateMiddleware } from 'cero-ts/middleware';

class ApiTask extends Task {
  static override middlewares = [
    [CorrelateMiddleware, { id: () => getRequestId() }],
  ];

  override async work() {
    // Task logic
  }
}

const result = await ApiTask.execute();
console.log(result.metadata.correlationId);
// "req-abc-123-def-456"
```

### Propagating Correlation IDs

Pass correlation IDs through nested tasks:

```typescript
class ParentTask extends Task {
  static override middlewares = [
    [CorrelateMiddleware, { id: () => getCurrentRequestId() }],
  ];

  override async work() {
    // Child tasks automatically inherit the correlation context
    await ChildTask1.execute();
    await ChildTask2.execute();
  }
}
```

## Chain in Workflows

Workflows automatically manage chains for all their tasks:

```typescript
class OrderWorkflow extends Workflow {
  static override tasks = [
    ValidateOrder,    // index=3
    CalculateTotal,   // index=2
    ProcessPayment,   // index=1
    SendConfirmation, // index=0 (workflow itself)
  ];
}

const result = await OrderWorkflow.execute({ orderId: 123 });

// All tasks share the same chain_id
// Logs show execution order via index
```

### Chain Tracing

Use chain IDs to trace execution flow in logs:

```shell
I, [2026-01-22T10:30:00.000Z] INFO -- cero: index=3 chain_id="abc123" class="ValidateOrder" status="success"
I, [2026-01-22T10:30:01.000Z] INFO -- cero: index=2 chain_id="abc123" class="CalculateTotal" status="success"
I, [2026-01-22T10:30:02.000Z] INFO -- cero: index=1 chain_id="abc123" class="ProcessPayment" status="success"
I, [2026-01-22T10:30:03.000Z] INFO -- cero: index=0 chain_id="abc123" class="OrderWorkflow" status="success"
```

## Accessing Chain Information

### From Result

```typescript
const result = await MyTask.execute();

result.chainId;   // Unique chain identifier
result.index;     // Position in the chain
result.id;        // Unique task instance ID
```

### From Task

```typescript
class MyTask extends Task {
  override async work() {
    console.log(this.id);       // Task instance ID
    console.log(this.chainId);  // Current chain ID
    console.log(this.index);    // Position in chain
  }
}
```

## Failure Chain Analysis

When a workflow fails, chain information helps identify the source:

```typescript
const result = await OrderWorkflow.execute({ orderId: 123 });

if (result.failed) {
  // Find the original failure
  const causedBy = result.causedFailure;
  if (causedBy) {
    console.log(`Original failure in: ${causedBy.class}`);
    console.log(`At index: ${causedBy.index}`);
    console.log(`Reason: ${causedBy.reason}`);
  }

  // Find what propagated the failure
  const thrownBy = result.threwFailure;
  if (thrownBy) {
    console.log(`Propagated by: ${thrownBy.class}`);
  }
}
```

## Chain Best Practices

### 1. Use Correlation for Request Tracing

```typescript
import { configure } from 'cero-ts';
import { CorrelateMiddleware } from 'cero-ts/middleware';

configure((config) => {
  config.middlewares.register(CorrelateMiddleware, {
    id: () => getRequestContext()?.requestId ?? generateUUID(),
  });
});
```

### 2. Include Chain ID in External Calls

```typescript
class CallExternalApi extends Task {
  override async work() {
    const response = await fetch('https://api.example.com/data', {
      headers: {
        'X-Correlation-ID': this.chainId,
        'X-Request-ID': this.id,
      },
    });
  }
}
```

### 3. Log Chain Context

```typescript
class ImportantTask extends Task {
  override async work() {
    console.log(`[${this.chainId}:${this.index}] Starting important operation`);

    // ... task logic ...

    console.log(`[${this.chainId}:${this.index}] Completed`);
  }
}
```

### 4. Query Logs by Chain

With structured logging, you can query all tasks in a chain:

```bash
# Find all logs for a specific chain
grep "chain_id=\"018c2b95-b764-7615\"" /var/log/tasks.log

# Or with JSON logs
jq 'select(.chainId == "018c2b95-b764-7615")' /var/log/tasks.json
```

## Chain Metadata in Results

The result object includes chain-related metadata:

```typescript
const result = await MyTask.execute();

// Result JSON includes chain info
const json = result.toJSON();
// {
//   id: "task-uuid",
//   chainId: "chain-uuid",
//   index: 0,
//   type: "Task",
//   class: "MyTask",
//   state: "complete",
//   status: "success",
//   ...
// }
```
