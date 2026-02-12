import type { DomainEvent } from '@saga/shared';

export interface StockReserved extends DomainEvent {
  readonly type: 'StockReserved';
  readonly orderId: string;
  readonly reservationId: string;
}

export interface StockReservationFailed extends DomainEvent {
  readonly type: 'StockReservationFailed';
  readonly orderId: string;
  readonly reason: string;
}

export interface StockReleased extends DomainEvent {
  readonly type: 'StockReleased';
  readonly orderId: string;
}
