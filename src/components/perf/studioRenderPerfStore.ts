export interface NodeRenderStats {
  id: string;
  label: string;
  count: number;
  lastRenderedAt: number;
}

export interface StudioRenderPerfSnapshot {
  canvasRenderCount: number;
  nodeRenders: NodeRenderStats[];
}

const EMPTY_SNAPSHOT: StudioRenderPerfSnapshot = {
  canvasRenderCount: 0,
  nodeRenders: [],
};

const listeners = new Set<() => void>();
const nodeRenderCounts = new Map<string, NodeRenderStats>();
let canvasRenderCount = 0;
let currentSnapshot = EMPTY_SNAPSHOT;
let emitQueued = false;

export function isStudioRenderPerfEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).has('debugPerf');
}

function publishSnapshot() {
  currentSnapshot = {
    canvasRenderCount,
    nodeRenders: Array.from(nodeRenderCounts.values())
      .sort((a, b) => b.lastRenderedAt - a.lastRenderedAt)
      .slice(0, 12),
  };

  listeners.forEach((listener) => listener());
}

function queuePublish() {
  if (emitQueued || !isStudioRenderPerfEnabled()) {
    return;
  }

  emitQueued = true;
  const publish = () => {
    emitQueued = false;
    publishSnapshot();
  };

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(publish);
    return;
  }

  window.setTimeout(publish, 0);
}

export function recordStudioCanvasRender() {
  if (!isStudioRenderPerfEnabled()) {
    return;
  }

  canvasRenderCount += 1;
  queuePublish();
}

export function recordStudioNodeRender(nodeId?: string, label?: string) {
  if (!nodeId || !isStudioRenderPerfEnabled()) {
    return;
  }

  const current = nodeRenderCounts.get(nodeId);
  nodeRenderCounts.set(nodeId, {
    id: nodeId,
    label: label || current?.label || nodeId,
    count: (current?.count ?? 0) + 1,
    lastRenderedAt: Date.now(),
  });
  queuePublish();
}

export function subscribeStudioRenderPerf(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStudioRenderPerfSnapshot() {
  return currentSnapshot;
}

export function getStudioRenderPerfFullSnapshot(): StudioRenderPerfSnapshot {
  return {
    canvasRenderCount,
    nodeRenders: Array.from(nodeRenderCounts.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function resetStudioRenderPerfStats() {
  canvasRenderCount = 0;
  nodeRenderCounts.clear();
  publishSnapshot();
}
