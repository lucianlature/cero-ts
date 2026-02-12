/**
 * WorkflowRecovery - Recovers in-flight durable workflows on process startup.
 *
 * On application restart, queries the WorkflowStore for all active workflows
 * and resumes each one by replaying its event log from the last checkpoint.
 *
 * Requires a WorkflowRegistry that maps workflow type names to their class
 * constructors, so the correct class can be instantiated for each workflow.
 *
 * @example
 * ```typescript
 * import { WorkflowRecovery, InMemoryWorkflowStore } from 'cero-ts/durable';
 *
 * const store = new InMemoryWorkflowStore();
 * const registry = new Map([
 *   ['OrderSaga', OrderSaga],
 *   ['PaymentWorkflow', PaymentWorkflow],
 * ]);
 *
 * const recovery = new WorkflowRecovery(store, registry);
 *
 * // On startup, recover all in-flight workflows
 * const handles = await recovery.recoverAll();
 * console.log(`Recovered ${handles.length} workflows`);
 * ```
 */

import type { DurableWorkflowHandle } from './handle.js';
import type { DurableWorkflow } from './workflow.js';
import type { WorkflowStore, WorkflowRegistry, ActiveWorkflowInfo, DurableRecoverOptions } from './types.js';

export class WorkflowRecovery {
  private readonly _store: WorkflowStore;
  private readonly _registry: WorkflowRegistry;

  constructor(store: WorkflowStore, registry: WorkflowRegistry) {
    this._store = store;
    this._registry = registry;
  }

  /**
   * Recover all active (in-flight) workflows from the store.
   *
   * For each active workflow:
   * 1. Loads the event log and latest checkpoint
   * 2. Instantiates the correct workflow class from the registry
   * 3. Replays from the checkpoint, delivering logged signals
   * 4. Resumes live execution from where it left off
   *
   * Workflows with unknown types (not in the registry) are skipped with a warning.
   *
   * @returns Array of DurableWorkflowHandle instances for recovered workflows
   */
  async recoverAll(): Promise<DurableWorkflowHandle[]> {
    const activeWorkflows = await this._store.listActiveWorkflows();
    const handles: DurableWorkflowHandle[] = [];

    for (const info of activeWorkflows) {
      const handle = await this._recoverOne(info);
      if (handle) {
        handles.push(handle);
      }
    }

    return handles;
  }

  /**
   * Recover a specific workflow by ID.
   *
   * @param workflowId - The workflow instance ID to recover
   * @returns A DurableWorkflowHandle, or null if not found or type unknown
   */
  async recover(workflowId: string): Promise<DurableWorkflowHandle | null> {
    const activeWorkflows = await this._store.listActiveWorkflows();
    const info = activeWorkflows.find((w) => w.workflowId === workflowId);

    if (!info) {
      return null;
    }

    return this._recoverOne(info);
  }

  /**
   * Get the list of active workflows that would be recovered.
   * Useful for inspection before triggering recovery.
   */
  async listRecoverable(): Promise<ActiveWorkflowInfo[]> {
    return this._store.listActiveWorkflows();
  }

  /** Recover a single workflow from its active info */
  private async _recoverOne(info: ActiveWorkflowInfo): Promise<DurableWorkflowHandle | null> {
    const WorkflowClass = this._registry.get(info.workflowType);

    if (!WorkflowClass) {
      console.warn(
        `[WorkflowRecovery] Unknown workflow type '${info.workflowType}' ` +
        `for workflow '${info.workflowId}'. Skipping. ` +
        `Register it in the WorkflowRegistry to enable recovery.`,
      );
      return null;
    }

    // Load events and checkpoint
    const [events, checkpoint] = await Promise.all([
      this._store.getEvents(info.workflowId),
      this._store.getLatestCheckpoint(info.workflowId),
    ]);

    // Use the static recover method on the workflow class
    // We cast through unknown because the registry stores abstract class constructors,
    // but recover() requires a concrete constructor. The workflow classes in the
    // registry are always concrete (users don't register abstract classes).
    const RecoverableClass = WorkflowClass as unknown as {
      recover(options: DurableRecoverOptions): Promise<DurableWorkflowHandle>;
    };

    return RecoverableClass.recover({
      store: this._store,
      workflowId: info.workflowId,
      events,
      checkpoint,
    });
  }
}
