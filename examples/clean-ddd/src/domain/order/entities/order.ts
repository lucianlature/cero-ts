import { AggregateRoot } from '../../shared/aggregate-root.js';
import { OrderId } from '../value-objects/order-id.js';
import { OrderStatus } from '../value-objects/order-status.js';
import { Money } from '../value-objects/money.js';
import { OrderItem } from './order-item.js';
import { Address } from '../../customer/value-objects/address.js';
import { CustomerId } from '../../customer/value-objects/customer-id.js';
import { OrderPlacedEvent } from '../events/order-placed.js';
import { OrderPaidEvent } from '../events/order-paid.js';
import { OrderCancelledEvent } from '../events/order-cancelled.js';

/**
 * Order Aggregate Root
 * Encapsulates all order invariants and business rules
 */
export interface OrderProps {
  id: OrderId;
  customerId: CustomerId;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress?: Address;
  status: OrderStatus;
  subtotal: Money;
  tax: Money;
  shipping: Money;
  total: Money;
  paymentReference?: string;
  placedAt?: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Order extends AggregateRoot<OrderId> {
  private props: OrderProps;

  private constructor(props: OrderProps) {
    super(props.id);
    this.props = { ...props };
  }

  /**
   * Factory method to create a new order
   */
  static create(params: {
    customerId: CustomerId;
    items: OrderItem[];
    shippingAddress: Address;
    billingAddress?: Address;
    notes?: string;
  }): Order {
    if (params.items.length === 0) {
      throw new EmptyOrderError();
    }

    const subtotal = params.items.reduce(
      (sum, item) => sum.add(item.totalPrice),
      Money.zero()
    );

    // Business rule: Calculate tax (10%)
    const tax = subtotal.multiply(0.10);

    // Business rule: Free shipping over $100
    const shipping = subtotal.getAmount() >= 100
      ? Money.zero()
      : Money.create(9.99);

    const total = subtotal.add(tax).add(shipping);
    const now = new Date();

    const order = new Order({
      id: OrderId.create(),
      customerId: params.customerId,
      items: [...params.items],
      shippingAddress: params.shippingAddress,
      billingAddress: params.billingAddress,
      status: OrderStatus.pending(),
      subtotal,
      tax,
      shipping,
      total,
      notes: params.notes,
      createdAt: now,
      updatedAt: now,
    });

    return order;
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(props: OrderProps): Order {
    return new Order(props);
  }

  // ==================== Getters ====================

  get customerId(): CustomerId { return this.props.customerId; }
  get items(): readonly OrderItem[] { return [...this.props.items]; }
  get shippingAddress(): Address { return this.props.shippingAddress; }
  get billingAddress(): Address | undefined { return this.props.billingAddress; }
  get status(): OrderStatus { return this.props.status; }
  get subtotal(): Money { return this.props.subtotal; }
  get tax(): Money { return this.props.tax; }
  get shipping(): Money { return this.props.shipping; }
  get total(): Money { return this.props.total; }
  get paymentReference(): string | undefined { return this.props.paymentReference; }
  get placedAt(): Date | undefined { return this.props.placedAt; }
  get paidAt(): Date | undefined { return this.props.paidAt; }
  get cancelledAt(): Date | undefined { return this.props.cancelledAt; }
  get cancellationReason(): string | undefined { return this.props.cancellationReason; }
  get notes(): string | undefined { return this.props.notes; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ==================== Behavior ====================

  /**
   * Confirm the order
   */
  confirm(): void {
    if (!this.props.status.canTransitionTo(OrderStatus.confirmed())) {
      throw new InvalidOrderOperationError(
        `Cannot confirm order in status: ${this.props.status.getValue()}`
      );
    }

    this.props.status = OrderStatus.confirmed();
    this.props.placedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OrderPlacedEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      total: this.total.getAmount(),
      currency: this.total.getCurrency(),
      itemCount: this.items.length,
      placedAt: this.props.placedAt,
    }));
  }

  /**
   * Mark order as paid
   */
  markAsPaid(paymentReference: string): void {
    if (!this.props.status.canTransitionTo(OrderStatus.paid())) {
      throw new InvalidOrderOperationError(
        `Cannot mark as paid order in status: ${this.props.status.getValue()}`
      );
    }

    this.props.status = OrderStatus.paid();
    this.props.paymentReference = paymentReference;
    this.props.paidAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OrderPaidEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      amount: this.total.getAmount(),
      currency: this.total.getCurrency(),
      paymentReference,
      paidAt: this.props.paidAt,
    }));
  }

  /**
   * Cancel the order
   */
  cancel(reason: string): void {
    if (!this.props.status.canTransitionTo(OrderStatus.cancelled())) {
      throw new InvalidOrderOperationError(
        `Cannot cancel order in status: ${this.props.status.getValue()}`
      );
    }

    this.props.status = OrderStatus.cancelled();
    this.props.cancellationReason = reason;
    this.props.cancelledAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OrderCancelledEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      reason,
      cancelledAt: this.props.cancelledAt,
    }));
  }

  /**
   * Check if order can be cancelled
   */
  canBeCancelled(): boolean {
    return this.props.status.canTransitionTo(OrderStatus.cancelled());
  }

  toJSON() {
    return {
      id: this.id.toString(),
      customerId: this.customerId.toString(),
      items: this.items.map(item => item.toJSON()),
      shippingAddress: this.shippingAddress.toJSON(),
      billingAddress: this.billingAddress?.toJSON(),
      status: this.status.getValue(),
      subtotal: this.subtotal.toJSON(),
      tax: this.tax.toJSON(),
      shipping: this.shipping.toJSON(),
      total: this.total.toJSON(),
      paymentReference: this.paymentReference,
      placedAt: this.placedAt?.toISOString(),
      paidAt: this.paidAt?.toISOString(),
      cancelledAt: this.cancelledAt?.toISOString(),
      cancellationReason: this.cancellationReason,
      notes: this.notes,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

export class EmptyOrderError extends Error {
  constructor() {
    super('Order must have at least one item');
    this.name = 'EmptyOrderError';
  }
}

export class InvalidOrderOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderOperationError';
  }
}
