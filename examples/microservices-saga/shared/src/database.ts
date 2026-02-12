// ---------------------------------------------------------------------------
// SQLite helpers via node:sqlite (Node 24 native — zero dependencies)
// ---------------------------------------------------------------------------

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Open (or create) a SQLite database at the given path.
 * Enables WAL mode for better concurrent read performance.
 */
export function openDatabase(dbPath: string): DatabaseSync {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/**
 * Execute a DDL migration statement (CREATE TABLE, etc.).
 * Wraps in a transaction for atomicity.
 */
export function runMigration(db: DatabaseSync, sql: string): void {
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Execute `fn` inside a BEGIN/COMMIT/ROLLBACK transaction.
 *
 * DDD Transaction Boundary #1 — Aggregate = Transaction:
 * Each call to withTransaction should wrap exactly ONE aggregate mutation.
 * Never span multiple aggregates in a single transaction.
 *
 * @returns The return value of `fn`.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Resolve the database path from env or default.
 * Uses DATA_DIR env var in Docker, falls back to local ./data/ for dev.
 */
export function resolveDbPath(filename: string): string {
  const dataDir = process.env['DATA_DIR'] ?? './data';
  return `${dataDir}/${filename}`;
}
