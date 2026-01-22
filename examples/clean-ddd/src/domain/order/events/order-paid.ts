import { DomainEvent } from '../../shared/domain-event.js';

export interface OrderPaidPayload {
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  paymentReference: string;
  paidAt: Date;
}

export class OrderPaidEvent extends DomainEvent<OrderPaidPayload> {
  static readonly EVENT_NAME = 'order.paid';

  constructor(payload: OrderPaidPayload) {
    super(OrderPaidEvent.EVENT_NAME, payload);
  }
}
