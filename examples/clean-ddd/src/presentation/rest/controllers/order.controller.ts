import { Router, Request, Response } from 'express';
import { PlaceOrderUseCase } from '../../../application/use-cases/place-order/place-order.use-case.js';
import { GetOrderUseCase } from '../../../application/use-cases/get-order/get-order.use-case.js';
import { CancelOrderUseCase } from '../../../application/use-cases/cancel-order/cancel-order.use-case.js';
import { ProcessOrderWorkflow } from '../../../application/workflows/process-order.workflow.js';
import {
  startFulfillment,
  getFulfillmentHandle,
  fulfillmentStatusQuery,
  canCancelQuery,
  orderShippedSignal,
  orderDeliveredSignal,
  cancelFulfillmentSignal,
} from '../../../application/workflows/order-fulfillment.workflow.js';
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

    // Interactive fulfillment workflow endpoints (Temporal-inspired)
    this.router.post('/:id/fulfill', this.startFulfillment.bind(this));
    this.router.get('/:id/fulfillment', this.getFulfillmentStatus.bind(this));
    this.router.post('/:id/ship', this.markShipped.bind(this));
    this.router.post('/:id/deliver', this.markDelivered.bind(this));
    this.router.post('/:id/cancel-fulfillment', this.cancelFulfillment.bind(this));
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

  // ============================================
  // Interactive Fulfillment Workflow Endpoints
  // ============================================

  /**
   * POST /api/orders/:id/fulfill
   * Start the interactive fulfillment workflow.
   * Returns immediately — use GET /api/orders/:id/fulfillment to poll status,
   * and POST /ship, /deliver, /cancel-fulfillment to send signals.
   */
  async startFulfillment(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;

    // Check if fulfillment is already running
    const existing = getFulfillmentHandle(id);
    if (existing && !existing.completed) {
      res.status(409).json({
        error: {
          code: 'FULFILLMENT_ALREADY_ACTIVE',
          message: 'Fulfillment workflow is already running for this order',
        },
      });
      return;
    }

    const handle = startFulfillment(id);

    res.status(202).json({
      message: 'Fulfillment workflow started',
      orderId: id,
      workflowId: handle.workflowId,
      _links: {
        status: `GET /api/orders/${id}/fulfillment`,
        ship: `POST /api/orders/${id}/ship`,
        deliver: `POST /api/orders/${id}/deliver`,
        cancel: `POST /api/orders/${id}/cancel-fulfillment`,
      },
    });
  }

  /**
   * GET /api/orders/:id/fulfillment
   * Query the current fulfillment status (Temporal Query pattern).
   */
  async getFulfillmentStatus(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const handle = getFulfillmentHandle(id);

    if (!handle) {
      res.status(404).json({
        error: {
          code: 'NO_ACTIVE_FULFILLMENT',
          message: 'No active fulfillment workflow for this order',
        },
      });
      return;
    }

    try {
      const status = handle.query(fulfillmentStatusQuery);
      const canCancel = handle.query(canCancelQuery);

      res.json({
        ...status,
        canCancel,
        workflowCompleted: handle.completed,
      });
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'QUERY_FAILED',
          message: error instanceof Error ? error.message : 'Failed to query workflow',
        },
      });
    }
  }

  /**
   * POST /api/orders/:id/ship
   * Signal the fulfillment workflow that the order has been shipped (Temporal Signal pattern).
   * Body: { trackingNumber?: string, carrier?: string }
   */
  async markShipped(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const handle = getFulfillmentHandle(id);

    if (!handle) {
      res.status(404).json({
        error: {
          code: 'NO_ACTIVE_FULFILLMENT',
          message: 'No active fulfillment workflow for this order',
        },
      });
      return;
    }

    try {
      handle.signal(orderShippedSignal, {
        trackingNumber: req.body?.trackingNumber,
        carrier: req.body?.carrier,
      });

      res.json({
        message: 'Shipment signal sent',
        orderId: id,
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'SIGNAL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send signal',
        },
      });
    }
  }

  /**
   * POST /api/orders/:id/deliver
   * Signal the fulfillment workflow that the order has been delivered (Temporal Signal pattern).
   * Body: { deliveredAt?: string, signature?: string }
   */
  async markDelivered(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const handle = getFulfillmentHandle(id);

    if (!handle) {
      res.status(404).json({
        error: {
          code: 'NO_ACTIVE_FULFILLMENT',
          message: 'No active fulfillment workflow for this order',
        },
      });
      return;
    }

    try {
      handle.signal(orderDeliveredSignal, {
        deliveredAt: req.body?.deliveredAt,
        signature: req.body?.signature,
      });

      res.json({
        message: 'Delivery signal sent',
        orderId: id,
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'SIGNAL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send signal',
        },
      });
    }
  }

  /**
   * POST /api/orders/:id/cancel-fulfillment
   * Signal the fulfillment workflow to cancel (Temporal Signal pattern).
   * Body: { reason: string }
   */
  async cancelFulfillment(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const handle = getFulfillmentHandle(id);

    if (!handle) {
      res.status(404).json({
        error: {
          code: 'NO_ACTIVE_FULFILLMENT',
          message: 'No active fulfillment workflow for this order',
        },
      });
      return;
    }

    const reason = req.body?.reason;
    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cancellation reason is required',
        },
      });
      return;
    }

    try {
      const canCancel = handle.query(canCancelQuery);
      if (!canCancel) {
        res.status(422).json({
          error: {
            code: 'CANNOT_CANCEL',
            message: 'Fulfillment cannot be cancelled at this stage',
          },
        });
        return;
      }

      handle.signal(cancelFulfillmentSignal, { reason });

      res.json({
        message: 'Cancellation signal sent',
        orderId: id,
      });
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'SIGNAL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send signal',
        },
      });
    }
  }

  // ============================================
  // Helpers
  // ============================================

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
