import { Customer } from '../../../domain/customer/entities/customer.js';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id.js';
import { Email } from '../../../domain/customer/value-objects/email.js';

/**
 * Customer Repository Port
 * Defines the contract for customer persistence
 */
export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  findByEmail(email: Email): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
  delete(id: CustomerId): Promise<void>;
}

// Symbol for dependency injection
export const CUSTOMER_REPOSITORY = Symbol('CustomerRepository');
