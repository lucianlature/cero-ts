// ---------------------------------------------------------------------------
// Command & Signal type contracts for the Order Saga
// ---------------------------------------------------------------------------

// ---- Shared primitives ----

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// ---- Commands (Gateway → Services) ----

export interface ReserveInventoryCommand {
  type: 'inventory.reserve';
  orderId: string;
  items: OrderItem[];
}

export interface ReleaseInventoryCommand {
  type: 'inventory.release';
  orderId: string;
}

export interface CapturePaymentCommand {
  type: 'payment.capture';
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}

export interface RefundPaymentCommand {
  type: 'payment.refund';
  orderId: string;
  transactionId: string;
}

export interface CreateShipmentCommand {
  type: 'shipping.create';
  orderId: string;
  address: ShippingAddress;
  items: OrderItem[];
  expedited: boolean;
}

export type SagaCommand =
  | ReserveInventoryCommand
  | ReleaseInventoryCommand
  | CapturePaymentCommand
  | RefundPaymentCommand
  | CreateShipmentCommand;

// ---- Signals (Services → Gateway) ----

export interface InventoryReservedSignal {
  type: 'inventory.reserved';
  orderId: string;
  reservationId: string;
}

export interface InventoryReleasedSignal {
  type: 'inventory.released';
  orderId: string;
}

export interface InventoryFailedSignal {
  type: 'inventory.failed';
  orderId: string;
  reason: string;
}

export interface PaymentCapturedSignal {
  type: 'payment.captured';
  orderId: string;
  transactionId: string;
}

export interface PaymentFailedSignal {
  type: 'payment.failed';
  orderId: string;
  reason: string;
}

export interface PaymentRefundedSignal {
  type: 'payment.refunded';
  orderId: string;
}

export interface ShipmentCreatedSignal {
  type: 'shipment.created';
  orderId: string;
  shipmentId: string;
  trackingNumber: string;
}

export interface ShipmentFailedSignal {
  type: 'shipment.failed';
  orderId: string;
  reason: string;
}

export type SagaSignal =
  | InventoryReservedSignal
  | InventoryReleasedSignal
  | InventoryFailedSignal
  | PaymentCapturedSignal
  | PaymentFailedSignal
  | PaymentRefundedSignal
  | ShipmentCreatedSignal
  | ShipmentFailedSignal;

// ---- Audit events (all services → gateway event collector) ----

export interface SagaAuditEvent {
  orderId: string;
  service: string;
  task: string;
  event: 'started' | 'success' | 'failed' | 'skipped';
  durationMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ---- Queue / exchange names ----

export const QUEUES = {
  INVENTORY_COMMANDS: 'inventory.commands',
  PAYMENT_COMMANDS: 'payment.commands',
  SHIPPING_COMMANDS: 'shipping.commands',
  SAGA_SIGNALS: 'saga.signals',
} as const;

export const EXCHANGES = {
  COMMANDS: 'saga.commands',
  SIGNALS: 'saga.signals',
  AUDIT: 'saga.audit',
} as const;

export const ROUTING_KEYS = {
  INVENTORY_RESERVE: 'inventory.reserve',
  INVENTORY_RELEASE: 'inventory.release',
  PAYMENT_CAPTURE: 'payment.capture',
  PAYMENT_REFUND: 'payment.refund',
  SHIPPING_CREATE: 'shipping.create',
} as const;
