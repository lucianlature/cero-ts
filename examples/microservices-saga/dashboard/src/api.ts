// ---------------------------------------------------------------------------
// API client — fetches from the gateway REST endpoints
// ---------------------------------------------------------------------------

import type { OrderSummary, OrderDetail, SagaStep, AuditEvent, OrderStatus } from './types';

const BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function fetchOrders(): Promise<OrderSummary[]> {
  const data = await fetchJson<{ orders: OrderSummary[] }>('/orders');
  return data.orders;
}

export async function fetchOrder(id: string): Promise<OrderDetail> {
  const data = await fetchJson<{ order: OrderDetail }>(`/orders/${id}`);
  return data.order;
}

export async function fetchSteps(id: string): Promise<SagaStep[]> {
  const data = await fetchJson<{ steps: SagaStep[] }>(`/orders/${id}/steps`);
  return data.steps;
}

export async function fetchTimeline(id: string): Promise<AuditEvent[]> {
  const data = await fetchJson<{ events: AuditEvent[] }>(`/orders/${id}/timeline`);
  return data.events;
}

export async function fetchStatus(id: string): Promise<OrderStatus> {
  return fetchJson<OrderStatus>(`/orders/${id}/status`);
}
