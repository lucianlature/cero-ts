import { domainEvents, publishSignal, createServiceLogger } from '@saga/shared';
import type { InventoryReservedSignal, InventoryFailedSignal, InventoryReleasedSignal } from '@saga/shared';
import type { StockReserved, StockReservationFailed, StockReleased } from '../domain/events.js';

const log = createServiceLogger('inventory');

export function registerSagaSignalHandlers(): void {
  domainEvents.on<StockReserved>('StockReserved', (event) => {
    const signal: InventoryReservedSignal = {
      type: 'inventory.reserved',
      orderId: event.orderId,
      reservationId: event.reservationId,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type });
  });

  domainEvents.on<StockReservationFailed>('StockReservationFailed', (event) => {
    const signal: InventoryFailedSignal = {
      type: 'inventory.failed',
      orderId: event.orderId,
      reason: event.reason,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type, reason: event.reason });
  });

  domainEvents.on<StockReleased>('StockReleased', (event) => {
    const signal: InventoryReleasedSignal = {
      type: 'inventory.released',
      orderId: event.orderId,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type });
  });
}
