# Clean DDD Integration with cero-ts

This example demonstrates how cero-ts integrates with Clean Architecture and Domain-Driven Design principles, covering the complete request flow from API to database.

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │ REST API    │  │ GraphQL     │  │ CLI         │                      │
│  │ Controllers │  │ Resolvers   │  │ Commands    │                      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                      │
└─────────┼────────────────┼────────────────┼─────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                                │
│                     (Use Cases / cero-ts Tasks)                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  PlaceOrderUseCase    │  CancelOrderUseCase  │  ShipOrderUseCase│    │
│  │  (cero-ts Task)       │  (cero-ts Task)      │  (cero-ts Task)  │    │
│  └───────────┬───────────┴──────────┬──────────┴─────────┬─────────┘    │
│              │                      │                    │              │
│  ┌───────────▼──────────────────────▼────────────────────▼───────────┐  │
│  │                         PORTS (Interfaces)                        │  │
│  │  OrderRepository │ PaymentGateway │ EventBus │ NotificationService│  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                      │                    │
          ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Order       │  │ OrderItem   │  │ Money       │  │ OrderPlaced │     │
│  │ (Aggregate) │  │ (Entity)    │  │ (Value Obj) │  │ (Domain Evt)│     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │ Customer    │  │ Address     │  │ OrderStatus │                      │
│  │ (Entity)    │  │ (Value Obj) │  │ (Value Obj) │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
          ▲                      ▲                    ▲
          │                      │                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE LAYER                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ADAPTERS (Implementations)                   │   │
│  │  PostgresOrderRepo │ StripePaymentGateway │ RabbitMQEventBus    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```shell
src/
├── domain/                      # Domain Layer
│   ├── order/
│   │   ├── entities/
│   │   │   ├── order.ts         # Order Aggregate Root
│   │   │   └── order-item.ts    # Order Item Entity
│   │   ├── value-objects/
│   │   │   ├── order-id.ts
│   │   │   ├── order-status.ts
│   │   │   └── money.ts
│   │   ├── events/
│   │   │   ├── order-placed.ts
│   │   │   ├── order-paid.ts
│   │   │   └── order-shipped.ts
│   │   ├── services/
│   │   │   └── order-pricing.service.ts
│   │   └── errors/
│   │       └── order.errors.ts
│   ├── customer/
│   │   ├── entities/
│   │   │   └── customer.ts
│   │   └── value-objects/
│   │       ├── customer-id.ts
│   │       └── address.ts
│   └── shared/
│       └── value-objects/
│           └── email.ts
│
├── application/                 # Application Layer
│   ├── ports/                   # Interfaces (Driven Ports)
│   │   ├── repositories/
│   │   │   ├── order.repository.ts
│   │   │   ├── customer.repository.ts
│   │   │   └── product.repository.ts
│   │   ├── services/
│   │   │   ├── payment-gateway.ts
│   │   │   └── notification.service.ts
│   │   └── event-bus.ts
│   ├── use-cases/               # cero-ts Tasks
│   │   ├── place-order/
│   │   │   ├── place-order.use-case.ts
│   │   │   └── place-order.dto.ts
│   │   ├── pay-order/
│   │   │   └── pay-order.use-case.ts
│   │   └── ship-order/
│   │       └── ship-order.use-case.ts
│   └── workflows/               # cero-ts Workflows
│       └── order-fulfillment.workflow.ts
│
├── infrastructure/              # Infrastructure Layer
│   ├── persistence/
│   │   ├── postgres/
│   │   │   ├── order.repository.impl.ts
│   │   │   ├── customer.repository.impl.ts
│   │   │   └── mappers/
│   │   │       └── order.mapper.ts
│   │   └── unit-of-work.ts
│   ├── payment/
│   │   └── stripe-payment-gateway.ts
│   ├── messaging/
│   │   └── rabbitmq-event-bus.ts
│   └── notifications/
│       └── email-notification.service.ts
│
├── presentation/                # Presentation Layer
│   ├── rest/
│   │   ├── controllers/
│   │   │   └── order.controller.ts
│   │   └── middleware/
│   │       └── error-handler.ts
│   └── dto/
│       ├── create-order.request.ts
│       └── order.response.ts
│
└── config/
    ├── container.ts             # Dependency Injection
    └── cero.config.ts           # cero-ts configuration
```

---

## Domain Layer

The domain layer contains pure business logic with no dependencies on external concerns.

### Value Objects

```typescript
// domain/shared/value-objects/email.ts

/**
 * Email Value Object
 * Immutable, validated email address
 */
export class Email {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static create(email: string): Email {
    if (!email || !Email.isValid(email)) {
      throw new InvalidEmailError(email);
    }
    return new Email(email.toLowerCase().trim());
  }

  static isValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}

export class InvalidEmailError extends Error {
  constructor(email: string) {
    super(`Invalid email address: ${email}`);
    this.name = 'InvalidEmailError';
  }
}
```

```typescript
// domain/order/value-objects/money.ts

/**
 * Money Value Object
 * Handles currency and amount with proper precision
 */
export class Money {
  private constructor(
    private readonly amount: number,
    private readonly currency: string
  ) {
    Object.freeze(this);
  }

  static create(amount: number, currency: string = 'USD'): Money {
    if (amount < 0) {
      throw new InvalidMoneyError('Amount cannot be negative');
    }
    // Store as cents to avoid floating point issues
    const cents = Math.round(amount * 100);
    return new Money(cents / 100, currency.toUpperCase());
  }

  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency.toUpperCase());
  }

  getAmount(): number {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return Money.create(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return Money.create(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return Money.create(this.amount * factor, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amount > other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(currency1: string, currency2: string) {
    super(`Cannot operate on different currencies: ${currency1} and ${currency2}`);
    this.name = 'CurrencyMismatchError';
  }
}
```

