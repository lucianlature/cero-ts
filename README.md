<div align="center">

# cero-ts

### **Framework for building maintainable business processes in TypeScript**

A TypeScript implementation inspired by [CMDx](https://github.com/drexed/cmdx), embracing the **CERO pattern**<br/>
**(Compose → Execute → React → Observe)** for clean, composable business logic.

[![CI](https://github.com/lucianlature/cero-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/lucianlature/cero-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/lucianlature/cero-ts/graph/badge.svg)](https://codecov.io/gh/lucianlature/cero-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success)](package.json)

---

[Features](#features) •
[Installation](#installation) •
[Quick Start](#quick-start) •
[Documentation](#documentation) •
[Examples](#examples)

</div>

---

## Why cero-ts?

Building business logic that's **easy to understand**, **test**, and **maintain** shouldn't require a PhD in software architecture. **cero-ts** provides a structured approach to encapsulating business operations with:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   📦 COMPOSE     Define inputs, validations, and behavior declaratively     │
│                                                                             │
│   ⚡ EXECUTE     Run with automatic validation, coercion, and lifecycle      │
│                                                                             │
│   🎯 REACT       Handle success, failure, or skip with clear patterns       │
│                                                                             │
│   👁️ OBSERVE     Built-in logging, metrics, and traceability                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
| --------- | ------------- |
| **Zero Dependencies** | Only Node.js core modules—no bloat, no supply chain risk |
| **Type-Safe Attributes** | Declare inputs with automatic coercion and validation |
| **Built-in Observability** | Structured logging with chain IDs and runtime metrics |
| **Composable Workflows** | Chain tasks into sequential or parallel pipelines |
| **Interactive Workflows** | Signals, Queries, and Conditions for long-running processes |
| **Durable Workflows** | Event sourcing, checkpoints, and deterministic replay for crash recovery |
| **Predictable Results** | Every execution returns success, failure, or skipped |
| **Middleware System** | Wrap execution with cross-cutting concerns |
| **Retry Support** | Automatic retries with exponential backoff and jitter |
| **Universal Runtime** | Works with Node.js, Bun, and Deno |

---

## Installation

```bash
npm install cero-ts
```

**Requirements:** Node.js 24+ (or Bun/Deno) • TypeScript 5.7+

---

## Quick Start

### 1️⃣ Compose — Define your task

```typescript
import { Task, required, optional } from 'cero-ts';

interface AnalyzeMetricsContext extends Record<string, unknown> {
  result?: AnalysisResult;
  analyzedAt?: Date;
}

class AnalyzeMetrics extends Task<AnalyzeMetricsContext> {
  // Declare inputs with validation
  static attributes = {
    datasetId: required({ type: 'integer', numeric: { min: 1 } }),
    analysisType: optional({ default: 'standard' }),
  };

  // Lifecycle hooks
  static callbacks = {
    onSuccess: ['trackCompletion'],
  };

  declare datasetId: number;
  declare analysisType: string;

  async work() {
    const dataset = await Dataset.findById(this.datasetId);

    if (!dataset) {
      this.fail('Dataset not found', { code: 'NOT_FOUND' });
    } else if (dataset.unprocessed) {
      this.skip('Dataset not ready for analysis');
    } else {
      this.context.result = await analyze(dataset, this.analysisType);
      this.context.analyzedAt = new Date();
    }
  }

  private trackCompletion() {
    Analytics.track('analysis_completed', { datasetId: this.datasetId });
  }
}
```

### 2️⃣ Execute — Run the task

```typescript
const result = await AnalyzeMetrics.execute({
  datasetId: 123,
  analysisType: 'advanced',
});
```

### 3️⃣ React — Handle the outcome

```typescript
// Pattern matching style
if (result.success) {
  console.log(`Analyzed at ${result.context.analyzedAt}`);
} else if (result.skipped) {
  console.log(`Skipped: ${result.reason}`);
} else if (result.failed) {
  console.log(`Failed: ${result.reason}`);
}

// Or fluent handlers
result
  .on('success', (r) => notifyUser(r.context.result))
  .on('failed', (r) => alertAdmin(r.reason))
  .on('skipped', (r) => logSkip(r.reason));
```

### 4️⃣ Observe — Automatic structured logging

```log
I, [2026-01-22T10:30:00.000Z #1234] INFO -- cero: index=0 chain_id="abc123" type="Task" class="AnalyzeMetrics" state="complete" status="success" runtime=125ms
```

---

## Documentation

### Workflows

Compose multiple tasks into powerful pipelines:

```typescript
import { Workflow } from 'cero-ts';

class OnboardingWorkflow extends Workflow {
  static tasks = [
    CreateUserProfile,
    SetupAccountPreferences,
    { task: SendWelcomeEmail, if: 'emailConfigured' },           // Conditional
    { tasks: [SendWelcomeSms, CreateDashboard], strategy: 'parallel' },  // Parallel
  ];

  emailConfigured() {
    return this.context.user.emailVerified;
  }
}

const result = await OnboardingWorkflow.execute({ userId: 123 });
```

### Interactive Workflows (Signals, Queries, Conditions)

Build long-running workflows that wait for external events — inspired by [Temporal](https://temporal.io):

```typescript
import { Workflow, defineSignal, defineQuery } from 'cero-ts';

// Define typed messages
const approvalSignal = defineSignal<[{ approved: boolean; approver: string }]>('approval');
const statusQuery = defineQuery<string>('status');

class ApprovalWorkflow extends Workflow {
  override async work() {
    let status = 'pending';
    let decision: { approved: boolean; approver: string } | undefined;

    // Register handlers for external events
    this.setHandler(approvalSignal, (input) => {
      decision = input;
      status = input.approved ? 'approved' : 'rejected';
    });
    this.setHandler(statusQuery, () => status);

    // Run prerequisite tasks
    await this.runTasks();
    status = 'awaiting_approval';

    // Block until approved or 24h timeout
    const received = await this.condition(() => decision !== undefined, '24h');
    if (!received) this.fail('Approval timed out');
    if (!decision!.approved) this.skip('Rejected', { approver: decision!.approver });
  }
}
```

Interact with the running workflow via a handle:

```typescript
const handle = ApprovalWorkflow.start({ requestId: 'REQ-001' });

handle.query(statusQuery);                                          // → 'awaiting_approval'
handle.signal(approvalSignal, { approved: true, approver: 'alice' });
const result = await handle.result();                               // → success
```

**Key primitives:**

| Primitive | Description |
| ----------- | ------------- |
| `defineSignal<Args>(name)` | Define a typed signal for sending data into a workflow |
| `defineQuery<Result>(name)` | Define a typed query for reading workflow state |
| `this.setHandler(signal, fn)` | Register a signal handler (may mutate state) |
| `this.setHandler(query, fn)` | Register a query handler (must be pure) |
| `this.condition(predicate, timeout?)` | Block until predicate is true or timeout expires |
| `this.runTasks()` | Run the static `tasks` pipeline within an interactive workflow |
| `Workflow.start(args)` | Start workflow, return `WorkflowHandle` |
| `handle.signal(signal, ...args)` | Send a signal to the running workflow |
| `handle.query(query, ...args)` | Read current workflow state |
| `handle.result()` | Await the final `Result` |

### Durable Workflows (Persistence, Replay, Recovery)

For workflows that span hours or days — order fulfillment, multi-party approvals, saga orchestration — processes can crash and restart. **Durable Workflows** survive restarts by persisting every state transition to an event log and checkpointing periodically for fast recovery.

```typescript
import { DurableWorkflow, InMemoryWorkflowStore } from 'cero-ts/durable';
import { defineSignal } from 'cero-ts';

const store = new InMemoryWorkflowStore();

const inventorySignal = defineSignal<[{ reserved: boolean }]>('inventory');
const paymentSignal = defineSignal<[{ captured: boolean }]>('payment');

class OrderSaga extends DurableWorkflow {
  private inventoryReserved = false;
  private paymentCaptured = false;

  override async work() {
    this.setHandler(inventorySignal, (payload) => {
      this.inventoryReserved = payload.reserved;
    });
    this.setHandler(paymentSignal, (payload) => {
      this.paymentCaptured = payload.captured;
    });

    // Durable step — skipped on replay if already completed
    await this.step('reserve_inventory', async () => {
      await publishCommand('inventory.reserve', { orderId: this.context.orderId });
    });

    // Durable condition — timer deadline persists across restarts
    const reserved = await this.condition(() => this.inventoryReserved, '30s');
    if (!reserved) this.fail('Inventory reservation timed out');

    await this.step('capture_payment', async () => {
      await publishCommand('payment.capture', { orderId: this.context.orderId });
    });

    const captured = await this.condition(() => this.paymentCaptured, '30s');
    if (!captured) this.fail('Payment capture timed out');
  }
}

// Start a durable workflow
const handle = OrderSaga.startDurable({ orderId: 'ORD-001' }, { store });

// Interact via the same handle API
handle.signal(inventorySignal, { reserved: true });
handle.signal(paymentSignal, { captured: true });
const result = await handle.result();
```

#### Recovery on restart

```typescript
import { WorkflowRecovery } from 'cero-ts/durable';

// Map workflow type names to their classes
const registry = new Map([
  ['OrderSaga', OrderSaga],
]);

const recovery = new WorkflowRecovery(store, registry);

// Recover all in-flight workflows (loads checkpoint + replays events)
const handles = await recovery.recoverAll();
console.log(`Recovered ${handles.length} workflows`);
```

#### How it works

```text
┌──────────────────────────────────────────────────────────────────────┐
│                      Durable Execution Engine                        │
│                                                                      │
│   Event Log (source of truth)          Checkpoints (fast recovery)   │
│   ┌─────────────────────────┐          ┌──────────────────────┐      │
│   │ 1. workflow.started     │          │ Snapshot at step N   │      │
│   │ 2. step.scheduled       │          │ • context state      │      │
│   │ 3. step.completed       │   ───►   │ • completed steps    │      │
│   │ 4. signal.received      │          │ • counter positions  │      │
│   │ 5. condition.satisfied  │          └──────────────────────┘      │
│   │ 6. ...                  │                                        │
│   └─────────────────────────┘          Recovery = checkpoint         │
│                                         + replay events since        │
└──────────────────────────────────────────────────────────────────────┘
```

**Key primitives:**

| Primitive | Description |
| ----------- | ------------- |
| `this.step(name, fn)` | Named durable step — skipped on replay, result persisted |
| `this.condition(predicate, timeout?)` | Durable condition — timer deadline survives restarts |
| `this.sleep(duration)` | Durable timer — resumes with remaining time after restart |
| `startDurable(args, { store })` | Start a workflow with persistence |
| `WorkflowClass.recover(options)` | Recover a specific workflow from the store |
| `WorkflowRecovery.recoverAll()` | Recover all in-flight workflows on startup |

**Storage is pluggable** — implement the `WorkflowStore` interface with any backend:

```typescript
import type { WorkflowStore } from 'cero-ts/durable';

class PostgresWorkflowStore implements WorkflowStore {
  async appendEvent(workflowId, event) { /* INSERT INTO workflow_events ... */ }
  async getEvents(workflowId, afterSequence?) { /* SELECT FROM workflow_events ... */ }
  async saveCheckpoint(workflowId, checkpoint) { /* UPSERT INTO workflow_checkpoints ... */ }
  async getLatestCheckpoint(workflowId) { /* SELECT FROM workflow_checkpoints ... */ }
  async listActiveWorkflows() { /* SELECT FROM workflow_checkpoints WHERE status = 'running' */ }
  async markCompleted(workflowId) { /* UPDATE workflow_checkpoints SET status = 'completed' */ }
}
```

> **Determinism requirement:** The `work()` method must make the same sequence of `step()`, `condition()`, and `sleep()` calls on every execution. This ensures replay produces identical state — the same constraint [Temporal](https://temporal.io) uses.

### Middleware

Add cross-cutting concerns with composable middleware:

```typescript
import { Task } from 'cero-ts';
import { TimeoutMiddleware, RuntimeMiddleware, CorrelateMiddleware } from 'cero-ts/middleware';

class ProcessReport extends Task {
  static middlewares = [
    RuntimeMiddleware,                                    // Track execution time
    [TimeoutMiddleware, { seconds: 30 }],                // Timeout after 30s
    [CorrelateMiddleware, { id: () => getRequestId() }], // Add correlation ID
  ];

  async work() {
    // Your logic here...
  }
}
```

### Attributes

#### Validation & Coercion

```typescript
class CreateUser extends Task {
  static attributes = {
    // Required with format validation
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),

    // Required with length constraint
    name: required({ length: { min: 1, max: 100 } }),

    // Optional with type coercion and range
    age: optional({ type: 'integer', numeric: { min: 0, max: 150 } }),

    // Optional with default and inclusion validation
    role: optional({ default: 'user', inclusion: { in: ['user', 'admin'] } }),
  };

  declare email: string;
  declare name: string;
  declare age?: number;
  declare role: string;

  async work() {
    // Attributes are validated and coerced before work() runs
  }
}
```

#### Built-in Type Coercions

| Type | Description |
| ------ | ------------- |
| `string` | Convert to string |
| `integer` | Parse as integer |
| `float` | Parse as floating point |
| `boolean` | Parse truthy/falsy values |
| `date` | Parse to Date (date only) |
| `datetime` | Parse to Date (with time) |
| `time` | Parse time string |
| `array` | Ensure array wrapper |
| `hash` / `object` | Parse JSON object |

#### Built-in Validators

| Validator | Options |
| ----------- | --------- |
| `presence` | Require non-empty value |
| `absence` | Require empty/null value |
| `format` | `{ with: /regex/ }` or `{ without: /regex/ }` |
| `length` | `{ min, max, is, within: [min, max] }` |
| `numeric` | `{ min, max, is, within: [min, max] }` |
| `inclusion` | `{ in: [...values] }` |
| `exclusion` | `{ in: [...values] }` |

### Interruptions

#### Skip — Gracefully bypass execution

```typescript
async work() {
  if (alreadyProcessed) {
    this.skip('Already processed');
    return;
  }
  // Continue with work...
}
```

#### Fail — Stop with error

```typescript
async work() {
  if (!isValid) {
    this.fail('Validation failed', { errors: validationErrors });
    return;
  }
  // Continue with work...
}
```

#### Strict Mode — Throw on failure

```typescript
import { FailFault, SkipFault } from 'cero-ts';

try {
  const result = await ProcessPayment.executeStrict({ orderId: 123 });
  // result.success is always true here
} catch (error) {
  if (error instanceof FailFault) {
    console.error('Payment failed:', error.result.reason);
  }
}
```

### Configuration

```typescript
import { Cero, configure } from 'cero-ts';

configure((config) => {
  // Breakpoints
  config.taskBreakpoints = ['failed'];
  config.rollbackOn = ['failed'];
  config.backtrace = true;

  // Global middleware
  config.middlewares.register(RuntimeMiddleware);

  // Global callbacks
  config.callbacks.register('onFailed', (task) => {
    Sentry.captureException(task.result.cause);
  });
});
```

---

## API Reference

### Task

The fundamental unit of business logic. A Task encapsulates a single operation — validating input, calling an API, updating a database, sending a notification — with declarative attributes, automatic validation, lifecycle callbacks, and a predictable result. Tasks are designed to be small, focused, testable, and composable into larger workflows.

Every task follows the same lifecycle: **validate inputs → execute `work()` → produce a Result**. If anything goes wrong, the task can `skip()` (graceful bypass), `fail()` (error), or throw (unexpected exception), and the result captures exactly what happened. Tasks can also retry on transient errors and rollback on failure.

`import { Task, required, optional } from 'cero-ts'`

<details>
<summary><b>Static Properties</b></summary>

| Property | Description |
| ---------- | ------------- |
| `attributes` | Attribute schema — declares inputs with types, defaults, and validation rules |
| `settings` | Configuration — breakpoints, retries, rollback, logging |
| `callbacks` | Lifecycle hooks — `beforeValidation`, `onSuccess`, `onFailed`, etc. |
| `middlewares` | Middleware stack — cross-cutting concerns wrapping execution |

</details>

<details>
<summary><b>Static Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `execute(args?, options?)` | Execute and return a `Result` (never throws on business logic errors) |
| `executeStrict(args?, options?)` | Execute and throw a `Fault` on failure/skip based on breakpoints |

</details>

<details>
<summary><b>Instance Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `work()` | Main business logic — override this (async supported) |
| `rollback()` | Optional cleanup called when execution fails |
| `skip(reason?, metadata?)` | Gracefully bypass execution with a reason |
| `fail(reason?, metadata?)` | Stop execution with an error |
| `throw(result, metadata?)` | Propagate a sub-task's failure/skip result |

</details>

### Workflow

A composition of multiple Tasks into a pipeline with optional interactivity. Workflows run tasks sequentially or in parallel, with conditional execution (`if`/`unless`), breakpoints on failure, and shared context flowing through the chain.

In **pipeline mode**, define a static `tasks` array and call `execute()` — tasks run in order and the workflow returns a single Result. In **interactive mode**, override `work()` and use Signals, Queries, and Conditions to wait for external events, making workflows suitable for long-running processes like approvals, multi-step wizards, or saga orchestration.

`import { Workflow, defineSignal, defineQuery } from 'cero-ts'`

<details>
<summary><b>Static Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `execute(args?, options?)` | Run the task pipeline to completion, return a `Result` |
| `start(args?, options?)` | Start an interactive workflow, return a `WorkflowHandle` |

</details>

<details>
<summary><b>Instance Methods (inside work())</b></summary>

| Method | Description |
| -------- | ------------- |
| `setHandler(signal, fn)` | Register a signal handler — may mutate workflow state |
| `setHandler(query, fn)` | Register a query handler — must be pure (read-only) |
| `condition(predicate, timeout?)` | Block until predicate returns true or timeout expires |
| `runTasks()` | Execute the static `tasks` pipeline within an interactive workflow |

</details>

### WorkflowHandle

The external interface to a running interactive workflow. Created by `Workflow.start()`, a handle lets you send Signals (fire-and-forget messages that mutate state), execute Queries (synchronous reads of current state), and await the final Result. Signals and conditions work together — a signal handler updates state, which causes a pending `condition()` to re-evaluate and potentially unblock the workflow.

`import { WorkflowHandle } from 'cero-ts'`

<details>
<summary><b>Methods & Properties</b></summary>

| Member | Description |
| -------- | ------------- |
| `signal(signal, ...args)` | Send a signal — triggers the registered handler |
| `query(query, ...args)` | Read current workflow state synchronously |
| `result()` | Await the final `Result` (resolves when workflow completes) |
| `completed` | `true` if the workflow has finished |
| `finalResult` | The `Result` if completed, otherwise `undefined` |

</details>

### DurableWorkflow

A Workflow subclass built for processes that span hours, days, or weeks — and must survive process restarts. Extends `Workflow` with persistent state: every step, signal, condition, and timer is recorded to an **event log** (source of truth), and **checkpoints** (state snapshots) are saved after each step for fast recovery.

On recovery, the workflow replays from the last checkpoint: completed steps are skipped, logged signals are re-delivered to reconstruct state, and conditions resolve from their recorded outcomes. Once replay catches up to the end of the event log, execution switches to live mode and continues normally.

**Key characteristics:**

- **Event-sourced** — every state transition is persisted as an immutable event
- **Checkpointed** — periodic snapshots for fast recovery without full replay
- **Deterministic replay** — `work()` must produce the same sequence of `step()`, `condition()`, and `sleep()` calls on every execution
- **Pluggable storage** — bring any backend via the `WorkflowStore` interface
- **Backward-compatible** — inherits all Workflow/Task capabilities (signals, queries, pipelines, middleware)

`import { DurableWorkflow, InMemoryWorkflowStore } from 'cero-ts/durable'`

<details>
<summary><b>Static Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `startDurable(args?, options?)` | Start a durable workflow, return a `DurableWorkflowHandle` |
| `recover(options)` | Recover a previously running workflow from the store |

</details>

<details>
<summary><b>Instance Methods (inside work())</b></summary>

| Method | Description |
| -------- | ------------- |
| `step(name, fn)` | Named durable step — executed live, skipped on replay. Results must be JSON-serializable. |
| `sleep(duration)` | Durable timer — survives restarts, resumes with remaining time |
| `condition(predicate, timeout?)` | Durable condition — timer deadline persisted, signals replayed on recovery |
| `setHandler(signal, fn)` | Register a signal handler (inherited from Workflow) |
| `setHandler(query, fn)` | Register a query handler (inherited from Workflow) |
| `runTasks()` | Execute the static `tasks` pipeline (inherited from Workflow) |

</details>

### DurableWorkflowHandle

Extends `WorkflowHandle` with access to the durable execution's event history, checkpoints, and replay state. Same signal/query/result API as the base handle.

`import { DurableWorkflowHandle } from 'cero-ts/durable'`

<details>
<summary><b>Methods & Properties</b></summary>

| Member | Description |
| -------- | ------------- |
| `signal(signal, ...args)` | Send a signal to the workflow (inherited) |
| `query(query, ...args)` | Read current workflow state (inherited) |
| `result()` | Await the final `Result` (inherited) |
| `events(afterSequence?)` | Get the full event history from the store |
| `checkpoint()` | Get the latest checkpoint snapshot |
| `completedSteps` | `ReadonlySet<string>` of completed step names |
| `currentSequence` | Sequence number of the last persisted event |
| `isReplaying` | `true` while the workflow is still replaying from the event log |

</details>

### Result

The immutable outcome of every Task or Workflow execution. A Result captures exactly what happened: the lifecycle **state** (`complete` or `interrupted`), the business **status** (`success`, `skipped`, or `failed`), the execution context, an optional reason for interruption, metadata, retry count, and whether rollback ran.

Results never throw — even failures are captured as data. Use predicates (`result.success`, `result.failed`) or the fluent `.on()` API for pattern-matched handling.

`import { Result } from 'cero-ts'`

<details>
<summary><b>Properties</b></summary>

| Property | Description |
| ---------- | ------------- |
| `success` | `true` if status is `'success'` |
| `failed` | `true` if status is `'failed'` |
| `skipped` | `true` if status is `'skipped'` |
| `complete` | `true` if state is `'complete'` (ran to end) |
| `interrupted` | `true` if state is `'interrupted'` (skip, fail, or exception) |
| `good` | `true` if success or skipped |
| `bad` | `true` if failed |
| `context` | The execution context with output data |
| `reason` | Why the task was interrupted (if applicable) |
| `cause` | The original `Error` if an exception occurred |
| `metadata` | Additional key-value metadata (runtime, correlationId, errors, etc.) |
| `retries` | Number of retry attempts made |
| `rolledBack` | `true` if `rollback()` was executed |

</details>

<details>
<summary><b>Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `on(type, handler)` | Fluent handler — `'success'`, `'failed'`, `'skipped'`, `'good'`, `'bad'`, etc. |
| `toJSON()` | Serialize to a plain object for logging or persistence |

</details>

---

## Examples

Check out the [`examples/`](./examples) directory for complete working examples:

- **[Basic Task](./examples/basic-task.ts)** — Simple task with attributes
- **[Attribute Validation](./examples/attribute-validation.ts)** — Input validation patterns
- **[Workflow Composition](./examples/workflow-composition.ts)** — Sequential and parallel pipelines
- **[Middleware Integration](./examples/middleware-integration.ts)** — Timeout, correlation, metrics
- **[Error Handling](./examples/error-handling.ts)** — Failures, skips, and retries
- **[Clean DDD](./examples/clean-ddd/)** — Full Clean Architecture + DDD example with Express
- **[Microservices Saga](./examples/microservices-saga/)** — Docker-composed saga orchestration with RabbitMQ, SQLite, and Interactive Workflows

---

## License

[LGPL-3.0](LICENSE) — Free to use in commercial projects with attribution.

---

<div align="center">

**[⬆ Back to Top](#cero-ts)**

Made with TypeScript

</div>
