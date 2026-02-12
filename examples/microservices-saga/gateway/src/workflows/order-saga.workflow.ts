// ---------------------------------------------------------------------------
// OrderSagaWorkflow — Durable Orchestrator for the Order Saga
// ---------------------------------------------------------------------------
//
// Architecture: Centralized durable workflow/orchestrator
//
// Uses cero-ts/durable for automatic persistence:
//   - Every step() is persisted to the event log BEFORE execution
//     and checkpointed AFTER completion
//   - Every condition() timer deadline is persisted durably
//   - Every signal received is logged to the event store
//   - On crash recovery, completed steps are skipped via deterministic
//     replay, signals are re-delivered, and execution resumes
//
// cero-ts features: DurableWorkflow (extends Workflow), step(), durable
//   condition(), defineSignal, defineQuery, setHandler, WorkflowHandle
//
// DDD Boundary #4: No transactions across services — communicates via
//   RabbitMQ commands, awaits async signals via condition().
// DDD Boundary #5: Saga step = independent transaction — each step
//   commits independently, compensations are forward transactions.
// ---------------------------------------------------------------------------

import { defineSignal, defineQuery } from 'cero-ts';
import { DurableWorkflow } from 'cero-ts/durable';
import {
  publishCommand,
  withTransaction,
  ROUTING_KEYS,
  createServiceLogger,
  enterContext,
} from '@saga/shared';

const log = createServiceLogger('saga');
import type {
  OrderItem,
  ShippingAddress,
  InventoryReservedSignal,
  InventoryFailedSignal,
  PaymentCapturedSignal,
  PaymentFailedSignal,
  ShipmentCreatedSignal,
  ShipmentFailedSignal,
} from '@saga/shared';
import { ValidateOrderTask } from '../tasks/validate-order.task.js';
import { getDb } from '../db.js';

// ---- Saga step names (canonical) ----

export const SAGA_STEPS = {
  INVENTORY_RESERVE: 'inventory_reserve',
  PAYMENT_CAPTURE: 'payment_capture',
  SHIPPING_CREATE: 'shipping_create',
} as const;

// ---- Compensation registry: step → compensating commands ----

export const COMPENSATION_REGISTRY: Record<
  string,
  (orderId: string, context: Record<string, unknown>) => void
> = {
  [SAGA_STEPS.INVENTORY_RESERVE]: (orderId) => {
    publishCommand(ROUTING_KEYS.INVENTORY_RELEASE, {
      type: 'inventory.release',
      orderId,
    });
  },
  [SAGA_STEPS.PAYMENT_CAPTURE]: (orderId, ctx) => {
    publishCommand(ROUTING_KEYS.PAYMENT_REFUND, {
      type: 'payment.refund',
      orderId,
      transactionId: ctx.transactionId ?? '',
    });
  },
  // shipping_create has no compensation (shipments are cancelled externally)
};

// ---- Saga context ----

export interface OrderSagaContext extends Record<string, unknown> {
  orderId?: string;
  customerId?: string;
  items?: OrderItem[];
  totalAmount?: number;
  currency?: string;
  paymentMethod?: string;
  shippingAddress?: ShippingAddress;
  expedited?: boolean;
  notes?: string;
  reservationId?: string;
  transactionId?: string;
  shipmentId?: string;
  trackingNumber?: string;
}

// ---- Signal definitions (typed messages from services) ----

export const inventoryReservedSignal = defineSignal<[InventoryReservedSignal]>(
  'inventory.reserved',
);
export const inventoryFailedSignal = defineSignal<[InventoryFailedSignal]>(
  'inventory.failed',
);
export const paymentCapturedSignal = defineSignal<[PaymentCapturedSignal]>(
  'payment.captured',
);
export const paymentFailedSignal = defineSignal<[PaymentFailedSignal]>(
  'payment.failed',
);
export const shipmentCreatedSignal = defineSignal<[ShipmentCreatedSignal]>(
  'shipment.created',
);
export const shipmentFailedSignal = defineSignal<[ShipmentFailedSignal]>(
  'shipment.failed',
);

// ---- Query definitions (read current saga state) ----

export type SagaStatus =
  | 'created'
  | 'validating'
  | 'reserving_inventory'
  | 'capturing_payment'
  | 'creating_shipment'
  | 'completed'
  | 'failed'
  | 'compensating';

