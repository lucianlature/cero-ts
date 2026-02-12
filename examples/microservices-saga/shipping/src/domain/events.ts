import type { DomainEvent } from '@saga/shared';

export interface ShipmentCreated extends DomainEvent {
  readonly type: 'ShipmentCreated';
  readonly orderId: string;
  readonly shipmentId: string;
  readonly trackingNumber: string;
  readonly carrier: string;
}

export interface ShipmentFailed extends DomainEvent {
  readonly type: 'ShipmentFailed';
  readonly orderId: string;
  readonly reason: string;
}
