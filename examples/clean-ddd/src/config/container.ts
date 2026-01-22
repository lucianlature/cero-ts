import type { OrderRepository } from '../application/ports/repositories/order.repository.js';
import type { CustomerRepository } from '../application/ports/repositories/customer.repository.js';
import type { ProductRepository } from '../application/ports/repositories/product.repository.js';
import type { PaymentGateway } from '../application/ports/services/payment-gateway.js';
import type { EventBus } from '../application/ports/event-bus.js';

import { InMemoryOrderRepository } from '../infrastructure/persistence/memory/order.repository.impl.js';
import { InMemoryCustomerRepository } from '../infrastructure/persistence/memory/customer.repository.impl.js';
import { InMemoryProductRepository } from '../infrastructure/persistence/memory/product.repository.impl.js';
import { MockPaymentGateway } from '../infrastructure/payment/mock-payment-gateway.js';
import { ConsoleEventBus } from '../infrastructure/messaging/console-event-bus.js';

/**
 * Simple Dependency Injection Container
 * In production, consider using a proper DI library like inversify or tsyringe
 */
class Container {
  private instances: Map<string, unknown> = new Map();
  private factories: Map<string, () => unknown> = new Map();

  /**
   * Register a singleton instance
   */
  registerInstance<T>(key: string, instance: T): void {
    this.instances.set(key, instance);
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory);
  }

  /**
   * Resolve a dependency
   */
  resolve<T>(key: string): T {
    // Check for existing instance
    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // Check for factory
    if (this.factories.has(key)) {
      const instance = this.factories.get(key)!() as T;
      this.instances.set(key, instance); // Cache the instance
      return instance;
    }

    throw new Error(`Dependency '${key}' not registered`);
  }

  /**
   * Check if a dependency is registered
   */
  has(key: string): boolean {
    return this.instances.has(key) || this.factories.has(key);
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.instances.clear();
    this.factories.clear();
  }
}

// Create and export the container instance
export const container = new Container();

/**
 * Configure the container with all dependencies
 */
export function configureContainer(): void {
  // Repositories
  container.registerFactory<OrderRepository>('OrderRepository', () => new InMemoryOrderRepository());
  container.registerFactory<CustomerRepository>('CustomerRepository', () => new InMemoryCustomerRepository());
  container.registerFactory<ProductRepository>('ProductRepository', () => new InMemoryProductRepository());

  // External Services
  container.registerFactory<PaymentGateway>('PaymentGateway', () => new MockPaymentGateway());
  container.registerFactory<EventBus>('EventBus', () => new ConsoleEventBus());
}

/**
 * Seed sample data for demonstration
 */
export async function seedSampleData(): Promise<void> {
  const { Customer } = await import('../domain/customer/entities/customer.js');
  const { Email } = await import('../domain/customer/value-objects/email.js');
  const { Address } = await import('../domain/customer/value-objects/address.js');
  const { CustomerId } = await import('../domain/customer/value-objects/customer-id.js');

  const customerRepo = container.resolve<InMemoryCustomerRepository>('CustomerRepository');

  // Create sample customers with known IDs for testing
  const customers = [
    {
      id: 'cust_demo-001',
      email: 'alice@example.com',
      name: 'Alice Johnson',
      address: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
      },
    },
    {
      id: 'cust_demo-002',
      email: 'bob@example.com',
      name: 'Bob Smith',
      address: {
        street: '456 Oak Ave',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    },
    {
      id: 'cust_demo-003',
      email: 'charlie@example.com',
      name: 'Charlie Brown',
      address: {
        street: '789 Pine Rd',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
      },
    },
  ];

  for (const data of customers) {
    // Create customer with specific ID (for demo purposes)
    const customer = Customer.reconstitute({
      id: CustomerId.fromString(data.id),
      email: Email.create(data.email),
      name: data.name,
      defaultShippingAddress: Address.create(data.address),
      isActive: true,
      createdAt: new Date(),
    });

    customerRepo.seed(customer);
  }

  console.log(`[Seed] Created ${customers.length} sample customers`);
}
