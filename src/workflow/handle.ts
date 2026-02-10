/**
 * WorkflowHandle - External interface for interacting with running workflows
 *
 * Provides the client-facing API to send signals, execute queries,
 * and await the final result of an interactive workflow.
 *
 * @example
 * ```typescript
 * const handle = await ApprovalWorkflow.start({ requestId: '123' });
 *
 * // Query current state
 * const status = handle.query(statusQuery);
 *
 * // Send a signal to mutate state
 * handle.signal(approvalSignal, { approved: true, approver: 'alice' });
 *
 * // Await the final result
 * const result = await handle.result();
 * ```
 */

import type { Result } from '../result.js';
import type { SignalDefinition, QueryDefinition } from './messages.js';

/**
 * Internal interface for workflow instances that support messaging.
 * Used by WorkflowHandle to dispatch signals and queries.
 *
 * @internal
 */
export interface MessageReceiver {
  /** Dispatch a signal to the workflow */
  _receiveSignal(name: string, args: unknown[]): void;
  /** Dispatch a query to the workflow and return the result */
  _receiveQuery(name: string, args: unknown[]): unknown;
}

/**
 * Handle to a running interactive workflow.
 *
 * Created by `Workflow.start()`, this provides the external API for:
 * - Sending Signals to mutate workflow state
 * - Executing Queries to read workflow state
 * - Awaiting the final Result
 *
 * @typeParam TContext - The workflow's context type
 */
export class WorkflowHandle<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The workflow's unique ID */
  readonly workflowId: string;

  /** @internal The workflow instance receiving messages */
  private readonly _receiver: MessageReceiver;

  /** @internal Promise that resolves when the workflow completes */
  private readonly _resultPromise: Promise<Result<TContext>>;

  /** @internal Whether the workflow has completed */
  private _completed = false;

  /** @internal Cached final result */
  private _finalResult?: Result<TContext>;

  constructor(
    workflowId: string,
    receiver: MessageReceiver,
    resultPromise: Promise<Result<TContext>>,
  ) {
    this.workflowId = workflowId;
    this._receiver = receiver;
    this._resultPromise = resultPromise.then((result) => {
      this._completed = true;
      this._finalResult = result;
      return result;
    });
  }

  /**
   * Send a Signal to the running workflow.
   *
   * Signals are asynchronous messages that trigger registered handlers
   * within the workflow, typically mutating its state. After the signal
   * handler runs, all pending `condition()` calls are re-evaluated.
   *
   * @param signal - The signal definition (created via `defineSignal`)
   * @param args - Arguments matching the signal's type signature
   * @throws {Error} If the workflow has already completed
   *
   * @example
   * ```typescript
   * handle.signal(approvalSignal, { approved: true, approver: 'alice' });
   * ```
   */
  signal<Args extends unknown[]>(
    signal: SignalDefinition<Args>,
    ...args: Args
  ): void {
    if (this._completed) {
      throw new Error(
        `Cannot send signal '${signal.name}' to completed workflow '${this.workflowId}'`,
      );
    }
    this._receiver._receiveSignal(signal.name, args);
  }

  /**
   * Execute a Query against the running workflow.
   *
   * Queries are synchronous reads of current workflow state.
   * They must not mutate state and return immediately.
   *
   * Queries can also be sent after the workflow completes (unlike signals),
   * since they only read the final state.
   *
   * @param query - The query definition (created via `defineQuery`)
   * @param args - Arguments matching the query's type signature
   * @returns The query result
   * @throws {Error} If no handler is registered for this query
   *
   * @example
   * ```typescript
   * const status = handle.query(statusQuery); // 'pending'
   * ```
   */
  query<TResult, Args extends unknown[]>(
    query: QueryDefinition<TResult, Args>,
    ...args: Args
  ): TResult {
    return this._receiver._receiveQuery(query.name, args) as TResult;
  }

  /**
   * Await the final result of the workflow execution.
   *
   * @returns Promise that resolves with the workflow's Result
   *
   * @example
   * ```typescript
   * const result = await handle.result();
   * if (result.success) {
   *   console.log('Workflow completed:', result.context);
   * }
   * ```
   */
  result(): Promise<Result<TContext>> {
    return this._resultPromise;
  }

  /**
   * Check if the workflow has completed.
   */
  get completed(): boolean {
    return this._completed;
  }

  /**
   * Get the final result if the workflow has completed, or undefined.
   */
  get finalResult(): Result<TContext> | undefined {
    return this._finalResult;
  }

  [Symbol.toStringTag] = 'WorkflowHandle';
}