```typescript
// domain/order/value-objects/order-id.ts

import { randomUUID } from 'node:crypto';

/**
 * OrderId Value Object
 * Strongly typed identifier for orders
 */
export class OrderId {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static create(): OrderId {
    return new OrderId(`order_${randomUUID()}`);
  }

  static fromString(id: string): OrderId {
    if (!id || !id.startsWith('order_')) {
      throw new InvalidOrderIdError(id);
    }
    return new OrderId(id);
  }

  toString(): string {
    return this.value;
  }

  equals(other: OrderId): boolean {
    return this.value === other.value;
  }
}

export class InvalidOrderIdError extends Error {
  constructor(id: string) {
    super(`Invalid order ID: ${id}`);
    this.name = 'InvalidOrderIdError';
  }
}
```

```typescript
// domain/order/value-objects/order-status.ts

/**
 * OrderStatus Value Object
 * Represents the state machine for order status
 */
export type OrderStatusValue =
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export class OrderStatus {
  private static readonly VALID_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['paid', 'cancelled'],
    paid: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  };

  private constructor(private readonly value: OrderStatusValue) {
    Object.freeze(this);
  }

  static pending(): OrderStatus {
    return new OrderStatus('pending');
  }

  static fromString(status: string): OrderStatus {
    const validStatuses: OrderStatusValue[] = [
      'pending', 'confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
    ];
    if (!validStatuses.includes(status as OrderStatusValue)) {
      throw new InvalidOrderStatusError(status);
    }
    return new OrderStatus(status as OrderStatusValue);
  }

  canTransitionTo(newStatus: OrderStatus): boolean {
    return OrderStatus.VALID_TRANSITIONS[this.value].includes(newStatus.value);
  }

  transitionTo(newStatus: OrderStatus): OrderStatus {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidStatusTransitionError(this.value, newStatus.value);
    }
    return newStatus;
  }

  getValue(): OrderStatusValue {
    return this.value;
  }

  isPending(): boolean { return this.value === 'pending'; }
  isConfirmed(): boolean { return this.value === 'confirmed'; }
  isPaid(): boolean { return this.value === 'paid'; }
  isShipped(): boolean { return this.value === 'shipped'; }
  isCancelled(): boolean { return this.value === 'cancelled'; }
  isDelivered(): boolean { return this.value === 'delivered'; }

  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }
}

export class InvalidOrderStatusError extends Error {
  constructor(status: string) {
    super(`Invalid order status: ${status}`);
    this.name = 'InvalidOrderStatusError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition order from '${from}' to '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}
```

### Entities

```typescript
// domain/order/entities/order-item.ts

import { Money } from '../value-objects/money';

/**
 * OrderItem Entity
 * Represents a line item in an order
 */
export interface OrderItemProps {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
}

export class OrderItem {
  private readonly props: OrderItemProps;

  private constructor(props: OrderItemProps) {
    this.props = { ...props };
  }

  static create(props: OrderItemProps): OrderItem {
    if (props.quantity <= 0) {
      throw new InvalidOrderItemError('Quantity must be positive');
    }
    return new OrderItem(props);
  }

  get productId(): string {
    return this.props.productId;
  }

  get productName(): string {
    return this.props.productName;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get totalPrice(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }

  updateQuantity(newQuantity: number): OrderItem {
    if (newQuantity <= 0) {
      throw new InvalidOrderItemError('Quantity must be positive');
    }
    return new OrderItem({ ...this.props, quantity: newQuantity });
  }
}

export class InvalidOrderItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderItemError';
  }
}
```

### Aggregate Root

