// ---------------------------------------------------------------------------
// API response types — mirrors the gateway REST endpoints
// ---------------------------------------------------------------------------

export interface OrderSummary {
  id: string;
  customer_id: string;
  total_amount: number;
  currency: string;
  status: string;
  saga_state: string;
  created_at: string;
  updated_at: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderItem[];
  shipping_address: ShippingAddress;
  payment_method: string;
  expedited: number;
  notes: string | null;
}

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

export interface SagaStep {
  step_name: string;
  status: 'started' | 'completed' | 'failed' | 'compensated';
  result_data: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
}

export interface AuditEvent {
  id: number;
  order_id: string;
  service: string;
  task: string;
  event: 'started' | 'success' | 'failed' | 'skipped';
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface OrderStatus {
  orderId: string;
  status: string;
  reason?: string;
  source: 'workflow' | 'database';
  completed: boolean;
}
