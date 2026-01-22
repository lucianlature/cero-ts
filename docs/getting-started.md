# Getting Started

cero-ts is a TypeScript framework for building maintainable, observable business logic through composable command objects. It brings structure, consistency, and powerful developer tools to your business processes.

## Common Challenges

- Inconsistent service object patterns across your codebase
- Black boxes make debugging a nightmare
- Fragile error handling erodes confidence

## What You Get

- Consistent, standardized architecture
- Built-in flow control and error handling
- Composable, reusable workflows
- Comprehensive logging for observability
- Attribute validation with type coercions

## Requirements

- Node.js 24+ (also works with Bun and Deno)
- TypeScript 5.7+

## Installation

```bash
npm install cero-ts
```

## The CERO Pattern

cero-ts embraces the **Compose, Execute, React, Observe** (CERO, pronounced "zero") pattern—a simple yet powerful approach to building reliable business logic.

```
Compose → Execute → React
              ↓
           Observe
```

### 1. Compose

Build reusable, single-responsibility tasks with typed attributes, validation, and callbacks.

```typescript
import { Task, required, optional } from 'cero-ts';

interface AnalyzeMetricsContext {
  result: AnalysisResult;
  analyzedAt: Date;
}

class AnalyzeMetrics extends Task<AnalyzeMetricsContext> {
  static override attributes = {
    datasetId: required({ type: 'integer', numeric: { min: 1 } }),
    analysisType: optional({ default: 'standard' }),
  };

  static override callbacks = {
    onSuccess: ['trackAnalysisCompletion'],
  };

  declare datasetId: number;
  declare analysisType: string;

  override async work() {
    const dataset = await Dataset.findById(this.datasetId);

    if (!dataset) {
      this.fail('Dataset not found', { code: 404 });
    } else if (dataset.unprocessed) {
      this.skip('Dataset not ready for analysis');
    } else {
      this.context.result = await PValueAnalyzer.execute({ dataset });
      this.context.analyzedAt = new Date();
    }
  }

  private trackAnalysisCompletion() {
    Analytics.track('analysis_completed', { datasetId: this.datasetId });
  }
}
```

**Minimum Viable Task:**

```typescript
class SendAnalyzedEmail extends Task {
  override async work() {
    const user = await User.findById(this.context.get('userId'));
    await MetricsMailer.sendAnalyzed(user);
  }
}
```

### 2. Execute

Invoke tasks with a consistent API that always returns a result object.

```typescript
// With arguments
const result = await AnalyzeMetrics.execute({
  datasetId: 123,
  analysisType: 'advanced',
});

// Without arguments
const result = await SendEmail.execute();
```

### 3. React

Every execution returns a result object with a clear outcome.

```typescript
if (result.success) {
  console.log(`Metrics analyzed at ${result.context.analyzedAt}`);
} else if (result.skipped) {
  console.log(`Skipping analysis: ${result.reason}`);
} else if (result.failed) {
  console.log(`Analysis failed: ${result.reason} (code: ${result.metadata.code})`);
}

// Or use fluent handlers
result
  .on('success', (r) => notifyUser(r))
  .on('failed', (r) => alertAdmin(r))
  .on('skipped', (r) => logSkip(r));
```

### 4. Observe

Every task execution generates structured logs with execution chains, runtime metrics, and contextual metadata.

```
I, [2026-01-22T10:30:00.000Z #1234] INFO -- cero:
index=1 chain_id="018c2b95-23j4-2kj3-32kj-3n4jk3n4jknf" type="Task" class="SendAnalyzedEmail" state="complete" status="success" metadata={runtime: 347}

I, [2026-01-22T10:30:01.000Z #1234] INFO -- cero:
index=0 chain_id="018c2b95-b764-7615-a924-cc5b910ed1e5" type="Task" class="AnalyzeMetrics" state="complete" status="success" metadata={runtime: 187}
```

## Type Safety

cero-ts is built with TypeScript-first design:

- **Generic contexts** - Type-safe context objects with `Task<TContext>`
- **Attribute declarations** - Use `declare` for compile-time attribute types
- **Result typing** - Full type inference for result objects
- **IDE support** - Excellent autocomplete and navigation

```typescript
interface UserContext {
  user: User;
  token: string;
}

class CreateUser extends Task<UserContext> {
  static override attributes = {
    email: required({ format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
    name: required({ length: { min: 1, max: 100 } }),
  };

  declare email: string;
  declare name: string;

  override async work() {
    this.context.user = await User.create({
      email: this.email,
      name: this.name,
    });
    this.context.token = generateToken(this.context.user);
  }
}

// Result is typed
const result = await CreateUser.execute({ email: 'test@example.com', name: 'Test' });
if (result.success) {
  console.log(result.context.user.id); // TypeScript knows about user
}
```

## Next Steps

- Learn about [Attributes](attributes/definitions.md) for input validation
- Explore [Workflows](workflows.md) for task composition
- Set up [Logging](logging.md) for observability
- Configure [Middlewares](middlewares.md) for cross-cutting concerns
