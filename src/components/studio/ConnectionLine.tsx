import { ConnectionLineComponentProps, getBezierPath } from '@xyflow/react';
import { DataType } from '@/types/computeFlow';

export const CustomConnectionLine = ({
  fromX,
  fromY,
  toX,
  toY,
  fromHandle,
}: ConnectionLineComponentProps) => {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const curvature = Math.min(0.5, Math.max(0.25, distance / 800));

  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    curvature,
  });

  const getDataType = (): DataType => {
    if (!fromHandle?.id) return 'any';
    const id = fromHandle.id.toLowerCase();
    if (id.includes('image') || id.includes('reference')) return 'image';
    if (id.includes('text') || id.includes('prompt')) return 'text';
    if (id.includes('video')) return 'video';
    if (id.includes('audio')) return 'audio';
    return 'any';
  };

  const strokeColor = getDataType() === 'text' ? '#d4a574' : '#f59e0b';

  return (
    <g>
      <path
        fill="none"
        stroke="#4a4a4a"
        strokeWidth={1.35}
        strokeLinecap="round"
        d={edgePath}
        opacity={0.56}
      />
      <path
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.35}
        strokeLinecap="round"
        d={edgePath}
        strokeDasharray="6 6"
        opacity={0.48}
        className="animate-[studio-flow_0.8s_linear_infinite]"
      />
      <circle cx={fromX} cy={fromY} r={2.1} fill="#4a4a4a" opacity={0.7} />
      <circle cx={toX} cy={toY} r={2.1} fill="#4a4a4a" opacity={0.7} />
    </g>
  );
};
