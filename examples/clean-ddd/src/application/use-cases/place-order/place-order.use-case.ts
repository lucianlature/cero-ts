import { Task, required } from 'cero-ts';
import { Order } from '../../../domain/order/entities/order.js';
import { OrderItem } from '../../../domain/order/entities/order-item.js';
import { CustomerId } from '../../../domain/customer/value-objects/customer-id.js';
import { Address } from '../../../domain/customer/value-objects/address.js';
import { OrderRepository } from '../../ports/repositories/order.repository.js';
import { CustomerRepository } from '../../ports/repositories/customer.repository.js';
import { ProductRepository, Product } from '../../ports/repositories/product.repository.js';
import { PaymentGateway } from '../../ports/services/payment-gateway.js';
import { EventBus } from '../../ports/event-bus.js';
import { PlaceOrderInput, PlaceOrderOutput } from './place-order.dto.js';
import { container } from '../../../config/container.js';

/**
 * Context interface for type-safe context access
 */
interface PlaceOrderContext extends Record<string, unknown> {
  order?: Order;
  output?: PlaceOrderOutput;
}

/**
 * PlaceOrder Use Case
 *
 * Orchestrates the process of placing a new order:
 * 1. Validate customer exists and is active
 * 2. Validate products and build order items
 * 3. Create order aggregate
 * 4. Process payment
 * 5. Persist order
 * 6. Publish domain events
 */
export class PlaceOrderUseCase extends Task<PlaceOrderContext> {
  // Dependencies (resolved from container)
  private orderRepository!: OrderRepository;
  private customerRepository!: CustomerRepository;
  private productRepository!: ProductRepository;
  private paymentGateway!: PaymentGateway;
  private eventBus!: EventBus;

  // Attributes
  static override attributes = {
    input: required(),
  };

  declare input: PlaceOrderInput;

  // Callbacks
  static override callbacks = {
    beforeExecution: ['resolveDependencies'],
    onSuccess: ['publishEvents'],
  };

  /**
   * Resolve dependencies from container
   */
  private resolveDependencies(): void {
    this.orderRepository = container.resolve<OrderRepository>('OrderRepository');
    this.customerRepository = container.resolve<CustomerRepository>('CustomerRepository');
    this.productRepository = container.resolve<ProductRepository>('ProductRepository');
    this.paymentGateway = container.resolve<PaymentGateway>('PaymentGateway');
    this.eventBus = container.resolve<EventBus>('EventBus');
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

  override async work(): Promise<void> {
    // Step 1: Validate customer
    const customer = await this.validateCustomer();
    if (!customer) return;

    // Step 2: Build order items
    const orderItems = await this.buildOrderItems();
    if (orderItems.length === 0) return;

    // Step 3: Create order aggregate
    const order = this.createOrder(orderItems);

    // Step 4: Process payment
    const paymentSuccess = await this.processPayment(order);
    if (!paymentSuccess) return;

    // Step 5: Persist order
    await this.persistOrder(order);

    // Step 6: Set output
    this.setOutput(order);
  }

  private async validateCustomer() {
    try {
      const customerId = CustomerId.fromString(this.input.customerId);
      const customer = await this.customerRepository.findById(customerId);

      if (!customer) {
        this.fail('Customer not found', {
          code: 'CUSTOMER_NOT_FOUND',
          customerId: this.input.customerId,
        });
        return null;
      }

      if (!customer.isActive()) {
        this.fail('Customer account is not active', {
          code: 'CUSTOMER_INACTIVE',
          customerId: this.input.customerId,
        });
        return null;
      }

      return customer;
    } catch (error) {
      this.fail('Invalid customer ID', {
        code: 'INVALID_CUSTOMER_ID',
        customerId: this.input.customerId,
      });
      return null;
    }
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
          productName: product.name,
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

  private createOrder(items: OrderItem[]): Order {
    const customerId = CustomerId.fromString(this.input.customerId);

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

  private async processPayment(order: Order): Promise<boolean> {
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
      return false;
    }

    // Update order with payment info
    order.confirm();
    order.markAsPaid(paymentResult.transactionId!);

    return true;
  }

  private async persistOrder(order: Order): Promise<void> {
    try {
      // Save order
      await this.orderRepository.save(order);

      // Decrement product stock
      for (const item of order.items) {
        await this.productRepository.decrementStock(item.productId, item.quantity);
      }

      this.context.order = order;
    } catch (error) {
      this.fail('Failed to save order', {
        code: 'PERSISTENCE_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private setOutput(order: Order): void {
    this.context.output = {
      orderId: order.id.toString(),
      status: order.status.getValue(),
      subtotal: order.subtotal.getAmount(),
      tax: order.tax.getAmount(),
      shipping: order.shipping.getAmount(),
      total: order.total.getAmount(),
      currency: order.total.getCurrency(),
      itemCount: order.items.length,
    };
  }
}
