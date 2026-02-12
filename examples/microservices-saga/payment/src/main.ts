// ---------------------------------------------------------------------------
// Payment Service — RabbitMQ consumer
// ---------------------------------------------------------------------------

import {
  connectRabbit,
  disconnectRabbit,
  consumeQueue,
  publishSignal,
  createServiceLogger,
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from '@saga/shared';

const log = createServiceLogger('payment');
import type {
  CapturePaymentCommand,
  RefundPaymentCommand,
  PaymentCapturedSignal,
  PaymentFailedSignal,
} from '@saga/shared';
import { configure } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';
import { RabbitAuditMiddleware } from '@saga/shared';
import { initDb, getDb } from './db.js';
import { PaymentWorkflow } from './workflows/payment.workflow.js';
import { RefundPaymentTask } from './tasks/refund-payment.task.js';
import { registerSagaSignalHandlers } from './handlers/saga-signal.handler.js';

async function bootstrap(): Promise<void> {
  log.info('Starting Payment Service');

  // Configure cero-ts
  configure((config) => {
    config.taskBreakpoints = ['failed'];
    config.rollbackOn = ['failed'];
    config.middlewares.register(RuntimeMiddleware);
    config.middlewares.register([RabbitAuditMiddleware, { service: 'payment' }]);
  });

  // Initialize SQLite
  initDb();

  // Connect to RabbitMQ
  await connectRabbit();

  // Register domain event handlers (signal emission, etc.)
  registerSagaSignalHandlers();

  // Consume payment commands
  await consumeQueue(
    QUEUES.PAYMENT_COMMANDS,
    EXCHANGES.COMMANDS,
    [ROUTING_KEYS.PAYMENT_CAPTURE, ROUTING_KEYS.PAYMENT_REFUND],
    async (_msg, payload) => {
      const command = payload as CapturePaymentCommand | RefundPaymentCommand;

      if (command.type === 'payment.capture') {
        await handleCapturePayment(command);
      } else if (command.type === 'payment.refund') {
        await handleRefundPayment(command);
      }
    },
  );

  log.info('Payment Service ready');
}

async function handleCapturePayment(
  command: CapturePaymentCommand,
): Promise<void> {
  log.info('Processing capture');

  // --- Idempotency check ---
  // If this command was already processed (e.g., retried after a crash),
  // re-emit the same signal without re-executing the workflow.
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, status FROM transactions WHERE order_id = ? AND status IN ('captured', 'failed') LIMIT 1`,
    )
    .get(command.orderId) as { id: string; status: string } | undefined;

  if (existing) {
    log.info('Idempotent: order already processed', { status: existing.status });
    if (existing.status === 'captured') {
      publishSignal({
        type: 'payment.captured',
        orderId: command.orderId,
        transactionId: existing.id,
      } satisfies PaymentCapturedSignal);
    } else {
      publishSignal({
        type: 'payment.failed',
        orderId: command.orderId,
        reason: 'Previously failed (idempotent replay)',
      } satisfies PaymentFailedSignal);
    }
    return;
  }

  // Domain events are raised by task callbacks (commit first, publish after).
  // The saga signal handler reacts to those events and sends the reply signal.
  await PaymentWorkflow.execute({
    orderId: command.orderId,
    amount: command.amount,
    currency: command.currency,
    paymentMethod: command.paymentMethod,
  });
}

async function handleRefundPayment(
  command: RefundPaymentCommand,
): Promise<void> {
  log.info('Processing refund');

  // Domain events raised by task callback → signal handler emits reply
  await RefundPaymentTask.execute({
    orderId: command.orderId,
    transactionId: command.transactionId,
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectRabbit();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await disconnectRabbit();
  process.exit(0);
});

bootstrap().catch((err) => {
  log.error('Fatal error', { err });
  process.exit(1);
});
