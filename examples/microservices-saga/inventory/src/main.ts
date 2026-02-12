// ---------------------------------------------------------------------------
// Inventory Service — RabbitMQ consumer
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
import type {
  ReserveInventoryCommand,
  ReleaseInventoryCommand,
  InventoryReservedSignal,
} from '@saga/shared';
import type { StockReservationFailed } from './domain/events.js';
import { registerSagaSignalHandlers } from './handlers/saga-signal.handler.js';
import { configure } from 'cero-ts';
import { RuntimeMiddleware } from 'cero-ts/middleware';
import { RabbitAuditMiddleware } from '@saga/shared';
import { initDb, getDb } from './db.js';
import { InventoryWorkflow } from './workflows/inventory.workflow.js';
import { ReleaseStockTask } from './tasks/release-stock.task.js';

const log = createServiceLogger('inventory');

async function bootstrap(): Promise<void> {
  log.info('Starting Inventory Service');

  // Configure cero-ts
  configure((config) => {
    config.taskBreakpoints = ['failed'];
    config.rollbackOn = ['failed'];
    config.middlewares.register(RuntimeMiddleware);
    config.middlewares.register([RabbitAuditMiddleware, { service: 'inventory' }]);
  });

  // Initialize SQLite (with seed data)
  initDb();

  // Connect to RabbitMQ
  await connectRabbit();

  // Register domain event handlers
  registerSagaSignalHandlers();

  // Consume inventory commands
  await consumeQueue(
    QUEUES.INVENTORY_COMMANDS,
    EXCHANGES.COMMANDS,
    [ROUTING_KEYS.INVENTORY_RESERVE, ROUTING_KEYS.INVENTORY_RELEASE],
    async (_msg, payload) => {
      const command = payload as ReserveInventoryCommand | ReleaseInventoryCommand;

      if (command.type === 'inventory.reserve') {
        await handleReserveInventory(command);
      } else if (command.type === 'inventory.release') {
        await handleReleaseInventory(command);
      }
    },
  );

  log.info('Inventory Service ready');
}

async function handleReserveInventory(
  command: ReserveInventoryCommand,
): Promise<void> {
  log.info('Processing reservation');

  // --- Idempotency check ---
  // If stock was already reserved for this order, re-emit the signal.
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM reservations WHERE order_id = ? AND status = 'reserved' LIMIT 1`,
    )
    .get(command.orderId) as { id: string } | undefined;

  if (existing) {
    log.info('Idempotent: order already reserved', { reservationId: existing.id });
    publishSignal({
      type: 'inventory.reserved',
      orderId: command.orderId,
      reservationId: existing.id,
    } satisfies InventoryReservedSignal);
    return;
  }

  // Domain events are raised by tasks (commit first, publish after).
  // The saga signal handler reacts to those events and sends reply signals.
  // However, if the pipeline fails early (e.g., CheckStockTask fails before
  // ReserveStockTask runs), the domain event must be raised here as a fallback.
  const result = await InventoryWorkflow.execute({
    orderId: command.orderId,
    items: command.items,
  });

  if (result.failed) {
    domainEvents.raise<StockReservationFailed>({
      type: 'StockReservationFailed',
      orderId: command.orderId,
      reason: result.reason ?? 'Inventory reservation failed',
      occurredAt: new Date().toISOString(),
    });
  }
}

async function handleReleaseInventory(
  command: ReleaseInventoryCommand,
): Promise<void> {
  log.info('Processing release');

  // Domain events raised by task → signal handler emits reply
  await ReleaseStockTask.execute({
    orderId: command.orderId,
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
