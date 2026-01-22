import { Money } from '../../../domain/order/value-objects/money.js';

/**
 * Product interface (simplified for this example)
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  price: Money;
  stock: number;
  isAvailable(): boolean;
}

/**
 * Product Repository Port
 * Defines the contract for product persistence
 */
export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findByIds(ids: string[]): Promise<Product[]>;
  decrementStock(productId: string, quantity: number): Promise<void>;
  incrementStock(productId: string, quantity: number): Promise<void>;
}

// Symbol for dependency injection
export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
