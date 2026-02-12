// ---------------------------------------------------------------------------
// SqliteWorkflowStore — SQLite-backed WorkflowStore for durable workflows
// ---------------------------------------------------------------------------
//
// Implements the cero-ts/durable WorkflowStore interface using Node 24's
// built-in node:sqlite. Events and checkpoints are persisted durably,
// enabling crash recovery via deterministic replay.
// ---------------------------------------------------------------------------

import type { DatabaseSync } from 'node:sqlite';
import type {
  WorkflowEvent,
  WorkflowCheckpoint,
  WorkflowStore,
  ActiveWorkflowInfo,
} from 'cero-ts/durable';

/**
 * Schema for the workflow durability tables.
 * Call `initWorkflowStoreTables(db)` during startup.
 */
export const WORKFLOW_STORE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS workflow_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id   TEXT NOT NULL,
    sequence      INTEGER NOT NULL,
    type          TEXT NOT NULL,
    data          TEXT NOT NULL,         -- full event JSON
    timestamp     INTEGER NOT NULL,
    UNIQUE(workflow_id, sequence)
  );

  CREATE INDEX IF NOT EXISTS idx_wf_events_wid
    ON workflow_events(workflow_id, sequence);

  CREATE TABLE IF NOT EXISTS workflow_checkpoints (
    workflow_id   TEXT PRIMARY KEY,
    data          TEXT NOT NULL,         -- full checkpoint JSON
    sequence      INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflow_active (
    workflow_id   TEXT PRIMARY KEY,
    workflow_type TEXT NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
`;

export class SqliteWorkflowStore implements WorkflowStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async appendEvent(workflowId: string, event: WorkflowEvent): Promise<void> {
    // Auto-register as active on workflow.started
    if (event.type === 'workflow.started') {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO workflow_active (workflow_id, workflow_type, created_at)
           VALUES (?, ?, ?)`,
        )
        .run(workflowId, event.workflowType, Date.now());
    }

    this.db
      .prepare(
        `INSERT INTO workflow_events (workflow_id, sequence, type, data, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(workflowId, event.sequence, event.type, JSON.stringify(event), event.timestamp);
  }

  async getEvents(workflowId: string, afterSequence?: number): Promise<WorkflowEvent[]> {
    const rows = afterSequence !== undefined
      ? (this.db
          .prepare(
            `SELECT data FROM workflow_events
             WHERE workflow_id = ? AND sequence > ?
             ORDER BY sequence ASC`,
          )
          .all(workflowId, afterSequence) as Array<{ data: string }>)
      : (this.db
          .prepare(
            `SELECT data FROM workflow_events
             WHERE workflow_id = ?
             ORDER BY sequence ASC`,
          )
          .all(workflowId) as Array<{ data: string }>);

    return rows.map((r) => JSON.parse(r.data) as WorkflowEvent);
  }

  async saveCheckpoint(workflowId: string, checkpoint: WorkflowCheckpoint): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO workflow_checkpoints (workflow_id, data, sequence, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(workflowId, JSON.stringify(checkpoint), checkpoint.sequence, checkpoint.createdAt);
  }

  async getLatestCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null> {
    const row = this.db
      .prepare(`SELECT data FROM workflow_checkpoints WHERE workflow_id = ?`)
      .get(workflowId) as { data: string } | undefined;

    return row ? (JSON.parse(row.data) as WorkflowCheckpoint) : null;
  }

  async listActiveWorkflows(): Promise<ActiveWorkflowInfo[]> {
    const rows = this.db
      .prepare(`SELECT workflow_id, workflow_type FROM workflow_active ORDER BY created_at ASC`)
      .all() as Array<{ workflow_id: string; workflow_type: string }>;

    return rows.map((r) => ({
      workflowId: r.workflow_id,
      workflowType: r.workflow_type,
    }));
  }

  async markCompleted(workflowId: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM workflow_active WHERE workflow_id = ?`)
      .run(workflowId);
  }
}
