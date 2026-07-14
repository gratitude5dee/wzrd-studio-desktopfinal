import { getDesktopBridge } from '@/lib/desktop';
import { getMediaActionById, type MediaActionProvider } from '@/lib/studio/mediaActionRegistry';
import type { NodeDefinition } from '@/types/computeFlow';

export type StudioExecutionRuntime = 'desktop' | 'web';

export interface StudioMediaActionResult {
  outputPath?: string;
  outputs?: Array<{ type: string; path?: string; url?: string; data?: unknown; name?: string }>;
  metadata?: unknown;
}

interface StudioLocalMediaPlatform {
  selectExportFolder: () => Promise<string | null>;
  runStudioMediaAction: (params: {
    operationId: string;
    actionId: string;
    inputs?: Record<string, unknown>;
    params?: Record<string, unknown>;
    outputFolder: string;
  }) => Promise<StudioMediaActionResult>;
  resolveMediaFileUrl?: (params: { filePath: string }) => Promise<string>;
}

export interface StudioExecutionPlatform {
  runtime: StudioExecutionRuntime;
  localMedia: StudioLocalMediaPlatform | null;
}

export interface StudioWebCompatibilityState {
  state: 'desktop_only';
  label: 'Web blocked';
  title: string;
  description: string;
}

export type StudioNodeExecutionRoute =
  | { type: 'remote'; provider?: Extract<MediaActionProvider, 'fal-ai' | 'edge_function'> }
  | { type: 'desktop-local' }
  | { type: 'web-blocked'; compatibility: StudioWebCompatibilityState };

export function getStudioNodeActionId(node: Partial<NodeDefinition>): string | undefined {
  const params = node.params as Record<string, unknown> | undefined;
  const metadata = node.metadata as Record<string, unknown> | undefined;
  return (
    (typeof node.actionId === 'string' && node.actionId) ||
    (typeof params?.actionId === 'string' && params.actionId) ||
    (typeof metadata?.actionId === 'string' && metadata.actionId) ||
    undefined
  );
}

export function resolveStudioNodeExecutionRoute(
  node: NodeDefinition,
  runtime: StudioExecutionRuntime
): StudioNodeExecutionRoute {
  const actionId = getStudioNodeActionId(node);
  const action = actionId ? getMediaActionById(actionId) : undefined;
  const isLocalFfmpeg = Boolean(
    actionId &&
      actionId !== 'fal.ffmpeg' &&
      (action?.executor === 'ffmpeg' || node.executor === 'ffmpeg') &&
      action?.providerPreference.includes('local')
  );

  if (!isLocalFfmpeg) {
    return { type: 'remote' };
  }

  if (runtime === 'desktop') {
    return { type: 'desktop-local' };
  }

  const provider = action?.providerPreference.find(
    (candidate): candidate is Extract<MediaActionProvider, 'fal-ai' | 'edge_function'> =>
      candidate === 'fal-ai' || candidate === 'edge_function'
  );
  if (provider) {
    return { type: 'remote', provider };
  }

  return {
    type: 'web-blocked',
    compatibility: {
      state: 'desktop_only',
      label: 'Web blocked',
      title: `${action?.label ?? node.label} runs on desktop`,
      description: 'This local FFmpeg node stays in the graph and is skipped in this browser.',
    },
  };
}

export function getStudioExecutionPlatform(): StudioExecutionPlatform {
  const desktop = getDesktopBridge();
  if (!desktop) {
    return { runtime: 'web', localMedia: null };
  }

  const localMedia =
    desktop.selectExportFolder && desktop.runStudioMediaAction
      ? {
          selectExportFolder: desktop.selectExportFolder,
          runStudioMediaAction: desktop.runStudioMediaAction,
          resolveMediaFileUrl: desktop.resolveMediaFileUrl,
        }
      : null;

  return { runtime: 'desktop', localMedia };
}
