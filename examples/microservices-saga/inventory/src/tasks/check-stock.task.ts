// ---------------------------------------------------------------------------
// CheckStockTask — Checks if all items are available in stock
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), skip (graceful bypass), fail
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import type { OrderItem } from '@saga/shared';
import { createServiceLogger } from '@saga/shared';
import { getDb } from '../db.js';

const log = createServiceLogger('inventory');

export interface CheckStockContext extends Record<string, unknown> {
  orderId?: string;
  items?: OrderItem[];
  stockAvailable?: boolean;
  unavailableItems?: string[];
}

export class CheckStockTask extends Task<CheckStockContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    items: required({ type: 'array' }),
  };

  declare orderId: string;
  declare items: OrderItem[];

  override async work(): Promise<void> {
    const db = getDb();
    const unavailable: string[] = [];

    for (const item of this.items) {
      const row = db
        .prepare(
          'SELECT stock_level, reserved FROM products WHERE id = ?',
        )
        .get(item.productId) as { stock_level: number; reserved: number } | undefined;

      if (!row) {
        unavailable.push(`${item.productId} (not found)`);
        continue;
      }

      const available = row.stock_level - row.reserved;
      if (available < item.quantity) {
        unavailable.push(
          `${item.productId} (need ${item.quantity}, available ${available})`,
        );
      }
    }

    if (unavailable.length > 0) {
      this.context.stockAvailable = false;
      this.context.unavailableItems = unavailable;
      this.fail(`Insufficient stock: ${unavailable.join(', ')}`);
      return;
    }

    this.context.orderId = this.orderId;
    this.context.items = this.items;
    this.context.stockAvailable = true;

    log.info('Stock check passed');
  }
}
