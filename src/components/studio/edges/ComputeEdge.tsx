import React, { memo, useState } from 'react';
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { DataType, EdgeStatus } from '@/types/computeFlow';

export interface ComputeEdgeData {
  edgeId?: string;
  dataType?: DataType;
  status?: EdgeStatus;
  label?: string;
  onInsertAction?: (edgeId: string, screenPosition: { x: number; y: number }) => void;
}

export const ComputeEdge = memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const edgeData = data as ComputeEdgeData | undefined;
    const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
    const curvature = Math.min(0.52, Math.max(0.24, distance / 700));

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature,
    });

    const status = edgeData?.status || 'idle';
    const strokeColor =
      status === 'error' ? '#cf6a6a' : selected || isHovered ? '#f59e0b' : '#4a4a4a';
    const strokeWidth = selected || isHovered ? 1.9 : 1.35;
    const dashPattern = status === 'running' ? '6 6' : undefined;

    return (
      <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18} className="cursor-pointer" />

        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashPattern}
          opacity={selected || isHovered ? 0.92 : 0.56}
          style={{ transition: 'stroke 0.15s ease, stroke-width 0.15s ease' }}
        />

        {status === 'running' ? (
          <path
            d={edgePath}
            fill="none"
            stroke="#d4a574"
            strokeWidth={strokeWidth}
            strokeDasharray="6 6"
            strokeLinecap="round"
            opacity={0.95}
            className="animate-[studio-flow_0.8s_linear_infinite]"
          />
        ) : null}

        <circle cx={sourceX} cy={sourceY} r={selected ? 2.4 : 2} fill={strokeColor} opacity={0.72} />
        <circle cx={targetX} cy={targetY} r={selected ? 2.4 : 2} fill={strokeColor} opacity={0.72} />

        {(edgeData?.label || edgeData?.onInsertAction) && (isHovered || selected) ? (
          <EdgeLabelRenderer>
            <div
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-white/8 bg-[#151515]/92 px-1.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-300 shadow-lg"
              style={{
                left: labelX,
                top: labelY,
              }}
            >
              {edgeData?.onInsertAction && edgeData.edgeId ? (
                <button
                  type="button"
                  className="nodrag pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-[#202020] text-zinc-300 transition-colors hover:border-[#f97316]/40 hover:text-white"
                  aria-label="Insert action"
                  onClick={(event) => {
                    event.stopPropagation();
                    edgeData.onInsertAction?.(edgeData.edgeId!, {
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  <Plus className="h-3 w-3" />
                </button>
              ) : null}
              {edgeData?.label ? <span className="pointer-events-none px-1.5">{edgeData.label}</span> : null}
            </div>
          </EdgeLabelRenderer>
        ) : null}
      </g>
    );
  }
);

ComputeEdge.displayName = 'ComputeEdge';
