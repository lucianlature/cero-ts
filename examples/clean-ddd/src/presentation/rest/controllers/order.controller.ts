import { Router, Request, Response } from 'express';
import { PlaceOrderUseCase } from '../../../application/use-cases/place-order/place-order.use-case.js';
import { GetOrderUseCase } from '../../../application/use-cases/get-order/get-order.use-case.js';
import { CancelOrderUseCase } from '../../../application/use-cases/cancel-order/cancel-order.use-case.js';
import { ProcessOrderWorkflow } from '../../../application/workflows/process-order.workflow.js';
import { CreateOrderRequestSchema } from '../../dto/create-order.request.js';
import { CancelOrderRequestSchema } from '../../dto/cancel-order.request.js';

/**
 * Order Controller
 * Handles HTTP requests for order operations
 */
export class OrderController {
  private router: Router;

  constructor() {
    this.router = Router();
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    this.router.post('/', this.createOrder.bind(this));
    this.router.get('/:id', this.getOrder.bind(this));
    this.router.post('/:id/cancel', this.cancelOrder.bind(this));
    this.router.post('/:id/process', this.processOrder.bind(this));
  }

  /**
   * POST /api/orders
   * Create a new order
   */
  async createOrder(req: Request, res: Response): Promise<void> {
    // Validate request body
    const validation = CreateOrderRequestSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.flatten(),
        },
      });
      return;
    }

    const input = validation.data;

    // Execute use case
    const result = await PlaceOrderUseCase.execute({
      input: {
        customerId: input.customerId,
        items: input.items,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        paymentMethodId: input.paymentMethodId,
        notes: input.notes,
      },
    });

    // Handle result
    if (result.success) {
      const ctx = result.context as unknown as Record<string, unknown>;
      const output = ctx.output as {
        orderId: string;
        status: string;
        subtotal: number;
        tax: number;
        shipping: number;
        total: number;
        currency: string;
        itemCount: number;
      };
      res.status(201).json({
        message: 'Order placed successfully',
        order: {
          id: output.orderId,
          status: output.status,
          subtotal: output.subtotal,
          tax: output.tax,
          shipping: output.shipping,
          total: output.total,
          currency: output.currency,
          itemCount: output.itemCount,
        },
      });
    } else {
      const statusCode = this.mapErrorToStatusCode(result.metadata.code as string);
      res.status(statusCode).json({
        error: {
          code: result.metadata.code,
          message: result.reason,
          details: result.metadata,
        },
      });
    }
  }

  /**
   * GET /api/orders/:id
   * Get order by ID
   */
  async getOrder(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const result = await GetOrderUseCase.execute({ orderId: id });

    if (result.success) {
      const ctx = result.context as unknown as Record<string, unknown>;
      res.json({ order: ctx.order });
    } else {
      const statusCode = this.mapErrorToStatusCode(result.metadata.code as string);
      res.status(statusCode).json({
        error: {
          code: result.metadata.code,
          message: result.reason,
        },
      });
    }
  }

  /**
   * POST /api/orders/:id/cancel
   * Cancel an order
   */
  async cancelOrder(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    // Validate request body
    const validation = CancelOrderRequestSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.flatten(),
        },
      });
      return;
    }

    const result = await CancelOrderUseCase.execute({
      orderId: id,
      reason: validation.data.reason,
    });

    if (result.success) {
      const ctx = result.context as unknown as Record<string, unknown>;
      res.json({
        message: 'Order cancelled successfully',
        refundTransactionId: ctx.refundTransactionId,
      });
    } else {
      const statusCode = this.mapErrorToStatusCode(result.metadata.code as string);
      res.status(statusCode).json({
        error: {
          code: result.metadata.code,
          message: result.reason,
          details: result.metadata,
        },
      });
    }
  }

  /**
   * POST /api/orders/:id/process
   * Start order processing workflow
   */
  async processOrder(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    const result = await ProcessOrderWorkflow.execute({ orderId: id });

    if (result.success) {
      res.json({
        message: 'Order processing started successfully',
        orderId: id,
      });
    } else {
      const statusCode = this.mapErrorToStatusCode(result.metadata.code as string);
      res.status(statusCode).json({
        error: {
          code: result.metadata.code,
          message: result.reason,
          details: result.metadata,
        },
      });
    }
  }

  /**
   * Map error codes to HTTP status codes
   */
  private mapErrorToStatusCode(code: string): number {
    const codeMap: Record<string, number> = {
      VALIDATION_ERROR: 400,
      INVALID_ORDER_ID: 400,
      INVALID_CUSTOMER_ID: 400,
      CUSTOMER_NOT_FOUND: 404,
      CUSTOMER_INACTIVE: 403,
      PRODUCT_NOT_FOUND: 404,
      ORDER_NOT_FOUND: 404,
      PRODUCT_UNAVAILABLE: 422,
      INSUFFICIENT_STOCK: 422,
      PAYMENT_FAILED: 402,
      CANNOT_CANCEL: 422,
      REFUND_FAILED: 500,
      PERSISTENCE_ERROR: 500,
    };
    return codeMap[code] || 500;
  }
}
