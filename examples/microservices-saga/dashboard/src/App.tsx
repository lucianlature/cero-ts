// ---------------------------------------------------------------------------
// App — Main dashboard layout: sidebar + flow graph + timeline
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { OrderSummary, OrderDetail as OrderDetailType, SagaStep, AuditEvent } from './types';
import { fetchOrders, fetchOrder, fetchSteps, fetchTimeline } from './api';
import { OrderList } from './components/OrderList';
import { OrderDetailCard } from './components/OrderDetail';
import { SagaFlowGraph } from './components/SagaFlowGraph';
import { StepTimeline } from './components/StepTimeline';

export function App() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetailType | null>(null);
  const [steps, setSteps] = useState<SagaStep[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Load orders on mount + poll every 5s
  useEffect(() => {
    const load = () => fetchOrders().then(setOrders).catch(console.error);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-select first order
  useEffect(() => {
    if (!selectedId && orders.length > 0) {
      setSelectedId(orders[0]!.id);
    }
  }, [orders, selectedId]);

  // Load order detail when selection changes
  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [orderData, stepsData, eventsData] = await Promise.all([
        fetchOrder(id),
        fetchSteps(id),
        fetchTimeline(id),
      ]);
      setDetail(orderData);
      setSteps(stepsData);
      setEvents(eventsData);
    } catch (err) {
      console.error('Failed to load order detail', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '20px' }}>🔀</div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Saga Flow Dashboard
            </h1>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
              cero-ts Microservices Orchestration
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#64748b' }}>
          <span>{orders.length} orders</span>
          <button
            type="button"
            onClick={() => fetchOrders().then(setOrders)}
            style={{
              padding: '6px 12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '3px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar — Order List */}
        <aside style={{
          width: '270px',
          borderRight: '1px solid #1e293b',
          overflow: 'auto',
          flexShrink: 0,
          padding: '8px',
        }}>
          <OrderList
            orders={orders}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedId && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#475569', fontSize: '14px' }}>
              Select an order to view its saga flow
            </div>
          )}

          {selectedId && loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#475569', fontSize: '14px' }}>
              Loading…
            </div>
          )}

          {selectedId && !loading && detail && (
            <>
              {/* Order summary card */}
              <div style={{ padding: '16px 20px', flexShrink: 0 }}>
                <OrderDetailCard order={detail} />
              </div>

              {/* Flow graph */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ReactFlowProvider>
                  <SagaFlowGraph order={detail} steps={steps} events={events} />
                </ReactFlowProvider>
              </div>
            </>
          )}
        </main>

        {/* Right panel — Timeline */}
        {selectedId && detail && !loading && (
          <aside style={{
            width: '360px',
            borderLeft: '1px solid #1e293b',
            overflow: 'auto',
            flexShrink: 0,
            background: '#0f172a',
          }}>
            <StepTimeline steps={steps} events={events} />
          </aside>
        )}
      </div>
    </div>
  );
}
