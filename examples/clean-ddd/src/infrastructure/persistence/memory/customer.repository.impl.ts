import { Customer } from '../../../domain/customer/entities/customer.js';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id.js';
import { Email } from '../../../domain/customer/value-objects/email.js';
import { CustomerRepository } from '../../../application/ports/repositories/customer.repository.js';

/**
 * In-Memory implementation of CustomerRepository
 * For demonstration purposes - replace with real database in production
 */
export class InMemoryCustomerRepository implements CustomerRepository {
  private customers: Map<string, Customer> = new Map();

  async findById(id: CustomerId): Promise<Customer | null> {
    return this.customers.get(id.toString()) ?? null;
  }

  async findByEmail(email: Email): Promise<Customer | null> {
    for (const customer of this.customers.values()) {
      if (customer.email.equals(email)) {
        return customer;
      }
    }
    return null;
  }

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id.toString(), customer);
  }

  async delete(id: CustomerId): Promise<void> {
    this.customers.delete(id.toString());
  }

  // Helper for seeding data
  seed(customer: Customer): void {
    this.customers.set(customer.id.toString(), customer);
  }

  // Helper for testing
  clear(): void {
    this.customers.clear();
  }

  getAll(): Customer[] {
    return Array.from(this.customers.values());
  }
}
