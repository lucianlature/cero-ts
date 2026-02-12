// ---------------------------------------------------------------------------
// CapturePaymentTask — Processes payment capture with retries and rollback
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), type coercion (float), validations
//   (numeric, format), retries with jitter, TimeoutMiddleware, rollback,
//   callbacks (onSuccess, onFailed)
// DDD Boundary #1: Aggregate = Transaction — one transaction record per call
// DDD Boundary #2: Application Service — load, execute, persist, publish
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import type { MiddlewareDefinition } from 'cero-ts';
import { TimeoutMiddleware } from 'cero-ts/middleware';
import { domainEvents, withTransaction, createServiceLogger } from '@saga/shared';
import { getDb } from '../db.js';
import type { PaymentCaptured, PaymentDeclined } from '../domain/events.js';

const log = createServiceLogger('payment');

export interface CapturePaymentContext extends Record<string, unknown> {
  orderId?: string;
  transactionId?: string;
  gatewayRef?: string;
  captured?: boolean;
  errorReason?: string;
}

export class CapturePaymentTask extends Task<CapturePaymentContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    amount: required({ type: 'float', numeric: { min: 0.01 } }),
    currency: required({
      type: 'string',
      inclusion: { in: ['USD', 'EUR', 'GBP'] },
    }),
    paymentMethod: required({
      type: 'string',
      format: /^pm_[a-zA-Z0-9_]+$/,
    }),
  };

  static override settings = {
    retries: 2,
    retryJitter: '500ms',
    rollbackOn: ['failed'] as ['failed'],
  };

  static override middlewares: MiddlewareDefinition[] = [
    [TimeoutMiddleware, { seconds: 30 }],
  ];

  static override callbacks = {
    onSuccess: ['recordSuccess'],
    onFailed: ['recordFailure'],
  };

  declare orderId: string;
  declare amount: number;
  declare currency: string;
  declare paymentMethod: string;

  override async work(): Promise<void> {
    log.info('Capturing payment', { amount: this.amount, currency: this.currency });

    // Simulate payment gateway call
    const result = await this.simulatePaymentGateway();

    if (!result.success) {
      this.context.errorReason = result.reason;
      this.fail(result.reason ?? 'Payment capture failed');
      return;
    }

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.context.orderId = this.orderId;
    this.context.transactionId = transactionId;
    this.context.gatewayRef = result.gatewayRef;
    this.context.captured = true;
  }

  override async rollback(): Promise<void> {
    log.info('Rolling back payment');
    // In a real system, this would call the payment gateway's void/cancel API
  }

  private recordSuccess(): void {
    const db = getDb();
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO transactions (id, order_id, amount, currency, payment_method, status, gateway_ref)
         VALUES (?, ?, ?, ?, ?, 'captured', ?)`,
      ).run(
        this.context.transactionId as string,
        this.orderId,
        this.amount,
        this.currency,
        this.paymentMethod,
        this.context.gatewayRef as string,
      );
    });

    // DDD: Commit first, publish after — domain event raised after DB transaction
    domainEvents.raise<PaymentCaptured>({
      type: 'PaymentCaptured',
      orderId: this.orderId,
      transactionId: this.context.transactionId as string,
      amount: this.amount,
      currency: this.currency,
      gatewayRef: this.context.gatewayRef as string,
      occurredAt: new Date().toISOString(),
    });
  }

  private recordFailure(): void {
    const db = getDb();
    const failedTxnId = `txn_fail_${Date.now()}`;
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO transactions (id, order_id, amount, currency, payment_method, status, error_reason)
         VALUES (?, ?, ?, ?, ?, 'failed', ?)`,
      ).run(
        failedTxnId,
        this.orderId,
        this.amount,
        this.currency,
        this.paymentMethod,
        this.context.errorReason as string,
      );
    });

    // DDD: Domain event for payment decline
    domainEvents.raise<PaymentDeclined>({
      type: 'PaymentDeclined',
      orderId: this.orderId,
      reason: this.context.errorReason as string,
      occurredAt: new Date().toISOString(),
    });
  }

  /** Simulates a payment gateway with realistic failure scenarios. */
  private async simulatePaymentGateway(): Promise<{
    success: boolean;
    gatewayRef?: string;
    reason?: string;
  }> {
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));

    // Known test payment methods that trigger failures
    if (this.paymentMethod === 'pm_declined') {
      return { success: false, reason: 'Card declined' };
    }
    if (this.paymentMethod === 'pm_insufficient_funds') {
      return { success: false, reason: 'Insufficient funds' };
    }
    if (this.paymentMethod === 'pm_expired') {
      return { success: false, reason: 'Card expired' };
    }

    // 5% random failure rate for realism
    if (Math.random() < 0.05) {
      return { success: false, reason: 'Gateway timeout (transient)' };
    }

    return {
      success: true,
      gatewayRef: `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}
