import { Workflow, Task, required, defineSignal, defineQuery, type WorkflowHandle } from 'cero-ts';
import { OrderId } from '../../domain/order/value-objects/order-id.js';
import type { OrderStatusValue } from '../../domain/order/value-objects/order-status.js';
import { OrderRepository } from '../ports/repositories/order.repository.js';
import { ProductRepository } from '../ports/repositories/product.repository.js';
import { PaymentGateway } from '../ports/services/payment-gateway.js';
import { EventBus } from '../ports/event-bus.js';
import { container } from '../../config/container.js';

// ============================================
// Fulfillment Context
// ============================================

interface FulfillmentContext extends Record<string, unknown> {
  orderId?: string;
  fulfillmentStatus?: FulfillmentStatus;
}

type FulfillmentStatus =
  | 'validating'
  | 'reserving_inventory'
  | 'awaiting_shipment'
  | 'shipped'
  | 'awaiting_delivery'
  | 'delivered'
  | 'cancelling'
  | 'cancelled'
  | 'refunding'
  | 'failed';

// ============================================
// Signal Definitions
// ============================================

/**
 * Signal sent by the warehouse when the order has been shipped.
 * Includes optional tracking information.
 */
export const orderShippedSignal = defineSignal<[{ trackingNumber?: string; carrier?: string }]>(
  'order.shipped',
);

/**
 * Signal sent by the delivery driver when the order has been delivered.
 */
export const orderDeliveredSignal = defineSignal<[{ deliveredAt?: string; signature?: string }]>(
  'order.delivered',
);

/**
 * Signal to request cancellation of the order during fulfillment.
 */
export const cancelFulfillmentSignal = defineSignal<[{ reason: string }]>(
  'fulfillment.cancel',
);

// ============================================
// Query Definitions
// ============================================

/**
 * Query the current fulfillment status.
 */
export const fulfillmentStatusQuery = defineQuery<{
  orderId: string;
  status: FulfillmentStatus;
  trackingNumber?: string;
  carrier?: string;
  deliveredAt?: string;
}>('fulfillment.status');

/**
 * Query whether the fulfillment can still be cancelled.
 */
export const canCancelQuery = defineQuery<boolean>('fulfillment.canCancel');

// ============================================
// Pipeline Tasks (used by runTasks)
// ============================================

/**
 * Validate order exists and is in correct state for fulfillment
 */
class ValidateForFulfillmentTask extends Task<FulfillmentContext> {
  static override attributes = {
    orderId: required(),
  };

  declare orderId: string;

  override async work(): Promise<void> {
    const orderRepo = container.resolve<OrderRepository>('OrderRepository');

    try {
      const orderIdVO = OrderId.fromString(this.orderId);
      const order = await orderRepo.findById(orderIdVO);

      if (!order) {
        this.fail('Order not found', { code: 'ORDER_NOT_FOUND' });
        return;
      }

      if (!order.status.isPaid()) {
        this.fail('Order must be paid before fulfillment', {
          code: 'INVALID_ORDER_STATUS',
          currentStatus: order.status.getValue(),
        });
        return;
      }

      this.context.orderId = this.orderId;
      console.log(`  [ValidateForFulfillment] Order ${this.orderId} validated`);
    } catch {
      this.fail('Invalid order ID', { code: 'INVALID_ORDER_ID' });
    }
  }
}

/**
 * Reserve inventory for order items
 */
class ReserveInventoryTask extends Task<FulfillmentContext> {
  override async work(): Promise<void> {
    const orderRepo = container.resolve<OrderRepository>('OrderRepository');
    const productRepo = container.resolve<ProductRepository>('ProductRepository');
    const orderId = this.context.orderId as string;
    const orderIdVO = OrderId.fromString(orderId);
    const order = await orderRepo.findById(orderIdVO);

    if (!order) {
      this.fail('Order not found');
      return;
    }

    for (const item of order.items) {
      const product = await productRepo.findById(item.productId);
      if (!product || product.stock < item.quantity) {
        this.fail('Insufficient inventory', {
          code: 'INSUFFICIENT_STOCK',
          productId: item.productId,
        });
        return;
      }
    }

    console.log(`  [ReserveInventory] Inventory reserved for order ${orderId}`);
  }
}

/**
 * Send confirmation and notify warehouse (parallel)
 */
class SendConfirmationTask extends Task<FulfillmentContext> {
  override async work(): Promise<void> {
    console.log(`  [SendConfirmation] Email sent for order ${this.context.orderId}`);
  }
}

