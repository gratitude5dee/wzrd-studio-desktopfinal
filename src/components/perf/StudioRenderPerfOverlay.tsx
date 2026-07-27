import { useSyncExternalStore } from 'react';
import {
  getStudioRenderPerfSnapshot,
  isStudioRenderPerfEnabled,
  subscribeStudioRenderPerf,
} from './studioRenderPerfStore';

export function StudioRenderPerfOverlay({ nodeCount }: { nodeCount: number }) {
  const snapshot = useSyncExternalStore(
    subscribeStudioRenderPerf,
    getStudioRenderPerfSnapshot,
    getStudioRenderPerfSnapshot
  );

  if (!isStudioRenderPerfEnabled()) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[1200] w-64 rounded-md border border-white/10 bg-black/75 p-3 font-mono text-[11px] text-zinc-200 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
        <span className="font-semibold text-white">Studio perf</span>
        <span className="text-zinc-400">{nodeCount} nodes</span>
      </div>
      <div className="mb-2 flex justify-between">
        <span>Canvas renders</span>
        <span>{snapshot.canvasRenderCount}</span>
      </div>
      <div className="space-y-1">
        {snapshot.nodeRenders.length === 0 ? (
          <div className="text-zinc-500">No node renders yet</div>
        ) : (
          snapshot.nodeRenders.map((node) => (
            <div key={node.id} className="flex justify-between gap-2">
              <span className="truncate">{node.label}</span>
              <span>{node.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
