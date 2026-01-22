import { Entity } from './entity.js';
import { DomainEvent } from './domain-event.js';

/**
 * Base class for aggregate roots
 * Manages domain events and provides identity
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  get domainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents];
  }
}
