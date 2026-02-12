// ---------------------------------------------------------------------------
// Inventory SQLite database — inventory.db
// ---------------------------------------------------------------------------

import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, runMigration, withTransaction, resolveDbPath, createServiceLogger } from '@saga/shared';

const log = createServiceLogger('inventory');

let db: DatabaseSync | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sku         TEXT NOT NULL UNIQUE,
    stock_level INTEGER NOT NULL DEFAULT 0,
    reserved    INTEGER NOT NULL DEFAULT 0,
    price       REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id          TEXT PRIMARY KEY,
    order_id    TEXT NOT NULL,
    product_id  TEXT NOT NULL,
    quantity    INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'reserved',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_order ON reservations(order_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
`;

const SEED_PRODUCTS = [
  { id: 'PROD-001', name: 'Wireless Headphones', sku: 'WH-100', stock_level: 50, price: 79.99 },
  { id: 'PROD-002', name: 'USB-C Hub', sku: 'USB-HUB-7', stock_level: 120, price: 49.99 },
  { id: 'PROD-003', name: 'Mechanical Keyboard', sku: 'KB-MEC-65', stock_level: 30, price: 149.99 },
  { id: 'PROD-004', name: '4K Monitor', sku: 'MON-4K-27', stock_level: 15, price: 399.99 },
  { id: 'PROD-005', name: 'Laptop Stand', sku: 'LS-ALU-01', stock_level: 200, price: 34.99 },
];

export function initDb(): DatabaseSync {
  const dbPath = resolveDbPath('inventory.db');
  db = openDatabase(dbPath);
  runMigration(db, SCHEMA);
  seedProducts(db);
  log.info('Database initialized', { dbPath });
  return db;
}

function seedProducts(database: DatabaseSync): void {
  const existing = database.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  if (existing.count > 0) return;

  withTransaction(database, () => {
    const stmt = database.prepare(
      'INSERT INTO products (id, name, sku, stock_level, price) VALUES (?, ?, ?, ?, ?)',
    );
    for (const p of SEED_PRODUCTS) {
      stmt.run(p.id, p.name, p.sku, p.stock_level, p.price);
    }
  });
  log.info('Seeded products', { count: SEED_PRODUCTS.length });
}

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return db;
}
