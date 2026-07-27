import { memo, useMemo } from 'react';
import { EdgeProps, getBezierPath } from '@xyflow/react';

export const GlowingEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) => {
  const [edgePath] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      }),
    [sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY]
  );

  const gradientId = `edge-gradient-${id}`;
  const glowGradientId = `edge-glow-gradient-${id}`;
  const glowId = `edge-glow-filter-${id}`;

  return (
    <>
      <path
        id={`${id}-glow`}
        className="react-flow__edge-path"
        d={edgePath}
        strokeWidth={8}
        stroke={`url(#${glowGradientId})`}
        fill="none"
        filter={`url(#${glowId})`}
        style={{ opacity: 0.5 }}
      />

      <path
        id={`${id}-pulse`}
        className="react-flow__edge-path animate-[studio-flow_1.2s_linear_infinite]"
        d={edgePath}
        strokeWidth={4}
        stroke={`url(#${gradientId})`}
        fill="none"
        filter={`url(#${glowId})`}
        strokeDasharray="8 8"
      />

      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        strokeWidth={2}
        stroke="#a78bfa"
        fill="none"
        markerEnd={markerEnd}
      />

      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        <linearGradient id={glowGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>

        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </>
  );
});

GlowingEdge.displayName = 'GlowingEdge';

export default GlowingEdge;
