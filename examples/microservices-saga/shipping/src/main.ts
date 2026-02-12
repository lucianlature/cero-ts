// ---------------------------------------------------------------------------
// Shipping Service — RabbitMQ consumer
// ---------------------------------------------------------------------------

import {
  connectRabbit,
  disconnectRabbit,
  consumeQueue,
  publishSignal,
  domainEvents,
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
  createServiceLogger,
} from '@saga/shared';
import type { CreateShipmentCommand, ShipmentCreatedSignal } from '@saga/shared';
import { registerSagaSignalHandlers } from './handlers/saga-signal.handler.js';
import type { ShipmentFailed } from './domain/events.js';
import { configure } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';
import { RabbitAuditMiddleware } from '@saga/shared';
import { initDb, getDb } from './db.js';
import { ShippingWorkflow } from './workflows/shipping.workflow.js';

const log = createServiceLogger('shipping');

async function bootstrap(): Promise<void> {
  log.info('Starting Shipping Service');

  // Configure cero-ts
  configure((config) => {
    config.taskBreakpoints = ['failed'];
    config.rollbackOn = ['failed'];
    config.middlewares.register(RuntimeMiddleware);
    config.middlewares.register([RabbitAuditMiddleware, { service: 'shipping' }]);
  });

  // Initialize SQLite
  initDb();

  // Connect to RabbitMQ
  await connectRabbit();

  // Register domain event handlers
  registerSagaSignalHandlers();

  // Consume shipping commands
  await consumeQueue(
    QUEUES.SHIPPING_COMMANDS,
    EXCHANGES.COMMANDS,
    [ROUTING_KEYS.SHIPPING_CREATE],
    async (_msg, payload) => {
      const command = payload as CreateShipmentCommand;

      if (command.type === 'shipping.create') {
        await handleCreateShipment(command);
      }
    },
  );

  log.info('Shipping Service ready');
}

async function handleCreateShipment(
  command: CreateShipmentCommand,
): Promise<void> {
  log.info('Processing shipment');

  // --- Idempotency check ---
  // If a shipment was already created for this order, re-emit the signal.
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, tracking_number FROM shipments WHERE order_id = ? AND status != 'cancelled' LIMIT 1`,
    )
    .get(command.orderId) as { id: string; tracking_number: string } | undefined;

  if (existing) {
    log.info('Idempotent: order already shipped', {
      trackingNumber: existing.tracking_number,
    });
    publishSignal({
      type: 'shipment.created',
      orderId: command.orderId,
      shipmentId: existing.id,
      trackingNumber: existing.tracking_number,
    } satisfies ShipmentCreatedSignal);
    return;
  }

  const result = await ShippingWorkflow.execute({
    orderId: command.orderId,
    address: command.address,
    expedited: command.expedited,
    country: command.address.country,
  });

  // Success domain event is raised by CreateLabelTask's onSuccess callback.
  // Failure needs to be raised here since it could come from any workflow task.
  // Guard: only raise failure if no trackingNumber exists in context (meaning
  // business logic truly failed, not a middleware/infrastructure error).
  if (result.failed && !result.context.get('trackingNumber')) {
    domainEvents.raise<ShipmentFailed>({
      type: 'ShipmentFailed',
      orderId: command.orderId,
      reason: result.reason ?? 'Unknown shipping error',
      occurredAt: new Date().toISOString(),
    });
  }
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
