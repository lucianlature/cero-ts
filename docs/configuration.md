# Configuration

Configure cero-ts globally to set defaults for all tasks and workflows.

## Basic Configuration

```typescript
import { configure, Cero } from 'cero-ts';

configure((config) => {
  // Set task breakpoints (what statuses should stop execution)
  config.taskBreakpoints = ['failed'];

  // Set workflow breakpoints
  config.workflowBreakpoints = ['failed'];

  // Enable backtrace in error results
  config.backtrace = true;

  // Configure rollback behavior
  config.rollbackOn = ['failed'];
});
```

## Configuration Options

### taskBreakpoints

Determines which result statuses should stop task execution in workflows.

```typescript
configure((config) => {
  // Default: only failures stop execution
  config.taskBreakpoints = ['failed'];

  // Stop on both failures and skips
  config.taskBreakpoints = ['failed', 'skipped'];

  // Never stop (continue through all tasks)
  config.taskBreakpoints = [];
});
```

### workflowBreakpoints

Determines which result statuses should stop workflow execution.

```typescript
configure((config) => {
  config.workflowBreakpoints = ['failed', 'skipped'];
});
```

### backtrace

Include stack traces in error results.

```typescript
configure((config) => {
  config.backtrace = true;  // Include stack traces
  config.backtrace = false; // Omit stack traces (default)
});
```

### rollbackOn

Configure when rollback methods should be called.

```typescript
configure((config) => {
  // Rollback on failures (default)
  config.rollbackOn = ['failed'];

  // Rollback on any interruption
  config.rollbackOn = ['failed', 'skipped'];

  // Never rollback
  config.rollbackOn = [];
});
```

## Registries

### Middleware Registry

Register global middleware that runs for all tasks:

```typescript
import { configure } from 'cero-ts';
import { RuntimeMiddleware, CorrelateMiddleware } from 'cero-ts/middleware';

configure((config) => {
  // Register middleware classes
  config.middlewares.register(RuntimeMiddleware);
  config.middlewares.register(CorrelateMiddleware);

  // Register middleware instances
  config.middlewares.register(new CustomMiddleware());

  // Register with options
  config.middlewares.register(TimeoutMiddleware, { seconds: 30 });
});
```

### Callback Registry

Register global callbacks that run for all tasks:

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  // Register callbacks by event type
  config.callbacks.register('onSuccess', (task) => {
    Metrics.increment('task.success');
  });

  config.callbacks.register('onFailed', (task) => {
    Sentry.captureException(task.result?.cause);
  });

  config.callbacks.register('onExecuted', (task) => {
    Logger.log(task.result);
  });
});
```

### Coercion Registry

Register custom type coercions:

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  // Register a custom coercion
  config.coercions.register('money', (value) => {
    if (typeof value === 'string') {
      return parseFloat(value.replace(/[$,]/g, ''));
    }
    return value;
  });

  // Register a coercion with options
  config.coercions.register('currency', (value, options) => {
    const num = parseFloat(value);
    return Math.round(num * 100) / 100; // Round to 2 decimals
  });
});

// Usage in task
class ProcessPayment extends Task {
  static override attributes = {
    amount: required({ type: 'money' }),
  };
}
```

### Validator Registry

Register custom validators:

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  // Register a custom validator
  config.validators.register('creditCard', (value) => {
    const cleaned = value.replace(/\D/g, '');
    // Luhn algorithm check
    return isValidLuhn(cleaned) ? true : 'is not a valid credit card number';
  });

  // Register a validator with options
  config.validators.register('phoneNumber', (value, options) => {
    const { country = 'US' } = options;
    const pattern = phonePatterns[country];
    return pattern.test(value) ? true : `is not a valid ${country} phone number`;
  });
});

// Usage in task
class CreateOrder extends Task {
  static override attributes = {
    cardNumber: required({ creditCard: true }),
    phone: optional({ phoneNumber: { country: 'US' } }),
  };
}
```

## Accessing Configuration

### Read Current Configuration

```typescript
import { Cero, getConfiguration } from 'cero-ts';

// Via Cero namespace
const config = Cero.configuration;
console.log(config.taskBreakpoints);

// Via function
const config = getConfiguration();
```

### Reset Configuration

```typescript
import { resetConfiguration, Cero } from 'cero-ts';

// Reset to defaults
resetConfiguration();

// Or via Cero namespace
Cero.resetConfiguration();
```

## Environment-Based Configuration

```typescript
import { configure } from 'cero-ts';

configure((config) => {
  if (process.env.NODE_ENV === 'production') {
    config.backtrace = false;
    config.taskBreakpoints = ['failed'];
  } else {
    config.backtrace = true;
    config.taskBreakpoints = ['failed', 'skipped'];
  }
});
```

## Per-Task Configuration

Override global configuration at the task level:

```typescript
class CriticalTask extends Task {
  static override settings = {
    breakpoints: ['failed', 'skipped'],
    rollbackOn: ['failed'],
  };

  override async work() {
    // Task logic
  }

  override async rollback() {
    // Cleanup on failure
  }
}
```

## Configuration Best Practices

1. **Configure Early**: Set up configuration before any tasks run
2. **Environment Awareness**: Adjust settings based on environment
3. **Global Defaults**: Use registries for common cross-cutting concerns
4. **Task Overrides**: Override only when necessary at task level

```typescript
// config/cero.ts
import { configure } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';

export function setupCero() {
  configure((config) => {
    // Always track runtime
    config.middlewares.register(RuntimeMiddleware);

    // Production settings
    if (process.env.NODE_ENV === 'production') {
      config.callbacks.register('onFailed', errorReporter);
      config.backtrace = false;
    }

    // Development settings
    if (process.env.NODE_ENV === 'development') {
      config.backtrace = true;
      config.callbacks.register('onExecuted', debugLogger);
    }
  });
}

// app.ts
import { setupCero } from './config/cero';

setupCero();
// Now all tasks use this configuration
```
