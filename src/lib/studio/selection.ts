import type { NodeDefinition } from '@/types/computeFlow';

const DEFAULT_NODE_WIDTH = 420;
const DEFAULT_NODE_HEIGHT = 300;
const FRAME_PADDING_X = 48;
const FRAME_PADDING_TOP = 72;
const FRAME_PADDING_BOTTOM = 40;

export interface SelectionFrameSource extends NodeDefinition {
  measuredWidth?: number;
  measuredHeight?: number;
}

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function normalizeSelectionIds(ids: string[], availableIds: Set<string>): string[] {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (!availableIds.has(id) || seen.has(id)) {
      continue;
    }

    seen.add(id);
    next.push(id);
  }

  return next;
}

export function toggleSelectionId(current: string[], id: string): string[] {
  return current.includes(id)
    ? current.filter((selectedId) => selectedId !== id)
    : [...current, id];
}

function getNodeWidth(node: SelectionFrameSource): number {
  return node.measuredWidth ?? node.size?.w ?? DEFAULT_NODE_WIDTH;
}

function getNodeHeight(node: SelectionFrameSource): number {
  return node.measuredHeight ?? node.size?.h ?? DEFAULT_NODE_HEIGHT;
}

export function buildFrameNodeForSelection(
  frameId: string,
  selectedNodes: SelectionFrameSource[],
  label = 'Group'
): NodeDefinition | null {
  if (selectedNodes.length < 2) {
    return null;
  }

  const left = Math.min(...selectedNodes.map((node) => node.position.x));
  const top = Math.min(...selectedNodes.map((node) => node.position.y));
  const right = Math.max(...selectedNodes.map((node) => node.position.x + getNodeWidth(node)));
  const bottom = Math.max(...selectedNodes.map((node) => node.position.y + getNodeHeight(node)));

  return {
    id: frameId,
    kind: 'comment',
    version: '1.0.0',
    label,
    position: {
      x: left - FRAME_PADDING_X,
      y: top - FRAME_PADDING_TOP,
    },
    size: {
      w: right - left + FRAME_PADDING_X * 2,
      h: bottom - top + FRAME_PADDING_TOP + FRAME_PADDING_BOTTOM,
    },
    inputs: [],
    outputs: [],
    params: {
      frame: true,
      title: label,
      color: '#f97316',
    },
    metadata: {
      role: 'frame',
      groupedNodeIds: selectedNodes.map((node) => node.id),
    },
    status: 'idle',
    progress: 0,
  };
}
