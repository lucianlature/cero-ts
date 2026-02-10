import express from 'express';
import { configureContainer, seedSampleData } from './config/container.js';
import { OrderController, CustomerController, ProductController } from './presentation/rest/controllers/index.js';
import { errorHandler, notFoundHandler } from './presentation/rest/middleware/error-handler.js';

const PORT = process.env.PORT || 3000;

async function bootstrap(): Promise<void> {
  // Configure dependency injection container
  configureContainer();

  // Seed sample data
  await seedSampleData();

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API info
  app.get('/', (_req, res) => {
    res.json({
      name: 'Clean DDD Example API',
      version: '1.0.0',
      description: 'Order management API built with Clean Architecture, DDD, and cero-ts',
      endpoints: {
        health: 'GET /health',
        products: {
          list: 'GET /api/products',
          get: 'GET /api/products/:id',
        },
        customers: {
          list: 'GET /api/customers',
          get: 'GET /api/customers/:id',
        },
        orders: {
          create: 'POST /api/orders',
          get: 'GET /api/orders/:id',
          cancel: 'POST /api/orders/:id/cancel',
          process: 'POST /api/orders/:id/process',
          fulfillment: {
            start: 'POST /api/orders/:id/fulfill',
            status: 'GET /api/orders/:id/fulfillment',
            ship: 'POST /api/orders/:id/ship',
            deliver: 'POST /api/orders/:id/deliver',
            cancelFulfillment: 'POST /api/orders/:id/cancel-fulfillment',
          },
        },
      },
      sampleRequest: {
        endpoint: 'POST /api/orders',
        body: {
          customerId: 'cust_demo-001',
          items: [
            { productId: 'prod_001', quantity: 1 },
            { productId: 'prod_002', quantity: 2 },
          ],
          shippingAddress: {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94102',
            country: 'US',
          },
          paymentMethodId: 'pm_valid_card',
        },
      },
    });
  });

  // Controllers
  const orderController = new OrderController();
  const customerController = new CustomerController();
  const productController = new ProductController();

  // Routes
  app.use('/api/orders', orderController.getRouter());
  app.use('/api/customers', customerController.getRouter());
  app.use('/api/products', productController.getRouter());

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Start server
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   Clean DDD Example with cero-ts                           ║
║                                                            ║
║   Server running at: http://localhost:${PORT}                 ║
║                                                            ║
║   Try these endpoints:                                     ║
║   • GET  /                      - API info                 ║
║   • GET  /api/products          - List products            ║
║   • GET  /api/customers         - List customers           ║
║   • POST /api/orders            - Create order             ║
║   • GET  /api/orders/:id        - Get order                ║
║   • POST /api/orders/:id/cancel - Cancel order             ║
║   • POST /api/orders/:id/process - Process workflow        ║
║                                                            ║
║   Interactive Fulfillment (Temporal-inspired):             ║
║   • POST /api/orders/:id/fulfill - Start fulfillment       ║
║   • GET  /api/orders/:id/fulfillment - Query status        ║
║   • POST /api/orders/:id/ship    - Signal: shipped         ║
║   • POST /api/orders/:id/deliver - Signal: delivered       ║
║   • POST /api/orders/:id/cancel-fulfillment - Cancel       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

// Run the application
bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
