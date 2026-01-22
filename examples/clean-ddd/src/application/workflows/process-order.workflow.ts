import { Workflow, Task, required } from 'cero-ts';
import { OrderId } from '../../domain/order/value-objects/order-id.js';
import { OrderRepository } from '../ports/repositories/order.repository.js';
import { ProductRepository } from '../ports/repositories/product.repository.js';
import { EventBus } from '../ports/event-bus.js';
import { container } from '../../config/container.js';

/**
 * Individual tasks that make up the order processing workflow
 */

interface OrderContext extends Record<string, unknown> {
  orderId?: string;
}

/**
 * Validate order exists and is in correct state
 */
class ValidateOrderTask extends Task<OrderContext> {
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
        this.fail('Order must be paid before processing', {
          code: 'INVALID_ORDER_STATUS',
          currentStatus: order.status.getValue(),
        });
        return;
      }

      this.context.orderId = this.orderId;
      console.log(`[ValidateOrder] Order ${this.orderId} is valid for processing`);
    } catch {
      this.fail('Invalid order ID', { code: 'INVALID_ORDER_ID' });
    }
  }
}

/**
 * Reserve inventory for order items
 */
class ReserveInventoryTask extends Task<OrderContext> {
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

    // Check and reserve inventory
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

    console.log(`[ReserveInventory] Inventory reserved for order ${orderId}`);
  }
}

/**
 * Send order confirmation email
 */
class SendConfirmationTask extends Task<OrderContext> {
  override async work(): Promise<void> {
    const orderId = this.context.orderId as string;

    // Simulate sending email
    console.log(`[SendConfirmation] Sending confirmation email for order ${orderId}`);
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[SendConfirmation] Email sent successfully`);
  }
}

/**
 * Notify warehouse for fulfillment
 */
class NotifyWarehouseTask extends Task<OrderContext> {
  override async work(): Promise<void> {
    const orderId = this.context.orderId as string;

    // Simulate warehouse notification
    console.log(`[NotifyWarehouse] Notifying warehouse for order ${orderId}`);
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[NotifyWarehouse] Warehouse notified successfully`);
  }
}

/**
 * Publish domain events
 */
class PublishEventsTask extends Task<OrderContext> {
  override async work(): Promise<void> {
    const eventBus = container.resolve<EventBus>('EventBus');
    const orderId = this.context.orderId as string;

    // In a real implementation, you would pull events from the order aggregate
    console.log(`[PublishEvents] Publishing events for order ${orderId}`);

    await eventBus.publish({
      eventId: `evt_${Date.now()}`,
      eventName: 'order.processing_started',
      occurredAt: new Date(),
      payload: { orderId },
      toJSON() {
        return {
          eventId: this.eventId,
          eventName: this.eventName,
          occurredAt: this.occurredAt.toISOString(),
          payload: this.payload,
        };
      },
    });
  }
}

/**
 * Process Order Workflow
 *
 * Orchestrates multiple tasks to process an order:
 * 1. Validate order
 * 2. Reserve inventory
 * 3. Send confirmation (parallel with warehouse notification)
 * 4. Notify warehouse (parallel with confirmation)
 * 5. Publish domain events
 */
export class ProcessOrderWorkflow extends Workflow<OrderContext> {
  static override tasks = [
    ValidateOrderTask,
    ReserveInventoryTask,
    // Parallel execution of confirmation and warehouse notification
    { tasks: [SendConfirmationTask, NotifyWarehouseTask], strategy: 'parallel' as const },
    PublishEventsTask,
  ];

  static override attributes = {
    orderId: required(),
  };

  static override settings = {
    tags: ['order', 'processing'],
  };
}
