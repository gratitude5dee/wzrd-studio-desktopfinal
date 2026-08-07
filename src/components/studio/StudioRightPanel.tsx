import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  Eraser,
  Inbox,
  Layers,
  MoreHorizontal,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AssetsGalleryPanel, type Asset } from './panels/AssetsGalleryPanel';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { NodeDefinition } from '@/types/computeFlow';
import { getNodeImagePreviewUrl } from '@/lib/imageEdit';
import {
  useStudioGraphActions,
  type StudioNodeType,
  type StudioNodeSeedOptions,
} from '@/hooks/studio/useStudioGraphActions';
import ImageEditDock from './image-edit/ImageEditDock';
import { FloraModelMarketplace } from './model-selector/FloraModelMarketplace';
import { useCatalogModels } from '@/hooks/useCatalogModels';
import {
  getNodeModelSelection,
  getNodePromptValue,
  getNodeTextPreviewValue,
  getStudioNodeMediaType,
} from '@/lib/studio/nodeUtils';
import {
  getMediaActionById,
  type MediaActionControl,
} from '@/lib/studio/mediaActionRegistry';
import { useStudioNodeGeneration } from '@/hooks/studio/useStudioNodeGeneration';
import { StudioNodePalette } from './StudioNodePalette';
import { WorkflowGeneratorTab } from './WorkflowGeneratorTab';
import type { NodeDefinition as WFNodeDef, EdgeDefinition as WFEdgeDef } from '@/types/computeFlow';

type RightPanelTab = 'gallery' | 'nodes' | 'generate';

interface StudioRightPanelProps {
  projectId?: string;
  selectedNodeId?: string | null;
  onClearSelection?: () => void;
  onAssetSelect?: (asset: Asset) => void;
  onWidthChange?: (width: number) => void;
  onCreateNode?: (type: StudioNodeType, seed?: StudioNodeSeedOptions) => void;
  onWorkflowGenerated?: (nodes: WFNodeDef[], edges: WFEdgeDef[]) => void;
}

function getNodeTextValue(node?: Pick<NodeDefinition, 'preview' | 'params'> | null): string | undefined {
  const value = getNodeTextPreviewValue(node);
  return value.trim().length > 0 ? value : undefined;
}

function formatFileType(node: NodeDefinition) {
  if (node.kind === 'Video') {
    return 'MP4';
  }
  if (node.kind === 'Image' || node.kind === 'ImageEdit') {
    return 'PNG';
  }
  if (node.kind === 'Text') {
    return 'TXT';
  }
  return 'N/A';
}

function formatCreatedValue(node: NodeDefinition) {
  const rawValue =
    (typeof node.metadata?.createdAt === 'string' && node.metadata.createdAt) ||
    (typeof node.metadata?.dateCreated === 'string' && node.metadata.dateCreated) ||
    '';

  if (!rawValue) {
    return 'Recently';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatFileSizeValue(node: NodeDefinition) {
  const rawValue =
    (typeof node.metadata?.sizeBytes === 'number' && node.metadata.sizeBytes) ||
    (typeof node.metadata?.fileSizeBytes === 'number' && node.metadata.fileSizeBytes) ||
    (typeof node.metadata?.fileSize === 'number' && node.metadata.fileSize) ||
    0;

  if (!rawValue) {
    return 'N/A';
  }

  if (rawValue < 1024 * 1024) {
    return `${Math.round(rawValue / 1024)} KB`;
  }

  return `${(rawValue / (1024 * 1024)).toFixed(1)} MB`;
}

function ActionIconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(249,115,22,0.12)] bg-[#131313] text-zinc-300 transition-colors hover:border-[rgba(249,115,22,0.20)] hover:bg-[#191919] hover:text-white"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-4 text-sm">
      <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <span className="truncate text-right text-zinc-100">{value}</span>
    </div>
  );
}

