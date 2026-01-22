import { DomainEvent } from '../../shared/domain-event.js';

export interface OrderCancelledPayload {
  orderId: string;
  customerId: string;
  reason: string;
  cancelledAt: Date;
}

export class OrderCancelledEvent extends DomainEvent<OrderCancelledPayload> {
  static readonly EVENT_NAME = 'order.cancelled';

  constructor(payload: OrderCancelledPayload) {
    super(OrderCancelledEvent.EVENT_NAME, payload);
  }
}
