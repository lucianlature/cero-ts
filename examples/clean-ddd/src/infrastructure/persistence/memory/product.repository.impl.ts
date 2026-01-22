import { Money } from '../../../domain/order/value-objects/money.js';
import { ProductRepository, Product } from '../../../application/ports/repositories/product.repository.js';

/**
 * Simple Product implementation
 */
class ProductEntity implements Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly price: Money,
    public stock: number,
    private active: boolean = true
  ) {}

  isAvailable(): boolean {
    return this.active && this.stock > 0;
  }
}

/**
 * In-Memory implementation of ProductRepository
 * For demonstration purposes - replace with real database in production
 */
export class InMemoryProductRepository implements ProductRepository {
  private products: Map<string, ProductEntity> = new Map();

  constructor() {
    // Seed with sample products
    this.seedProducts();
  }

  private seedProducts(): void {
    const sampleProducts: ProductEntity[] = [
      new ProductEntity(
        'prod_001',
        'Wireless Keyboard',
        'Ergonomic wireless keyboard with backlight',
        Money.create(79.99),
        50
      ),
      new ProductEntity(
        'prod_002',
        'USB-C Hub',
        '7-in-1 USB-C hub with HDMI and SD card reader',
        Money.create(49.99),
        100
      ),
      new ProductEntity(
        'prod_003',
        'Monitor Stand',
        'Adjustable monitor stand with USB ports',
        Money.create(129.99),
        30
      ),
      new ProductEntity(
        'prod_004',
        'Webcam HD',
        '1080p HD webcam with built-in microphone',
        Money.create(89.99),
        75
      ),
      new ProductEntity(
        'prod_005',
        'Mouse Pad XL',
        'Extended mouse pad with stitched edges',
        Money.create(24.99),
        200
      ),
    ];

    for (const product of sampleProducts) {
      this.products.set(product.id, product);
    }
  }

  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    return ids
      .map(id => this.products.get(id))
      .filter((p): p is ProductEntity => p !== undefined);
  }

  async decrementStock(productId: string, quantity: number): Promise<void> {
    const product = this.products.get(productId);
    if (product) {
      product.stock = Math.max(0, product.stock - quantity);
    }
  }

  async incrementStock(productId: string, quantity: number): Promise<void> {
    const product = this.products.get(productId);
    if (product) {
      product.stock += quantity;
    }
  }

  // Helper for testing
  clear(): void {
    this.products.clear();
  }

  addProduct(product: ProductEntity): void {
    this.products.set(product.id, product);
  }

  getAll(): Product[] {
    return Array.from(this.products.values());
  }
}
