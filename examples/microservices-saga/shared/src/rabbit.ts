// ---------------------------------------------------------------------------
// RabbitMQ connection and messaging helpers
// ---------------------------------------------------------------------------

import amqplib from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from './events.js';
import { createServiceLogger } from './logger.js';
import { runInContext } from './context.js';

const log = createServiceLogger('rabbit');

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

const RECONNECT_DELAY_MS = 3000;
const MAX_RETRIES = 20;

/** Connect to RabbitMQ with retry logic. */
export async function connectRabbit(
  url: string = process.env['RABBITMQ_URL'] ?? 'amqp://localhost:5672',
): Promise<{ connection: ChannelModel; channel: Channel }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await amqplib.connect(url);
      connection = conn;
      const ch = await conn.createChannel();
      channel = ch;
      await ch.prefetch(1);

      // Declare exchanges
      await ch.assertExchange(EXCHANGES.COMMANDS, 'topic', { durable: true });
      await ch.assertExchange(EXCHANGES.SIGNALS, 'fanout', { durable: true });
      await ch.assertExchange(EXCHANGES.AUDIT, 'topic', { durable: true });

      conn.on('error', (err: Error) => {
        log.error('Connection error', { error: err.message });
      });

      conn.on('close', () => {
        log.warn('Connection closed');
        connection = null;
        channel = null;
      });

      log.info('Connected', { url });
      return { connection: conn, channel: ch };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Connection attempt failed', { attempt, maxRetries: MAX_RETRIES, error: message });
      if (attempt < MAX_RETRIES) {
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  throw new Error(`Failed to connect to RabbitMQ after ${MAX_RETRIES} attempts`);
}

/** Get the current channel (must call connectRabbit first). */
export function getChannel(): Channel {
  if (!channel) {
    throw new Error('RabbitMQ not connected — call connectRabbit() first');
  }
  return channel;
}

/**
 * Publish a command to a service via the commands exchange.
 * Includes a correlation header with the orderId extracted from the payload
 * for infrastructure-level tracing (visible in RabbitMQ management UI).
 */
export function publishCommand(routingKey: string, payload: unknown): void {
  const ch = getChannel();
  const orderId = (payload as Record<string, unknown>)?.orderId as string | undefined;
  ch.publish(
    EXCHANGES.COMMANDS,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      contentType: 'application/json',
      headers: {
        'x-correlation-id': orderId ?? '',
        'x-published-at': new Date().toISOString(),
      },
    },
  );
}

/**
 * Publish a signal back to the gateway via the signals exchange.
 * Includes correlation headers for traceability.
 */
export function publishSignal(payload: unknown): void {
  const ch = getChannel();
  const orderId = (payload as Record<string, unknown>)?.orderId as string | undefined;
  ch.publish(
    EXCHANGES.SIGNALS,
    '',
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      contentType: 'application/json',
      headers: {
        'x-correlation-id': orderId ?? '',
        'x-published-at': new Date().toISOString(),
      },
    },
  );
}

/** Publish an audit event to the audit exchange. */
export function publishAuditEvent(routingKey: string, payload: unknown): void {
  const ch = getChannel();
  ch.publish(
    EXCHANGES.AUDIT,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      contentType: 'application/json',
      headers: { 'x-published-at': new Date().toISOString() },
    },
  );
}

/** Consume messages from a queue bound to an exchange with a routing key. */
export async function consumeQueue(
  queueName: string,
  exchange: string,
  routingKeys: string[],
  handler: (msg: ConsumeMessage, payload: unknown) => Promise<void>,
): Promise<void> {
  const ch = getChannel();
  await ch.assertQueue(queueName, { durable: true });

  for (const key of routingKeys) {
    await ch.bindQueue(queueName, exchange, key);
  }

  await ch.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const payload: unknown = JSON.parse(msg.content.toString());
      // Set request-scoped context from the message — propagates orderId
      // through the entire async chain (tasks, callbacks, EventEmitter listeners)
      const orderId = (payload as Record<string, unknown>)?.orderId as string | undefined;
      const correlationId = msg.properties?.headers?.['x-correlation-id'] as string | undefined;
      await runInContext({ orderId: orderId ?? correlationId }, () => handler(msg, payload));
      ch.ack(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const correlationId = msg.properties?.headers?.['x-correlation-id'] as string | undefined;
      log.error('Error processing message', { queue: queueName, error: message, correlationId });
      ch.nack(msg, false, false); // dead-letter, don't requeue
    }
  });

  log.info('Consuming', { queue: queueName, routingKeys });
}

/** Consume messages from a queue bound to a fanout exchange. */
export async function consumeFanoutQueue(
  queueName: string,
  exchange: string,
  handler: (msg: ConsumeMessage, payload: unknown) => Promise<void>,
): Promise<void> {
  const ch = getChannel();
  await ch.assertQueue(queueName, { durable: true });
  await ch.bindQueue(queueName, exchange, '');

  await ch.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const payload: unknown = JSON.parse(msg.content.toString());
      const orderId = (payload as Record<string, unknown>)?.orderId as string | undefined;
      await runInContext({ orderId }, () => handler(msg, payload));
      ch.ack(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error processing fanout message', { queue: queueName, error: message });
      ch.nack(msg, false, false);
    }
  });

  log.info('Consuming fanout', { queue: queueName });
}

/** Graceful shutdown. */
export async function disconnectRabbit(): Promise<void> {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch {
    // ignore errors during shutdown
  } finally {
    channel = null;
    connection = null;
  }
}

/** Check if connected. */
export function isConnected(): boolean {
  return connection !== null && channel !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
