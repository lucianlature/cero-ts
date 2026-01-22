import { Order } from '../../../domain/order/entities/order.js';
import { OrderId } from '../../../domain/order/value-objects/order-id.js';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id.js';

/**
 * Order Repository Port
 * Defines the contract for order persistence
 */
export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  findByCustomerId(customerId: CustomerId): Promise<Order[]>;
  save(order: Order): Promise<void>;
  delete(id: OrderId): Promise<void>;
}

// Symbol for dependency injection
export const ORDER_REPOSITORY = Symbol('OrderRepository');
