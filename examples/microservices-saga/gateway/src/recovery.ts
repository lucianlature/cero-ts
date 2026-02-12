// ---------------------------------------------------------------------------
// Saga Recovery — recover in-flight sagas using cero-ts/durable
// ---------------------------------------------------------------------------
//
// On startup, the gateway uses WorkflowRecovery to find all active workflows
// in the SQLite-backed WorkflowStore and resume them via deterministic replay.
//
// Each recovered workflow:
//   1. Loads its event log and latest checkpoint from SQLite
//   2. Replays completed steps (skipping execution)
//   3. Re-delivers logged signals to reconstruct state
//   4. Resumes live execution from where it left off
//
// This replaces the previous manual recovery that read saga_steps and ran
// compensations. Now, the workflow itself handles compensation as part of
// its normal execution flow — if it was mid-saga when the process died,
// replay catches up and the workflow continues (or compensates) naturally.
// ---------------------------------------------------------------------------

import { WorkflowRecovery } from 'cero-ts/durable';
import type { WorkflowRegistry } from 'cero-ts/durable';
import { createServiceLogger } from '@saga/shared';
import { OrderSagaWorkflow } from './workflows/order-saga.workflow.js';
import { getWorkflowStore, registerHandle } from './store.js';

const log = createServiceLogger('gateway');

// Registry: maps workflow class names to their constructors
const registry: WorkflowRegistry = new Map([
  ['OrderSagaWorkflow', OrderSagaWorkflow],
]);

/**
 * Recover all in-flight sagas from a previous process lifecycle.
 *
 * Call AFTER connectRabbit() (so resumed workflows can publish commands)
 * and AFTER initDb() (so the workflow store can read events).
 */
export async function recoverInFlightSagas(): Promise<void> {
  const store = getWorkflowStore();
  const recovery = new WorkflowRecovery(store, registry);

  const recoverable = await recovery.listRecoverable();

  if (recoverable.length === 0) {
    log.info('No in-flight sagas to recover');
    return;
  }

  log.info('Recovering in-flight sagas', { count: recoverable.length });

  const handles = await recovery.recoverAll();

  // Re-register handles so signal routing works for recovered workflows.
  // The orderId is stored in the workflow's context (persisted in the checkpoint).
  for (const handle of handles) {
    const checkpoint = await store.getLatestCheckpoint(handle.workflowId);
    const orderId = (checkpoint?.context?.orderId as string) ?? handle.workflowId;

    registerHandle(orderId, handle);
    log.info('Recovered saga', { orderId, workflowId: handle.workflowId });
  }

  log.info('Recovery complete', { recovered: handles.length });
}
