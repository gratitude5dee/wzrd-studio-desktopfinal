import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';
import { EdgeStatus } from '@/types/computeFlow';

interface CustomEdgeData {
  status?: EdgeStatus;
  color?: string;
  dashed?: boolean;
}

const CustomEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
    curvature: 0.8,
  });

  const edgeData = data as CustomEdgeData | undefined;
  const status: EdgeStatus = edgeData?.status || 'idle';
  const isRunning = status === 'running';
  const isError = status === 'error';
  const isSuccess = status === 'succeeded';

  const getStatusColor = () => {
    if (isError) return '#ef4444';
    if (isSuccess) return '#f97316';
    if (isRunning) return '#3b82f6';
    return edgeData?.color || '#52525b';
  };

  const strokeColor = getStatusColor();

  return (
    <>
      {/* Glow effect for edges */}
      <BaseEdge 
        path={edgePath}
        style={{
          strokeWidth: 10,
          stroke: strokeColor,
          opacity: 0.15,
          filter: 'blur(4px)',
        }}
      />
      
      {/* Main edge path */}
      <BaseEdge 
        path={edgePath}
        style={{
          ...style,
          strokeWidth: isRunning ? 3.5 : 3,
          stroke: strokeColor,
          strokeDasharray: isRunning ? '10 5' : edgeData?.dashed ? '5,5' : 'none',
          opacity: 0.9,
        }}
        className={isRunning ? 'animate-[studio-flow_0.8s_linear_infinite]' : undefined}
      />

      {/* Connection dots at endpoints */}
      <circle
        cx={sourceX}
        cy={sourceY}
        r={4}
        fill={strokeColor}
        opacity={0.8}
      />
      <circle
        cx={targetX}
        cy={targetY}
        r={4}
        fill={strokeColor}
        opacity={0.8}
      />

      {isRunning ? (
        <BaseEdge
          path={edgePath}
          style={{
            strokeWidth: 4,
            stroke: strokeColor,
            strokeDasharray: '10 5',
            opacity: 0.55,
          }}
          className="animate-[studio-flow_0.8s_linear_infinite]"
        />
      ) : null}

      {/* Success flash */}
      {isSuccess && (
        <animate
          attributeName="opacity"
          values="1;0"
          dur="0.8s"
          fill="freeze"
        />
      )}
    </>
  );
};

export default CustomEdge;
