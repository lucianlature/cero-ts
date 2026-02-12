// ---------------------------------------------------------------------------
// WorkflowHandle registry — maps orderId to active durable handles
// ---------------------------------------------------------------------------

import type { DurableWorkflowHandle } from 'cero-ts/durable';
import type { OrderSagaContext } from './workflows/order-saga.workflow.js';
import { SqliteWorkflowStore } from './stores/sqlite-workflow-store.js';
import { getDb } from './db.js';

// ---- Workflow store singleton (SQLite-backed) ----

let workflowStore: SqliteWorkflowStore | null = null;

export function getWorkflowStore(): SqliteWorkflowStore {
  if (!workflowStore) {
    workflowStore = new SqliteWorkflowStore(getDb());
  }
  return workflowStore;
}

// ---- Active handle registry (orderId → DurableWorkflowHandle) ----

const activeHandles = new Map<string, DurableWorkflowHandle<OrderSagaContext>>();

export function registerHandle(
  orderId: string,
  handle: DurableWorkflowHandle<OrderSagaContext>,
): void {
  activeHandles.set(orderId, handle);

  // Clean up completed workflows after result resolves
  handle.result().finally(() => {
    // Keep for a while so queries can still read final state
    setTimeout(() => activeHandles.delete(orderId), 60_000);
  });
}

export function getHandle(
  orderId: string,
): DurableWorkflowHandle<OrderSagaContext> | undefined {
  return activeHandles.get(orderId);
}

export function getAllHandles(): Map<
  string,
  DurableWorkflowHandle<OrderSagaContext>
> {
  return activeHandles;
}
