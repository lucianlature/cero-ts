import { v4 as uuidv4 } from 'uuid';

/**
 * OrderId Value Object
 * Strongly typed identifier for orders
 */
export class OrderId {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static create(): OrderId {
    return new OrderId(`order_${uuidv4()}`);
  }

  static fromString(id: string): OrderId {
    if (!id || !id.startsWith('order_')) {
      throw new InvalidOrderIdError(id);
    }
    return new OrderId(id);
  }

  toString(): string {
    return this.value;
  }

  equals(other: OrderId): boolean {
    return this.value === other.value;
  }
}

export class InvalidOrderIdError extends Error {
  constructor(id: string) {
    super(`Invalid order ID: ${id}`);
    this.name = 'InvalidOrderIdError';
  }
}
