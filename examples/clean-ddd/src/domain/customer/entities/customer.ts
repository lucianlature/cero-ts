import { Entity } from '../../shared/entity.js';
import { CustomerId } from '../value-objects/customer-id.js';
import { Email } from '../value-objects/email.js';
import { Address } from '../value-objects/address.js';

/**
 * Customer Entity
 */
export interface CustomerProps {
  id: CustomerId;
  email: Email;
  name: string;
  defaultShippingAddress?: Address;
  defaultBillingAddress?: Address;
  isActive: boolean;
  createdAt: Date;
}

export class Customer extends Entity<CustomerId> {
  private props: CustomerProps;

  private constructor(props: CustomerProps) {
    super(props.id);
    this.props = { ...props };
  }

  static create(params: {
    email: Email;
    name: string;
    defaultShippingAddress?: Address;
    defaultBillingAddress?: Address;
  }): Customer {
    if (!params.name || params.name.trim().length === 0) {
      throw new InvalidCustomerError('Name is required');
    }

    return new Customer({
      id: CustomerId.create(),
      email: params.email,
      name: params.name.trim(),
      defaultShippingAddress: params.defaultShippingAddress,
      defaultBillingAddress: params.defaultBillingAddress,
      isActive: true,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: CustomerProps): Customer {
    return new Customer(props);
  }

  get email(): Email { return this.props.email; }
  get name(): string { return this.props.name; }
  get defaultShippingAddress(): Address | undefined { return this.props.defaultShippingAddress; }
  get defaultBillingAddress(): Address | undefined { return this.props.defaultBillingAddress; }
  get createdAt(): Date { return this.props.createdAt; }

  isActive(): boolean {
    return this.props.isActive;
  }

  deactivate(): void {
    this.props.isActive = false;
  }

  activate(): void {
    this.props.isActive = true;
  }

  updateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new InvalidCustomerError('Name is required');
    }
    this.props.name = name.trim();
  }

  toJSON() {
    return {
      id: this.id.toString(),
      email: this.email.toString(),
      name: this.name,
      defaultShippingAddress: this.defaultShippingAddress?.toJSON(),
      defaultBillingAddress: this.defaultBillingAddress?.toJSON(),
      isActive: this.props.isActive,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

export class InvalidCustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCustomerError';
  }
}
