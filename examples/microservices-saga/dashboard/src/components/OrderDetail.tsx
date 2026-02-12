// ---------------------------------------------------------------------------
// OrderDetail — header card showing order summary
// ---------------------------------------------------------------------------

import type { OrderDetail as OrderDetailType } from '../types';

interface Props {
  order: OrderDetailType;
}

export function OrderDetailCard({ order }: Props) {
  const isFailed = order.saga_state === 'failed';
  const isCompleted = order.saga_state === 'completed';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '16px',
        padding: '16px 20px',
        background: '#1e293b',
        borderRadius: '12px',
        border: `1px solid ${isCompleted ? '#065f46' : isFailed ? '#7f1d1d' : '#334155'}`,
      }}
    >
      <Stat label="Order ID" value={order.id} mono />
      <Stat label="Customer" value={order.customer_id} />
      <Stat
        label="Total"
        value={`${order.currency} ${order.total_amount.toFixed(2)}`}
      />
      <Stat label="Payment" value={order.payment_method} mono />
      <Stat
        label="Saga State"
        value={order.saga_state.toUpperCase()}
        color={isCompleted ? '#6ee7b7' : isFailed ? '#fca5a5' : '#93c5fd'}
      />
      <Stat label="Items" value={`${order.items.length} product(s)`} />
      <Stat
        label="Shipping"
        value={`${order.shipping_address.city}, ${order.shipping_address.state}`}
      />
      {order.expedited === 1 && <Stat label="Priority" value="EXPEDITED" color="#fbbf24" />}
    </div>
  );
}

function Stat({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{
        fontSize: '12px',
        color: color ?? '#e2e8f0',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        fontWeight: 500,
        wordBreak: 'break-all',
      }}>
        {value}
      </div>
    </div>
  );
}
