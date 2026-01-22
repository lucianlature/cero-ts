import { v4 as uuidv4 } from 'uuid';

/**
 * CustomerId Value Object
 * Strongly typed identifier for customers
 */
export class CustomerId {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static create(): CustomerId {
    return new CustomerId(`cust_${uuidv4()}`);
  }

  static fromString(id: string): CustomerId {
    if (!id || !id.startsWith('cust_')) {
      throw new InvalidCustomerIdError(id);
    }
    return new CustomerId(id);
  }

  toString(): string {
    return this.value;
  }

  equals(other: CustomerId): boolean {
    return this.value === other.value;
  }
}

export class InvalidCustomerIdError extends Error {
  constructor(id: string) {
    super(`Invalid customer ID: ${id}`);
    this.name = 'InvalidCustomerIdError';
  }
}
