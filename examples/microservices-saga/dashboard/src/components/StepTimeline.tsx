// ---------------------------------------------------------------------------
// StepTimeline — vertical timeline of saga steps with data payloads
// ---------------------------------------------------------------------------

import type { SagaStep, AuditEvent } from '../types';

interface Props {
  steps: SagaStep[];
  events: AuditEvent[];
}

function statusDot(status: string) {
  const colorMap: Record<string, string> = {
    completed: '#059669',
    failed: '#dc2626',
    compensated: '#d97706',
    started: '#2563eb',
    success: '#059669',
    skipped: '#64748b',
  };
  const color = colorMap[status] ?? '#475569';
  return (
    <div
      style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: color,
        border: `2px solid ${color}`,
        boxShadow: `0 0 6px ${color}40`,
        flexShrink: 0,
      }}
    />
  );
}

function stepLabel(name: string): string {
  const map: Record<string, string> = {
    inventory_reserve: 'Reserve Inventory',
    payment_capture: 'Capture Payment',
    shipping_create: 'Create Shipment',
    compensate_inventory_reserve: '↩ Release Inventory',
    compensate_payment_capture: '↩ Refund Payment',
  };
  return map[name] ?? name;
}

function formatData(data: Record<string, unknown> | null): string {
  if (!data) return '';
  return JSON.stringify(data, null, 2);
}

export function StepTimeline({ steps, events }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Saga steps (durable execution history) */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
        <h3 style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          Saga Steps
        </h3>
      </div>

      {steps.length === 0 && (
        <div style={{ padding: '16px', color: '#475569', fontSize: '12px', fontStyle: 'italic' }}>
          No steps recorded
        </div>
      )}

      {steps.map((step, i) => (
        <div
          key={`${step.step_name}-${i}`}
          style={{
            display: 'flex',
            gap: '12px',
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b10',
          }}
        >
          {/* Timeline connector */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingTop: '4px' }}>
            {statusDot(step.status)}
            {i < steps.length - 1 && (
              <div style={{ width: '1px', flex: 1, background: '#334155', minHeight: '20px' }} />
            )}
          </div>

          {/* Step content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                {stepLabel(step.step_name)}
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 600,
                color: step.status === 'completed' ? '#6ee7b7' : step.status === 'failed' ? '#fca5a5' : step.status === 'compensated' ? '#fbbf24' : '#93c5fd',
                textTransform: 'uppercase',
              }}>
                {step.status}
              </span>
            </div>

            {step.started_at && (
              <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
                {new Date(step.started_at).toLocaleTimeString()}
                {step.completed_at && (
                  <> → {new Date(step.completed_at).toLocaleTimeString()}</>
                )}
              </div>
            )}

            {step.result_data && Object.keys(step.result_data).length > 0 && (
              <pre style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '10px',
                fontFamily: 'ui-monospace, monospace',
                color: '#94a3b8',
                margin: '6px 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                overflow: 'hidden',
              }}>
                {formatData(step.result_data)}
              </pre>
            )}
          </div>
        </div>
      ))}

      {/* Audit events */}
      {events.length > 0 && (
        <>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', borderTop: '1px solid #1e293b', marginTop: '8px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Audit Events ({events.length})
            </h3>
          </div>

          {events.map((event) => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '8px 16px',
                borderBottom: '1px solid #1e293b10',
              }}
            >
              <div style={{ paddingTop: '4px' }}>{statusDot(event.event)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1' }}>
                    {event.service}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    {event.task}
                  </span>
                  <span style={{ fontSize: '10px', color: '#475569', marginLeft: 'auto' }}>
                    {event.event}
                    {event.duration_ms != null && ` • ${event.duration_ms}ms`}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#475569' }}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
