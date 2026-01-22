import { DomainEvent } from '../../shared/domain-event.js';

export interface OrderPlacedPayload {
  orderId: string;
  customerId: string;
  total: number;
  currency: string;
  itemCount: number;
  placedAt: Date;
}

export class OrderPlacedEvent extends DomainEvent<OrderPlacedPayload> {
  static readonly EVENT_NAME = 'order.placed';

  constructor(payload: OrderPlacedPayload) {
    super(OrderPlacedEvent.EVENT_NAME, payload);
  }
}
