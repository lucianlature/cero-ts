import { Task, required } from 'cero-ts';
import { Order } from '../../../domain/order/entities/order.js';
import { OrderId } from '../../../domain/order/value-objects/order-id.js';
import { OrderRepository } from '../../ports/repositories/order.repository.js';
import { PaymentGateway } from '../../ports/services/payment-gateway.js';
import { EventBus } from '../../ports/event-bus.js';
import { container } from '../../../config/container.js';

interface CancelOrderContext extends Record<string, unknown> {
  order?: Order;
  refundTransactionId?: string;
}

/**
 * CancelOrder Use Case
 * Cancels an existing order and processes refund if needed
 */
export class CancelOrderUseCase extends Task<CancelOrderContext> {
  private orderRepository!: OrderRepository;
  private paymentGateway!: PaymentGateway;
  private eventBus!: EventBus;

  static override attributes = {
    orderId: required(),
    reason: required({ length: { min: 1, max: 500 } }),
  };

  declare orderId: string;
  declare reason: string;

  static override callbacks = {
    beforeExecution: ['resolveDependencies'],
    onSuccess: ['publishEvents'],
  };

  private resolveDependencies(): void {
    this.orderRepository = container.resolve<OrderRepository>('OrderRepository');
    this.paymentGateway = container.resolve<PaymentGateway>('PaymentGateway');
    this.eventBus = container.resolve<EventBus>('EventBus');
  }

  private async publishEvents(): Promise<void> {
    const order = this.context.order;
    if (order) {
      const events = order.pullDomainEvents();
      await this.eventBus.publishAll(events);
    }
  }

  override async work(): Promise<void> {
    // Validate order ID
    let orderIdVO: OrderId;
    try {
      orderIdVO = OrderId.fromString(this.orderId);
    } catch {
      this.fail('Invalid order ID format', {
        code: 'INVALID_ORDER_ID',
        orderId: this.orderId,
      });
      return;
    }

    // Find the order
    const order = await this.orderRepository.findById(orderIdVO);

    if (!order) {
      this.fail('Order not found', {
        code: 'ORDER_NOT_FOUND',
        orderId: this.orderId,
      });
      return;
    }

    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
      this.fail('Order cannot be cancelled', {
        code: 'CANNOT_CANCEL',
        currentStatus: order.status.getValue(),
      });
      return;
    }

    // If order was paid, process refund
    if (order.status.isPaid() && order.paymentReference) {
      const refundResult = await this.paymentGateway.refund(
        order.paymentReference,
        order.total
      );

      if (!refundResult.success) {
        this.fail('Refund failed', {
          code: 'REFUND_FAILED',
          errorCode: refundResult.errorCode,
          errorMessage: refundResult.errorMessage,
        });
        return;
      }

      this.context.refundTransactionId = refundResult.transactionId;
    }

    // Cancel the order
    order.cancel(this.reason);
    await this.orderRepository.save(order);

    this.context.order = order;
  }
}
