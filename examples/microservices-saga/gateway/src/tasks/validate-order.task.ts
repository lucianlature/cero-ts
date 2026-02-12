// ---------------------------------------------------------------------------
// ValidateOrderTask — Validates and coerces incoming order data
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), optional(), type coercions,
//   validations (numeric, format, length, inclusion, presence), callbacks
// DDD Boundary #2: Application Service — one aggregate command per task
// ---------------------------------------------------------------------------

import { Task, required, optional } from 'cero-ts';
import type { OrderItem, ShippingAddress } from '@saga/shared';
import { withTransaction } from '@saga/shared';
import { getDb } from '../db.js';

export interface ValidateOrderContext extends Record<string, unknown> {
  orderId?: string;
  customerId?: string;
  items?: OrderItem[];
  totalAmount?: number;
  currency?: string;
  paymentMethod?: string;
  shippingAddress?: ShippingAddress;
  expedited?: boolean;
  notes?: string;
}

export class ValidateOrderTask extends Task<ValidateOrderContext> {
  static override attributes = {
    customerId: required({ type: 'string', length: { min: 1, max: 64 } }),
    items: required({ type: 'array' }),
    totalAmount: required({ type: 'float', numeric: { min: 0.01 } }),
    currency: optional({
      default: 'USD',
      inclusion: { in: ['USD', 'EUR', 'GBP'] },
    }),
    paymentMethod: required({
      type: 'string',
      format: /^pm_[a-zA-Z0-9_]+$/,
    }),
    shippingStreet: required({ type: 'string', presence: true }),
    shippingCity: required({ type: 'string', presence: true }),
    shippingState: required({ type: 'string', length: { min: 2, max: 4 } }),
    shippingPostalCode: required({
      type: 'string',
      format: /^\d{5}(-\d{4})?$/,
    }),
    shippingCountry: optional({ default: 'US', type: 'string', length: { is: 2 } }),
    expedited: optional({ default: false, type: 'boolean' }),
    notes: optional({ type: 'string', length: { max: 500 } }),
  };

  static override callbacks = {
    onSuccess: ['persistOrder'],
  };

  declare customerId: string;
  declare items: OrderItem[];
  declare totalAmount: number;
  declare currency: string;
  declare paymentMethod: string;
  declare shippingStreet: string;
  declare shippingCity: string;
  declare shippingState: string;
  declare shippingPostalCode: string;
  declare shippingCountry: string;
  declare expedited: boolean;
  declare notes: string | undefined;

  override async work(): Promise<void> {
    // Validate items array structure
    if (!Array.isArray(this.items) || this.items.length === 0) {
      this.fail('Order must contain at least one item');
      return;
    }

    for (const item of this.items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        this.fail('Each item must have a productId and quantity >= 1', {
          invalidItem: item,
        });
        return;
      }
    }

    // Compute total from items and validate against declared total
    const computedTotal = this.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const roundedComputed = Math.round(computedTotal * 100) / 100;
    const roundedDeclared = Math.round(this.totalAmount * 100) / 100;

    if (Math.abs(roundedComputed - roundedDeclared) > 0.01) {
      this.fail('Total amount does not match item prices', {
        computed: roundedComputed,
        declared: roundedDeclared,
      });
      return;
    }

    // Generate order ID and populate context
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.context.orderId = orderId;
    this.context.customerId = this.customerId;
    this.context.items = this.items;
    this.context.totalAmount = roundedDeclared;
    this.context.currency = this.currency;
    this.context.paymentMethod = this.paymentMethod;
    this.context.expedited = this.expedited;
    this.context.notes = this.notes;
    this.context.shippingAddress = {
      street: this.shippingStreet,
      city: this.shippingCity,
      state: this.shippingState,
      postalCode: this.shippingPostalCode,
      country: this.shippingCountry,
    };
  }

  /**
   * DDD Boundary #3 — Commit first, publish after:
   * Persist the order in a SQLite transaction within the onSuccess callback.
   * The order is committed to the DB before any RabbitMQ messages are sent
   * (which happens later in the workflow).
   */
  private persistOrder(): void {
    const db = getDb();
    const ctx = this.context;

    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO orders (id, customer_id, items, shipping_address, total_amount, currency, payment_method, status, saga_state, expedited, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'created', ?, ?, datetime('now'), datetime('now'))`,
      ).run(
        ctx.orderId as string,
        ctx.customerId as string,
        JSON.stringify(ctx.items),
        JSON.stringify(ctx.shippingAddress),
        ctx.totalAmount as number,
        ctx.currency as string,
        ctx.paymentMethod as string,
        ctx.expedited ? 1 : 0,
        (ctx.notes as string) ?? null,
      );
    });
  }
}
