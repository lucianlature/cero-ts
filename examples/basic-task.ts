/**
 * Basic Task Example
 *
 * This example demonstrates the fundamental usage of cero-ts tasks:
 * - Creating a simple task
 * - Defining attributes
 * - Implementing the work() method
 * - Executing and handling results
 */

import { Task, required, optional } from 'cero-ts';

// =============================================================================
// Example 1: Minimal Task
// =============================================================================

/**
 * The simplest possible task - just override work()
 */
class HelloWorld extends Task {
  override async work() {
    console.log('Hello, World!');
    this.context.set('message', 'Hello, World!');
  }
}

// Execute and check result
async function runMinimalTask() {
  const result = await HelloWorld.execute();

  if (result.success) {
    console.log('Message:', result.context.get('message'));
  }
}

// =============================================================================
// Example 2: Task with Attributes
// =============================================================================

/**
 * Context interface for type-safe context access
 */
interface GreetingContext {
  greeting: string;
  timestamp: Date;
}

/**
 * A task with required and optional attributes
 */
class GreetUser extends Task<GreetingContext> {
  // Define attributes with validation
  static override attributes = {
    name: required({ length: { min: 1, max: 100 } }),
    title: optional({ default: '' }),
    enthusiastic: optional({ type: 'boolean', default: false }),
  };

  // TypeScript declarations for attributes
  declare name: string;
  declare title: string;
  declare enthusiastic: boolean;

  override async work() {
    // Build the greeting
    const prefix = this.title ? `${this.title} ` : '';
    const suffix = this.enthusiastic ? '!' : '.';
    const greeting = `Hello, ${prefix}${this.name}${suffix}`;

    // Store results in context
    this.context.greeting = greeting;
    this.context.timestamp = new Date();
  }
}

async function runGreetingTask() {
  // Execute with all arguments
  const result1 = await GreetUser.execute({
    name: 'Alice',
    title: 'Dr.',
    enthusiastic: true,
  });

  if (result1.success) {
    console.log(result1.context.greeting); // "Hello, Dr. Alice!"
  }

  // Execute with minimal arguments (using defaults)
  const result2 = await GreetUser.execute({ name: 'Bob' });

  if (result2.success) {
    console.log(result2.context.greeting); // "Hello, Bob."
  }

  // Execute with invalid arguments
  const result3 = await GreetUser.execute({ name: '' });

  if (result3.failed) {
    console.log('Validation failed:', result3.reason);
    console.log('Errors:', result3.metadata.errors);
  }
}

// =============================================================================
// Example 3: Task with Callbacks
// =============================================================================

interface OrderContext {
  order: { id: string; total: number };
  processedAt: Date;
}

/**
 * A task demonstrating lifecycle callbacks
 */
class ProcessOrder extends Task<OrderContext> {
  static override attributes = {
    orderId: required({ type: 'integer' }),
    priority: optional({ default: 'normal', inclusion: { in: ['low', 'normal', 'high'] } }),
  };

  static override callbacks = {
    beforeExecution: ['logStart'],
    onSuccess: ['logSuccess', 'sendNotification'],
    onFailed: ['logFailure'],
  };

  declare orderId: number;
  declare priority: string;

  override async work() {
    // Simulate order processing
    console.log(`Processing order ${this.orderId} with ${this.priority} priority`);

    // Simulate fetching order
    const order = {
      id: `ORD-${this.orderId}`,
      total: Math.random() * 100,
    };

    this.context.order = order;
    this.context.processedAt = new Date();
  }

  private logStart() {
    console.log(`[${new Date().toISOString()}] Starting order processing...`);
  }

  private logSuccess() {
    console.log(`[${new Date().toISOString()}] Order processed successfully`);
  }

  private sendNotification() {
    console.log(`Notification: Order ${this.context.order.id} ready`);
  }

  private logFailure() {
    console.log(`[${new Date().toISOString()}] Order processing failed`);
  }
}

async function runOrderTask() {
  const result = await ProcessOrder.execute({
    orderId: 12345,
    priority: 'high',
  });

  if (result.success) {
    console.log('Order:', result.context.order);
    console.log('Processed at:', result.context.processedAt);
  }
}

// =============================================================================
// Example 4: Using Fluent Result Handlers
// =============================================================================

async function runWithFluentHandlers() {
  await GreetUser.execute({ name: 'Charlie' }).then((result) =>
    result
      .on('success', (r) => {
        console.log('Success!', r.context.greeting);
      })
      .on('failed', (r) => {
        console.error('Failed:', r.reason);
      })
      .on('skipped', (r) => {
        console.log('Skipped:', r.reason);
      })
  );
}

// =============================================================================
// Example 5: Task with Context Sharing
// =============================================================================

interface CalculationContext {
  numbers: number[];
  sum: number;
  average: number;
}

class CalculateStats extends Task<CalculationContext> {
  static override attributes = {
    numbers: required({ type: 'array' }),
  };

  declare numbers: number[];

  override async work() {
    if (this.numbers.length === 0) {
      this.skip('No numbers to calculate');
      return;
    }

    const sum = this.numbers.reduce((a, b) => a + b, 0);
    const average = sum / this.numbers.length;

    this.context.numbers = this.numbers;
    this.context.sum = sum;
    this.context.average = average;
  }
}

async function runCalculationTask() {
  // With numbers
  const result1 = await CalculateStats.execute({ numbers: [1, 2, 3, 4, 5] });
  if (result1.success) {
    console.log('Sum:', result1.context.sum); // 15
    console.log('Average:', result1.context.average); // 3
  }

  // With empty array - will be skipped
  const result2 = await CalculateStats.execute({ numbers: [] });
  if (result2.skipped) {
    console.log('Skipped:', result2.reason); // "No numbers to calculate"
  }
}

// =============================================================================
// Run all examples
// =============================================================================

async function main() {
  console.log('=== Example 1: Minimal Task ===');
  await runMinimalTask();

  console.log('\n=== Example 2: Task with Attributes ===');
  await runGreetingTask();

  console.log('\n=== Example 3: Task with Callbacks ===');
  await runOrderTask();

  console.log('\n=== Example 4: Fluent Result Handlers ===');
  await runWithFluentHandlers();

  console.log('\n=== Example 5: Context Sharing ===');
  await runCalculationTask();
}

main().catch(console.error);
