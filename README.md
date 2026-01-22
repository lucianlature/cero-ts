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

<details>
<summary><b>Static Properties</b></summary>

| Property | Description |
| ---------- | ------------- |
| `attributes` | Attribute schema definitions |
| `settings` | Task configuration overrides |
| `callbacks` | Lifecycle callback registrations |
| `middlewares` | Middleware stack |

</details>

<details>
<summary><b>Static Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `execute(args?, options?)` | Execute and return Result |
| `executeStrict(args?, options?)` | Execute and throw on failure |

</details>

<details>
<summary><b>Instance Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `work()` | Main business logic (override this) |
| `rollback()` | Optional cleanup on failure |
| `skip(reason?, metadata?)` | Skip execution |
| `fail(reason?, metadata?)` | Fail execution |
| `throw(result, metadata?)` | Propagate sub-task failure |

</details>

### Result

<details>
<summary><b>Properties</b></summary>

| Property | Description |
| ---------- | ------------- |
| `success` | `true` if status is `'success'` |
| `failed` | `true` if status is `'failed'` |
| `skipped` | `true` if status is `'skipped'` |
| `complete` | `true` if state is `'complete'` |
| `interrupted` | `true` if state is `'interrupted'` |
| `good` | `true` if success or skipped |
| `bad` | `true` if failed |
| `context` | Execution context with output data |
| `reason` | Interruption reason (if any) |
| `metadata` | Additional metadata |

</details>

<details>
<summary><b>Methods</b></summary>

| Method | Description |
| -------- | ------------- |
| `on(type, handler)` | Fluent handler registration |

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

---

## License

[LGPL-3.0](LICENSE) — Free to use in commercial projects with attribution.

---

<div align="center">

**[⬆ Back to Top](#cero-ts)**

Made with TypeScript

</div>
