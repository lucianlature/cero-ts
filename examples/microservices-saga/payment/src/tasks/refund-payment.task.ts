// ---------------------------------------------------------------------------
// RefundPaymentTask — Compensation task for saga rollback
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), callbacks, withTransaction
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import { domainEvents, withTransaction, createServiceLogger } from '@saga/shared';
import { getDb } from '../db.js';
import type { PaymentRefunded } from '../domain/events.js';

const log = createServiceLogger('payment');

export interface RefundPaymentContext extends Record<string, unknown> {
  orderId?: string;
  refunded?: boolean;
}

export class RefundPaymentTask extends Task<RefundPaymentContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    transactionId: required({ type: 'string', presence: true }),
  };

  static override callbacks = {
    onSuccess: ['recordRefund'],
  };

  declare orderId: string;
  declare transactionId: string;

  override async work(): Promise<void> {
    log.info('Refunding transaction', { transactionId: this.transactionId, orderId: this.orderId });

    // Simulate refund processing
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    this.context.orderId = this.orderId;
    this.context.refunded = true;
  }

  private recordRefund(): void {
    const db = getDb();
    withTransaction(db, () => {
      // Update original transaction status
      db.prepare(
        `UPDATE transactions SET status = 'refunded', updated_at = datetime('now') WHERE id = ?`,
      ).run(this.transactionId);

      // Insert refund record
      const refundId = `txn_refund_${Date.now()}`;
      db.prepare(
        `INSERT INTO transactions (id, order_id, amount, currency, payment_method, status, gateway_ref)
         SELECT ?, order_id, amount, currency, payment_method, 'refunded', ?
         FROM transactions WHERE id = ?`,
      ).run(refundId, `refund_of_${this.transactionId}`, this.transactionId);
    });

    // DDD: Domain event for refund
    domainEvents.raise<PaymentRefunded>({
      type: 'PaymentRefunded',
      orderId: this.orderId,
      transactionId: this.transactionId,
      occurredAt: new Date().toISOString(),
    });
  }
}
