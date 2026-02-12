import { domainEvents, publishSignal, createServiceLogger } from '@saga/shared';
import type { ShipmentCreatedSignal, ShipmentFailedSignal } from '@saga/shared';
import type { ShipmentCreated, ShipmentFailed } from '../domain/events.js';

const log = createServiceLogger('shipping');

export function registerSagaSignalHandlers(): void {
  domainEvents.on<ShipmentCreated>('ShipmentCreated', (event) => {
    const signal: ShipmentCreatedSignal = {
      type: 'shipment.created',
      orderId: event.orderId,
      shipmentId: event.shipmentId,
      trackingNumber: event.trackingNumber,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type });
  });

  domainEvents.on<ShipmentFailed>('ShipmentFailed', (event) => {
    const signal: ShipmentFailedSignal = {
      type: 'shipment.failed',
      orderId: event.orderId,
      reason: event.reason,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type, reason: event.reason });
  });
}
