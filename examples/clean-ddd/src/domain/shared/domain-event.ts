import { v4 as uuidv4 } from 'uuid';

/**
 * Base class for all domain events
 */
export abstract class DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly payload: T;

  constructor(eventName: string, payload: T) {
    this.eventId = uuidv4();
    this.eventName = eventName;
    this.occurredAt = new Date();
    this.payload = payload;
  }

  toJSON() {
    return {
      eventId: this.eventId,
      eventName: this.eventName,
      occurredAt: this.occurredAt.toISOString(),
      payload: this.payload,
    };
  }
}