```typescript
// domain/order/entities/order.ts

import { OrderId } from '../value-objects/order-id';
import { OrderStatus } from '../value-objects/order-status';
import { Money } from '../value-objects/money';
import { OrderItem } from './order-item';
import { Address } from '../../customer/value-objects/address';
import { CustomerId } from '../../customer/value-objects/customer-id';
import { DomainEvent } from '../../shared/domain-event';
import { OrderPlacedEvent } from '../events/order-placed';
import { OrderPaidEvent } from '../events/order-paid';
import { OrderShippedEvent } from '../events/order-shipped';
import { OrderCancelledEvent } from '../events/order-cancelled';

/**
 * Order Aggregate Root
 * Encapsulates all order invariants and business rules
 */
export interface OrderProps {
  id: OrderId;
  customerId: CustomerId;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress?: Address;
  status: OrderStatus;
  subtotal: Money;
  tax: Money;
  shipping: Money;
  total: Money;
  placedAt?: Date;
  paidAt?: Date;
  shippedAt?: Date;
  notes?: string;
}

export class Order {
  private props: OrderProps;
  private domainEvents: DomainEvent[] = [];

  private constructor(props: OrderProps) {
    this.props = { ...props };
  }

  /**
   * Factory method to create a new order
   */
  static create(params: {
    customerId: CustomerId;
    items: OrderItem[];
    shippingAddress: Address;
    billingAddress?: Address;
    notes?: string;
  }): Order {
    if (params.items.length === 0) {
      throw new EmptyOrderError();
    }

    const subtotal = params.items.reduce(
      (sum, item) => sum.add(item.totalPrice),
      Money.zero()
    );

    // Business rule: Calculate tax (example: 10%)
    const tax = subtotal.multiply(0.10);

    // Business rule: Free shipping over $100
    const shipping = subtotal.getAmount() >= 100
      ? Money.zero()
      : Money.create(9.99);

    const total = subtotal.add(tax).add(shipping);

    const order = new Order({
      id: OrderId.create(),
      customerId: params.customerId,
      items: [...params.items],
      shippingAddress: params.shippingAddress,
      billingAddress: params.billingAddress,
      status: OrderStatus.pending(),
      subtotal,
      tax,
      shipping,
      total,
      notes: params.notes,
    });

    return order;
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(props: OrderProps): Order {
    return new Order(props);
  }

  // ==================== Getters ====================

  get id(): OrderId { return this.props.id; }
  get customerId(): CustomerId { return this.props.customerId; }
  get items(): readonly OrderItem[] { return [...this.props.items]; }
  get shippingAddress(): Address { return this.props.shippingAddress; }
  get billingAddress(): Address | undefined { return this.props.billingAddress; }
  get status(): OrderStatus { return this.props.status; }
  get subtotal(): Money { return this.props.subtotal; }
  get tax(): Money { return this.props.tax; }
  get shipping(): Money { return this.props.shipping; }
  get total(): Money { return this.props.total; }
  get placedAt(): Date | undefined { return this.props.placedAt; }
  get paidAt(): Date | undefined { return this.props.paidAt; }
  get shippedAt(): Date | undefined { return this.props.shippedAt; }
  get notes(): string | undefined { return this.props.notes; }

  // ==================== Behavior ====================

  /**
   * Confirm the order (after validation)
   */
  confirm(): void {
    this.ensureCanTransitionTo('confirmed');
    this.props.status = this.props.status.transitionTo(OrderStatus.fromString('confirmed'));
    this.props.placedAt = new Date();

    this.addDomainEvent(new OrderPlacedEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      total: this.total.getAmount(),
      currency: this.total.getCurrency(),
      itemCount: this.items.length,
      placedAt: this.props.placedAt,
    }));
  }

  /**
   * Mark order as paid
   */
  markAsPaid(paymentReference: string): void {
    this.ensureCanTransitionTo('paid');
    this.props.status = this.props.status.transitionTo(OrderStatus.fromString('paid'));
    this.props.paidAt = new Date();

    this.addDomainEvent(new OrderPaidEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      amount: this.total.getAmount(),
      currency: this.total.getCurrency(),
      paymentReference,
      paidAt: this.props.paidAt,
    }));
  }

  /**
   * Start processing the order
   */
  startProcessing(): void {
    this.ensureCanTransitionTo('processing');
    this.props.status = this.props.status.transitionTo(OrderStatus.fromString('processing'));
  }

  /**
   * Ship the order
   */
  ship(trackingNumber: string): void {
    this.ensureCanTransitionTo('shipped');
    this.props.status = this.props.status.transitionTo(OrderStatus.fromString('shipped'));
    this.props.shippedAt = new Date();

    this.addDomainEvent(new OrderShippedEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      trackingNumber,
      shippedAt: this.props.shippedAt,
    }));
  }

  /**
   * Cancel the order
   */
  cancel(reason: string): void {
    this.ensureCanTransitionTo('cancelled');
    this.props.status = this.props.status.transitionTo(OrderStatus.fromString('cancelled'));

    this.addDomainEvent(new OrderCancelledEvent({
      orderId: this.id.toString(),
      customerId: this.customerId.toString(),
      reason,
      cancelledAt: new Date(),
    }));
  }

  // ==================== Domain Events ====================

  private addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents = [];
    return events;
  }

  // ==================== Private ====================

  private ensureCanTransitionTo(status: string): void {
    const newStatus = OrderStatus.fromString(status);
    if (!this.props.status.canTransitionTo(newStatus)) {
      throw new InvalidStatusTransitionError(
        this.props.status.getValue(),
        status
      );
    }
  }
}

export class EmptyOrderError extends Error {
  constructor() {
    super('Order must have at least one item');
    this.name = 'EmptyOrderError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition order from '${from}' to '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}
```

### Domain Events

```typescript
// domain/order/events/order-placed.ts

import { DomainEvent } from '../../shared/domain-event';

export interface OrderPlacedPayload {
  orderId: string;
  customerId: string;
  total: number;
  currency: string;
  itemCount: number;
  placedAt: Date;
}

export class OrderPlacedEvent extends DomainEvent<OrderPlacedPayload> {
  static readonly EVENT_NAME = 'order.placed';

  constructor(payload: OrderPlacedPayload) {
    super(OrderPlacedEvent.EVENT_NAME, payload);
  }
}
```

```typescript
// domain/shared/domain-event.ts

import { randomUUID } from 'node:crypto';

export abstract class DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly payload: T;

  constructor(eventName: string, payload: T) {
    this.eventId = randomUUID();
    this.eventName = eventName;
    this.occurredAt = new Date();
    this.payload = payload;
  }
}
```

---

## Application Layer

The application layer contains use cases implemented as cero-ts Tasks.

### Ports (Interfaces)

```typescript
// application/ports/repositories/order.repository.ts

import { Order } from '../../../domain/order/entities/order';
import { OrderId } from '../../../domain/order/value-objects/order-id';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id';

/**
 * Order Repository Port
 * Defines the contract for order persistence
 */
export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  findByCustomerId(customerId: CustomerId): Promise<Order[]>;
  save(order: Order): Promise<void>;
  delete(id: OrderId): Promise<void>;
  nextId(): OrderId;
}

// Symbol for dependency injection
export const ORDER_REPOSITORY = Symbol('OrderRepository');
```

```typescript
// application/ports/services/payment-gateway.ts

import { Money } from '../../../domain/order/value-objects/money';

/**
 * Payment Gateway Port
 * Defines the contract for payment processing
 */
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface PaymentGateway {
  charge(params: {
    amount: Money;
    customerId: string;
    orderId: string;
    paymentMethodId: string;
    description?: string;
  }): Promise<PaymentResult>;

  refund(transactionId: string, amount?: Money): Promise<PaymentResult>;
}

export const PAYMENT_GATEWAY = Symbol('PaymentGateway');
```

```typescript
// application/ports/event-bus.ts

import { DomainEvent } from '../../domain/shared/domain-event';

/**
 * Event Bus Port
 * Defines the contract for publishing domain events
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}

export const EVENT_BUS = Symbol('EventBus');
```

### DTOs

```typescript
// application/use-cases/place-order/place-order.dto.ts

/**
 * Input DTO for PlaceOrder use case
 * Represents the data needed to place an order
 */
export interface PlaceOrderInput {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethodId: string;
  notes?: string;
}

/**
 * Output DTO for PlaceOrder use case
 */
export interface PlaceOrderOutput {
  orderId: string;
  status: string;
  total: number;
  currency: string;
  estimatedDelivery: string;
}
```

### Use Cases (cero-ts Tasks)

