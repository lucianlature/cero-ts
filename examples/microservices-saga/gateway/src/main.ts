// ---------------------------------------------------------------------------
// API Gateway — Hono server + RabbitMQ signal consumer
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connectRabbit, disconnectRabbit, isConnected, createServiceLogger } from '@saga/shared';
import { initDb } from './db.js';

const log = createServiceLogger('gateway');
import { configureCeroTs } from './config.js';
import { startSignalConsumer } from './messaging/signal-consumer.js';
import { startEventCollector } from './messaging/event-collector.js';
import { recoverInFlightSagas } from './recovery.js';
import { createOrderRoutes } from './routes/orders.js';
import { createEventsRoutes } from './routes/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env['GATEWAY_PORT'] ?? 3000);

// Dashboard: serve the pre-built React app from dashboard/dist/
// In Docker, it's copied to /app/dashboard/dist. In dev, it's at ../dashboard/dist.
const dashboardDistDir = existsSync(join(__dirname, '..', '..', 'dashboard', 'dist'))
  ? join(__dirname, '..', '..', 'dashboard', 'dist')
  : join(__dirname, '..', '..', '..', 'dashboard', 'dist'); // workspace root fallback

const dashboardHtml = existsSync(join(dashboardDistDir, 'index.html'))
  ? readFileSync(join(dashboardDistDir, 'index.html'), 'utf-8')
  : '<html><body><h1>Dashboard not built</h1><p>Run <code>npm run build</code> in dashboard/</p></body></html>';

async function bootstrap(): Promise<void> {
  log.info('Starting API Gateway');

  // 1. Configure cero-ts
  configureCeroTs();

  // 2. Initialize SQLite
  initDb();

  // 3. Connect to RabbitMQ
  await connectRabbit();

  // 4. Recover in-flight sagas from previous process lifecycle
  // Must happen after RabbitMQ connects so compensating commands can be published
  await recoverInFlightSagas();

  // 5. Start signal consumer (routes signals to active WorkflowHandles)
  await startSignalConsumer();

  // 6. Start event collector (audit events → SQLite)
  await startEventCollector();

  // 7. Build Hono app
  const app = new Hono();

  // Request logging middleware
  app.use('*', async (c, next) => {
    log.info('Request', { method: c.req.method, url: c.req.path });
    await next();
  });

  // Health check
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'gateway',
      rabbit: isConnected(),
      uptime: process.uptime(),
    }),
  );

  // API info
  app.get('/', (c) =>
    c.json({
      name: 'Microservices Saga — API Gateway (Hono)',
      version: '1.0.0',
      endpoints: {
        'POST /api/orders': 'Create order and start saga',
        'GET /api/orders': 'List all orders',
        'GET /api/orders/:id': 'Get order details',
        'GET /api/orders/:id/status': 'Query live saga status',
        'GET /api/orders/:id/timeline': 'Get saga event timeline',
        'GET /health': 'Health check',
        'GET /dashboard': 'Live saga dashboard',
      },
    }),
  );

  // Dashboard — serve the React SPA and its assets
  app.get('/dashboard', (c) => c.html(dashboardHtml));
  app.get('/dashboard/*', (c) => c.html(dashboardHtml));

  // Serve Vite-built assets (JS, CSS) from dashboard/dist/assets/
  app.get('/assets/*', (c) => {
    const assetPath = join(dashboardDistDir, c.req.path);
    try {
      const content = readFileSync(assetPath);
      const ext = c.req.path.split('.').pop();
      const mimeMap: Record<string, string> = {
        js: 'application/javascript',
        css: 'text/css',
        svg: 'image/svg+xml',
        png: 'image/png',
        woff2: 'font/woff2',
      };
      return c.body(content, 200, {
        'Content-Type': mimeMap[ext ?? ''] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    } catch {
      return c.notFound();
    }
  });

  // Mount routes
  app.route('/api/orders', createOrderRoutes());
  app.route('/api/events', createEventsRoutes());

  // 404
  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  // Global error handler
  app.onError((err, c) => {
    log.error('Unhandled error', { err });
    return c.json({ error: 'Internal server error' }, 500);
  });

  // Start server
  serve({ fetch: app.fetch, port: PORT }, () => {
    log.info('API Gateway listening', { url: `http://localhost:${PORT}` });
    log.info('RabbitMQ Management', { url: 'http://localhost:15672' });
    log.info('Dashboard', { url: `http://localhost:${PORT}/dashboard` });
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info('Shutting down');
  await disconnectRabbit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.info('Shutting down');
  await disconnectRabbit();
  process.exit(0);
});

bootstrap().catch((err) => {
  log.error('Fatal error', { err });
  process.exit(1);
});