function formatProviderLabel(provider?: string) {
  if (!provider) {
    return 'Model';
  }

  if (provider === 'gmi-cloud') {
    return 'GMI Cloud';
  }

  return provider
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function NodeInspector({
  node,
  projectId,
  extraContent,
  onClearSelection,
}: {
  node: NodeDefinition;
  projectId?: string;
  extraContent?: React.ReactNode;
  onClearSelection?: () => void;
}) {
  const { updateNode, removeNode } = useComputeFlowStore();
  const { scheduleSave } = useStudioGraphActions(projectId);
  const { generateNode, updateNodeModelSelection } = useStudioNodeGeneration(projectId);
  const { models: catalogModels } = useCatalogModels({ autoFetch: true });

  const params = (node.params ?? {}) as Record<string, unknown>;
  const registryAction = getMediaActionById(node.actionId ?? (typeof params.actionId === 'string' ? params.actionId : undefined));
  const registryControls = registryAction?.controls ?? [];
  const mediaType = getStudioNodeMediaType(node.kind);
  const modelSelection = getNodeModelSelection(node);
  const previewUrl = node.kind === 'Image' ? getNodeImagePreviewUrl(node) : node.preview?.url;
  const promptValue = getNodePromptValue(node);
  const textPreview = getNodeTextValue(node);
  const selectedModel = catalogModels.find((model) => model.id === modelSelection.selectedModelIds[0]);
  const requestedModelId =
    (typeof params.requestedModelId === 'string' && params.requestedModelId) ||
    modelSelection.selectedModelIds[0] ||
    '';
  const resolvedModelId =
    (typeof params.resolvedModelId === 'string' && params.resolvedModelId) ||
    requestedModelId ||
    '';
  const requestedModel = requestedModelId ? catalogModels.find((model) => model.id === requestedModelId) : undefined;
  const resolvedModel = resolvedModelId ? catalogModels.find((model) => model.id === resolvedModelId) : undefined;
  const fallbackUsed =
    Boolean(params.fallbackUsed) || Boolean(requestedModelId && resolvedModelId && requestedModelId !== resolvedModelId);
  const fallbackReason =
    typeof params.fallbackReason === 'string' && params.fallbackReason.trim().length > 0
      ? params.fallbackReason
      : undefined;
  const aspectRatioValue = typeof params.aspectRatio === 'string' ? params.aspectRatio : 'Auto';
  const resolutionValue = typeof params.resolution === 'string' ? params.resolution : '2K';
  const seedValue = typeof params.seed === 'number' ? String(params.seed) : typeof params.seed === 'string' ? params.seed : '';
  const createdValue = formatCreatedValue(node);
  const fileSizeValue = formatFileSizeValue(node);
  const creatorValue =
    (typeof node.metadata?.creatorName === 'string' && node.metadata.creatorName) ||
    (typeof node.metadata?.createdBy === 'string' && node.metadata.createdBy) ||
    'Studio user';
  const statusMessage =
    typeof node.error === 'string' && node.error.trim().length > 0
      ? node.error
      : fallbackUsed && resolvedModel
        ? `Ran with ${resolvedModel.name} after resolving the selected model.`
        : null;

  const updateParams = useCallback(
    (nextParams: Record<string, unknown>) => {
      updateNode(node.id, {
        params: {
          ...params,
          ...nextParams,
        },
      });
      scheduleSave();
    },
    [node.id, params, scheduleSave, updateNode]
  );

  const renderRegistryControl = (control: MediaActionControl) => {
    const value = params[control.id] ?? control.defaultValue ?? '';
    const labelClass = 'space-y-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-500';
    const controlClass = 'h-12 w-full rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#131313] px-3 text-sm text-white outline-none';

    if (control.type === 'select') {
      return (
        <label key={control.id} className={labelClass}>
          <span>{control.label}</span>
          <select
            value={String(value)}
            onChange={(event) => updateParams({ [control.id]: event.target.value })}
            className={controlClass}
          >
            {(control.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (control.type === 'slider') {
      const numericValue = typeof value === 'number' ? value : Number(value || control.defaultValue || 0);
      return (
        <label key={control.id} className={labelClass}>
          <span className="flex items-center justify-between">
            <span>{control.label}</span>
            <span className="font-mono text-zinc-300">{numericValue}</span>
          </span>
          <input
            type="range"
            value={numericValue}
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            onChange={(event) => updateParams({ [control.id]: Number(event.target.value) })}
            className="w-full accent-orange-500"
          />
        </label>
      );
    }

    if (control.type === 'switch') {
      return (
        <div key={control.id} className="flex items-center justify-between rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#131313] px-4 py-3">
          <span className="text-sm text-zinc-200">{control.label}</span>
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => updateParams({ [control.id]: checked })}
          />
        </div>
      );
    }

    if (control.type === 'color') {
      return (
        <label key={control.id} className={labelClass}>
          <span>{control.label}</span>
          <input
            type="color"
            value={String(value)}
            onChange={(event) => updateParams({ [control.id]: event.target.value })}
            className="h-12 w-full rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#131313] p-2"
          />
        </label>
      );
    }

    if (control.type === 'textarea') {
      return (
        <label key={control.id} className={labelClass}>
          <span>{control.label}</span>
          <Textarea
            value={String(value)}
            onChange={(event) => updateParams({ [control.id]: event.target.value })}
            className="min-h-28 rounded-[18px] border-[rgba(249,115,22,0.12)] bg-[#131313] text-white"
          />
        </label>
      );
    }

    if (control.type === 'file') {
      return (
        <label key={control.id} className={labelClass}>
          <span>{control.label}</span>
          <Input
            type="file"
            onChange={(event) => updateParams({ [`${control.id}Name`]: event.target.files?.[0]?.name ?? '' })}
            className="h-12 rounded-[18px] border-[rgba(249,115,22,0.12)] bg-[#131313] text-white"
          />
        </label>
      );
    }

    return (
      <label key={control.id} className={labelClass}>
        <span>{control.label}</span>
        <Input
          type={control.type === 'number' ? 'number' : 'text'}
          value={String(value)}
          min={control.min}
          max={control.max}
          step={control.step}
          onChange={(event) =>
            updateParams({
              [control.id]: control.type === 'number' ? Number(event.target.value) : event.target.value,
            })
          }
          className="h-12 rounded-[18px] border-[rgba(249,115,22,0.12)] bg-[#131313] text-white"
        />
      </label>
    );
  };

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="border-b border-[rgba(249,115,22,0.10)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Selected node</div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-[rgba(249,115,22,0.10)] bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
                {node.kind}
              </Badge>
              <Badge className="rounded-full border border-[#f97316]/20 bg-[#1a1510] px-2.5 py-1 text-[11px] text-[#fdba74]">
                {node.status}
              </Badge>
            </div>
            <div className="mt-2 truncate text-[22px] font-medium leading-[1.05] tracking-[-0.03em] text-white">
              {node.label}
            </div>
            <div className="mt-1.5 text-sm text-zinc-500">
              {resolvedModel
                ? `${formatProviderLabel(resolvedModel.provider)} · ${resolvedModel.name}`
                : selectedModel
                  ? `${formatProviderLabel(selectedModel.provider)} · ${selectedModel.name}`
                  : 'No model selected'}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-9 rounded-full border border-[rgba(249,115,22,0.12)] bg-[#131313] p-0 text-zinc-400 hover:border-[rgba(249,115,22,0.20)] hover:bg-[#191919] hover:text-white"
            onClick={onClearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {statusMessage ? (
          <section
            className={cn(
              'rounded-[20px] border px-4 py-3 text-sm leading-6',
              node.status === 'failed'
                ? 'border-[#B85050]/20 bg-[#2b1717]/70 text-[#e1b2b2]'
                : 'border-[#f97316]/20 bg-[#1a1510]/70 text-[#d4a574]'
            )}
          >
            {statusMessage}
          </section>
        ) : null}

        <section className="space-y-3 rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[#101010]/98 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
          {previewUrl ? (
            <div className="overflow-hidden rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[#141414] shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
              {node.kind === 'Video' ? (
                <video src={previewUrl} className="aspect-[16/9] w-full object-cover" controls muted />
              ) : (
                <img src={previewUrl} alt={node.label} className="aspect-[16/9] w-full object-cover" />
              )}
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[#111111]/98 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Metadata</div>
          <div className="space-y-3">
            <MetadataRow label="Model" value={resolvedModel?.name || selectedModel?.name || 'Not set'} />
            {fallbackUsed && requestedModel ? (
              <MetadataRow label="Requested" value={requestedModel.name} />
            ) : null}
            <MetadataRow label="Format" value={formatFileType(node)} />
            <MetadataRow label="Size" value={fileSizeValue} />
            <MetadataRow label="Resolution" value={String(params.imageSize || params.resolution || aspectRatioValue)} />
            <MetadataRow label="Created" value={createdValue} />
            <MetadataRow label="Creator" value={creatorValue} />
            <MetadataRow label="Cost" value={resolvedModel ? `⊕${resolvedModel.credits}` : selectedModel ? `⊕${selectedModel.credits}` : 'N/A'} />
            {fallbackUsed && fallbackReason ? (
              <MetadataRow label="Fallback" value={fallbackReason} />
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[#111111]/98 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Actions</div>
          <div className="flex flex-wrap items-center gap-2.5">
            <ActionIconButton icon={Play} label="Generate" onClick={() => void generateNode(node.id)} />
            <ActionIconButton icon={Sparkles} label="Enhance" />
            <ActionIconButton icon={Eraser} label="Inpaint" />
            <ActionIconButton icon={Crop} label="Crop" />
            <ActionIconButton icon={MoreHorizontal} label="More" onClick={() => removeNode(node.id)} />
          </div>
        </section>

        {mediaType || registryAction ? (
          <section className="space-y-3 rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[#111111]/98 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{mediaType ? 'Generate' : 'Action'}</div>

            {mediaType ? (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Model</div>
              <FloraModelMarketplace
                mediaType={mediaType}
                value={modelSelection}
                onChange={(selection) => updateNodeModelSelection(node.id, selection)}
                className="h-12 w-full justify-between rounded-[18px]"
              />
            </div>
            ) : null}

            {registryAction ? (
              <div className="rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#131313] px-4 py-3">
                <div className="text-sm text-white">{registryAction.label}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">{registryAction.workflowType}</div>
              </div>
            ) : null}

            {registryControls.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {registryControls.map(renderRegistryControl)}
              </div>
            ) : null}

            {registryControls.length === 0 && (node.kind === 'Image' || node.kind === 'Video') ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <span>Aspect Ratio</span>
                  <select
                    value={aspectRatioValue}
                    onChange={(event) => updateParams({ aspectRatio: event.target.value })}
                    className="h-12 w-full rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#131313] px-3 text-sm text-white outline-none"
                  >
                    <option value="Auto">Auto</option>
                    <option value="16:9">16:9</option>
                    <option value="4:5">4:5</option>
                    <option value="1:1">1:1</option>
                    <option value="9:16">9:16</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <span>Resolution</span>
                  <select
                    value={resolutionValue}
                    onChange={(event) => updateParams({ resolution: event.target.value })}
                    className="h-12 w-full rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#131313] px-3 text-sm text-white outline-none"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </label>
              </div>
            ) : null}

            {registryControls.length === 0 && node.kind === 'Text' ? (
              <div className="flex items-center justify-between rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[#131313] px-4 py-3">
                <div>
                  <div className="text-sm text-white">Web Search</div>
                  <div className="text-xs text-zinc-500">Use web context when prompting.</div>
                </div>
                <Switch
                  checked={Boolean(params.webSearch)}
                  onCheckedChange={(checked) => updateParams({ webSearch: checked })}
                />
              </div>
            ) : registryControls.length === 0 ? (
              <label className="space-y-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <span>Seed</span>
                <Input
                  value={seedValue}
                  onChange={(event) => updateParams({ seed: event.target.value })}
                  placeholder="Random"
                  className="h-12 rounded-[18px] border-[rgba(249,115,22,0.12)] bg-[#131313] font-mono text-white"
                />
              </label>
            ) : null}

            <label className="space-y-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <span>Prompt</span>
              <Textarea
                value={promptValue}
                onChange={(event) =>
                  updateParams(
                    node.kind === 'Text'
                      ? { prompt: event.target.value, content: event.target.value }
                      : { prompt: event.target.value }
                  )
                }
                className="min-h-[180px] rounded-[22px] border-[rgba(249,115,22,0.12)] bg-[#131313] text-white"
                placeholder="Describe what this node should create..."
              />
            </label>
          </section>
        ) : null}

        {textPreview ? (
          <section className="space-y-3 rounded-[24px] border border-[rgba(249,115,22,0.12)] bg-[#111111]/98 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Preview</div>
            <div className="max-h-56 overflow-y-auto rounded-[22px] border border-[rgba(249,115,22,0.10)] bg-[#131313] p-4 text-sm leading-6 text-zinc-200">
              {textPreview}
            </div>
          </section>
        ) : null}

        {extraContent}
      </div>
    </div>
  );
}

function NodeCreationSection({
  onCreateNode,
  title = 'Create Node',
  description,
}: {
  onCreateNode?: (type: StudioNodeType, seed?: StudioNodeSeedOptions) => void;
  title?: string;
  description?: string;
}) {
  if (!onCreateNode) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-[rgba(249,115,22,0.12)] bg-[#111111]/98 p-4">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{title}</div>
        {description ? <p className="text-sm leading-6 text-zinc-400">{description}</p> : null}
      </div>
      <StudioNodePalette onCreateNode={onCreateNode} />
    </section>
  );
}

export function StudioRightPanel({
  projectId,
  selectedNodeId,
  onClearSelection,
  onAssetSelect,
  onWidthChange,
  onCreateNode,
  onWorkflowGenerated,
}: StudioRightPanelProps) {
  const { nodeDefinitions, edgeDefinitions } = useComputeFlowStore();
  const [activeTab, setActiveTab] = useState<RightPanelTab>('gallery');
  const [isCollapsed, setIsCollapsed] = useState(true);

  const selectedNode = useMemo(
    () => nodeDefinitions.find((node) => node.id === selectedNodeId) ?? null,
    [nodeDefinitions, selectedNodeId]
  );

  const incomingEdges = useMemo(
    () => edgeDefinitions.filter((edge) => edge.target.nodeId === selectedNode?.id),
    [edgeDefinitions, selectedNode?.id]
  );

  const incomingImageSources = useMemo(
    () =>
      incomingEdges
        .map((edge) => {
          const sourceNode = nodeDefinitions.find((node) => node.id === edge.source.nodeId);
          const imageUrl = getNodeImagePreviewUrl(sourceNode);
          if (!sourceNode || !imageUrl) {
            return null;
          }
          return {
            sourceNodeId: sourceNode.id,
            name: sourceNode.label || 'Image Layer',
            url: imageUrl,
          };
        })
        .filter(Boolean) as Array<{ sourceNodeId: string; name: string; url: string }>,
    [incomingEdges, nodeDefinitions]
  );

  const incomingPrompt = useMemo(
    () =>
      incomingEdges
        .map((edge) => {
          const sourceNode = nodeDefinitions.find((node) => node.id === edge.source.nodeId);
          if (!sourceNode) {
            return undefined;
          }

          return getNodeTextValue(sourceNode);
        })
        .find((value) => typeof value === 'string' && value.trim().length > 0),
    [incomingEdges, nodeDefinitions]
  );

  useEffect(() => {
    if (selectedNodeId) {
      setActiveTab('nodes');
    }
  }, [selectedNodeId]);

  const panelWidth =
    isCollapsed ? 58 : activeTab === 'nodes' && selectedNode?.kind === 'ImageEdit' ? 960 : 372;

  useEffect(() => {
    onWidthChange?.(panelWidth);
  }, [onWidthChange, panelWidth]);

  const tabs = [
    { id: 'gallery' as const, label: 'Gallery', icon: Inbox },
    { id: 'nodes' as const, label: 'Nodes', icon: Layers },
    { id: 'generate' as const, label: 'Generate', icon: Sparkles },
  ];
  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const ActiveTabIcon = activeTabConfig.icon;

  return (
    <motion.aside
      className="fixed bottom-4 right-4 top-[74px] z-40 flex justify-end"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <AnimatePresence mode="wait">
        {isCollapsed ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            onClick={() => setIsCollapsed(false)}
            className="flex h-full w-[58px] flex-col items-center justify-between overflow-hidden rounded-[26px] border border-[rgba(249,115,22,0.12)] bg-[#090909]/98 px-2 py-4 shadow-[-20px_0_64px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
            title={`Expand ${activeTabConfig.label}`}
            aria-label={`Expand ${activeTabConfig.label}`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[rgba(249,115,22,0.12)] bg-[#111111] text-zinc-200">
                <ActiveTabIcon className="h-4 w-4" />
              </div>
              <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">
                {activeTabConfig.label}
              </span>
            </div>
            <div className="flex flex-col items-center gap-3">
              {selectedNode ? (
                <div className="flex flex-col items-center gap-2">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      selectedNode.status === 'failed'
                        ? 'bg-[#B85050]'
                        : selectedNode.status === 'succeeded'
                          ? 'bg-[#f97316]'
                          : 'bg-zinc-500'
                    )}
                  />
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                    {selectedNode.kind}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Rail</span>
              )}
              <ChevronLeft className="h-4 w-4 text-zinc-300" />
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            className={cn(
              'relative flex h-full flex-col overflow-hidden rounded-[30px] border border-[rgba(249,115,22,0.12)] bg-[#090909]/98 shadow-[-24px_0_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl',
              activeTab === 'nodes' && selectedNode?.kind === 'ImageEdit' ? 'w-[960px]' : 'w-[372px]'
            )}
          >
              <div className="flex items-center border-b border-[rgba(249,115,22,0.10)] bg-[#111111]/80 pr-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'relative flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                      {isActive ? (
                        <motion.div
                          layoutId="studio-right-panel-tab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f97316]"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setIsCollapsed(true)}
                  className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(249,115,22,0.12)] bg-[#131313] text-zinc-400 transition-colors hover:border-[rgba(249,115,22,0.20)] hover:bg-[#191919] hover:text-white"
                  title="Collapse panel"
                  aria-label="Collapse panel"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

            <div className="min-h-0 flex-1">
                <AnimatePresence mode="wait">
                  {activeTab === 'gallery' && projectId ? (
                    <motion.div
                      key="gallery"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <AssetsGalleryPanel
                        projectId={projectId}
                        onAssetSelect={onAssetSelect}
                        onClose={() => setIsCollapsed(true)}
                        hideHeader
                      />
                    </motion.div>
                  ) : null}

                  {activeTab === 'nodes' ? (
                    <motion.div
                      key="nodes"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="h-full"
                    >
                      {selectedNode?.kind === 'ImageEdit' ? (
                        <div className="flex h-full min-h-0 flex-col">
                          <div className="flex items-center justify-between border-b border-[rgba(249,115,22,0.10)] px-5 py-4">
                            <div className="flex items-center gap-2">
                              <Badge className="rounded-full border border-[rgba(249,115,22,0.10)] bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
                                {selectedNode.kind}
                              </Badge>
                              <span className="text-sm text-zinc-400">Selected node</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 rounded-full px-2 text-zinc-400 hover:bg-white/5 hover:text-white"
                              onClick={onClearSelection}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="min-h-0 flex-1">
                            <ImageEditDock
                              projectId={projectId}
                              node={selectedNode}
                              incomingImageSources={incomingImageSources}
                              incomingPrompt={incomingPrompt}
                            />
                          </div>
                        </div>
                      ) : selectedNode ? (
                        <NodeInspector
                          node={selectedNode}
                          projectId={projectId}
                          onClearSelection={onClearSelection}
                          extraContent={
                            <NodeCreationSection
                              onCreateNode={onCreateNode}
                              description="Create a new node from the same Studio graph palette without leaving the inspector."
                            />
                          }
                        />
                      ) : (
                        <div className="flex h-full flex-col bg-transparent">
                          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                            <section className="space-y-3 rounded-[26px] border border-[rgba(249,115,22,0.12)] bg-[#101010]/98 px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
                              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Nodes</div>
                              <div className="text-[30px] font-medium leading-[1.05] tracking-[-0.03em] text-white">
                                Build the graph from the rail.
                              </div>
                              <p className="text-sm leading-6 text-zinc-400">
                                Create Text, Image, Image Edit, and Video nodes from the same Studio palette used by the left add rail.
                              </p>
                            </section>

                            <NodeCreationSection
                              onCreateNode={onCreateNode}
                              title="Create Node"
                              description="Choose a node type to add it directly to the canvas."
                            />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ) : null}

                  {activeTab === 'generate' ? (
                    <motion.div
                      key="generate"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="h-full overflow-y-auto"
                    >
                      {onWorkflowGenerated ? (
                        <WorkflowGeneratorTab
                          projectId={projectId}
                          selectedNodeId={selectedNodeId}
                          selectedNodeLabel={selectedNode?.label ?? null}
                          variant="panel"
                          onWorkflowGenerated={onWorkflowGenerated}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-500">
                          Open a project to use the workflow generator.
                        </div>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

export default StudioRightPanel;
