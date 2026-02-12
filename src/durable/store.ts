/**
 * InMemoryWorkflowStore - In-memory implementation of WorkflowStore.
 *
 * Suitable for development, testing, and prototyping.
 * All data is lost when the process exits.
 *
 * For production use, implement WorkflowStore with a durable backend
 * (SQLite, PostgreSQL, Redis, etc.).
 *
 * @example
 * ```typescript
 * const store = new InMemoryWorkflowStore();
 *
 * const handle = OrderSaga.startDurable({ orderId: '123' }, { store });
 * ```
 */

import type {
  WorkflowEvent,
  WorkflowCheckpoint,
  WorkflowStore,
  ActiveWorkflowInfo,
} from './types.js';

export class InMemoryWorkflowStore implements WorkflowStore {
  /** Events indexed by workflow ID */
  private readonly _events = new Map<string, WorkflowEvent[]>();

  /** Checkpoints indexed by workflow ID */
  private readonly _checkpoints = new Map<string, WorkflowCheckpoint>();

  /** Active (non-completed) workflow metadata */
  private readonly _active = new Map<string, ActiveWorkflowInfo>();

  async appendEvent(workflowId: string, event: WorkflowEvent): Promise<void> {
    let events = this._events.get(workflowId);
    if (!events) {
      events = [];
      this._events.set(workflowId, events);

      // Auto-register as active on first event
      if (event.type === 'workflow.started') {
        this._active.set(workflowId, {
          workflowId,
          workflowType: event.workflowType,
        });
      }
    }
    events.push(event);
  }

  async getEvents(workflowId: string, afterSequence?: number): Promise<WorkflowEvent[]> {
    const events = this._events.get(workflowId) ?? [];
    if (afterSequence !== undefined) {
      return events.filter((e) => e.sequence > afterSequence);
    }
    return [...events];
  }

  async saveCheckpoint(workflowId: string, checkpoint: WorkflowCheckpoint): Promise<void> {
    this._checkpoints.set(workflowId, checkpoint);
  }

  async getLatestCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | null> {
    return this._checkpoints.get(workflowId) ?? null;
  }

  async listActiveWorkflows(): Promise<ActiveWorkflowInfo[]> {
    return [...this._active.values()];
  }

  async markCompleted(workflowId: string): Promise<void> {
    this._active.delete(workflowId);
  }

  // ============================================
  // Utility methods (not part of the interface)
  // ============================================

  /** Get the total number of events across all workflows */
  get totalEvents(): number {
    let total = 0;
    for (const events of this._events.values()) {
      total += events.length;
    }
    return total;
  }

  /** Get the number of active workflows */
  get activeCount(): number {
    return this._active.size;
  }

  /** Clear all stored data */
  clear(): void {
    this._events.clear();
    this._checkpoints.clear();
    this._active.clear();
  }
}
