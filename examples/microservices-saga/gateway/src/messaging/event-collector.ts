// ---------------------------------------------------------------------------
// Event Collector — consumes saga.audit events and stores in SQLite
// ---------------------------------------------------------------------------

import { consumeQueue, EXCHANGES, createServiceLogger } from '@saga/shared';
import type { SagaAuditEvent } from '@saga/shared';

const log = createServiceLogger('gateway');
import { getDb } from '../db.js';
import { broadcastEvent } from '../routes/events.js';

const AUDIT_QUEUE = 'gateway.audit.collector';

export async function startEventCollector(): Promise<void> {
  await consumeQueue(
    AUDIT_QUEUE,
    EXCHANGES.AUDIT,
    ['#'], // consume all audit events
    async (_msg, payload) => {
      const event = payload as SagaAuditEvent;

      // Persist to SQLite
      try {
        const db = getDb();
        db.prepare(
          `INSERT INTO saga_events (order_id, service, task, event, duration_ms, metadata, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          event.orderId,
          event.service,
          event.task,
          event.event,
          event.durationMs ?? null,
          event.metadata ? JSON.stringify(event.metadata) : null,
          event.timestamp,
        );
      } catch (err) {
        // Don't fail on audit persistence errors
        log.warn('Audit event persistence error', { err });
      }

      // Broadcast to SSE clients
      broadcastEvent(event);
    },
  );

  log.info('Event collector started');
}
