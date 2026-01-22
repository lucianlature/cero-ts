# OpenTelemetry Tracing

Add distributed tracing to your tasks using OpenTelemetry. Track execution across services and visualize task flows.

[OpenTelemetry JS](https://opentelemetry.io/docs/instrumentation/js/)

## Installation

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

## Setup

### Initialize OpenTelemetry

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

### Create Tracing Middleware

```typescript
// lib/tracing-middleware.ts
import { trace, context, SpanKind, SpanStatusCode, Span } from '@opentelemetry/api';
import { Task, Result } from 'cero-ts';

const tracer = trace.getTracer('cero-ts');

interface TracingOptions {
  /** Custom span name (default: task class name) */
  spanName?: string | ((task: Task) => string);
  /** Additional attributes to add to span */
  attributes?: Record<string, string | number | boolean>;
  /** Include context data as span attributes */
  includeContext?: boolean;
  /** Record task result as span event */
  recordResult?: boolean;
}

export class TracingMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: TracingOptions,
    next: () => Promise<Result>
  ): Promise<Result> {
    const spanName = typeof options.spanName === 'function'
      ? options.spanName(task)
      : options.spanName ?? task.constructor.name;

    return tracer.startActiveSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'task.class': task.constructor.name,
        'task.id': task.id,
        'task.chain_id': task.chainId,
        'task.index': task.index,
        ...options.attributes,
      },
    }, async (span) => {
      try {
        // Add context as attributes if requested
        if (options.includeContext) {
          for (const [key, value] of Object.entries(task.context.toObject())) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              span.setAttribute(`task.context.${key}`, value);
            }
          }
        }

        const result = await next();

        // Set span status based on result
        if (result.success) {
          span.setStatus({ code: SpanStatusCode.OK });
        } else if (result.failed) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.reason,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK, message: 'skipped' });
        }

        // Add result attributes
        span.setAttribute('task.status', result.status);
        span.setAttribute('task.state', result.state);

        if (result.reason) {
          span.setAttribute('task.reason', result.reason);
        }

        // Record result as event if requested
        if (options.recordResult) {
          span.addEvent('task.completed', {
            status: result.status,
            reason: result.reason || '',
          });
        }

        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

// Singleton instance
export const tracingMiddleware = new TracingMiddleware();
```

## Usage

### Basic Usage

```typescript
import { Task, required } from 'cero-ts';
import { tracingMiddleware } from './lib/tracing-middleware';

class ProcessOrder extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
  };

  declare orderId: number;

  static override middlewares = [tracingMiddleware];

  override async work() {
    // This execution is traced
    await this.validateOrder();
    await this.processPayment();
    await this.createShipment();

    this.context.set('status', 'completed');
  }
}
```

### With Custom Attributes

```typescript
class ProcessPayment extends Task {
  static override attributes = {
    orderId: required({ type: 'integer' }),
    amount: required({ type: 'float' }),
  };

  declare orderId: number;
  declare amount: number;

  static override middlewares = [
    [tracingMiddleware, {
      attributes: {
        'payment.gateway': 'stripe',
        'payment.currency': 'USD',
      },
      recordResult: true,
    }],
  ];
}
```

### Include Context Data

```typescript
class AuditedTask extends Task {
  static override middlewares = [
    [tracingMiddleware, {
      includeContext: true,  // Add context values as span attributes
    }],
  ];
}
```

## Child Spans

Create child spans for sub-operations:

```typescript
import { trace, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('cero-ts');

class ProcessOrder extends Task {
  static override middlewares = [tracingMiddleware];

  override async work() {
    // Parent span is created by middleware

    // Create child span for validation
    await tracer.startActiveSpan('validate-order', async (span) => {
      try {
        await this.validateOrder();
        span.setStatus({ code: SpanStatusCode.OK });
      } finally {
        span.end();
      }
    });

    // Create child span for payment
    await tracer.startActiveSpan('process-payment', async (span) => {
      span.setAttribute('payment.amount', this.amount);
      try {
        await this.processPayment();
        span.setStatus({ code: SpanStatusCode.OK });
      } finally {
        span.end();
      }
    });
  }
}
```

## Workflow Tracing

Trace entire workflows with parent-child relationships:

```typescript
import { Workflow } from 'cero-ts';
import { tracingMiddleware } from './lib/tracing-middleware';

class OrderWorkflow extends Workflow {
  static override middlewares = [
    [tracingMiddleware, { spanName: 'OrderWorkflow' }],
  ];

  static override tasks = [
    ValidateOrder,    // Child span
    ProcessPayment,   // Child span
    CreateShipment,   // Child span
    SendConfirmation, // Child span
  ];
}

// Each task also has tracing middleware
class ValidateOrder extends Task {
  static override middlewares = [
    [tracingMiddleware, { spanName: 'ValidateOrder' }],
  ];
}
```

This creates a trace like:

```shell
OrderWorkflow (parent span)
├── ValidateOrder (child span)
├── ProcessPayment (child span)
├── CreateShipment (child span)
└── SendConfirmation (child span)
```

## Context Propagation

Propagate trace context across service boundaries:

```typescript
import { context, propagation } from '@opentelemetry/api';

class CallExternalService extends Task {
  static override middlewares = [tracingMiddleware];

  override async work() {
    // Extract current trace context
    const headers: Record<string, string> = {};
    propagation.inject(context.active(), headers);

    // Pass headers to external service
    const response = await fetch('https://api.example.com/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,  // Include trace headers
      },
      body: JSON.stringify({ data: this.context.toObject() }),
    });

    this.context.set('response', await response.json());
  }
}
```

## Global Configuration

Enable tracing for all tasks:

```typescript
import { configure } from 'cero-ts';
import { tracingMiddleware } from './lib/tracing-middleware';

configure((config) => {
  // Enable tracing globally
  config.middlewares.register(tracingMiddleware, {
    recordResult: true,
  });
});
```

## Custom Tracer

Use a custom tracer:

```typescript
import { trace } from '@opentelemetry/api';

// Create a custom tracer for your domain
const paymentTracer = trace.getTracer('payment-service', '1.0.0');

class PaymentTracingMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: TracingOptions,
    next: () => Promise<Result>
  ): Promise<Result> {
    return paymentTracer.startActiveSpan(
      `payment.${task.constructor.name}`,
      async (span) => {
        // ... tracing logic
      }
    );
  }
}
```

## Baggage

Pass data through the trace context:

```typescript
import { propagation, context } from '@opentelemetry/api';

class SetBaggageMiddleware {
  async call<T extends Record<string, unknown>>(
    task: Task<T>,
    options: { items: Record<string, string> },
    next: () => Promise<Result>
  ): Promise<Result> {
    // Set baggage items
    let ctx = context.active();
    for (const [key, value] of Object.entries(options.items)) {
      ctx = propagation.setBaggage(ctx, propagation.createBaggage({
        [key]: { value },
      }));
    }

    // Run task with baggage context
    return context.with(ctx, () => next());
  }
}

// Usage
class MyTask extends Task {
  static override middlewares = [
    [new SetBaggageMiddleware(), {
      items: {
        'user.id': '123',
        'tenant.id': 'acme',
      },
    }],
    tracingMiddleware,
  ];
}
```

## Exporting to Different Backends

### Jaeger

```typescript
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const exporter = new JaegerExporter({
  endpoint: 'http://localhost:14268/api/traces',
});
```

### Zipkin

```typescript
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

const exporter = new ZipkinExporter({
  url: 'http://localhost:9411/api/v2/spans',
});
```

### Console (for debugging)

```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const exporter = new ConsoleSpanExporter();
```