```typescript
// application/use-cases/place-order/place-order.use-case.ts

import { Task, required, optional } from 'cero-ts';
import { Order } from '../../../domain/order/entities/order';
import { OrderItem } from '../../../domain/order/entities/order-item';
import { Money } from '../../../domain/order/value-objects/money';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id';
import { Address } from '../../../domain/customer/value-objects/address';
import { OrderRepository, ORDER_REPOSITORY } from '../../ports/repositories/order.repository';
import { CustomerRepository, CUSTOMER_REPOSITORY } from '../../ports/repositories/customer.repository';
import { ProductRepository, PRODUCT_REPOSITORY } from '../../ports/repositories/product.repository';
import { PaymentGateway, PAYMENT_GATEWAY } from '../../ports/services/payment-gateway';
import { EventBus, EVENT_BUS } from '../../ports/event-bus';
import { UnitOfWork, UNIT_OF_WORK } from '../../ports/unit-of-work';
import { PlaceOrderInput, PlaceOrderOutput } from './place-order.dto';
import { container } from '../../../config/container';

/**
 * Context interface for type-safe context access
 */
interface PlaceOrderContext {
  order: Order;
  output: PlaceOrderOutput;
}

/**
 * PlaceOrder Use Case
 *
 * Orchestrates the process of placing a new order:
 * 1. Validate customer exists
 * 2. Validate products and build order items
 * 3. Create order aggregate
 * 4. Process payment
 * 5. Persist order
 * 6. Publish domain events
 */
export class PlaceOrderUseCase extends Task<PlaceOrderContext> {
  // ==================== Dependencies (injected) ====================

  private orderRepository: OrderRepository;
  private customerRepository: CustomerRepository;
  private productRepository: ProductRepository;
  private paymentGateway: PaymentGateway;
  private eventBus: EventBus;
  private unitOfWork: UnitOfWork;

  // ==================== Attributes ====================

  static override attributes = {
    input: required<PlaceOrderInput>(),
  };

  declare input: PlaceOrderInput;

  // ==================== Callbacks ====================

  static override callbacks = {
    beforeExecution: ['resolveDependencies'],
    onSuccess: ['publishEvents'],
    onFailed: ['handleFailure'],
  };

  // ==================== Lifecycle ====================

  /**
   * Resolve dependencies from container
   * This allows the use case to remain testable with mock implementations
   */
  private resolveDependencies(): void {
    this.orderRepository = container.get<OrderRepository>(ORDER_REPOSITORY);
    this.customerRepository = container.get<CustomerRepository>(CUSTOMER_REPOSITORY);
    this.productRepository = container.get<ProductRepository>(PRODUCT_REPOSITORY);
    this.paymentGateway = container.get<PaymentGateway>(PAYMENT_GATEWAY);
    this.eventBus = container.get<EventBus>(EVENT_BUS);
    this.unitOfWork = container.get<UnitOfWork>(UNIT_OF_WORK);
  }

  /**
   * Publish domain events after successful execution
   */
  private async publishEvents(): Promise<void> {
    const order = this.context.order;
    if (order) {
      const events = order.pullDomainEvents();
      await this.eventBus.publishAll(events);
    }
  }

  /**
   * Handle failure - log and potentially compensate
   */
  private handleFailure(): void {
    console.error(`PlaceOrder failed: ${this.result?.reason}`, {
      customerId: this.input.customerId,
      itemCount: this.input.items.length,
    });
  }

  // ==================== Main Logic ====================

  override async work(): Promise<void> {
    // Step 1: Validate customer
    const customer = await this.validateCustomer();

    // Step 2: Build order items
    const orderItems = await this.buildOrderItems();

    // Step 3: Create order aggregate
    const order = this.createOrder(customer.id, orderItems);

    // Step 4: Process payment
    await this.processPayment(order);

    // Step 5: Confirm and persist order
    await this.persistOrder(order);

    // Step 6: Set output
    this.setOutput(order);
  }

  // ==================== Private Methods ====================

  private async validateCustomer() {
    const customerId = CustomerId.fromString(this.input.customerId);
    const customer = await this.customerRepository.findById(customerId);

    if (!customer) {
      this.fail('Customer not found', {
        code: 'CUSTOMER_NOT_FOUND',
        customerId: this.input.customerId,
      });
      return null!;
    }

    if (!customer.isActive()) {
      this.fail('Customer account is not active', {
        code: 'CUSTOMER_INACTIVE',
        customerId: this.input.customerId,
      });
      return null!;
    }

    return customer;
  }

  private async buildOrderItems(): Promise<OrderItem[]> {
    const items: OrderItem[] = [];

    for (const itemInput of this.input.items) {
      const product = await this.productRepository.findById(itemInput.productId);

      if (!product) {
        this.fail('Product not found', {
          code: 'PRODUCT_NOT_FOUND',
          productId: itemInput.productId,
        });
        return [];
      }

      if (!product.isAvailable()) {
        this.fail('Product is not available', {
          code: 'PRODUCT_UNAVAILABLE',
          productId: itemInput.productId,
          productName: product.name,
        });
        return [];
      }

      if (product.stock < itemInput.quantity) {
        this.fail('Insufficient stock', {
          code: 'INSUFFICIENT_STOCK',
          productId: itemInput.productId,
          requested: itemInput.quantity,
          available: product.stock,
        });
        return [];
      }

      items.push(
        OrderItem.create({
          productId: product.id,
          productName: product.name,
          quantity: itemInput.quantity,
          unitPrice: product.price,
        })
      );
    }

    return items;
  }

  private createOrder(customerId: CustomerId, items: OrderItem[]): Order {
    const shippingAddress = Address.create({
      street: this.input.shippingAddress.street,
      city: this.input.shippingAddress.city,
      state: this.input.shippingAddress.state,
      postalCode: this.input.shippingAddress.postalCode,
      country: this.input.shippingAddress.country,
    });

    const billingAddress = this.input.billingAddress
      ? Address.create({
          street: this.input.billingAddress.street,
          city: this.input.billingAddress.city,
          state: this.input.billingAddress.state,
          postalCode: this.input.billingAddress.postalCode,
          country: this.input.billingAddress.country,
        })
      : undefined;

    return Order.create({
      customerId,
      items,
      shippingAddress,
      billingAddress,
      notes: this.input.notes,
    });
  }

  private async processPayment(order: Order): Promise<void> {
    const paymentResult = await this.paymentGateway.charge({
      amount: order.total,
      customerId: order.customerId.toString(),
      orderId: order.id.toString(),
      paymentMethodId: this.input.paymentMethodId,
      description: `Order ${order.id.toString()}`,
    });

    if (!paymentResult.success) {
      this.fail('Payment failed', {
        code: 'PAYMENT_FAILED',
        errorCode: paymentResult.errorCode,
        errorMessage: paymentResult.errorMessage,
      });
      return;
    }

    // Update order with payment info
    order.confirm();
    order.markAsPaid(paymentResult.transactionId!);
  }

  private async persistOrder(order: Order): Promise<void> {
    await this.unitOfWork.begin();

    try {
      await this.orderRepository.save(order);

      // Decrement product stock
      for (const item of order.items) {
        await this.productRepository.decrementStock(
          item.productId,
          item.quantity
        );
      }

      await this.unitOfWork.commit();
      this.context.order = order;
    } catch (error) {
      await this.unitOfWork.rollback();
      this.fail('Failed to save order', {
        code: 'PERSISTENCE_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private setOutput(order: Order): void {
    // Calculate estimated delivery (example: 5-7 business days)
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7);

    this.context.output = {
      orderId: order.id.toString(),
      status: order.status.getValue(),
      total: order.total.getAmount(),
      currency: order.total.getCurrency(),
      estimatedDelivery: deliveryDate.toISOString().split('T')[0],
    };
  }
}
```

