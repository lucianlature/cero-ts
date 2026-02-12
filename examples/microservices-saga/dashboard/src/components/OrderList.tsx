// ---------------------------------------------------------------------------
// OrderList — sidebar listing all orders with status badges
// ---------------------------------------------------------------------------

import type { OrderSummary } from '../types';

interface Props {
  orders: OrderSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusBadge(sagaState: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: '#064e3b', text: '#6ee7b7', label: 'Completed' },
    failed: { bg: '#7f1d1d', text: '#fca5a5', label: 'Failed' },
    created: { bg: '#1e3a8a', text: '#93c5fd', label: 'Created' },
  };
  const badge = map[sagaState] ?? { bg: '#1e293b', text: '#94a3b8', label: sagaState };
  return (
    <span
      style={{
        background: badge.bg,
        color: badge.text,
        padding: '2px 8px',
        borderRadius: '8px',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {badge.label}
    </span>
  );
}

export function OrderList({ orders, selectedId, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {orders.map((order) => (
        <button
          key={order.id}
          onClick={() => onSelect(order.id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '12px 16px',
            border: selectedId === order.id ? '1px solid #3b82f6' : '1px solid transparent',
            borderRadius: '10px',
            background: selectedId === order.id ? '#1e293b' : 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            color: '#e2e8f0',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 600 }}>
              {order.id.slice(0, 24)}
            </span>
            {statusBadge(order.saga_state)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
            <span>{order.customer_id}</span>
            <span>
              {order.currency} {order.total_amount.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            {new Date(order.created_at).toLocaleString()}
          </div>
        </button>
      ))}
      {orders.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          No orders yet
        </div>
      )}
    </div>
  );
}