export const sagaStatusQuery = defineQuery<SagaStatus>('saga.status');

export interface SagaDetails {
  orderId: string;
  status: SagaStatus;
  customerId: string;
  totalAmount: number;
  currency: string;
  reservationId?: string;
  transactionId?: string;
  shipmentId?: string;
  trackingNumber?: string;
}

export const sagaDetailsQuery = defineQuery<SagaDetails>('saga.details');

// ---- The Durable Workflow ----

export class OrderSagaWorkflow extends DurableWorkflow<OrderSagaContext> {
  // Pipeline tasks: run ValidateOrderTask first
  static override tasks = [ValidateOrderTask];

  // Saga state (mutated by signal handlers, reconstructed on replay)
  private sagaStatus: SagaStatus = 'created';
  private inventoryReserved = false;
  private inventoryFailed = false;
  private inventoryFailReason = '';
  private paymentCaptured = false;
  private paymentFailed = false;
  private paymentFailReason = '';
  private shipmentCreated = false;
  private shipmentFailed = false;
  private shipmentFailReason = '';

  override async work(): Promise<void> {
    // --- Register signal handlers ---
    // Signal handlers mutate workflow state. During replay, logged signals
    // are re-delivered through these handlers to reconstruct state.
    this.registerSignalHandlers();
    this.registerQueryHandlers();

    // --- Step 0: Validate the order (pipeline) ---
    this.sagaStatus = 'validating';
    await this.runTasks();

    const orderId = this.context.orderId as string;
    enterContext({ orderId });
    log.info('Order validated, starting durable saga');

    // Yield to the event loop so the route handler can register this
    // WorkflowHandle in the store before we dispatch any commands.
    await new Promise((r) => setTimeout(r, 0));

    // ----------------------------------------------------------------
    // Step 1: Reserve inventory (durable)
    // ----------------------------------------------------------------
    this.sagaStatus = 'reserving_inventory';
    this.updateOrderStatus(orderId, 'reserving_inventory');

    await this.step(SAGA_STEPS.INVENTORY_RESERVE, () => {
      publishCommand(ROUTING_KEYS.INVENTORY_RESERVE, {
        type: 'inventory.reserve',
        orderId,
        items: this.context.items,
      });
    });

    const inventoryOk = await this.condition(
      () => this.inventoryReserved || this.inventoryFailed,
      '30s',
    );

    if (!inventoryOk) {
      return this.failSaga(orderId, 'Inventory reservation timed out', []);
    }

    if (this.inventoryFailed) {
      return this.failSaga(
        orderId,
        `Inventory reservation failed: ${this.inventoryFailReason}`,
        [],
      );
    }

    log.info('Inventory reserved', { reservationId: this.context.reservationId });
    this.updateOrderStatus(orderId, 'inventory_reserved');

    // ----------------------------------------------------------------
    // Step 2: Capture payment (durable)
    // ----------------------------------------------------------------
    this.sagaStatus = 'capturing_payment';
    this.updateOrderStatus(orderId, 'capturing_payment');

    await this.step(SAGA_STEPS.PAYMENT_CAPTURE, () => {
      publishCommand(ROUTING_KEYS.PAYMENT_CAPTURE, {
        type: 'payment.capture',
        orderId,
        amount: this.context.totalAmount,
        currency: this.context.currency,
        paymentMethod: this.context.paymentMethod,
      });
    });

    const paymentOk = await this.condition(
      () => this.paymentCaptured || this.paymentFailed,
      '30s',
    );

    if (!paymentOk || this.paymentFailed) {
      const reason = !paymentOk
        ? 'Payment capture timed out'
        : `Payment failed: ${this.paymentFailReason}`;

      return this.failSaga(orderId, reason, [SAGA_STEPS.INVENTORY_RESERVE]);
    }

    log.info('Payment captured', { transactionId: this.context.transactionId });
    this.updateOrderStatus(orderId, 'payment_captured');

    // ----------------------------------------------------------------
    // Step 3: Create shipment (durable)
    // ----------------------------------------------------------------
    this.sagaStatus = 'creating_shipment';
    this.updateOrderStatus(orderId, 'creating_shipment');

    await this.step(SAGA_STEPS.SHIPPING_CREATE, () => {
      publishCommand(ROUTING_KEYS.SHIPPING_CREATE, {
        type: 'shipping.create',
        orderId,
        address: this.context.shippingAddress,
        items: this.context.items,
        expedited: this.context.expedited ?? false,
      });
    });

    const shipmentOk = await this.condition(
      () => this.shipmentCreated || this.shipmentFailed,
      '60s',
    );

    if (!shipmentOk || this.shipmentFailed) {
      const reason = !shipmentOk
        ? 'Shipment creation timed out'
        : `Shipment failed: ${this.shipmentFailReason}`;

      return this.failSaga(orderId, reason, [
        SAGA_STEPS.PAYMENT_CAPTURE,
        SAGA_STEPS.INVENTORY_RESERVE,
      ]);
    }

    // ----------------------------------------------------------------
    // Success — all three steps completed
    // ----------------------------------------------------------------
    this.sagaStatus = 'completed';
    this.updateOrderStatus(orderId, 'completed');
    log.info('Order saga completed', {
      trackingNumber: this.context.trackingNumber,
    });
  }

