// ---------------------------------------------------------------------------
// Gateway SQLite database — orders.db
// ---------------------------------------------------------------------------

import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, runMigration, resolveDbPath, createServiceLogger } from '@saga/shared';

const log = createServiceLogger('gateway');

let db: DatabaseSync | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    items           TEXT NOT NULL,         -- JSON array
    shipping_address TEXT NOT NULL,        -- JSON object
    total_amount    REAL NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'USD',
    payment_method  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    saga_state      TEXT NOT NULL DEFAULT 'created',
    expedited       INTEGER NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saga_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL,
    service     TEXT NOT NULL,
    task        TEXT NOT NULL,
    event       TEXT NOT NULL,             -- started | success | failed | skipped
    duration_ms REAL,
    metadata    TEXT,                      -- JSON
    timestamp   TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_saga_events_order ON saga_events(order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

  -- Durable workflow event log (cero-ts/durable).
  -- Every state transition is persisted here as an immutable event.
  -- On crash recovery, events are replayed to reconstruct workflow state.
  CREATE TABLE IF NOT EXISTS workflow_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id   TEXT NOT NULL,
    sequence      INTEGER NOT NULL,
    type          TEXT NOT NULL,
    data          TEXT NOT NULL,
    timestamp     INTEGER NOT NULL,
    UNIQUE(workflow_id, sequence)
  );

  CREATE INDEX IF NOT EXISTS idx_wf_events_wid
    ON workflow_events(workflow_id, sequence);

  -- Durable workflow checkpoints — periodic state snapshots for fast recovery.
  CREATE TABLE IF NOT EXISTS workflow_checkpoints (
    workflow_id   TEXT PRIMARY KEY,
    data          TEXT NOT NULL,
    sequence      INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );

  -- Active (in-flight) workflows — removed on completion.
  CREATE TABLE IF NOT EXISTS workflow_active (
    workflow_id   TEXT PRIMARY KEY,
    workflow_type TEXT NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
`;

export function initDb(): DatabaseSync {
  const dbPath = resolveDbPath('orders.db');
  db = openDatabase(dbPath);
  runMigration(db, SCHEMA);
  log.info('Database initialized', { dbPath });
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error('[gateway] Database not initialized — call initDb() first');
  }
  return db;
}
