// ---------------------------------------------------------------------------
// ReleaseStockTask — Compensation task: releases previously reserved stock
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), withTransaction
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import { withTransaction, createServiceLogger, domainEvents } from '@saga/shared';
import type { StockReleased } from '../domain/events.js';
import { getDb } from '../db.js';

const log = createServiceLogger('inventory');

export interface ReleaseStockContext extends Record<string, unknown> {
  orderId?: string;
  released?: boolean;
}

export class ReleaseStockTask extends Task<ReleaseStockContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
  };

  declare orderId: string;

  override async work(): Promise<void> {
    const db = getDb();

    const reservations = db
      .prepare(
        `SELECT product_id, quantity FROM reservations
         WHERE order_id = ? AND status = 'reserved'`,
      )
      .all(this.orderId) as Array<{ product_id: string; quantity: number }>;

    if (reservations.length === 0) {
      log.info('No active reservations');
      this.context.released = false;
      return;
    }

    withTransaction(db, () => {
      for (const res of reservations) {
        db.prepare(
          'UPDATE products SET reserved = reserved - ? WHERE id = ?',
        ).run(res.quantity, res.product_id);
      }

      db.prepare(
        `UPDATE reservations SET status = 'released' WHERE order_id = ? AND status = 'reserved'`,
      ).run(this.orderId);
    });

    this.context.orderId = this.orderId;
    this.context.released = true;
    log.info('Released stock');

    // DDD: Domain event for stock release
    domainEvents.raise<StockReleased>({
      type: 'StockReleased',
      orderId: this.orderId,
      occurredAt: new Date().toISOString(),
    });
  }
}
