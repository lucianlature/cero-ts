// ---------------------------------------------------------------------------
// @saga/shared — barrel exports
// ---------------------------------------------------------------------------

// Event / command / signal contracts
export type {
  OrderItem,
  ShippingAddress,
  ReserveInventoryCommand,
  ReleaseInventoryCommand,
  CapturePaymentCommand,
  RefundPaymentCommand,
  CreateShipmentCommand,
  SagaCommand,
  InventoryReservedSignal,
  InventoryReleasedSignal,
  InventoryFailedSignal,
  PaymentCapturedSignal,
  PaymentFailedSignal,
  PaymentRefundedSignal,
  ShipmentCreatedSignal,
  ShipmentFailedSignal,
  SagaSignal,
  SagaAuditEvent,
} from './events.js';

export { QUEUES, EXCHANGES, ROUTING_KEYS } from './events.js';

// RabbitMQ helpers
export {
  connectRabbit,
  getChannel,
  publishCommand,
  publishSignal,
  publishAuditEvent,
  consumeQueue,
  consumeFanoutQueue,
  disconnectRabbit,
  isConnected,
} from './rabbit.js';

// SQLite helpers
export {
  openDatabase,
  runMigration,
  withTransaction,
  resolveDbPath,
} from './database.js';

// Middleware
export { RabbitAuditMiddleware } from './middleware.js';
export type { AuditMiddlewareOptions } from './middleware.js';

// Structured logger
export { StructuredLogger, createServiceLogger } from './logger.js';
export type { LogLevel, LogContext } from './logger.js';

// Request-scoped context (AsyncLocalStorage)
export { runInContext, getRequestContext, enterContext } from './context.js';
export type { RequestContext } from './context.js';

// Domain event bus
export { DomainEventBus, domainEvents } from './domain-events.js';
export type { DomainEvent } from './domain-events.js';
