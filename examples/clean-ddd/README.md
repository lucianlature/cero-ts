# Clean DDD Example with cero-ts

This is a complete working example demonstrating how **cero-ts** integrates with **Clean Architecture** and **Domain-Driven Design** principles.

## Architecture

```shell
src/
├── domain/           # Domain Layer (Entities, Value Objects, Events)
├── application/      # Application Layer (Use Cases as cero-ts Tasks, Ports)
├── infrastructure/   # Infrastructure Layer (Repository implementations, Adapters)
├── presentation/     # Presentation Layer (Express Controllers, DTOs)
└── config/           # Configuration (DI Container)
```

### Layers

1. **Domain Layer** - Pure business logic with no external dependencies
   - Entities (Order, Customer)
   - Value Objects (Money, OrderStatus, Address, Email)
   - Domain Events (OrderPlaced, OrderPaid, OrderCancelled)
   - Aggregate Roots with domain behavior

2. **Application Layer** - Use cases orchestrating domain logic
   - **cero-ts Tasks** as Use Cases (PlaceOrderUseCase, GetOrderUseCase, CancelOrderUseCase)
   - Ports (interfaces for repositories and external services)

3. **Infrastructure Layer** - Concrete implementations
   - In-memory repositories (replace with real DB in production)
   - Mock payment gateway
   - Console event bus

4. **Presentation Layer** - HTTP interface
   - Express.js controllers
   - Request validation with Zod
   - Error handling middleware

## Running the Example

```bash
# Navigate to the example directory
cd examples/clean-ddd

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run
npm run build
npm start
```

The server will start at `http://localhost:3000`.

## API Endpoints

### Products

```bash
# List all products
curl http://localhost:3000/api/products

# Get a product
curl http://localhost:3000/api/products/prod_001
```

### Customers

```bash
# List all customers
curl http://localhost:3000/api/customers

# Get a customer
curl http://localhost:3000/api/customers/cust_demo-001
```

### Orders

```bash
# Create an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_demo-001",
    "items": [
      { "productId": "prod_001", "quantity": 1 },
      { "productId": "prod_002", "quantity": 2 }
    ],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "paymentMethodId": "pm_valid_card"
  }'

# Get an order (use the ID from create response)
curl http://localhost:3000/api/orders/order_xxx

# Cancel an order
curl -X POST http://localhost:3000/api/orders/order_xxx/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason": "Changed my mind"}'

# Process an order (runs the workflow)
curl -X POST http://localhost:3000/api/orders/order_xxx/process
```

## Testing Different Scenarios

### Successful Order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_demo-001",
    "items": [{ "productId": "prod_001", "quantity": 1 }],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "paymentMethodId": "pm_valid_card"
  }'
```

### Payment Declined

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_demo-001",
    "items": [{ "productId": "prod_001", "quantity": 1 }],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "paymentMethodId": "pm_declined"
  }'
```

### Invalid Customer

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_invalid",
    "items": [{ "productId": "prod_001", "quantity": 1 }],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "paymentMethodId": "pm_valid_card"
  }'
```

### Insufficient Stock

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_demo-001",
    "items": [{ "productId": "prod_001", "quantity": 9999 }],
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "paymentMethodId": "pm_valid_card"
  }'
```

## Key Concepts Demonstrated

### cero-ts Tasks as Use Cases

```typescript
export class PlaceOrderUseCase extends Task<PlaceOrderContext> {
  static override attributes = {
    input: required<PlaceOrderInput>(),
  };

  static override callbacks = {
    beforeExecution: ['resolveDependencies'],
    onSuccess: ['publishEvents'],
  };

  override async work(): Promise<void> {
    // Orchestrate domain logic
    const customer = await this.validateCustomer();
    const orderItems = await this.buildOrderItems();
    const order = this.createOrder(orderItems);
    await this.processPayment(order);
    await this.persistOrder(order);
  }
}
```

### Workflows

Orchestrate multiple use cases with the Workflow class:

```typescript
export class ProcessOrderWorkflow extends Workflow<OrderContext> {
  static override tasks = [
    ValidateOrderTask,
    ReserveInventoryTask,
    // Parallel execution
    { tasks: [SendConfirmationTask, NotifyWarehouseTask], strategy: 'parallel' },
    PublishEventsTask,
  ];

  static override attributes = {
    orderId: required(),
  };
}
```

### Dependency Inversion

Use cases depend on **Ports** (interfaces), not concrete implementations:

```typescript
// Port (interface in application layer)
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

// Adapter (implementation in infrastructure layer)
class InMemoryOrderRepository implements OrderRepository { }
class PostgresOrderRepository implements OrderRepository { }
```

### Domain Events

The Order aggregate raises events that are published after successful execution:

```typescript
// In Order aggregate
confirm(): void {
  this.addDomainEvent(new OrderPlacedEvent({
    orderId: this.id.toString(),
    customerId: this.customerId.toString(),
    total: this.total.getAmount(),
  }));
}

// In Use Case callback
private async publishEvents(): Promise<void> {
  const events = order.pullDomainEvents();
  await this.eventBus.publishAll(events);
}
```

## Extending the Example

### Add Real Database

Replace `InMemoryOrderRepository` with a real implementation:

```typescript
// infrastructure/persistence/postgres/order.repository.impl.ts
export class PostgresOrderRepository implements OrderRepository {
  constructor(private pool: Pool) {}

  async findById(id: OrderId): Promise<Order | null> {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [id.toString()]
    );
    return result.rows[0] ? OrderMapper.toDomain(result.rows[0]) : null;
  }
}
```

### Add Real Payment Gateway

Replace `MockPaymentGateway` with Stripe:

```typescript
// infrastructure/payment/stripe-payment-gateway.ts
export class StripePaymentGateway implements PaymentGateway {
  constructor(private stripe: Stripe) {}

  async charge(params: ChargeParams): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amount.getAmount() * 100,
      currency: params.amount.getCurrency().toLowerCase(),
      payment_method: params.paymentMethodId,
      confirm: true,
    });
    return { success: true, transactionId: intent.id };
  }
}
```

### Add Message Broker

Replace `ConsoleEventBus` with RabbitMQ:

```typescript
// infrastructure/messaging/rabbitmq-event-bus.ts
export class RabbitMQEventBus implements EventBus {
  async publish(event: DomainEvent): Promise<void> {
    await this.channel.publish(
      'domain_events',
      event.eventName,
      Buffer.from(JSON.stringify(event.toJSON()))
    );
  }
}
```

## License

MIT
