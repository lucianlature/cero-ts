import { Order } from '../../../domain/order/entities/order.js';
import { OrderId } from '../../../domain/order/value-objects/order-id.js';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id.js';
import { OrderRepository } from '../../../application/ports/repositories/order.repository.js';

/**
 * In-Memory implementation of OrderRepository
 * For demonstration purposes - replace with real database in production
 */
export class InMemoryOrderRepository implements OrderRepository {
  private orders: Map<string, Order> = new Map();

  async findById(id: OrderId): Promise<Order | null> {
    return this.orders.get(id.toString()) ?? null;
  }

  async findByCustomerId(customerId: CustomerId): Promise<Order[]> {
    const customerOrders: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.customerId.equals(customerId)) {
        customerOrders.push(order);
      }
    }
    return customerOrders;
  }

  async save(order: Order): Promise<void> {
    this.orders.set(order.id.toString(), order);
  }

  async delete(id: OrderId): Promise<void> {
    this.orders.delete(id.toString());
  }

  // Helper for testing
  clear(): void {
    this.orders.clear();
  }

  getAll(): Order[] {
    return Array.from(this.orders.values());
  }
}
