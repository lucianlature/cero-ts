import { DomainEvent } from '../../domain/shared/domain-event.js';
import { EventBus } from '../../application/ports/event-bus.js';

/**
 * Console Event Bus
 * Logs events to console for demonstration
 * Replace with RabbitMQ, Redis, or other message broker in production
 */
export class ConsoleEventBus implements EventBus {
  private handlers: Map<string, Array<(event: DomainEvent) => Promise<void>>> = new Map();

  async publish(event: DomainEvent): Promise<void> {
    console.log(`[EventBus] Published: ${event.eventName}`, JSON.stringify(event.toJSON(), null, 2));

    // Execute registered handlers
    const eventHandlers = this.handlers.get(event.eventName) ?? [];
    for (const handler of eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[EventBus] Handler error for ${event.eventName}:`, error);
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Subscribe to events (for demonstration)
   */
  subscribe(eventName: string, handler: (event: DomainEvent) => Promise<void>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(eventName: string, handler: (event: DomainEvent) => Promise<void>): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
}
