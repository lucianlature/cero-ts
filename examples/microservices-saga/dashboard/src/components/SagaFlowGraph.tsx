// ---------------------------------------------------------------------------
// SagaFlowGraph — ReactFlow visualization of an order's saga
// ---------------------------------------------------------------------------

import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  BackgroundVariant,
  applyNodeChanges,
} from '@xyflow/react';
import type { Node, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { OrderDetail, SagaStep, AuditEvent } from '../types';
import { buildSagaFlow } from '../flowBuilder';
import { FlowNode } from './FlowNode';

interface Props {
  order: OrderDetail;
  steps: SagaStep[];
  events: AuditEvent[];
}

const nodeTypes = { flowNode: FlowNode };

// ── Keyframe animations injected once ────────────────────────────────────

const ANIMATION_CSS = `
/* Fade-in — opacity only, no transform (ReactFlow owns transform for positioning) */
@keyframes fadeSlideIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 8px 2px var(--glow, #3b82f620); }
  50%      { box-shadow: 0 0 22px 6px var(--glow, #3b82f650); }
}

/* Handle arrows — scale is safe here since handles aren't positioned via transform */
@keyframes arrowBounce {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 1; }
}

@keyframes dotBreath {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}

/* Outcome — box-shadow pulse instead of transform */
@keyframes celebratePulse {
  0%, 100% { box-shadow: 0 0 14px 3px var(--glow, #22c55e30); }
  50%      { box-shadow: 0 0 28px 8px var(--glow, #22c55e50); }
}

.react-flow__edge-path {
  transition: stroke 0.3s ease, stroke-width 0.3s ease;
}

.react-flow__edge-text {
  transition: opacity 0.4s ease;
}
`;

const legendStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '10px',
  fontFamily: 'ui-monospace, monospace',
  color: '#94a3b8',
  lineHeight: 1.7,
  opacity: 0.85,
};

export function SagaFlowGraph({ order, steps, events }: Props) {
  const built = useMemo(() => buildSagaFlow(order, steps, events), [order, steps, events]);

  const [nodes, setNodes] = useState<Node[]>(built.nodes);
  const edges = built.edges;
  const colorMode = "dark";

  // Sync when order/steps/events change (rebuild)
  useEffect(() => { setNodes(built.nodes); }, [built]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a' }}>
      {/* biome-ignore lint: inject animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_CSS }} />
      <ReactFlow
        nodes={nodes}
        colorMode={colorMode}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#0f172a' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <Controls
          style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}
          showInteractive={false}
        />
        <Panel position="top-right" style={legendStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>LEGEND</div>
          <div><span style={{ color: '#818cf8' }}>──</span> solid = command →</div>
          <div><span style={{ color: '#22c55e' }}>╌╌</span> dashed <span style={{ color: '#22c55e' }}>green</span> = signal ✓</div>
          <div><span style={{ color: '#ef4444' }}>╌╌</span> dashed <span style={{ color: '#ef4444' }}>red</span> = signal ✗</div>
          <div><span style={{ color: '#f59e0b' }}>╌╌</span> dashed <span style={{ color: '#f59e0b' }}>amber</span> = compensation</div>
          <div style={{ marginTop: '6px', borderTop: '1px solid #334155', paddingTop: '6px' }}>
            <span style={{ color: '#818cf8' }}>■</span> Inventory &nbsp;
            <span style={{ color: '#c084fc' }}>■</span> Payment &nbsp;
            <span style={{ color: '#5eead4' }}>■</span> Shipping
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
