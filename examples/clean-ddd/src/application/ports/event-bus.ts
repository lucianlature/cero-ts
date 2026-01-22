import { DomainEvent } from '../../domain/shared/domain-event.js';

/**
 * Event Bus Port
 * Defines the contract for publishing domain events
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}

// Symbol for dependency injection
export const EVENT_BUS = Symbol('EventBus');
