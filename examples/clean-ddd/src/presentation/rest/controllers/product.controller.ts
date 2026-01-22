import { Router, Request, Response } from 'express';
import { container } from '../../../config/container.js';
import { ProductRepository } from '../../../application/ports/repositories/product.repository.js';

/**
 * Product Controller
 * Provides endpoints to view products (for demo purposes)
 */
export class ProductController {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    this.router.get('/', this.listProducts.bind(this));
    this.router.get('/:id', this.getProduct.bind(this));
  }

  /**
   * GET /api/products
   * List all products
   */
  async listProducts(_req: Request, res: Response): Promise<void> {
    const productRepo = container.resolve<ProductRepository>('ProductRepository');

    // In-memory repo has getAll() helper
    const products = (productRepo as any).getAll?.() ?? [];

    res.json({
      products: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price.toJSON(),
        stock: p.stock,
        available: p.isAvailable(),
      })),
    });
  }

  /**
   * GET /api/products/:id
   * Get product by ID
   */
  async getProduct(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const productRepo = container.resolve<ProductRepository>('ProductRepository');

    const product = await productRepo.findById(id);

    if (!product) {
      res.status(404).json({
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
        },
      });
      return;
    }

    res.json({
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price.toJSON(),
        stock: product.stock,
        available: product.isAvailable(),
      },
    });
  }
}