  // ---- Formalized compensation ----

  /**
   * Fail the saga and run compensations as durable steps.
   *
   * Compensations are driven by the COMPENSATION_REGISTRY and the list of
   * previously completed steps. Each compensation is wrapped in step() so
   * it's recorded in the durable event log and skipped on replay.
   */
  private async failSaga(
    orderId: string,
    reason: string,
    completedStepsToCompensate: string[],
  ): Promise<void> {
    if (completedStepsToCompensate.length > 0) {
      this.sagaStatus = 'compensating';
      this.updateOrderStatus(orderId, 'compensating');

      log.info('Compensating steps', {
        steps: completedStepsToCompensate.join(', '),
      });

      for (const stepName of completedStepsToCompensate) {
        const compensate = COMPENSATION_REGISTRY[stepName];
        if (compensate) {
          await this.step(`compensate_${stepName}`, () => {
            compensate(orderId, this.context.toObject());
          });
        }
      }
    }

    this.sagaStatus = 'failed';
    this.updateOrderStatus(orderId, 'failed');
    this.fail(reason);
  }

  // ---- Signal handlers ----

  private registerSignalHandlers(): void {
    this.setHandler(inventoryReservedSignal, (data) => {
      this.inventoryReserved = true;
      this.context.reservationId = data.reservationId;
    });

    this.setHandler(inventoryFailedSignal, (data) => {
      this.inventoryFailed = true;
      this.inventoryFailReason = data.reason;
    });

    this.setHandler(paymentCapturedSignal, (data) => {
      this.paymentCaptured = true;
      this.context.transactionId = data.transactionId;
    });

    this.setHandler(paymentFailedSignal, (data) => {
      this.paymentFailed = true;
      this.paymentFailReason = data.reason;
    });

    this.setHandler(shipmentCreatedSignal, (data) => {
      this.shipmentCreated = true;
      this.context.shipmentId = data.shipmentId;
      this.context.trackingNumber = data.trackingNumber;
    });

    this.setHandler(shipmentFailedSignal, (data) => {
      this.shipmentFailed = true;
      this.shipmentFailReason = data.reason;
    });
  }

  // ---- Query handlers ----

  private registerQueryHandlers(): void {
    this.setHandler(sagaStatusQuery, () => this.sagaStatus);

    this.setHandler(sagaDetailsQuery, () => ({
      orderId: this.context.orderId as string,
      status: this.sagaStatus,
      customerId: this.context.customerId as string,
      totalAmount: this.context.totalAmount as number,
      currency: this.context.currency as string,
      reservationId: this.context.reservationId as string | undefined,
      transactionId: this.context.transactionId as string | undefined,
      shipmentId: this.context.shipmentId as string | undefined,
      trackingNumber: this.context.trackingNumber as string | undefined,
    }));
  }

  // ---- Domain aggregate update ----

  /**
   * DDD Boundary #5 — Saga step = independent transaction:
   * Each status update is its own committed transaction.
   * The orders table tracks the domain aggregate state, separate from
   * the durable workflow event log.
   */
  private updateOrderStatus(orderId: string, sagaState: string): void {
    const db = getDb();
    withTransaction(db, () => {
      db.prepare(
        `UPDATE orders SET saga_state = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(sagaState, orderId);
    });
  }
}
