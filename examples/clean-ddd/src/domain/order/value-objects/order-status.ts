/**
 * OrderStatus Value Object
 * Represents the state machine for order status
 */
export type OrderStatusValue =
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export class OrderStatus {
  private static readonly VALID_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['paid', 'cancelled'],
    paid: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  };

  private constructor(private readonly value: OrderStatusValue) {
    Object.freeze(this);
  }

  static pending(): OrderStatus {
    return new OrderStatus('pending');
  }

  static confirmed(): OrderStatus {
    return new OrderStatus('confirmed');
  }

  static paid(): OrderStatus {
    return new OrderStatus('paid');
  }

  static processing(): OrderStatus {
    return new OrderStatus('processing');
  }

  static shipped(): OrderStatus {
    return new OrderStatus('shipped');
  }

  static delivered(): OrderStatus {
    return new OrderStatus('delivered');
  }

  static cancelled(): OrderStatus {
    return new OrderStatus('cancelled');
  }

  static fromString(status: string): OrderStatus {
    const validStatuses: OrderStatusValue[] = [
      'pending', 'confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
    ];
    if (!validStatuses.includes(status as OrderStatusValue)) {
      throw new InvalidOrderStatusError(status);
    }
    return new OrderStatus(status as OrderStatusValue);
  }

  canTransitionTo(newStatus: OrderStatus): boolean {
    return OrderStatus.VALID_TRANSITIONS[this.value].includes(newStatus.value);
  }

  transitionTo(newStatus: OrderStatus): OrderStatus {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidStatusTransitionError(this.value, newStatus.value);
    }
    return newStatus;
  }

  getValue(): OrderStatusValue {
    return this.value;
  }

  isPending(): boolean { return this.value === 'pending'; }
  isConfirmed(): boolean { return this.value === 'confirmed'; }
  isPaid(): boolean { return this.value === 'paid'; }
  isProcessing(): boolean { return this.value === 'processing'; }
  isShipped(): boolean { return this.value === 'shipped'; }
  isCancelled(): boolean { return this.value === 'cancelled'; }
  isDelivered(): boolean { return this.value === 'delivered'; }

  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export class InvalidOrderStatusError extends Error {
  constructor(status: string) {
    super(`Invalid order status: ${status}`);
    this.name = 'InvalidOrderStatusError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition order from '${from}' to '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}
