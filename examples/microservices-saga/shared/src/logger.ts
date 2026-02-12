// ---------------------------------------------------------------------------
// Structured Logger — JSON output with automatic context from AsyncLocalStorage
// ---------------------------------------------------------------------------
//
// Combines two patterns:
//
// 1. Pino + OpenTelemetry (structured JSON with trace context):
//    https://leapcell.io/blog/weaving-observability-traces-and-logs-in-node-js
//
// 2. AsyncLocalStorage for implicit context propagation:
//    https://leapcell.io/blog/contextual-clarity-building-a-request-scoped-data-flow-with-eventemitter-and-asynclocalstorage
//
// The logger auto-reads orderId (and any other fields) from the current
// AsyncLocalStorage context. No `.child({ orderId })` needed — just call
// `log.info('...')` and the orderId appears in the JSON output automatically.
//
// Filter a single order's journey across ALL four services:
//   docker compose logs --no-log-prefix | jq 'select(.orderId == "ORD-123")'
// ---------------------------------------------------------------------------

import { getRequestContext } from './context.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogContext {
  service?: string;
  orderId?: string;
  [key: string]: unknown;
}

/**
 * Structured JSON logger that auto-enriches from AsyncLocalStorage.
 *
 * Usage:
 * ```ts
 * const log = createServiceLogger('payment');
 *
 * // Outside any request context:
 * log.info('Service started');
 * // → {"level":"info","service":"payment","msg":"Service started","timestamp":"..."}
 *
 * // Inside runInContext({ orderId: 'ORD-123', service: 'payment' }, () => { ... }):
 * log.info('Captured payment', { amount: 99.99 });
 * // → {"level":"info","service":"payment","orderId":"ORD-123","msg":"Captured payment","amount":99.99,"timestamp":"..."}
 * ```
 *
 * No `.child()` calls needed — orderId propagates automatically via AsyncLocalStorage.
 */
export class StructuredLogger {
  private readonly staticContext: LogContext;
  private readonly minLevel: LogLevel;

  constructor(staticContext: LogContext = {}, minLevel?: LogLevel) {
    this.staticContext = staticContext;
    this.minLevel = minLevel ?? (process.env['LOG_LEVEL'] as LogLevel) ?? 'info';
  }

  /**
   * Create a child logger with additional **static** context.
   * Still available for cases where you want to bind extra fields that
   * aren't in AsyncLocalStorage (e.g., a component name within a service).
   */
  child(additionalContext: LogContext): StructuredLogger {
    return new StructuredLogger(
      { ...this.staticContext, ...additionalContext },
      this.minLevel,
    );
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.write('debug', msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.write('info', msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.write('warn', msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.write('error', msg, data);
  }

  private write(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LEVEL_VALUES[level] < LEVEL_VALUES[this.minLevel]) return;

    // Merge: static context < ALS context < per-call data
    // ALS context (orderId, etc.) is injected automatically
    const alsContext = getRequestContext();

    const entry: Record<string, unknown> = {
      level,
      ...this.staticContext,
      ...alsContext,
      msg,
      ...data,
      timestamp: new Date().toISOString(),
    };

    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }
}

/**
 * Create a service-scoped structured logger.
 *
 * The `service` field is bound statically. The `orderId` (and any other
 * request-scoped fields) are pulled from AsyncLocalStorage automatically
 * on every log call — no manual `.child()` needed.
 */
export function createServiceLogger(service: string): StructuredLogger {
  return new StructuredLogger({ service });
}
