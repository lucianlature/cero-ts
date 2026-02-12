// ---------------------------------------------------------------------------
// Signal Consumer — routes RabbitMQ signals to active WorkflowHandles
// ---------------------------------------------------------------------------
// DDD Boundary #4: No transactions across services — signals arrive async
//   from other services via RabbitMQ. We look up the WorkflowHandle by
//   orderId and deliver the signal. No shared transactions.
// ---------------------------------------------------------------------------

import { consumeFanoutQueue, EXCHANGES, QUEUES, createServiceLogger } from '@saga/shared';
import type { SagaSignal } from '@saga/shared';

const log = createServiceLogger('gateway');
import { getHandle } from '../store.js';
import {
  inventoryReservedSignal,
  inventoryFailedSignal,
  paymentCapturedSignal,
  paymentFailedSignal,
  shipmentCreatedSignal,
  shipmentFailedSignal,
} from '../workflows/order-saga.workflow.js';

// Map signal types to their cero-ts signal definitions
const SIGNAL_MAP = {
  'inventory.reserved': inventoryReservedSignal,
  'inventory.failed': inventoryFailedSignal,
  'payment.captured': paymentCapturedSignal,
  'payment.failed': paymentFailedSignal,
  'shipment.created': shipmentCreatedSignal,
  'shipment.failed': shipmentFailedSignal,
} as const;

export async function startSignalConsumer(): Promise<void> {
  await consumeFanoutQueue(
    QUEUES.SAGA_SIGNALS,
    EXCHANGES.SIGNALS,
    async (_msg, payload) => {
      const signal = payload as SagaSignal;
      const { orderId, type } = signal;

      log.info('Received signal', { type });

      const handle = getHandle(orderId);
      if (!handle) {
        log.warn('No active handle for order, signal dropped', { type });
        return;
      }

      const signalDef = SIGNAL_MAP[type as keyof typeof SIGNAL_MAP];
      if (!signalDef) {
        log.warn('Unknown signal type', { type });
        return;
      }

      // Deliver the signal to the workflow handle
      // biome-ignore lint: signal type is dynamic
      handle.signal(signalDef as any, signal as any);
    },
  );
}
