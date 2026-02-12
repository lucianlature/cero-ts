// ---------------------------------------------------------------------------
// Flow builder — manually positioned saga graph (2-column, animated)
// ---------------------------------------------------------------------------

import type { Node, Edge } from '@xyflow/react';
import type { SagaStep, OrderDetail, AuditEvent } from './types';

// ── Service colour palettes ───────────────────────────────────────────────

interface ServicePalette {
  bg: string;
  bgMuted: string;
  border: string;
  text: string;
  textDim: string;
  edge: string;
  icon: string;
  glow: string;
}

const SERVICE_PALETTES: Record<string, ServicePalette> = {
  inventory: {
    bg: '#1e1b4b',
    bgMuted: '#1e1b4b80',
    border: '#6366f1',
    text: '#c7d2fe',
    textDim: '#a5b4fc',
    edge: '#818cf8',
    icon: '📦',
    glow: '#6366f140',
  },
  payment: {
    bg: '#3b0764',
    bgMuted: '#3b076480',
    border: '#a855f7',
    text: '#e9d5ff',
    textDim: '#d8b4fe',
    edge: '#c084fc',
    icon: '💳',
    glow: '#a855f740',
  },
  shipping: {
    bg: '#134e4a',
    bgMuted: '#134e4a80',
    border: '#14b8a6',
    text: '#ccfbf1',
    textDim: '#99f6e4',
    edge: '#5eead4',
    icon: '🚚',
    glow: '#14b8a640',
  },
};

// ── Step / compensation metadata ──────────────────────────────────────────

const STEP_META: Record<
  string,
  { service: string; label: string; commandLabel: string; signalOk: string; signalFail: string }
> = {
  inventory_reserve: {
    service: 'inventory',
    label: 'Reserve Inventory',
    commandLabel: 'inventory.reserve',
    signalOk: 'inventory.reserved',
    signalFail: 'inventory.failed',
  },
  payment_capture: {
    service: 'payment',
    label: 'Capture Payment',
    commandLabel: 'payment.capture',
    signalOk: 'payment.captured',
    signalFail: 'payment.failed',
  },
  shipping_create: {
    service: 'shipping',
    label: 'Create Shipment',
    commandLabel: 'shipping.create',
    signalOk: 'shipment.created',
    signalFail: 'shipment.failed',
  },
};

const COMPENSATION_META: Record<string, { label: string; commandLabel: string }> = {
  inventory_reserve: { label: 'Release Inventory', commandLabel: 'inventory.release' },
  payment_capture: { label: 'Refund Payment', commandLabel: 'payment.refund' },
};

// ── Status helpers ────────────────────────────────────────────────────────

type StepStatus = SagaStep['status'];

function statusBadge(status: StepStatus | 'pending'): string {
  switch (status) {
    case 'completed':   return '● COMPLETED';
    case 'failed':      return '✖ FAILED';
    case 'compensated': return '↩ COMPENSATED';
    case 'started':     return '◉ IN PROGRESS';
    case 'pending':     return '○ PENDING';
    default:            return '○ UNKNOWN';
  }
}

function statusAccent(status: StepStatus | 'pending'): string {
  switch (status) {
    case 'completed':   return '#22c55e';
    case 'failed':      return '#ef4444';
    case 'compensated': return '#f59e0b';
    case 'started':     return '#3b82f6';
    case 'pending':     return '#64748b';
    default:            return '#64748b';
  }
}

function statusGlow(status: StepStatus | 'pending'): string {
  switch (status) {
    case 'completed':   return '0 0 12px 2px #22c55e30';
    case 'failed':      return '0 0 12px 2px #ef444430';
    case 'compensated': return '0 0 12px 2px #f59e0b30';
    case 'started':     return '0 0 16px 4px #3b82f640';
    case 'pending':     return 'none';
    default:            return 'none';
  }
}

// ── Dimensions & spacing ─────────────────────────────────────────────────

const ORCH_W = 220;  const ORCH_H = 60;
const SVC_W  = 240;  const SVC_H  = 80;
const START_W = 220; const START_H = 58;
const OUTCOME_W = 200; const OUTCOME_H = 48;
const COMP_W = 210;  const COMP_H = 50;

const COL0_X = 0;
const COL1_X = ORCH_W + 200;

const ROW_GAP = 40;
const START_Y = 0;

const NODE_TYPE = 'flowNode';

// ── Edge label helpers ───────────────────────────────────────────────────

function edgeLabelStyle(color: string) {
  return {
    fill: color,
    fontSize: 9,
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
  };
}

const LABEL_BG_STYLE = { fill: '#0f172a', fillOpacity: 0.85 };
const LABEL_BG_PADDING: [number, number] = [4, 6];

// ── Animation helpers ────────────────────────────────────────────────────

/** Staggered fade-slide-in animation */
function fadeIn(delay: number): string {
  return `fadeSlideIn 0.5s ease-out ${delay}s both`;
}

// ── Builder ───────────────────────────────────────────────────────────────

