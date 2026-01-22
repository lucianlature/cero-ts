/**
 * Workflow Composition Example
 *
 * This example demonstrates workflow patterns:
 * - Sequential task execution
 * - Parallel task execution
 * - Conditional tasks
 * - Nested workflows
 * - Error handling in workflows
 */

import { Task, Workflow, required, optional } from 'cero-ts';

// =============================================================================
// Individual Tasks for Workflows
// =============================================================================

interface OrderContext extends Record<string, unknown> {
  orderId: string;
  order: { id: string; items: string[]; total: number };
  validated: boolean;
  paymentId: string;
  shipmentId: string;
  notificationsSent: string[];
}

class ValidateOrder extends Task<OrderContext> {
  override async work() {
    const orderId = this.context.get('orderId') as string;
    console.log(`Validating order ${orderId}...`);

    // Simulate validation
    await delay(100);

    // Simulate fetching order
    this.context.order = {
      id: orderId,
      items: ['item1', 'item2'],
      total: 99.99,
    };
    this.context.validated = true;

    console.log(`Order ${orderId} validated`);
  }
}

class CalculateTax extends Task<OrderContext> {
  override async work() {
    const order = this.context.order;
    console.log(`Calculating tax for order ${order.id}...`);

    await delay(50);

    const tax = order.total * 0.08;
    this.context.set('tax', tax);
    this.context.set('totalWithTax', order.total + tax);

    console.log(`Tax calculated: $${tax.toFixed(2)}`);
  }
}

class ProcessPayment extends Task<OrderContext> {
  override async work() {
    const total = this.context.get('totalWithTax') as number;
    console.log(`Processing payment of $${total.toFixed(2)}...`);

    await delay(200);

    this.context.paymentId = `pay_${Date.now()}`;
    console.log(`Payment processed: ${this.context.paymentId}`);
  }
}

class CreateShipment extends Task<OrderContext> {
  override async work() {
    const order = this.context.order;
    console.log(`Creating shipment for order ${order.id}...`);

    await delay(150);

    this.context.shipmentId = `ship_${Date.now()}`;
    console.log(`Shipment created: ${this.context.shipmentId}`);
  }
}

class SendEmailNotification extends Task<OrderContext> {
  override async work() {
    console.log('Sending email notification...');
    await delay(100);

    const notifications = (this.context.notificationsSent ?? []) as string[];
    notifications.push('email');
    this.context.notificationsSent = notifications;

    console.log('Email sent');
  }
}

class SendSmsNotification extends Task<OrderContext> {
  override async work() {
    console.log('Sending SMS notification...');
    await delay(80);

    const notifications = (this.context.notificationsSent ?? []) as string[];
    notifications.push('sms');
    this.context.notificationsSent = notifications;

    console.log('SMS sent');
  }
}

class SendPushNotification extends Task<OrderContext> {
  override async work() {
    console.log('Sending push notification...');
    await delay(60);

    const notifications = (this.context.notificationsSent ?? []) as string[];
    notifications.push('push');
    this.context.notificationsSent = notifications;

    console.log('Push sent');
  }
}

class UpdateInventory extends Task<OrderContext> {
  override async work() {
    const order = this.context.order;
    console.log(`Updating inventory for ${order.items.length} items...`);

    await delay(100);

    this.context.set('inventoryUpdated', true);
    console.log('Inventory updated');
  }
}

// =============================================================================
// Example 1: Basic Sequential Workflow
// =============================================================================

class BasicOrderWorkflow extends Workflow<OrderContext> {
  static override tasks = [ValidateOrder, CalculateTax, ProcessPayment, CreateShipment];
}

async function runBasicWorkflow() {
  console.log('Starting basic order workflow...\n');

  const result = await BasicOrderWorkflow.execute({ orderId: 'ORD-001' });

  if (result.success) {
    console.log('\nWorkflow completed successfully!');
    console.log('Payment ID:', result.context.paymentId);
    console.log('Shipment ID:', result.context.shipmentId);
  } else {
    console.error('Workflow failed:', result.reason);
  }
}

// =============================================================================
// Example 2: Workflow with Parallel Tasks
// =============================================================================

class ParallelNotificationWorkflow extends Workflow<OrderContext> {
  static override tasks = [
    ValidateOrder,
    ProcessPayment,

    // Send all notifications in parallel
    {
      tasks: [SendEmailNotification, SendSmsNotification, SendPushNotification],
      strategy: 'parallel' as const,
    },

    CreateShipment,
  ];
}

async function runParallelWorkflow() {
  console.log('Starting workflow with parallel notifications...\n');

  const result = await ParallelNotificationWorkflow.execute({ orderId: 'ORD-002' });

  if (result.success) {
    console.log('\nWorkflow completed successfully!');
    console.log('Notifications sent:', result.context.notificationsSent);
  }
}

// =============================================================================
// Example 3: Workflow with Conditional Tasks
// =============================================================================

class ConditionalOrderWorkflow extends Workflow<OrderContext> {
  static override tasks = [
    ValidateOrder,
    CalculateTax,
    ProcessPayment,

    // Only create shipment for physical orders
    { task: CreateShipment, if: 'isPhysicalOrder' },

    // Only update inventory for in-stock items
    { task: UpdateInventory, if: (workflow) => workflow.context.get('hasInventory') === true },

    // Send email unless customer opted out
    { task: SendEmailNotification, unless: 'customerOptedOutEmail' },
  ];

  isPhysicalOrder() {
    const order = this.context.order;
    return order && order.items.some((item) => !item.startsWith('digital_'));
  }

