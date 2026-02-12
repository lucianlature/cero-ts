// ---------------------------------------------------------------------------
// SSE events stream — Hono router
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SagaAuditEvent } from '@saga/shared';

// Active SSE write callbacks
type SSEWriter = (data: string) => void;
const clients: Set<SSEWriter> = new Set();

export function createEventsRoutes(): Hono {
  const app = new Hono();

  // GET /api/events/stream — SSE endpoint for real-time saga events
  app.get('/stream', (c) => {
    return streamSSE(c, async (stream) => {
      // Send keepalive
      await stream.writeSSE({ data: '', event: 'keepalive' });

      // Register this client
      const writer: SSEWriter = (data) => {
        stream.writeSSE({ data, event: 'saga-event' }).catch(() => {
          // Client disconnected — cleaned up by onAbort
        });
      };
      clients.add(writer);

      // Remove on disconnect
      stream.onAbort(() => {
        clients.delete(writer);
      });

      // Keep the stream open until the client disconnects
      while (true) {
        await stream.sleep(30_000);
        await stream.writeSSE({ data: '', event: 'keepalive' });
      }
    });
  });

  return app;
}

/** Broadcast an audit event to all connected SSE clients. */
export function broadcastEvent(event: SagaAuditEvent): void {
  const data = JSON.stringify(event);
  for (const writer of clients) {
    writer(data);
  }
}
