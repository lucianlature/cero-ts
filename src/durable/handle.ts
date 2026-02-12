/**
 * DurableWorkflowHandle - Handle to a running durable workflow.
 *
 * Extends the base WorkflowHandle with access to the durable execution
 * context, providing event history and checkpoint access.
 *
 * @example
 * ```typescript
 * const handle = OrderSaga.startDurable({ orderId: '123' }, { store });
 *
 * // Same API as WorkflowHandle
 * handle.signal(inventorySignal, { reserved: true });
 * const status = handle.query(statusQuery);
 * const result = await handle.result();
 *
 * // Durable-specific: access event history
 * const events = await handle.events();
 * ```
 */

import { WorkflowHandle, type MessageReceiver } from '../workflow/handle.js';
import type { Result } from '../result.js';
import type { DurableExecution } from './execution.js';
import type { WorkflowEvent, WorkflowCheckpoint, WorkflowStore } from './types.js';

export class DurableWorkflowHandle<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> extends WorkflowHandle<TContext> {
  /** @internal The durable execution context */
  private readonly _execution: DurableExecution;

  constructor(
    workflowId: string,
    receiver: MessageReceiver,
    resultPromise: Promise<Result<TContext>>,
    execution: DurableExecution,
  ) {
    super(workflowId, receiver, resultPromise);
    this._execution = execution;
  }

  /**
   * Get the full event history for this workflow.
   *
   * Returns all persisted events in sequence order, providing
   * a complete audit trail of every state transition.
   *
   * @param afterSequence - Optional: only return events after this sequence number
   */
  async events(afterSequence?: number): Promise<WorkflowEvent[]> {
    return this._execution['_store'].getEvents(this.workflowId, afterSequence);
  }

  /**
   * Get the latest checkpoint for this workflow.
   *
   * Returns the most recent state snapshot, or null if no checkpoints exist.
   */
  async checkpoint(): Promise<WorkflowCheckpoint | null> {
    return this._execution['_store'].getLatestCheckpoint(this.workflowId);
  }

  /**
   * Get the current event sequence number.
   *
   * This is the sequence of the last event persisted to the store.
   */
  get currentSequence(): number {
    return this._execution.sequence;
  }

  /**
   * Get the set of completed step names.
   */
  get completedSteps(): ReadonlySet<string> {
    return this._execution.completedSteps;
  }

  /**
   * Check if the workflow is currently replaying from the event log.
   *
   * Returns true during recovery when the workflow hasn't yet caught
   * up to the end of the event log.
   */
  get isReplaying(): boolean {
    return this._execution.isReplaying;
  }

  override [Symbol.toStringTag] = 'DurableWorkflowHandle';
}
