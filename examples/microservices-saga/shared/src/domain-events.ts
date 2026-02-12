// ---------------------------------------------------------------------------
// Domain Event Bus — In-process, typed, EventEmitter-based
// ---------------------------------------------------------------------------
//
// Domain events are INTERNAL facts within a single bounded context.
// They represent something that happened in the domain ("PaymentCaptured",
// "StockReserved") and are the source of truth from which all reactions
// (signal emission, projections, notifications) are derived.
//
// This bus uses Node.js EventEmitter, which means:
// - Handlers run synchronously in the order they were registered
// - AsyncLocalStorage context propagates automatically to handlers
//   (as per https://leapcell.io/blog/contextual-clarity-building-a-request-scoped-data-flow-with-eventemitter-and-asynclocalstorage)
// - Decouples "what happened" from "who needs to know"
//
// Layering:
//   Domain Event (fact, internal)  →  raised by Tasks after commit
//   Signal (saga reply, external)  →  emitted by handler reacting to domain event
//   Integration Event (public API) →  (future) filtered version for other contexts
// ---------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

/**
 * Base interface for all domain events.
 *
 * Each bounded context defines its own event types extending this.
 * The `type` field is the discriminator used for handler routing.
 */
export interface DomainEvent {
  /** Discriminator — e.g. 'PaymentCaptured', 'StockReserved' */
  readonly type: string;
  /** When the event occurred (ISO 8601) */
  readonly occurredAt: string;
  /** The aggregate ID that raised this event */
  readonly [key: string]: unknown;
}

/**
 * Typed domain event bus.
 *
 * Each service creates one instance (singleton per process).
 * Tasks raise events after committing to the DB (commit first, publish after).
 * Handlers react to events for side effects (signals, projections, etc.).
 *
 * @example
 * ```ts
 * // In the task's onSuccess callback (after DB commit):
 * domainEvents.raise({
 *   type: 'PaymentCaptured',
 *   orderId: 'ORD-123',
 *   transactionId: 'txn_abc',
 *   amount: 99.99,
 *   currency: 'USD',
 *   occurredAt: new Date().toISOString(),
 * });
 *
 * // In a handler (registered at service startup):
 * domainEvents.on('PaymentCaptured', (event) => {
 *   publishSignal({ type: 'payment.captured', ... });
 * });
 * ```
 */
export class DomainEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Don't limit listeners — a domain event may have many handlers
    this.emitter.setMaxListeners(50);
  }

  /**
   * Raise a domain event.
   *
   * Call this AFTER the DB transaction commits (DDD Boundary #3:
   * "commit first, publish after"). Handlers execute synchronously
   * and inherit the current AsyncLocalStorage context.
   */
  raise<T extends DomainEvent>(event: T): void {
    this.emitter.emit(event.type, event);
  }

  /**
   * Register a handler for a domain event type.
   *
   * Handlers are called synchronously in registration order.
   * Multiple handlers can subscribe to the same event type —
   * this is how you separate signal emission from projections
   * from notifications, each as an independent reaction.
   */
  on<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => void,
  ): void {
    this.emitter.on(eventType, handler);
  }

  /** Remove a specific handler. */
  off<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => void,
  ): void {
    this.emitter.off(eventType, handler);
  }

  /** Remove all handlers (useful for testing). */
  clear(): void {
    this.emitter.removeAllListeners();
  }
}

/**
 * Singleton domain event bus for the current service process.
 *
 * Each microservice (payment, inventory, shipping) runs in its own
 * process, so this is effectively scoped to one bounded context.
 */
export const domainEvents = new DomainEventBus();
