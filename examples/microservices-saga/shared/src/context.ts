// ---------------------------------------------------------------------------
// Request-scoped context via AsyncLocalStorage
// ---------------------------------------------------------------------------
//
// Implements the pattern from:
// https://leapcell.io/blog/contextual-clarity-building-a-request-scoped-data-flow-with-eventemitter-and-asynclocalstorage
//
// Context is set ONCE at the boundary (HTTP request or RabbitMQ message arrival)
// and automatically propagates through the entire async chain — including
// EventEmitter listeners, setTimeout callbacks, and promise chains.
//
// No explicit parameter drilling needed. Any code downstream can call
// getRequestContext() to retrieve the current orderId, service, etc.
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped context that propagates through the async chain.
 * Set once at the entry boundary, available everywhere downstream.
 */
export interface RequestContext {
  /** The order ID — acts as the distributed trace ID across all services */
  orderId?: string;
  /** The service that set the context */
  service?: string;
  /** Additional context fields (e.g., customerId, requestId) */
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request-scoped context.
 *
 * Call this at entry boundaries:
 * - HTTP middleware: `runInContext({ orderId, service }, () => next())`
 * - RabbitMQ consumer: `runInContext({ orderId, service }, () => handler(msg))`
 *
 * Everything downstream — including EventEmitter listeners — automatically
 * inherits the context without explicit parameter passing.
 */
export function runInContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Get the current request context from AsyncLocalStorage.
 * Returns an empty object if called outside of `runInContext()`.
 *
 * Safe to call anywhere — tasks, middleware, EventEmitter listeners,
 * promise chains, setTimeout callbacks, etc.
 */
export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}

/**
 * Set context for the current async execution and all continuations.
 * Use at the start of long-lived async methods (like workflow.work())
 * where wrapping in runInContext() is impractical.
 */
export function enterContext(ctx: RequestContext): void {
  storage.enterWith(ctx);
}
