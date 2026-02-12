// ---------------------------------------------------------------------------
// SchedulePickupTask — Schedules carrier pickup (conditional: domestic only)
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), optional(), skip (conditional)
// ---------------------------------------------------------------------------

import { Task, required, optional } from 'cero-ts';
import { createServiceLogger } from '@saga/shared';

const log = createServiceLogger('shipping');

export interface SchedulePickupContext extends Record<string, unknown> {
  orderId?: string;
  pickupScheduled?: boolean;
  pickupDate?: string;
}

export class SchedulePickupTask extends Task<SchedulePickupContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    country: required({ type: 'string' }),
    expedited: optional({ default: false, type: 'boolean' }),
  };

  declare orderId: string;
  declare country: string;
  declare expedited: boolean;

  override async work(): Promise<void> {
    // Only schedule pickup for domestic (US) shipments
    if (this.country !== 'US') {
      this.skip('Pickup scheduling only available for domestic shipments');
      return;
    }

    // Simulate scheduling
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 50));

    const daysUntilPickup = this.expedited ? 0 : 1;
    const pickupDate = new Date(
      Date.now() + daysUntilPickup * 86_400_000,
    ).toISOString();

    this.context.orderId = this.orderId;
    this.context.pickupScheduled = true;
    this.context.pickupDate = pickupDate;

    log.info('Pickup scheduled', { pickupDate });
  }
}