export function buildSagaFlow(
  order: OrderDetail,
  steps: SagaStep[],
  _events: AuditEvent[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const stepMap = new Map(steps.map((s) => [s.step_name, s]));

  const sagaCompleted = order.saga_state === 'completed';
  const sagaFailed    = order.saga_state === 'failed';

  let curY = START_Y;
  let animDelay = 0;
  const ANIM_STEP = 0.12; // stagger increment per node

  // ── Gateway start ─────────────────────────────────────────────────────
  nodes.push({
    id: 'gateway-start',
    type: NODE_TYPE,
    position: { x: COL0_X, y: curY },
    data: { label: `🛒  Order\n${order.id}`, handles: ['bottom'] },
    style: {
      background: '#0f172a',
      color: '#f8fafc',
      border: '2px solid #3b82f6',
      borderRadius: '12px',
      padding: '14px 18px',
      fontSize: '13px',
      fontWeight: 600,
      fontFamily: 'ui-monospace, monospace',
      width: START_W,
      textAlign: 'center' as const,
      boxShadow: '0 0 14px 3px #3b82f630',
      animation: fadeIn(animDelay),
    },
  });

  curY += START_H + ROW_GAP;
  animDelay += ANIM_STEP * 2;

  // ── Per-step rows ─────────────────────────────────────────────────────
  const stepOrder = ['inventory_reserve', 'payment_capture', 'shipping_create'];
  let prevOrchId = 'gateway-start';

  for (const stepName of stepOrder) {
    const step    = stepMap.get(stepName);
    const meta    = STEP_META[stepName]!;
    const palette = SERVICE_PALETTES[meta.service]!;
    const status: StepStatus | 'pending' = step?.status ?? 'pending';

    const orchId = `orch-${stepName}`;
    const svcId  = `svc-${stepName}`;

    const isActive  = status !== 'pending';
    const isRunning = status === 'started';

    const duration =
      step?.started_at && step?.completed_at
        ? `${new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()}ms`
        : null;

    const resultLines = step?.result_data
      ? Object.entries(step.result_data)
          .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
          .join('\n')
      : '';

    // Signal state
    const hasSignal = isActive && !isRunning;
    const isOk      = status === 'completed';
    const signalName = hasSignal ? (isOk ? meta.signalOk : meta.signalFail) : null;

    // Arrow colors
    const cmdColor = isActive ? palette.edge : '#475569';
    const sigColor = hasSignal ? (isOk ? '#22c55e' : '#ef4444') : '#64748b';

    const rowH = Math.max(ORCH_H, SVC_H);

    // ── Step node (left) ─────────────────────────────────────────────
    nodes.push({
      id: orchId,
      type: NODE_TYPE,
      position: { x: COL0_X, y: curY + (rowH - ORCH_H) / 2 },
      data: {
        label: `${meta.label}\n${statusBadge(status)}${duration ? `  ⏱ ${duration}` : ''}`,
        handles: ['top', 'bottom', 'right', 'right-in'],
        cmdColor,
        sigColor,
      },
      style: {
        background: '#0f172a',
        color: '#e2e8f0',
        border: `2px solid ${statusAccent(status)}`,
        borderLeft: `5px solid ${palette.border}`,
        borderRadius: '10px',
        padding: '12px 14px',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'ui-monospace, monospace',
        width: ORCH_W,
        textAlign: 'center' as const,
        boxShadow: statusGlow(status),
        animation: `${fadeIn(animDelay)}${isRunning ? ', glowPulse 2s ease-in-out infinite' : ''}`,
        // @ts-expect-error — CSS custom property for glow animation
        '--glow': `${statusAccent(status)}40`,
        transition: 'box-shadow 0.4s ease, border-color 0.3s ease',
      },
    });

    animDelay += ANIM_STEP;

    // ── Service node (right) ─────────────────────────────────────────
    nodes.push({
      id: svcId,
      type: NODE_TYPE,
      position: { x: COL1_X, y: curY + (rowH - SVC_H) / 2 },
      data: {
        label: `${palette.icon}  ${meta.service.toUpperCase()}${resultLines ? `\n\n${resultLines}` : ''}`,
        handles: ['left-a', 'left-b-out'],
        cmdColor,
        sigColor,
      },
      style: {
        background: isActive ? palette.bg : palette.bgMuted,
        color: isActive ? palette.text : palette.textDim,
        border: `2px solid ${isActive ? palette.border : palette.border + '60'}`,
        borderRadius: '10px',
        padding: '14px 18px',
        fontSize: '11px',
        fontFamily: 'ui-monospace, monospace',
        width: SVC_W,
        textAlign: 'left' as const,
        opacity: isActive ? 1 : 0.45,
        boxShadow: isActive ? `0 0 10px 2px ${palette.glow}` : 'none',
        animation: fadeIn(animDelay),
        transition: 'box-shadow 0.4s ease, opacity 0.4s ease, border-color 0.3s ease',
      },
    });

    animDelay += ANIM_STEP;

    // ── Command edge (solid, Step → Service) — animated when active ──
    edges.push({
      id: `e-cmd-${stepName}`,
      source: orchId,
      sourceHandle: 'right',
      target: svcId,
      targetHandle: 'left-a',
      type: 'smoothstep',
      animated: isActive,
      label: `▸ ${meta.commandLabel}`,
      labelStyle: edgeLabelStyle(isActive ? palette.text : '#94a3b8'),
      labelBgStyle: LABEL_BG_STYLE,
      labelBgPadding: LABEL_BG_PADDING,
      labelBgBorderRadius: 4,
      style: {
        stroke: cmdColor,
        strokeWidth: isActive ? 2 : 1,
      },
    });

    // ── Signal edge (dashed, Service → Step) — animated when present ─
    if (hasSignal && signalName) {
      const signalColor = isOk ? '#22c55e' : '#ef4444';
      const signalIcon  = isOk ? ' ✓' : ' ✗';

      edges.push({
        id: `e-sig-${stepName}`,
        source: svcId,
        sourceHandle: 'left-b-out',
        target: orchId,
        targetHandle: 'right-in',
        type: 'smoothstep',
        animated: true,
        label: `◂ ${signalName}${signalIcon}`,
        labelStyle: edgeLabelStyle(signalColor),
        labelBgStyle: LABEL_BG_STYLE,
        labelBgPadding: LABEL_BG_PADDING,
        labelBgBorderRadius: 4,
        style: {
          stroke: signalColor,
          strokeWidth: 1.5,
          strokeDasharray: '6 3',
        },
      });
    }

    // ── Pipeline edge (vertical) — animated when active ───────────────
    edges.push({
      id: `e-pipe-${prevOrchId}-${orchId}`,
      source: prevOrchId,
      sourceHandle: 'bottom',
      target: orchId,
      targetHandle: 'top',
      type: 'smoothstep',
      animated: isActive,
      style: { stroke: statusAccent(status), strokeWidth: 2 },
    });

    // ── Compensation ─────────────────────────────────────────────────
    if (status === 'compensated' && COMPENSATION_META[stepName]) {
      const compMeta = COMPENSATION_META[stepName]!;
      const compId   = `comp-${stepName}`;

      animDelay += ANIM_STEP;

      nodes.push({
        id: compId,
        type: NODE_TYPE,
        position: { x: COL1_X, y: curY + rowH + 10 },
        data: {
          label: `↩️  ${compMeta.label}\n${compMeta.commandLabel}`,
          handles: ['left'],
        },
        style: {
          background: '#451a03',
          color: '#fbbf24',
          border: '2px dashed #f59e0b',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
          width: COMP_W,
          textAlign: 'center' as const,
          boxShadow: '0 0 10px 2px #f59e0b25',
          animation: fadeIn(animDelay),
        },
      });

      edges.push({
        id: `e-comp-${stepName}`,
        source: orchId,
        sourceHandle: 'right',
        target: compId,
        targetHandle: 'left',
        type: 'smoothstep',
        animated: true,
        label: `↩ ${compMeta.commandLabel}`,
        labelStyle: edgeLabelStyle('#f59e0b'),
        labelBgStyle: LABEL_BG_STYLE,
        labelBgPadding: LABEL_BG_PADDING,
        labelBgBorderRadius: 4,
        style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5 3' },
      });

      curY += COMP_H + 10;
    }

    prevOrchId = orchId;
    curY += rowH + ROW_GAP;
  }

  // ── Outcome node ────────────────────────────────────────────────────
  animDelay += ANIM_STEP;

  const outcomeLabel = sagaCompleted
    ? '✅  Order Completed'
    : sagaFailed
      ? '❌  Order Failed'
      : '⏳  In Progress…';
  const outcomeColor = sagaCompleted ? '#22c55e' : sagaFailed ? '#ef4444' : '#64748b';
  const outcomeBg    = sagaCompleted ? '#052e16' : sagaFailed ? '#450a0a' : '#1e293b';
  const outcomeGlow  = sagaCompleted
    ? '0 0 18px 4px #22c55e30'
    : sagaFailed
      ? '0 0 18px 4px #ef444430'
      : 'none';

  nodes.push({
    id: 'outcome',
    type: NODE_TYPE,
    position: { x: COL0_X + (ORCH_W - OUTCOME_W) / 2, y: curY },
    data: { label: outcomeLabel, handles: ['top'] },
    style: {
      background: outcomeBg,
      color: outcomeColor,
      border: `2px solid ${outcomeColor}`,
      borderRadius: '20px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 700,
      fontFamily: '-apple-system, sans-serif',
      textAlign: 'center' as const,
      boxShadow: outcomeGlow,
      animation: `${fadeIn(animDelay)}${sagaCompleted || sagaFailed ? ', celebratePulse 3s ease-in-out infinite' : ''}`,
      // @ts-expect-error — CSS custom property for glow animation
      '--glow': `${outcomeColor}40`,
    },
  });

  edges.push({
    id: `e-pipe-${prevOrchId}-outcome`,
    source: prevOrchId,
    sourceHandle: 'bottom',
    target: 'outcome',
    targetHandle: 'top',
    type: 'smoothstep',
    animated: sagaCompleted || sagaFailed,
    style: { stroke: outcomeColor, strokeWidth: 2 },
  });

  return { nodes, edges };
}
