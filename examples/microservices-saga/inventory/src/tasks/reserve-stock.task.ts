// ---------------------------------------------------------------------------
// ReserveStockTask — Atomically reserves inventory for an order
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), rollback, withTransaction, callbacks
// DDD Boundary #1: Aggregate = Transaction — product + reservation in
//   a single atomic SQLite transaction.
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import type { OrderItem } from '@saga/shared';
import { withTransaction, createServiceLogger, domainEvents } from '@saga/shared';
import type { StockReserved, StockReservationFailed } from '../domain/events.js';
import { getDb } from '../db.js';

const log = createServiceLogger('inventory');

export interface ReserveStockContext extends Record<string, unknown> {
  orderId?: string;
  reservationId?: string;
  reserved?: boolean;
}

export class ReserveStockTask extends Task<ReserveStockContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    items: required({ type: 'array' }),
  };

  static override settings = {
    rollbackOn: ['failed'] as ['failed'],
  };

  declare orderId: string;
  declare items: OrderItem[];

  override async work(): Promise<void> {
    const db = getDb();
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // DDD Boundary #1: single aggregate transaction
      withTransaction(db, () => {
        for (const item of this.items) {
          const changes = db.prepare(
            `UPDATE products
             SET reserved = reserved + ?
             WHERE id = ? AND (stock_level - reserved) >= ?`,
          ).run(item.quantity, item.productId, item.quantity);

          if ((changes as unknown as { changes: number }).changes === 0) {
            throw new Error(
              `Cannot reserve ${item.quantity} of ${item.productId} — insufficient stock`,
            );
          }

          const resItemId = `${reservationId}_${item.productId}`;
          db.prepare(
            `INSERT INTO reservations (id, order_id, product_id, quantity, status)
             VALUES (?, ?, ?, ?, 'reserved')`,
          ).run(resItemId, this.orderId, item.productId, item.quantity);
        }
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);

      // DDD: Domain event for reservation failure
      domainEvents.raise<StockReservationFailed>({
        type: 'StockReservationFailed',
        orderId: this.orderId,
        reason,
        occurredAt: new Date().toISOString(),
      });

      this.fail(reason);
      return;
    }

    this.context.orderId = this.orderId;
    this.context.reservationId = reservationId;
    this.context.reserved = true;

    log.info('Reserved stock', { reservationId });

    // DDD: Domain event raised after DB commit
    domainEvents.raise<StockReserved>({
      type: 'StockReserved',
      orderId: this.orderId,
      reservationId,
      occurredAt: new Date().toISOString(),
    });
  }

  /** Rollback: release the reserved stock. */
  override async rollback(): Promise<void> {
    log.info('Rolling back reservation');
    const db = getDb();

    withTransaction(db, () => {
      // Get all reservations for this order
      const reservations = db
        .prepare(
          `SELECT product_id, quantity FROM reservations
           WHERE order_id = ? AND status = 'reserved'`,
        )
        .all(this.orderId) as Array<{ product_id: string; quantity: number }>;

      for (const res of reservations) {
        db.prepare(
          'UPDATE products SET reserved = reserved - ? WHERE id = ?',
        ).run(res.quantity, res.product_id);
      }

      db.prepare(
        `UPDATE reservations SET status = 'released' WHERE order_id = ? AND status = 'reserved'`,
      ).run(this.orderId);
    });
  }
}
