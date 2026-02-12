import type { DomainEvent } from '@saga/shared';

export interface PaymentCaptured extends DomainEvent {
  readonly type: 'PaymentCaptured';
  readonly orderId: string;
  readonly transactionId: string;
  readonly amount: number;
  readonly currency: string;
  readonly gatewayRef: string;
}

export interface PaymentDeclined extends DomainEvent {
  readonly type: 'PaymentDeclined';
  readonly orderId: string;
  readonly reason: string;
}

export interface PaymentRefunded extends DomainEvent {
  readonly type: 'PaymentRefunded';
  readonly orderId: string;
  readonly transactionId: string;
}