  customerOptedOutEmail() {
    return this.context.get('emailOptOut') === true;
  }
}

async function runConditionalWorkflow() {
  console.log('Starting conditional workflow (physical order)...\n');

  const physical = await ConditionalOrderWorkflow.execute({
    orderId: 'ORD-003',
    hasInventory: true,
    emailOptOut: false,
  });

  console.log('\nPhysical order result:', physical.success ? 'Success' : 'Failed');
  console.log('Shipment ID:', physical.context.shipmentId ?? 'Not created');

  console.log('\n---\n');
  console.log('Starting conditional workflow (digital order, email opt-out)...\n');

  // For digital order, mock the order data to have digital items
  const digital = await ConditionalOrderWorkflow.execute({
    orderId: 'ORD-004',
    hasInventory: false,
    emailOptOut: true,
  });

  console.log('\nDigital order result:', digital.success ? 'Success' : 'Failed');
}

// =============================================================================
// Example 4: Nested Workflows
// =============================================================================

class PaymentWorkflow extends Workflow<OrderContext> {
  static override tasks = [CalculateTax, ProcessPayment];
}

class FulfillmentWorkflow extends Workflow<OrderContext> {
  static override tasks = [CreateShipment, UpdateInventory];
}

class NotificationWorkflow extends Workflow<OrderContext> {
  static override tasks = [
    {
      tasks: [SendEmailNotification, SendSmsNotification],
      strategy: 'parallel' as const,
    },
  ];
}

class NestedOrderWorkflow extends Workflow<OrderContext> {
  static override tasks = [
    ValidateOrder,
    PaymentWorkflow,
    { task: FulfillmentWorkflow, if: 'orderValidated' },
    NotificationWorkflow,
  ];

  orderValidated() {
    return this.context.validated === true;
  }
}

async function runNestedWorkflow() {
  console.log('Starting nested workflow...\n');

  const result = await NestedOrderWorkflow.execute({ orderId: 'ORD-005' });

  if (result.success) {
    console.log('\nNested workflow completed successfully!');
    console.log('All stages completed');
  }
}

// =============================================================================
// Example 5: Workflow with Error Handling
// =============================================================================

class FailingPayment extends Task<OrderContext> {
  override async work() {
    console.log('Processing payment...');
    await delay(100);

    // Simulate payment failure
    this.fail('Payment declined: insufficient funds', {
      code: 'INSUFFICIENT_FUNDS',
      retryable: true,
    });
  }
}

class ErrorHandlingWorkflow extends Workflow<OrderContext> {
  static override tasks = [ValidateOrder, FailingPayment, CreateShipment]; // Won't reach CreateShipment
}

async function runErrorHandlingWorkflow() {
  console.log('Starting workflow with payment failure...\n');

  const result = await ErrorHandlingWorkflow.execute({ orderId: 'ORD-006' });

  if (result.failed) {
    console.log('\nWorkflow failed (expected)');
    console.log('Reason:', result.reason);
    console.log('Error code:', result.metadata.code);
    console.log('Retryable:', result.metadata.retryable);

    // Check which task failed
    if (result.causedFailure) {
      console.log('Failed at:', result.causedFailure.class);
    }
  }
}

// =============================================================================
// Example 6: Workflow with Custom Breakpoints
// =============================================================================

class SkippableTask extends Task<OrderContext> {
  override async work() {
    console.log('Checking if task should run...');

    // Skip based on some condition
    if (this.context.get('skipOptional')) {
      this.skip('Optional task skipped by configuration');
      return;
    }

    console.log('Running optional task...');
    await delay(50);
  }
}

// Default: skipped tasks don't stop workflow
class SkipFriendlyWorkflow extends Workflow<OrderContext> {
  static override tasks = [ValidateOrder, SkippableTask, ProcessPayment];
}

// Strict: any interruption stops workflow
class StrictWorkflow extends Workflow<OrderContext> {
  static override settings = {
    workflowBreakpoints: ['failed', 'skipped'],
  };

  static override tasks = [ValidateOrder, SkippableTask, ProcessPayment];
}

async function runBreakpointWorkflow() {
  console.log('Skip-friendly workflow (skips continue)...\n');

  const friendly = await SkipFriendlyWorkflow.execute({
    orderId: 'ORD-007',
    skipOptional: true,
  });

  console.log('Result:', friendly.success ? 'Success' : 'Stopped');
  console.log('Payment processed:', !!friendly.context.paymentId);

  console.log('\n---\n');
  console.log('Strict workflow (skips stop workflow)...\n');

  const strict = await StrictWorkflow.execute({
    orderId: 'ORD-008',
    skipOptional: true,
  });

  console.log('Result:', strict.success ? 'Success' : 'Stopped');
  console.log('Status:', strict.status);
  console.log('Payment processed:', !!strict.context.paymentId);
}

// =============================================================================
// Helper function
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Run all examples
// =============================================================================

async function main() {
  console.log('=== Example 1: Basic Sequential Workflow ===\n');
  await runBasicWorkflow();

  console.log('\n\n=== Example 2: Parallel Tasks ===\n');
  await runParallelWorkflow();

  console.log('\n\n=== Example 3: Conditional Tasks ===\n');
  await runConditionalWorkflow();

  console.log('\n\n=== Example 4: Nested Workflows ===\n');
  await runNestedWorkflow();

  console.log('\n\n=== Example 5: Error Handling ===\n');
  await runErrorHandlingWorkflow();

  console.log('\n\n=== Example 6: Custom Breakpoints ===\n');
  await runBreakpointWorkflow();
}

main().catch(console.error);
