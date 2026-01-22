import { Router, Request, Response } from 'express';
import { container } from '../../../config/container.js';
import { CustomerRepository } from '../../../application/ports/repositories/customer.repository.js';

/**
 * Customer Controller
 * Provides endpoints to view customers (for demo purposes)
 */
export class CustomerController {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    this.router.get('/', this.listCustomers.bind(this));
    this.router.get('/:id', this.getCustomer.bind(this));
  }

  /**
   * GET /api/customers
   * List all customers (demo endpoint)
   */
  async listCustomers(_req: Request, res: Response): Promise<void> {
    const customerRepo = container.resolve<CustomerRepository>('CustomerRepository');

    // In-memory repo has getAll() helper
    const customers = (customerRepo as any).getAll?.() ?? [];

    res.json({
      customers: customers.map((c: any) => c.toJSON()),
    });
  }

  /**
   * GET /api/customers/:id
   * Get customer by ID
   */
  async getCustomer(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const customerRepo = container.resolve<CustomerRepository>('CustomerRepository');

    try {
      const { CustomerId } = await import('../../../domain/customer/value-objects/customer-id.js');
      const customerId = CustomerId.fromString(id);
      const customer = await customerRepo.findById(customerId);

      if (!customer) {
        res.status(404).json({
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: 'Customer not found',
          },
        });
        return;
      }

      res.json({ customer: customer.toJSON() });
    } catch {
      res.status(400).json({
        error: {
          code: 'INVALID_CUSTOMER_ID',
          message: 'Invalid customer ID format',
        },
      });
    }
  }
}