### Additional Use Cases

```typescript
// application/use-cases/cancel-order/cancel-order.use-case.ts

import { Task, required } from 'cero-ts';
import { OrderId } from '../../../domain/order/value-objects/order-id';
import { OrderRepository, ORDER_REPOSITORY } from '../../ports/repositories/order.repository';
import { PaymentGateway, PAYMENT_GATEWAY } from '../../ports/services/payment-gateway';
import { EventBus, EVENT_BUS } from '../../ports/event-bus';
import { container } from '../../../config/container';

interface CancelOrderContext {
  refundTransactionId?: string;
}

export class CancelOrderUseCase extends Task<CancelOrderContext> {
  private orderRepository!: OrderRepository;
  private paymentGateway!: PaymentGateway;
  private eventBus!: EventBus;

  static override attributes = {
    orderId: required(),
    reason: required({ length: { min: 1, max: 500 } }),
  };

  declare orderId: string;
  declare reason: string;

  static override callbacks = {
    beforeExecution: ['resolveDependencies'],
    onSuccess: ['publishEvents'],
  };

  private resolveDependencies(): void {
    this.orderRepository = container.get<OrderRepository>(ORDER_REPOSITORY);
    this.paymentGateway = container.get<PaymentGateway>(PAYMENT_GATEWAY);
    this.eventBus = container.get<EventBus>(EVENT_BUS);
  }

  private order: any;

  private async publishEvents(): Promise<void> {
    if (this.order) {
      const events = this.order.pullDomainEvents();
      await this.eventBus.publishAll(events);
    }
  }

  override async work(): Promise<void> {
    // Find the order
    const orderId = OrderId.fromString(this.orderId);
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      this.fail('Order not found', {
        code: 'ORDER_NOT_FOUND',
        orderId: this.orderId,
      });
      return;
    }

    // Check if order can be cancelled
    if (!order.status.canTransitionTo(OrderStatus.fromString('cancelled'))) {
      this.fail('Order cannot be cancelled', {
        code: 'CANNOT_CANCEL',
        currentStatus: order.status.getValue(),
      });
      return;
    }

    // If order was paid, process refund
    if (order.status.isPaid()) {
      const refundResult = await this.paymentGateway.refund(
        order.paymentTransactionId,
        order.total
      );

      if (!refundResult.success) {
        this.fail('Refund failed', {
          code: 'REFUND_FAILED',
          errorMessage: refundResult.errorMessage,
        });
        return;
      }

      this.context.refundTransactionId = refundResult.transactionId;
    }

    // Cancel the order
    order.cancel(this.reason);
    await this.orderRepository.save(order);

    this.order = order;
  }
}
```

### Workflows

```typescript
// application/workflows/order-fulfillment.workflow.ts

import { Workflow } from 'cero-ts';
import { PlaceOrderUseCase } from '../use-cases/place-order/place-order.use-case';
import { SendOrderConfirmationUseCase } from '../use-cases/notifications/send-order-confirmation.use-case';
import { NotifyWarehouseUseCase } from '../use-cases/warehouse/notify-warehouse.use-case';
import { UpdateInventoryAnalyticsUseCase } from '../use-cases/analytics/update-inventory-analytics.use-case';

/**
 * Order Fulfillment Workflow
 *
 * Orchestrates the complete order fulfillment process:
 * 1. Place the order (validate, pay, persist)
 * 2. Send confirmation email to customer
 * 3. Notify warehouse for picking
 * 4. Update analytics
 *
 * Steps 2-4 are non-critical and should not fail the workflow
 */
export class OrderFulfillmentWorkflow extends Workflow {
  static override tasks = [
    // Critical: Order placement (fails workflow on error)
    PlaceOrderUseCase,

    // Non-critical: Notifications and analytics (continue on skip/fail)
    {
      tasks: [
        SendOrderConfirmationUseCase,
        NotifyWarehouseUseCase,
        UpdateInventoryAnalyticsUseCase,
      ],
      strategy: 'parallel',
      breakpoints: [],  // Never halt on these tasks
    },
  ];
}
```

---

## Infrastructure Layer

The infrastructure layer contains concrete implementations of the ports.

### Repository Implementation