class NotifyWarehouseTask extends Task<FulfillmentContext> {
  override async work(): Promise<void> {
    console.log(`  [NotifyWarehouse] Warehouse notified for order ${this.context.orderId}`);
  }
}

// ============================================
// Order Fulfillment Workflow
// ============================================

/**
 * Interactive Order Fulfillment Workflow
 *
 * Models the complete fulfillment lifecycle using Temporal-inspired patterns:
 *
 * 1. **Pipeline phase** (runTasks): Validate order → Reserve inventory → Notify warehouse + Send confirmation
 * 2. **Await shipment** (condition + signal): Blocks until warehouse signals shipment or timeout
 * 3. **Await delivery** (condition + signal): Blocks until driver signals delivery or timeout
 * 4. **Cancellation** (signal): Can be cancelled at any point before delivery
 *
 * Signals:
 *   - `order.shipped`       — Warehouse marks order as shipped
 *   - `order.delivered`     — Driver marks order as delivered
 *   - `fulfillment.cancel`  — Request cancellation
 *
 * Queries:
 *   - `fulfillment.status`   — Current fulfillment status with tracking info
 *   - `fulfillment.canCancel` — Whether cancellation is still possible
 *
 * @example
 * ```typescript
 * // Start the interactive fulfillment workflow
 * const handle = OrderFulfillmentWorkflow.start({ orderId: 'ord_123' });
 *
 * // Query status at any time
 * const status = handle.query(fulfillmentStatusQuery);
 * // → { orderId: 'ord_123', status: 'awaiting_shipment' }
 *
 * // Warehouse ships the order
 * handle.signal(orderShippedSignal, { trackingNumber: '1Z999AA10123456784', carrier: 'UPS' });
 *
 * // Driver delivers the order
 * handle.signal(orderDeliveredSignal, { deliveredAt: new Date().toISOString() });
 *
 * // Await final result
 * const result = await handle.result();
 * ```
 */
export class OrderFulfillmentWorkflow extends Workflow<FulfillmentContext> {
  // Pipeline tasks: validation + inventory + notifications
  static override tasks = [
    ValidateForFulfillmentTask,
    ReserveInventoryTask,
    { tasks: [SendConfirmationTask, NotifyWarehouseTask], strategy: 'parallel' as const },
  ];

  static override attributes = {
    orderId: required(),
  };

  static override settings = {
    tags: ['order', 'fulfillment'],
  };

  override async work(): Promise<void> {
    // ---- Workflow State ----
    let status: FulfillmentStatus = 'validating';
    let trackingNumber: string | undefined;
    let carrier: string | undefined;
    let deliveredAt: string | undefined;
    let cancelReason: string | undefined;
    let cancelled = false;

    // ---- Register Signal Handlers ----

    this.setHandler(orderShippedSignal, (input) => {
      if (status === 'awaiting_shipment') {
        trackingNumber = input.trackingNumber;
        carrier = input.carrier;
        status = 'shipped';
        console.log(`  [Fulfillment] Order shipped — tracking: ${trackingNumber ?? 'N/A'}`);
      }
    });

    this.setHandler(orderDeliveredSignal, (input) => {
      if (status === 'shipped' || status === 'awaiting_delivery') {
        deliveredAt = input.deliveredAt ?? new Date().toISOString();
        status = 'delivered';
        console.log(`  [Fulfillment] Order delivered at ${deliveredAt}`);
      }
    });

    this.setHandler(cancelFulfillmentSignal, (input) => {
      // Can only cancel before delivery
      if (status !== 'delivered' && status !== 'cancelled' && status !== 'failed') {
        cancelReason = input.reason;
        cancelled = true;
        status = 'cancelling';
        console.log(`  [Fulfillment] Cancellation requested: ${input.reason}`);
      }
    });

    // ---- Register Query Handlers ----

    this.setHandler(fulfillmentStatusQuery, () => ({
      orderId: (this.context.orderId as string) ?? 'unknown',
      status,
      trackingNumber,
      carrier,
      deliveredAt,
    }));

    this.setHandler(canCancelQuery, () =>
      status !== 'delivered' && status !== 'cancelled' && status !== 'failed',
    );

    // ---- Phase 1: Pipeline — Validate, Reserve, Notify ----
    console.log(`\n[Fulfillment] Starting fulfillment pipeline...`);
    status = 'validating';
    await this.runTasks();
    status = 'reserving_inventory';

    // Check for cancellation between phases
    if (cancelled) {
      await this.handleCancellation(cancelReason);
      return;
    }

    // ---- Phase 2: Await Shipment ----
    status = 'awaiting_shipment';
    console.log(`[Fulfillment] Awaiting warehouse shipment signal...`);

    const shipped = await this.condition(
      () => status === 'shipped' || cancelled,
      '7d', // 7-day shipment window
    );

    if (cancelled) {
      await this.handleCancellation(cancelReason);
      return;
    }

    if (!shipped) {
      status = 'failed';
      await this.handleRefund('Shipment timeout — order not shipped within 7 days');
      return;
    }

    // ---- Phase 3: Await Delivery ----
    status = 'awaiting_delivery';
    console.log(`[Fulfillment] Order shipped. Awaiting delivery signal...`);

    const delivered = await this.condition(
      () => status === 'delivered' || cancelled,
      '14d', // 14-day delivery window
    );

    if (cancelled) {
      await this.handleCancellation(cancelReason);
      return;
    }

    if (!delivered) {
      status = 'failed';
      await this.handleRefund('Delivery timeout — order not delivered within 14 days');
      return;
    }

    // ---- Phase 4: Complete ----
    console.log(`[Fulfillment] Order ${this.context.orderId} fulfilled successfully!`);

    // Update order status in the domain
    await this.updateOrderStatus('delivered');

    // Publish completion event
    await this.publishEvent('order.fulfilled', {
      orderId: this.context.orderId,
      trackingNumber,
      carrier,
      deliveredAt,
    });
  }

