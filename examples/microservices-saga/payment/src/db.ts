// ---------------------------------------------------------------------------
// Payment SQLite database — payments.db
// ---------------------------------------------------------------------------

import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, runMigration, resolveDbPath, createServiceLogger } from '@saga/shared';

const log = createServiceLogger('payment');
let db: DatabaseSync | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    order_id        TEXT NOT NULL,
    amount          REAL NOT NULL,
    currency        TEXT NOT NULL,
    payment_method  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    gateway_ref     TEXT,
    error_reason    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
`;

export function initDb(): DatabaseSync {
  const dbPath = resolveDbPath('payments.db');
  db = openDatabase(dbPath);
  runMigration(db, SCHEMA);
  log.info('Database initialized', { dbPath });
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error('[payment] Database not initialized — call initDb() first');
  }
  return db;
}