```typescript
// infrastructure/persistence/postgres/order.repository.impl.ts

import { Pool } from 'pg';
import { Order } from '../../../domain/order/entities/order';
import { OrderId } from '../../../domain/order/value-objects/order-id';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id';
import { OrderRepository } from '../../../application/ports/repositories/order.repository';
import { OrderMapper } from './mappers/order.mapper';

/**
 * PostgreSQL implementation of OrderRepository
 */
export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: OrderId): Promise<Order | null> {
    const result = await this.pool.query(
      `SELECT o.*,
              json_agg(oi.*) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [id.toString()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return OrderMapper.toDomain(result.rows[0]);
  }

  async findByCustomerId(customerId: CustomerId): Promise<Order[]> {
    const result = await this.pool.query(
      `SELECT o.*,
              json_agg(oi.*) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [customerId.toString()]
    );

    return result.rows.map(OrderMapper.toDomain);
  }

  async save(order: Order): Promise<void> {
    const data = OrderMapper.toPersistence(order);

    await this.pool.query('BEGIN');

    try {
      // Upsert order
      await this.pool.query(
        `INSERT INTO orders (
          id, customer_id, status, subtotal, tax, shipping, total,
          shipping_address, billing_address, placed_at, paid_at, shipped_at, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          paid_at = EXCLUDED.paid_at,
          shipped_at = EXCLUDED.shipped_at,
          updated_at = NOW()`,
        [
          data.id,
          data.customer_id,
          data.status,
          data.subtotal,
          data.tax,
          data.shipping,
          data.total,
          JSON.stringify(data.shipping_address),
          data.billing_address ? JSON.stringify(data.billing_address) : null,
          data.placed_at,
          data.paid_at,
          data.shipped_at,
          data.notes,
        ]
      );

      // Delete and re-insert items
      await this.pool.query('DELETE FROM order_items WHERE order_id = $1', [data.id]);

      for (const item of data.items) {
        await this.pool.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [data.id, item.product_id, item.product_name, item.quantity, item.unit_price]
        );
      }

      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }

  async delete(id: OrderId): Promise<void> {
    await this.pool.query('DELETE FROM orders WHERE id = $1', [id.toString()]);
  }

  nextId(): OrderId {
    return OrderId.create();
  }
}
```

### Mapper

```typescript
// infrastructure/persistence/postgres/mappers/order.mapper.ts

import { Order, OrderProps } from '../../../../domain/order/entities/order';
import { OrderItem } from '../../../../domain/order/entities/order-item';
import { OrderId } from '../../../../domain/order/value-objects/order-id';
import { OrderStatus } from '../../../../domain/order/value-objects/order-status';
import { Money } from '../../../../domain/order/value-objects/money';
import { CustomerId } from '../../../../domain/customer/value-objects/customer-id';
import { Address } from '../../../../domain/customer/value-objects/address';

interface OrderPersistence {
  id: string;
  customer_id: string;
  status: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  shipping_address: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  billing_address?: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  placed_at?: Date;
  paid_at?: Date;
  shipped_at?: Date;
  notes?: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }>;
}

/**
 * Maps between domain Order and persistence format
 */
export class OrderMapper {
  static toDomain(raw: OrderPersistence): Order {
    const items = raw.items.map((item) =>
      OrderItem.create({
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: Money.create(item.unit_price),
      })
    );

    const props: OrderProps = {
      id: OrderId.fromString(raw.id),
      customerId: CustomerId.fromString(raw.customer_id),
      items,
      shippingAddress: Address.create({
        street: raw.shipping_address.street,
        city: raw.shipping_address.city,
        state: raw.shipping_address.state,
        postalCode: raw.shipping_address.postal_code,
        country: raw.shipping_address.country,
      }),
      billingAddress: raw.billing_address
        ? Address.create({
            street: raw.billing_address.street,
            city: raw.billing_address.city,
            state: raw.billing_address.state,
            postalCode: raw.billing_address.postal_code,
            country: raw.billing_address.country,
          })
        : undefined,
      status: OrderStatus.fromString(raw.status),
      subtotal: Money.create(raw.subtotal),
      tax: Money.create(raw.tax),
      shipping: Money.create(raw.shipping),
      total: Money.create(raw.total),
      placedAt: raw.placed_at,
      paidAt: raw.paid_at,
      shippedAt: raw.shipped_at,
      notes: raw.notes,
    };

    return Order.reconstitute(props);
  }

  static toPersistence(order: Order): OrderPersistence {
    return {
      id: order.id.toString(),
      customer_id: order.customerId.toString(),
      status: order.status.getValue(),
      subtotal: order.subtotal.getAmount(),
      tax: order.tax.getAmount(),
      shipping: order.shipping.getAmount(),
      total: order.total.getAmount(),
      shipping_address: {
        street: order.shippingAddress.street,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postal_code: order.shippingAddress.postalCode,
        country: order.shippingAddress.country,
      },
      billing_address: order.billingAddress
        ? {
            street: order.billingAddress.street,
            city: order.billingAddress.city,
            state: order.billingAddress.state,
            postal_code: order.billingAddress.postalCode,
            country: order.billingAddress.country,
          }
        : undefined,
      placed_at: order.placedAt,
      paid_at: order.paidAt,
      shipped_at: order.shippedAt,
      notes: order.notes,
      items: order.items.map((item) => ({
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice.getAmount(),
      })),
    };
  }
}
```

### Payment Gateway Implementation

```typescript
// infrastructure/payment/stripe-payment-gateway.ts

import Stripe from 'stripe';
import { PaymentGateway, PaymentResult } from '../../application/ports/services/payment-gateway';
import { Money } from '../../domain/order/value-objects/money';

export class StripePaymentGateway implements PaymentGateway {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey);
  }

  async charge(params: {
    amount: Money;
    customerId: string;
    orderId: string;
    paymentMethodId: string;
    description?: string;
  }): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(params.amount.getAmount() * 100), // Stripe uses cents
        currency: params.amount.getCurrency().toLowerCase(),
        payment_method: params.paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          orderId: params.orderId,
          customerId: params.customerId,
        },
        description: params.description,
      });

      if (paymentIntent.status === 'succeeded') {
        return {
          success: true,
          transactionId: paymentIntent.id,
        };
      }

      return {
        success: false,
        errorCode: 'PAYMENT_INCOMPLETE',
        errorMessage: `Payment status: ${paymentIntent.status}`,
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          errorCode: error.code ?? 'STRIPE_ERROR',
          errorMessage: error.message,
        };
      }
      throw error;
    }
  }

  async refund(transactionId: string, amount?: Money): Promise<PaymentResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: transactionId,
        amount: amount ? Math.round(amount.getAmount() * 100) : undefined,
      });

      return {
        success: refund.status === 'succeeded',
        transactionId: refund.id,
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          errorCode: error.code ?? 'STRIPE_ERROR',
          errorMessage: error.message,
        };
      }
      throw error;
    }
  }
}
```

### Event Bus Implementation

```typescript
// infrastructure/messaging/rabbitmq-event-bus.ts

import amqp, { Connection, Channel } from 'amqplib';
import { EventBus } from '../../application/ports/event-bus';
import { DomainEvent } from '../../domain/shared/domain-event';

export class RabbitMQEventBus implements EventBus {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private exchange: string;

  constructor(
    private readonly url: string,
    exchange: string = 'domain_events'
  ) {
    this.exchange = exchange;
  }

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
  }

  async publish(event: DomainEvent): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const message = JSON.stringify({
      eventId: event.eventId,
      eventName: event.eventName,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    });

    this.channel!.publish(
      this.exchange,
      event.eventName,  // Routing key
      Buffer.from(message),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        timestamp: event.occurredAt.getTime(),
      }
    );
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
```

---

## Presentation Layer

The presentation layer handles HTTP requests and responses.

### Request/Response DTOs

```typescript
// presentation/dto/create-order.request.ts

import { z } from 'zod';

export const CreateOrderRequestSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1, 'Order must have at least one item'),

  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().length(2),
    postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.string().length(2).default('US'),
  }),

  billingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().length(2),
    postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    country: z.string().length(2).default('US'),
  }).optional(),

  paymentMethodId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
```

```typescript
// presentation/dto/order.response.ts

export interface OrderResponse {
  id: string;
  status: string;
  total: {
    amount: number;
    currency: string;
  };
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  estimatedDelivery?: string;
  placedAt?: string;
  paidAt?: string;
}

export interface CreateOrderResponse {
  order: OrderResponse;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

### Controller

```typescript
// presentation/rest/controllers/order.controller.ts

import { Request, Response, Router } from 'express';
import { PlaceOrderUseCase } from '../../../application/use-cases/place-order/place-order.use-case';
import { CancelOrderUseCase } from '../../../application/use-cases/cancel-order/cancel-order.use-case';
import { GetOrderUseCase } from '../../../application/use-cases/get-order/get-order.use-case';
import { CreateOrderRequestSchema, CreateOrderRequest } from '../../dto/create-order.request';
import { OrderResponse, CreateOrderResponse, ErrorResponse } from '../../dto/order.response';
import { FailFault } from 'cero-ts';

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
    this.router.post('/orders', this.createOrder.bind(this));
    this.router.get('/orders/:id', this.getOrder.bind(this));
    this.router.post('/orders/:id/cancel', this.cancelOrder.bind(this));
  }

  /**
   * POST /orders
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
      } as ErrorResponse);
      return;
    }

    const input = validation.data;
    const customerId = req.user?.id; // From auth middleware

    if (!customerId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      } as ErrorResponse);
      return;
    }

    // Execute use case
    const result = await PlaceOrderUseCase.execute({
      input: {
        customerId,
        items: input.items,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        paymentMethodId: input.paymentMethodId,
        notes: input.notes,
      },
    });

    // Handle result
    if (result.success) {
      const output = result.context.output;
      res.status(201).json({
        order: {
          id: output.orderId,
          status: output.status,
          total: {
            amount: output.total,
            currency: output.currency,
          },
          estimatedDelivery: output.estimatedDelivery,
        },
        message: 'Order placed successfully',
      } as CreateOrderResponse);
    } else {
      // Map error codes to HTTP status codes
      const statusCode = this.mapErrorToStatusCode(result.metadata.code as string);
      res.status(statusCode).json({
        error: {
          code: result.metadata.code as string,
          message: result.reason || 'Order creation failed',
          details: result.metadata,
        },
      } as ErrorResponse);
    }
  }

  /**
   * GET /orders/:id
   * Get order by ID
   */
  async getOrder(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const customerId = req.user?.id;

    const result = await GetOrderUseCase.execute({
      orderId: id,
      customerId,
    });

    if (result.success) {
      res.json({ order: result.context.order });
    } else if (result.metadata.code === 'ORDER_NOT_FOUND') {
      res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    } else {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: result.reason || 'Failed to retrieve order',
        },
      });
    }
  }

  /**
   * POST /orders/:id/cancel
   * Cancel an order
   */
  async cancelOrder(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cancellation reason is required',
        },
      });
      return;
    }

    const result = await CancelOrderUseCase.execute({
      orderId: id,
      reason,
    });

    if (result.success) {
      res.json({
        message: 'Order cancelled successfully',
        refundTransactionId: result.context.refundTransactionId,
      });
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

  private mapErrorToStatusCode(code: string): number {
    const codeMap: Record<string, number> = {
      VALIDATION_ERROR: 400,
      CUSTOMER_NOT_FOUND: 404,
      PRODUCT_NOT_FOUND: 404,
      ORDER_NOT_FOUND: 404,
      CUSTOMER_INACTIVE: 403,
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
```

---

## Configuration

### Dependency Injection Container

```typescript
// config/container.ts

import { Container } from 'inversify';
import { Pool } from 'pg';
import {
  OrderRepository,
  ORDER_REPOSITORY,
} from '../application/ports/repositories/order.repository';
import {
  CustomerRepository,
  CUSTOMER_REPOSITORY,
} from '../application/ports/repositories/customer.repository';
import {
  ProductRepository,
  PRODUCT_REPOSITORY,
} from '../application/ports/repositories/product.repository';
import {
  PaymentGateway,
  PAYMENT_GATEWAY,
} from '../application/ports/services/payment-gateway';
import { EventBus, EVENT_BUS } from '../application/ports/event-bus';
import { UnitOfWork, UNIT_OF_WORK } from '../application/ports/unit-of-work';

import { PostgresOrderRepository } from '../infrastructure/persistence/postgres/order.repository.impl';
import { PostgresCustomerRepository } from '../infrastructure/persistence/postgres/customer.repository.impl';
import { PostgresProductRepository } from '../infrastructure/persistence/postgres/product.repository.impl';
import { PostgresUnitOfWork } from '../infrastructure/persistence/postgres/unit-of-work.impl';
import { StripePaymentGateway } from '../infrastructure/payment/stripe-payment-gateway';
import { RabbitMQEventBus } from '../infrastructure/messaging/rabbitmq-event-bus';

// Create container
export const container = new Container();

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Bind repositories
container.bind<OrderRepository>(ORDER_REPOSITORY)
  .toDynamicValue(() => new PostgresOrderRepository(pool))
  .inSingletonScope();

container.bind<CustomerRepository>(CUSTOMER_REPOSITORY)
  .toDynamicValue(() => new PostgresCustomerRepository(pool))
  .inSingletonScope();

container.bind<ProductRepository>(PRODUCT_REPOSITORY)
  .toDynamicValue(() => new PostgresProductRepository(pool))
  .inSingletonScope();

// Bind unit of work
container.bind<UnitOfWork>(UNIT_OF_WORK)
  .toDynamicValue(() => new PostgresUnitOfWork(pool))
  .inRequestScope();

// Bind external services
container.bind<PaymentGateway>(PAYMENT_GATEWAY)
  .toDynamicValue(() => new StripePaymentGateway(process.env.STRIPE_SECRET_KEY!))
  .inSingletonScope();

container.bind<EventBus>(EVENT_BUS)
  .toDynamicValue(() => new RabbitMQEventBus(process.env.RABBITMQ_URL!))
  .inSingletonScope();
```

### cero-ts Configuration

```typescript
// config/cero.config.ts

import { configure } from 'cero-ts';
import { RuntimeMiddleware, CorrelateMiddleware } from 'cero-ts/middleware';
import { Logger, JsonFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new JsonFormatter(),
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

configure((config) => {
  // Global middleware
  config.middlewares.register(RuntimeMiddleware);
  config.middlewares.register(CorrelateMiddleware, {
    id: () => globalThis.requestContext?.requestId,
  });

  // Global callbacks for logging
  config.callbacks.register('onExecuted', (task) => {
    if (task.result) {
      logger.log(task.result, {
        tags: ['use-case'],
      });
    }
  });

  // Error reporting
  config.callbacks.register('onFailed', (task) => {
    if (process.env.NODE_ENV === 'production' && task.result?.cause) {
      // Report to error tracking service
      Sentry.captureException(task.result.cause, {
        tags: { task: task.constructor.name },
        extra: { metadata: task.result.metadata },
      });
    }
  });

  // Configure breakpoints
  config.taskBreakpoints = ['failed'];
  config.workflowBreakpoints = ['failed'];
});
```

---

## Complete Request Flow

Here's how a request flows through all layers:

```text
1. HTTP Request arrives at OrderController
   POST /orders { items: [...], paymentMethodId: "pm_123", ... }

2. Controller validates request with Zod schema
   → CreateOrderRequestSchema.safeParse(req.body)

3. Controller extracts authenticated user from request
   → customerId from JWT/session

4. Controller executes PlaceOrderUseCase (cero-ts Task)
   → PlaceOrderUseCase.execute({ input: { customerId, items, ... } })

5. Use case resolves dependencies from container
   → beforeExecution callback injects repositories, gateways

6. Use case validates customer (domain rule)
   → CustomerRepository.findById() → Customer entity

7. Use case builds order items (domain logic)
   → ProductRepository.findById() → Product entities
   → OrderItem.create() → OrderItem value objects

8. Use case creates Order aggregate (domain factory)
   → Order.create() → Order aggregate with business rules
   → Calculates subtotal, tax, shipping (domain service)

9. Use case processes payment (infrastructure)
   → PaymentGateway.charge() → Stripe API call

10. Order aggregate updates state (domain behavior)
    → order.confirm() → status transition
    → order.markAsPaid() → records payment, raises event

11. Use case persists order (infrastructure)
    → UnitOfWork.begin()
    → OrderRepository.save() → PostgreSQL INSERT
    → ProductRepository.decrementStock() → UPDATE
    → UnitOfWork.commit()

12. Domain events are published (infrastructure)
    → onSuccess callback
    → EventBus.publishAll() → RabbitMQ

13. Use case sets output in context
    → PlaceOrderOutput DTO

14. Controller receives result
    → result.success → 201 Created
    → result.failed → appropriate error status

15. HTTP Response sent to client
    { order: { id: "order_123", status: "paid", ... } }
```

## Key Benefits

### Clean Architecture Benefits

1. **Dependency Rule**: All dependencies point inward toward the domain
2. **Testability**: Use cases can be tested with mock repositories/gateways
3. **Flexibility**: Infrastructure can be swapped without touching domain
4. **Separation of Concerns**: Each layer has a clear responsibility

### DDD Benefits

1. **Ubiquitous Language**: Code reflects business terminology (Order, Customer, etc.)
2. **Encapsulated Business Rules**: Domain invariants protected by aggregates
3. **Domain Events**: Business events captured and propagated
4. **Value Objects**: Type safety and validation at domain level

### cero-ts Benefits

1. **Structured Use Cases**: Tasks provide consistent execution pattern
2. **Result-Based Flow**: Clear success/failure handling without exceptions
3. **Observability**: Built-in logging, chain correlation
4. **Middleware**: Cross-cutting concerns (auth, caching, metrics)
5. **Workflows**: Compose complex operations from simple use cases
6. **Callbacks**: Lifecycle hooks for side effects (events, notifications)
