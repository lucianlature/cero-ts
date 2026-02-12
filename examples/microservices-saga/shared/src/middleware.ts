// ---------------------------------------------------------------------------
// RabbitAuditMiddleware — publishes task lifecycle events to saga.audit
// ---------------------------------------------------------------------------
// cero-ts features: Custom MiddlewareFunction, wraps every task execution,
//   captures start/success/fail/skip with timing data.
//
// Each service registers this globally via configure().
// The gateway's event-collector consumes from the audit exchange.
// ---------------------------------------------------------------------------

import type { Task } from 'cero-ts';
import { publishAuditEvent, isConnected } from './rabbit.js';
import type { SagaAuditEvent } from './events.js';

export interface AuditMiddlewareOptions {
  service: string;
}

/**
 * Middleware factory: returns a cero-ts MiddlewareFunction that publishes
 * audit events to the saga.audit RabbitMQ exchange.
 */
export function RabbitAuditMiddleware(
  task: Task<Record<string, unknown>>,
  options: Record<string, unknown>,
  next: () => Promise<unknown>,
): Promise<unknown> {
  const service = (options['service'] as string) ?? 'unknown';
  const taskName = task.constructor.name;
  const orderId =
    (task.context.orderId as string) ??
    (task as unknown as Record<string, unknown>)['orderId'] as string ??
    'unknown';

  // Emit "started" event
  emitAuditEvent(orderId, service, taskName, 'started');

  const startTime = performance.now();

  return next().then((result) => {
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const status = task.chain.lastResult;
    const event = status?.success
      ? 'success'
      : status?.skipped
        ? 'skipped'
        : status?.failed
          ? 'failed'
          : 'success';

    emitAuditEvent(orderId, service, taskName, event, durationMs, {
      reason: status?.reason,
    });

    return result;
  });
}

function emitAuditEvent(
  orderId: string,
  service: string,
  task: string,
  event: SagaAuditEvent['event'],
  durationMs?: number,
  metadata?: Record<string, unknown>,
): void {
  if (!isConnected()) return;

  const auditEvent: SagaAuditEvent = {
    orderId,
    service,
    task,
    event,
    durationMs,
    metadata,
    timestamp: new Date().toISOString(),
  };

  try {
    const routingKey = `${orderId}.${service}.${event}`;
    publishAuditEvent(routingKey, auditEvent);
  } catch {
    // Don't let audit failures break the task
  }
}
