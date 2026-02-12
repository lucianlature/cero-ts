import { domainEvents, publishSignal, createServiceLogger } from '@saga/shared';
import type { PaymentCapturedSignal, PaymentFailedSignal, PaymentRefundedSignal } from '@saga/shared';
import type { PaymentCaptured, PaymentDeclined, PaymentRefunded } from '../domain/events.js';

const log = createServiceLogger('payment');

/** Saga signal handler: translates domain events into orchestrator reply signals. */
export function registerSagaSignalHandlers(): void {
  domainEvents.on<PaymentCaptured>('PaymentCaptured', (event) => {
    const signal: PaymentCapturedSignal = {
      type: 'payment.captured',
      orderId: event.orderId,
      transactionId: event.transactionId,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type });
  });

  domainEvents.on<PaymentDeclined>('PaymentDeclined', (event) => {
    const signal: PaymentFailedSignal = {
      type: 'payment.failed',
      orderId: event.orderId,
      reason: event.reason,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type, reason: event.reason });
  });

  domainEvents.on<PaymentRefunded>('PaymentRefunded', (event) => {
    const signal: PaymentRefundedSignal = {
      type: 'payment.refunded',
      orderId: event.orderId,
    };
    publishSignal(signal);
    log.info('Saga signal emitted', { signal: signal.type });
  });
}
