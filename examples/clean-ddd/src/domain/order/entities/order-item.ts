import { Money } from '../value-objects/money.js';

/**
 * OrderItem Entity
 * Represents a line item in an order
 */
export interface OrderItemProps {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
}

export class OrderItem {
  private readonly props: OrderItemProps;

  private constructor(props: OrderItemProps) {
    this.props = { ...props };
  }

  static create(props: OrderItemProps): OrderItem {
    if (props.quantity <= 0) {
      throw new InvalidOrderItemError('Quantity must be positive');
    }
    if (!props.productId || props.productId.trim().length === 0) {
      throw new InvalidOrderItemError('Product ID is required');
    }
    if (!props.productName || props.productName.trim().length === 0) {
      throw new InvalidOrderItemError('Product name is required');
    }
    return new OrderItem(props);
  }

  get productId(): string {
    return this.props.productId;
  }

  get productName(): string {
    return this.props.productName;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get totalPrice(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }

  updateQuantity(newQuantity: number): OrderItem {
    if (newQuantity <= 0) {
      throw new InvalidOrderItemError('Quantity must be positive');
    }
    return new OrderItem({ ...this.props, quantity: newQuantity });
  }

  toJSON() {
    return {
      productId: this.productId,
      productName: this.productName,
      quantity: this.quantity,
      unitPrice: this.unitPrice.toJSON(),
      totalPrice: this.totalPrice.toJSON(),
    };
  }
}

export class InvalidOrderItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderItemError';
  }
}
