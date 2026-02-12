// ---------------------------------------------------------------------------
// Order REST routes — Hono router
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { FailFault, SkipFault } from 'cero-ts';
import { createServiceLogger, runInContext } from '@saga/shared';
import {
  OrderSagaWorkflow,
  sagaStatusQuery,
  sagaDetailsQuery,
} from '../workflows/order-saga.workflow.js';
import { registerHandle, getHandle, getWorkflowStore } from '../store.js';
import { getDb } from '../db.js';

const log = createServiceLogger('gateway');

export function createOrderRoutes(): Hono {
  const app = new Hono();

  // POST /api/orders — Create order and start saga
  app.post('/', async (c) => {
    try {
      const {
        customerId,
        items,
        totalAmount,
        currency,
        paymentMethod,
        shippingAddress,
        expedited,
        notes,
      } = await c.req.json();

      // Start a durable workflow — persists events and checkpoints to SQLite
      const store = getWorkflowStore();
      const handle = OrderSagaWorkflow.startDurable(
        {
          customerId,
          items,
          totalAmount,
          currency,
          paymentMethod,
          shippingStreet: shippingAddress?.street,
          shippingCity: shippingAddress?.city,
          shippingState: shippingAddress?.state,
          shippingPostalCode: shippingAddress?.postalCode,
          shippingCountry: shippingAddress?.country,
          expedited,
          notes,
        },
        { store },
      );

      // Poll for orderId — available once validation completes.
      // Register the handle BEFORE any command is dispatched to prevent
      // the race condition where a signal arrives before the handle exists.
      let orderId: string | undefined;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 5));
        if (handle.completed && handle.finalResult?.failed) break;
        try {
          orderId = handle.query(sagaDetailsQuery).orderId;
          if (orderId) break;
        } catch {
          // Query handler not yet registered — keep polling
        }
      }

      // If the workflow already failed (validation), return the error
      if (handle.completed && handle.finalResult?.failed) {
        return c.json(
          {
            error: 'Order validation failed',
            reason: handle.finalResult.reason,
            metadata: handle.finalResult.metadata,
          },
          400,
        );
      }

      if (!orderId) {
        return c.json({ error: 'Workflow did not produce an orderId' }, 500);
      }

      // Register handle for signal routing — MUST happen before commands
      // are dispatched by the workflow's work() method
      registerHandle(orderId, handle);

      // Async: log final result when saga completes
      handle.result().then((result) => {
        runInContext({ orderId }, () => {
          result
            .on('success', () => log.info('Order completed successfully'))
            .on('failed', (r) => log.info('Order failed', { reason: r.reason }))
            .on('skipped', (r) => log.info('Order skipped', { reason: r.reason }));
        });
      });

      return c.json(
        {
          orderId,
          status: 'processing',
          message: 'Order saga started. Query status for updates.',
        },
        202,
      );
    } catch (err) {
      if (err instanceof FailFault) {
        return c.json(
          {
            error: 'Order validation failed',
            reason: err.result.reason,
            metadata: err.result.metadata,
          },
          400,
        );
      }
      if (err instanceof SkipFault) {
        return c.json(
          { error: 'Order skipped', reason: err.result.reason },
          422,
        );
      }

      const message = err instanceof Error ? err.message : 'Internal server error';
      log.error('Error creating order', { err });
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/orders — List all orders
  app.get('/', (c) => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, customer_id, total_amount, currency, status, saga_state, created_at, updated_at
           FROM orders ORDER BY created_at DESC LIMIT 50`,
        )
        .all();

      return c.json({ orders: rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/orders/:id — Get order details (DB + live saga state)
  app.get('/:id', (c) => {
    try {
      const id = c.req.param('id');
      const db = getDb();
      const row = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id) as Record<string, unknown> | undefined;

      if (!row) {
        return c.json({ error: 'Order not found' }, 404);
      }

      // Enrich with live saga state if workflow is active
      const handle = getHandle(id);
      let liveState = null;
      if (handle && !handle.completed) {
        try {
          liveState = handle.query(sagaDetailsQuery);
        } catch {
          // Query handler not yet registered
        }
      }

      return c.json({
        order: {
          ...row,
          items: JSON.parse(row['items'] as string),
          shipping_address: JSON.parse(row['shipping_address'] as string),
        },
        liveState,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/orders/:id/status — Query live saga status
  app.get('/:id/status', (c) => {
    try {
      const id = c.req.param('id');
      const handle = getHandle(id);

      if (!handle) {
        // Fall back to DB
        const db = getDb();
        const row = db
          .prepare('SELECT saga_state FROM orders WHERE id = ?')
          .get(id) as Record<string, unknown> | undefined;

        if (!row) {
          return c.json({ error: 'Order not found' }, 404);
        }

        return c.json({
          orderId: id,
          status: row['saga_state'],
          source: 'database',
          completed: true,
        });
      }

      if (handle.completed) {
        const result = handle.finalResult;
        return c.json({
          orderId: id,
          status: result?.success ? 'completed' : result?.failed ? 'failed' : 'skipped',
          reason: result?.reason,
          source: 'workflow',
          completed: true,
        });
      }

      const status = handle.query(sagaStatusQuery);
      return c.json({
        orderId: id,
        status,
        source: 'workflow',
        completed: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/orders/:id/steps — Durable saga step history (from event log)
  //
  // Transforms raw durable events into the SagaStep[] format the dashboard
  // expects:  { step_name, status, result_data, started_at, completed_at }
  //
  // Compensation detection: if a `compensate_<stepName>` step completed,
  // the original step is marked as 'compensated'.
  app.get('/:id/steps', async (c) => {
    try {
      const id = c.req.param('id');

      // Collect raw durable events from the handle or the store
      let rawEvents: Array<{ type: string; step?: string; result?: unknown; error?: string; timestamp: number }> = [];

      const handle = getHandle(id);
      if (handle) {
        const events = await handle.events();
        rawEvents = events.filter(
          (e) => e.type === 'step.scheduled' || e.type === 'step.completed' || e.type === 'step.failed',
        ) as typeof rawEvents;
      } else {
        // Fall back to querying the workflow store directly
        const store = getWorkflowStore();
        const db = getDb();
        const rows = db
          .prepare(
            `SELECT DISTINCT we.workflow_id FROM workflow_events we
             WHERE we.data LIKE ?
             LIMIT 1`,
          )
          .all(`%"orderId":"${id}"%`) as Array<{ workflow_id: string }>;

        if (rows.length > 0 && rows[0]) {
          const events = await store.getEvents(rows[0].workflow_id);
          rawEvents = events.filter(
            (e) => e.type === 'step.scheduled' || e.type === 'step.completed' || e.type === 'step.failed',
          ) as typeof rawEvents;
        }
      }

      if (rawEvents.length === 0) {
        return c.json({ orderId: id, steps: [], source: 'not_found' });
      }

      // ── Transform durable events → SagaStep[] ──────────────────────
      interface StepAcc {
        step_name: string;
        status: 'started' | 'completed' | 'failed' | 'compensated';
        result_data: Record<string, unknown> | null;
        started_at: string | null;
        completed_at: string | null;
      }

      const stepAccMap = new Map<string, StepAcc>();

      for (const e of rawEvents) {
        const name = e.step ?? '';
        if (!name) continue;

        if (!stepAccMap.has(name)) {
          stepAccMap.set(name, {
            step_name: name,
            status: 'started',
            result_data: null,
            started_at: null,
            completed_at: null,
          });
        }
        const acc = stepAccMap.get(name)!;

        switch (e.type) {
          case 'step.scheduled':
            acc.started_at = new Date(e.timestamp).toISOString();
            acc.status = 'started';
            break;
          case 'step.completed':
            acc.completed_at = new Date(e.timestamp).toISOString();
            acc.status = 'completed';
            if (e.result && typeof e.result === 'object' && !Array.isArray(e.result)) {
              acc.result_data = e.result as Record<string, unknown>;
            }
            break;
          case 'step.failed':
            acc.completed_at = new Date(e.timestamp).toISOString();
            acc.status = 'failed';
            if (e.error) {
              acc.result_data = { error: e.error };
            }
            break;
        }
      }

      // Detect compensation: if `compensate_<name>` completed → mark original as 'compensated'
      for (const [name, acc] of stepAccMap) {
        if (name.startsWith('compensate_') && acc.status === 'completed') {
          const originalName = name.slice('compensate_'.length);
          const original = stepAccMap.get(originalName);
          if (original) {
            original.status = 'compensated';
          }
        }
      }

      // Build ordered list: main steps first (in saga order), then compensation steps
      const SAGA_ORDER = ['inventory_reserve', 'payment_capture', 'shipping_create'];
      const ordered: StepAcc[] = [];

      for (const name of SAGA_ORDER) {
        const acc = stepAccMap.get(name);
        if (acc) ordered.push(acc);
      }
      // Append compensation steps
      for (const [name, acc] of stepAccMap) {
        if (name.startsWith('compensate_')) {
          ordered.push(acc);
        }
      }
      // Append any remaining steps not yet included
      for (const [name, acc] of stepAccMap) {
        if (!SAGA_ORDER.includes(name) && !name.startsWith('compensate_')) {
          ordered.push(acc);
        }
      }

      return c.json({ orderId: id, steps: ordered, source: 'durable_events' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/orders/:id/timeline — Full event trail for an order
  app.get('/:id/timeline', (c) => {
    try {
      const id = c.req.param('id');
      const db = getDb();
      const events = db
        .prepare(
          `SELECT * FROM saga_events
           WHERE order_id = ?
           ORDER BY timestamp ASC`,
        )
        .all(id) as Array<Record<string, unknown>>;

      return c.json({
        orderId: id,
        events: events.map((e) => ({
          ...e,
          metadata: e['metadata'] ? JSON.parse(e['metadata'] as string) : null,
        })),
        count: events.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
