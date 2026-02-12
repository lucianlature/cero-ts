// ---------------------------------------------------------------------------
// FlowNode — custom ReactFlow node with animated arrow handles
// ---------------------------------------------------------------------------

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

type HandleSpec =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'left-a' | 'left-b-out'
  | 'right-in';

interface FlowNodeData {
  label: string;
  handles?: HandleSpec[];
  cmdColor?: string;
  sigColor?: string;
  [key: string]: unknown;
}

// Pipeline handles — breathing dots
const pipelineDot = (active: boolean): React.CSSProperties => ({
  width: 6,
  height: 6,
  background: active ? '#94a3b8' : '#475569',
  border: 'none',
  borderRadius: '50%',
  transition: 'background 0.3s ease',
  ...(active ? { animation: 'dotBreath 2s ease-in-out infinite' } : {}),
});

// Arrow pointing RIGHT  ▸  (for command flow)
const arrowRight = (color: string, animate: boolean): React.CSSProperties => ({
  width: 10,
  height: 10,
  background: color,
  border: 'none',
  borderRadius: 0,
  clipPath: 'polygon(0% 0%, 100% 50%, 0% 100%)',
  transition: 'background 0.3s ease',
  ...(animate ? { animation: 'arrowBounce 1.8s ease-in-out infinite' } : {}),
});

// Arrow pointing LEFT  ◂  (for signal flow)
const arrowLeft = (color: string, animate: boolean): React.CSSProperties => ({
  width: 10,
  height: 10,
  background: color,
  border: 'none',
  borderRadius: 0,
  clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)',
  transition: 'background 0.3s ease',
  ...(animate ? { animation: 'arrowBounce 1.8s ease-in-out 0.3s infinite' } : {}),
});

export const FlowNode = memo(({ data }: NodeProps) => {
  const d = data as FlowNodeData;
  const handles = d.handles ?? ['top', 'bottom'];
  const cmdColor = d.cmdColor ?? '#818cf8';
  const sigColor = d.sigColor ?? '#64748b';

  // Arrows pulse when their color indicates activity (not gray/dim)
  const cmdActive = cmdColor !== '#475569';
  const sigActive = sigColor !== '#64748b';

  return (
    <>
      {/* Pipeline handles — breathing dots */}
      {handles.includes('top') && (
        <Handle type="target" position={Position.Top} id="top" style={pipelineDot(cmdActive)} />
      )}
      {handles.includes('bottom') && (
        <Handle type="source" position={Position.Bottom} id="bottom" style={pipelineDot(cmdActive)} />
      )}

      {/* Compensation target */}
      {handles.includes('left') && (
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          style={{ ...pipelineDot(true), background: '#f59e0b', animation: 'arrowBounce 2s ease-in-out infinite' }}
        />
      )}

      {/* ▸ Command OUT — right side of step nodes */}
      {handles.includes('right') && (
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          style={{ ...arrowRight(cmdColor, cmdActive), top: '35%' }}
        />
      )}

      {/* ◂ Signal IN — right side of step nodes */}
      {handles.includes('right-in') && (
        <Handle
          type="target"
          position={Position.Right}
          id="right-in"
          style={{ ...arrowLeft(sigColor, sigActive), top: '65%' }}
        />
      )}

      {/* ▸ Command IN — left side of service nodes */}
      {handles.includes('left-a') && (
        <Handle
          type="target"
          position={Position.Left}
          id="left-a"
          style={{ ...arrowRight(cmdColor, cmdActive), top: '35%' }}
        />
      )}

      {/* ◂ Signal OUT — left side of service nodes */}
      {handles.includes('left-b-out') && (
        <Handle
          type="source"
          position={Position.Left}
          id="left-b-out"
          style={{ ...arrowLeft(sigColor, sigActive), top: '65%' }}
        />
      )}

      <div style={{ whiteSpace: 'pre-wrap' }}>{d.label}</div>
    </>
  );
});

FlowNode.displayName = 'FlowNode';
