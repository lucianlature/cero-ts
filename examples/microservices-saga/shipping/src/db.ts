// ---------------------------------------------------------------------------
// Shipping SQLite database — shipments.db
// ---------------------------------------------------------------------------

import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, runMigration, resolveDbPath, createServiceLogger } from '@saga/shared';

const log = createServiceLogger('shipping');
let db: DatabaseSync | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS shipments (
    id              TEXT PRIMARY KEY,
    order_id        TEXT NOT NULL,
    carrier         TEXT NOT NULL,
    tracking_number TEXT NOT NULL UNIQUE,
    label_url       TEXT,
    status          TEXT NOT NULL DEFAULT 'created',
    address         TEXT NOT NULL,         -- JSON
    expedited       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
  CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_number);
`;

export function initDb(): DatabaseSync {
  const dbPath = resolveDbPath('shipments.db');
  db = openDatabase(dbPath);
  runMigration(db, SCHEMA);
  log.info('Database initialized', { dbPath });
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return db;
}
