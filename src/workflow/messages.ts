/**
 * Workflow Messages - Signals and Queries for interactive workflows
 *
 * Signals allow external systems to send data into a running workflow.
 * Queries allow external systems to read state from a running workflow.
 *
 * Inspired by Temporal's message-passing patterns.
 *
 * @example
 * ```typescript
 * const approvalSignal = defineSignal<[{ approved: boolean }]>('approval');
 * const statusQuery = defineQuery<string>('status');
 *
 * class ApprovalWorkflow extends Workflow<ApprovalContext> {
 *   async work() {
 *     let status = 'pending';
 *     let approval: { approved: boolean } | undefined;
 *
 *     this.setHandler(approvalSignal, (input) => {
 *       approval = input;
 *       status = input.approved ? 'approved' : 'rejected';
 *     });
 *
 *     this.setHandler(statusQuery, () => status);
 *
 *     const received = await this.condition(() => approval !== undefined, '24h');
 *     if (!received) this.fail('Approval timeout');
 *   }
 * }
 * ```
 */

// ============================================
// Signal Definition
// ============================================

/**
 * Branded type for a signal definition.
 * Signals are fire-and-forget messages that mutate workflow state.
 */
export interface SignalDefinition<Args extends unknown[] = []> {
  /** Unique name identifying this signal */
  readonly name: string;
  /** @internal Brand discriminator */
  readonly _brand: 'Signal';
  /** @internal Type-level argument tracking */
  readonly _args: Args;
}

/**
 * Define a named Signal for sending data into a running workflow.
 *
 * @param name - Unique signal name
 * @returns A typed SignalDefinition
 *
 * @example
 * ```typescript
 * // No arguments
 * const cancelSignal = defineSignal('cancel');
 *
 * // With typed arguments
 * const approveSignal = defineSignal<[{ approved: boolean; approver: string }]>('approve');
 * ```
 */
export function defineSignal<Args extends unknown[] = []>(
  name: string,
): SignalDefinition<Args> {
  return Object.freeze({ name, _brand: 'Signal' }) as SignalDefinition<Args>;
}

// ============================================
// Query Definition
// ============================================

/**
 * Branded type for a query definition.
 * Queries are synchronous reads of workflow state — they must not mutate state.
 */
export interface QueryDefinition<TResult = unknown, Args extends unknown[] = []> {
  /** Unique name identifying this query */
  readonly name: string;
  /** @internal Brand discriminator */
  readonly _brand: 'Query';
  /** @internal Type-level result tracking */
  readonly _result: TResult;
  /** @internal Type-level argument tracking */
  readonly _args: Args;
}

/**
 * Define a named Query for reading state from a running workflow.
 *
 * @param name - Unique query name
 * @returns A typed QueryDefinition
 *
 * @example
 * ```typescript
 * // Simple query
 * const statusQuery = defineQuery<string>('status');
 *
 * // Query with arguments
 * const itemQuery = defineQuery<Item, [id: string]>('getItem');
 * ```
 */
export function defineQuery<TResult = unknown, Args extends unknown[] = []>(
  name: string,
): QueryDefinition<TResult, Args> {
  return Object.freeze({ name, _brand: 'Query' }) as QueryDefinition<TResult, Args>;
}

// ============================================
// Handler Types
// ============================================

/**
 * Handler function for signals.
 * May be sync or async. Return value is ignored.
 */
export type SignalHandler<Args extends unknown[] = []> = (
  ...args: Args
) => void | Promise<void>;

/**
 * Handler function for queries.
 * Must be synchronous — queries are instant reads of current state.
 */
export type QueryHandler<TResult = unknown, Args extends unknown[] = []> = (
  ...args: Args
) => TResult;

// ============================================
// Type Guards
// ============================================

/**
 * Check if a value is a SignalDefinition
 */
export function isSignalDefinition(value: unknown): value is SignalDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_brand' in value &&
    (value as SignalDefinition)._brand === 'Signal'
  );
}

/**
 * Check if a value is a QueryDefinition
 */
export function isQueryDefinition(value: unknown): value is QueryDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_brand' in value &&
    (value as QueryDefinition)._brand === 'Query'
  );
}
