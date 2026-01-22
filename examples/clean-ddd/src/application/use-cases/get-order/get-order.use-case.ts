import { Task, required } from 'cero-ts';
import { Order } from '../../../domain/order/entities/order.js';
import { OrderId } from '../../../domain/order/value-objects/order-id.js';
import { OrderRepository } from '../../ports/repositories/order.repository.js';
import { container } from '../../../config/container.js';

interface GetOrderContext extends Record<string, unknown> {
  order?: ReturnType<Order['toJSON']>;
}

/**
 * GetOrder Use Case
 * Retrieves an order by ID
 */
export class GetOrderUseCase extends Task<GetOrderContext> {
  private orderRepository!: OrderRepository;

  static override attributes = {
    orderId: required(),
  };

  declare orderId: string;

  static override callbacks = {
    beforeExecution: ['resolveDependencies'],
  };

  private resolveDependencies(): void {
    this.orderRepository = container.resolve<OrderRepository>('OrderRepository');
  }

  override async work(): Promise<void> {
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

    const order = await this.orderRepository.findById(orderIdVO);

    if (!order) {
      this.fail('Order not found', {
        code: 'ORDER_NOT_FOUND',
        orderId: this.orderId,
      });
      return;
    }

    this.context.order = order.toJSON();
  }
}
