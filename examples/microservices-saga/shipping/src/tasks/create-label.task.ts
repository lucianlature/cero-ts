// ---------------------------------------------------------------------------
// CreateLabelTask — Creates a shipping label and records shipment
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), optional(), RuntimeMiddleware,
//   callbacks, withTransaction
// ---------------------------------------------------------------------------

import { Task, required, optional } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';
import type { ShippingAddress } from '@saga/shared';
import { domainEvents, withTransaction, createServiceLogger } from '@saga/shared';
import type { ShipmentCreated } from '../domain/events.js';
import { getDb } from '../db.js';

const log = createServiceLogger('shipping');

export interface CreateLabelContext extends Record<string, unknown> {
  orderId?: string;
  shipmentId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  carrier?: string;
}

export class CreateLabelTask extends Task<CreateLabelContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    address: required(),
    expedited: optional({ default: false, type: 'boolean' }),
  };

  static override middlewares = [RuntimeMiddleware];

  static override callbacks = {
    onSuccess: ['recordShipment'],
  };

  declare orderId: string;
  declare address: ShippingAddress;
  declare expedited: boolean;

  override async work(): Promise<void> {
    // Simulate label generation
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));

    const carrier = this.expedited ? 'FedEx Express' : 'USPS Priority';
    const trackingNumber = `TRK${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const shipmentId = `ship_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const labelUrl = `https://labels.example.com/${trackingNumber}.pdf`;

    this.context.orderId = this.orderId;
    this.context.shipmentId = shipmentId;
    this.context.trackingNumber = trackingNumber;
    this.context.labelUrl = labelUrl;
    this.context.carrier = carrier;

    log.info('Label created', {
      trackingNumber,
      carrier,
    });
  }

  private recordShipment(): void {
    const db = getDb();
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO shipments (id, order_id, carrier, tracking_number, label_url, status, address, expedited)
         VALUES (?, ?, ?, ?, ?, 'created', ?, ?)`,
      ).run(
        this.context.shipmentId as string,
        this.orderId,
        this.context.carrier as string,
        this.context.trackingNumber as string,
        this.context.labelUrl as string,
        JSON.stringify(this.address),
        this.expedited ? 1 : 0,
      );
    });
    // DDD: Domain event raised after DB commit
    domainEvents.raise<ShipmentCreated>({
      type: 'ShipmentCreated',
      orderId: this.orderId,
      shipmentId: this.context.shipmentId as string,
      trackingNumber: this.context.trackingNumber as string,
      carrier: this.context.carrier as string,
      occurredAt: new Date().toISOString(),
    });
  }
}