  // ---- Helpers ----

  private async handleCancellation(reason?: string): Promise<void> {
    console.log(`[Fulfillment] Processing cancellation...`);
    await this.handleRefund(reason ?? 'Cancelled by request');
    await this.updateOrderStatus('cancelled');
  }

  private async handleRefund(reason: string): Promise<void> {
    try {
      const orderRepo = container.resolve<OrderRepository>('OrderRepository');
      const paymentGateway = container.resolve<PaymentGateway>('PaymentGateway');
      const orderId = this.context.orderId as string;
      const orderIdVO = OrderId.fromString(orderId);
      const order = await orderRepo.findById(orderIdVO);

      if (order?.paymentReference) {
        const refundResult = await paymentGateway.refund(order.paymentReference, order.total);
        if (refundResult.success) {
          console.log(`  [Fulfillment] Refund processed: ${refundResult.transactionId}`);
        } else {
          console.error(`  [Fulfillment] Refund failed: ${refundResult.errorMessage}`);
        }
      }

      this.fail(reason, { code: 'FULFILLMENT_CANCELLED' });
    } catch (error) {
      this.fail(reason, {
        code: 'FULFILLMENT_CANCELLED',
        refundError: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  private async updateOrderStatus(targetStatus: 'delivered' | 'cancelled'): Promise<void> {
    try {
      const orderRepo = container.resolve<OrderRepository>('OrderRepository');
      const orderId = this.context.orderId as string;
      const orderIdVO = OrderId.fromString(orderId);
      const order = await orderRepo.findById(orderIdVO);

      if (order) {
        if (targetStatus === 'cancelled') {
          order.cancel('Fulfillment cancelled');
        }
        // For 'delivered', the domain model would need a deliver() method
        await orderRepo.save(order);
      }
    } catch (error) {
      console.error(`  [Fulfillment] Failed to update order status: ${error}`);
    }
  }

  private async publishEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const eventBus = container.resolve<EventBus>('EventBus');
      await eventBus.publish({
        eventId: `evt_${Date.now()}`,
        eventName,
        occurredAt: new Date(),
        payload,
        toJSON() {
          return {
            eventId: this.eventId,
            eventName: this.eventName,
            occurredAt: this.occurredAt.toISOString(),
            payload: this.payload,
          };
        },
      });
    } catch (error) {
      console.error(`  [Fulfillment] Failed to publish event: ${error}`);
    }
  }
}

// ============================================
// In-memory handle registry (for demo purposes)
// ============================================

/**
 * Simple in-memory registry for active fulfillment workflow handles.
 * In production, this would be backed by a persistent store or Temporal.
 */
const activeHandles = new Map<string, WorkflowHandle<FulfillmentContext>>();

/**
 * Start a fulfillment workflow and register the handle.
 */
export function startFulfillment(orderId: string): WorkflowHandle<FulfillmentContext> {
  const handle = OrderFulfillmentWorkflow.start({ orderId });

  activeHandles.set(orderId, handle);

  // Clean up when workflow completes
  void handle.result().then(() => {
    activeHandles.delete(orderId);
  });

  return handle;
}

/**
 * Get the handle for an active fulfillment workflow.
 */
export function getFulfillmentHandle(orderId: string): WorkflowHandle<FulfillmentContext> | undefined {
  return activeHandles.get(orderId);
}
