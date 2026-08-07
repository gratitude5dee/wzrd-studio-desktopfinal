import React, { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, Connection, useUpdateNodeInternals } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  ChevronUp, 
  Play, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  Image,
  Type,
  Video,
  Wand2,
  Box,
  Workflow,
  Send,
  GitBranch,
  Sparkles,
  ChevronRight,
  Music,
  Copy,
  Download,
  Star,
  Trash2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HANDLE_COLORS, HANDLE_GLOW_COLORS, Port, DataType, isTypeCompatible } from '@/types/computeFlow';
import { NodeHoverMenu } from './NodeHoverMenu';
import { useCatalogModels, type CatalogMediaType } from '@/hooks/useCatalogModels';
import { getMediaActionById, type MediaActionControl } from '@/lib/studio/mediaActionRegistry';

export interface ComputeNodeData {
  kind: string;
  label: string;
  inputs: Port[];
  outputs: Port[];
  params: Record<string, unknown>;
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'dirty';
  progress?: number;
  preview?: { type: string; url?: string; data?: unknown };
  actionId?: string;
  mediaType?: string;
  workflowType?: string;
  controls?: MediaActionControl[];
  batch?: { policy?: string; items?: unknown[] };
  variants?: Array<{ id: string; type: string; url?: string; data?: unknown }>;
  collapsed?: boolean;
  color?: string;
  model?: string;
  modelSelection?: { auto: boolean; selectedModelIds: string[]; useMultipleModels: boolean };
  onExecute?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onModelChange?: (modelId: string) => void;
  onModelSelectionChange?: (selection: { auto: boolean; selectedModelIds: string[]; useMultipleModels: boolean }) => void;
  onUpdateParams?: (params: Record<string, unknown>) => void;
  onParamsChange?: (params: Record<string, unknown>) => void;
}

const NODE_ICONS: Record<string, LucideIcon> = {
  Image: Image,
  Text: Type,
  Video: Video,
  Prompt: Wand2,
  Model: Box,
  Transform: Workflow,
  Output: Send,
  Gateway: GitBranch,
  Audio: Music,
};

const HELPER_TEXT: Record<string, string> = {
  Image: "Try 'An abstract geometric pattern with vibrant colors'",
  Text: "Try 'Write a compelling product description'",
  Video: "Try 'A cinematic drone shot over mountains'",
  Prompt: "Connect text or image inputs to enhance prompts",
  Model: "Select and configure AI model parameters",
  Transform: "Apply transformations to your data",
  Output: "Export or save your generated content",
  Gateway: "Route data based on conditions",
};

export const ComputeNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = (data as unknown) as ComputeNodeData;
  const { getEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const paramsActionId = typeof nodeData.params?.actionId === 'string' ? nodeData.params.actionId : undefined;
  const action = useMemo(
    () => getMediaActionById(nodeData.actionId ?? paramsActionId),
    [nodeData.actionId, paramsActionId]
  );
  const mediaType: CatalogMediaType | undefined = useMemo(() => {
    const candidate =
      action?.modelMediaType ??
      action?.mediaType ??
      nodeData.mediaType ??
      (nodeData.kind === 'Image' || nodeData.kind === 'ImageEdit' ? 'image' :
        nodeData.kind === 'Text' || nodeData.kind === 'Prompt' ? 'text' :
        nodeData.kind === 'Video' ? 'video' :
        nodeData.kind === 'Audio' ? 'audio' :
        nodeData.kind === 'Model' ? '3d' :
        undefined);
    return ['text', 'image', 'video', 'audio', 'json', '3d'].includes(String(candidate))
      ? (candidate as CatalogMediaType)
      : undefined;
  }, [action?.mediaType, action?.modelMediaType, nodeData.kind, nodeData.mediaType]);
  const modelWorkflowTypes = useMemo(() => {
    const configured = action?.modelWorkflowTypes ?? [];
    const current = nodeData.workflowType ?? action?.workflowType;
    return Array.from(new Set([...configured, current].filter((value): value is string => typeof value === 'string' && value.length > 0)));
  }, [action?.modelWorkflowTypes, action?.workflowType, nodeData.workflowType]);
  const preferredProvider =
    mediaType && mediaType !== 'text' && action?.providerPreference?.includes('fal-ai')
      ? 'fal-ai'
      : undefined;
  const { models: catalogModels } = useCatalogModels({
    mediaType,
    provider: preferredProvider,
    workflowTypes: modelWorkflowTypes,
    studioSurface: mediaType ? `studio:${mediaType}` : undefined,
    includeAdvanced: true,
    autoFetch: Boolean(mediaType),
  });
  const [collapsed, setCollapsed] = useState(nodeData.collapsed ?? false);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const modelOptions = useMemo(() => {
    const compatible = modelWorkflowTypes.length > 0
      ? catalogModels.filter((model) => modelWorkflowTypes.includes(model.workflow_type))
      : catalogModels;
    const models = compatible.length > 0 ? compatible : catalogModels;
    return models.map((model) => ({ id: model.id, label: model.name }));
  }, [catalogModels, modelWorkflowTypes]);

  const Icon = NODE_ICONS[nodeData.kind] || Box;
  const helperText = action?.description ?? HELPER_TEXT[nodeData.kind] ?? '';
  const models = modelOptions;
  const actionControls = nodeData.controls ?? action?.controls ?? [];
  const selectedModel =
    (typeof nodeData.params?.model === 'string' && nodeData.params.model) ||
    nodeData.modelSelection?.selectedModelIds?.[0] ||
    nodeData.model ||
    action?.defaultModelId ||
    modelOptions[0]?.id ||
    '';
  const progressValue = Math.max(0, Math.min(100, Number(nodeData.progress ?? 0)));
  const previewData =
    nodeData.preview?.data && typeof nodeData.preview.data === 'object'
      ? (nodeData.preview.data as Record<string, unknown>)
      : {};
  const previewUrl =
    nodeData.preview?.url ??
    (typeof previewData.url === 'string' ? previewData.url : undefined) ??
    (typeof previewData.audioUrl === 'string' ? previewData.audioUrl : undefined) ??
    (typeof previewData.modelUrl === 'string' ? previewData.modelUrl : undefined);
  const previewText =
    typeof nodeData.preview?.data === 'string'
      ? nodeData.preview.data
      : previewData.text ?? previewData.prompt ?? previewData.content;

  const handleSignature = useMemo(
    () => [
      ...(nodeData.inputs ?? []).map((port) => `in:${port.id}:${port.datatype}:${port.position}`),
      ...(nodeData.outputs ?? []).map((port) => `out:${port.id}:${port.datatype}:${port.position}`),
    ].join('|'),
    [nodeData.inputs, nodeData.outputs]
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [handleSignature, id, updateNodeInternals]);

  // Get primary color based on node type
  const primaryColor = useMemo(() => {
    const outputType = nodeData.outputs?.[0]?.datatype || 'any';
    return HANDLE_COLORS[outputType as DataType] || HANDLE_COLORS.any;
  }, [nodeData.outputs]);

  // Status indicator styles with premium glow effects
  const statusStyles = useMemo(() => {
    switch (nodeData.status) {
      case 'running': return { 
        ring: 'ring-2 ring-blue-500/60', 
        dot: 'bg-blue-500',
        glow: '0 0 20px rgba(59, 130, 246, 0.4)',
        animate: true,
      };
      case 'succeeded': return { 
        ring: 'ring-2 ring-amber-500/60', 
        dot: 'bg-amber-500',
        glow: '0 0 16px rgba(245, 158, 11, 0.3)',
        animate: false,
      };
      case 'failed': return { 
        ring: 'ring-2 ring-red-500/60', 
        dot: 'bg-red-500',
        glow: '0 0 16px rgba(239, 68, 68, 0.3)',
        animate: false,
      };
      case 'queued': return { 
        ring: 'ring-2 ring-amber-500/50', 
        dot: 'bg-amber-500',
        glow: '0 0 12px rgba(245, 158, 11, 0.2)',
        animate: true,
      };
        default: return { 
          ring: selected ? 'ring-2 ring-[#f97316]/50' : '', 
        dot: 'bg-zinc-600',
        glow: selected ? '0 0 24px rgba(139, 92, 246, 0.25)' : undefined,
        animate: false,
      };
    }
  }, [nodeData.status, selected]);

  // Handle validation for connections
  const isValidConnection = useCallback((connection: Connection) => {
    const edges = getEdges();
    const targetPort = nodeData.inputs?.find(p => p.id === connection.targetHandle);
    if (!targetPort) return false;
    return true;
  }, [nodeData.inputs, getEdges]);

  const handleModelChange = useCallback((modelId: string) => {
    nodeData.onModelChange?.(modelId);
    nodeData.onModelSelectionChange?.({
      auto: false,
      selectedModelIds: [modelId],
      useMultipleModels: false,
    });
    nodeData.onUpdateParams?.({
      model: modelId,
      selectedModels: [modelId],
      modelAuto: false,
      useMultipleModels: false,
    });
    nodeData.onParamsChange?.({ ...nodeData.params, model: modelId });
  }, [nodeData]);

  const handleParamChange = useCallback((paramKey: string, value: unknown) => {
    nodeData.onUpdateParams?.({ [paramKey]: value });
    nodeData.onParamsChange?.({ ...nodeData.params, [paramKey]: value });
  }, [nodeData]);

  const renderControl = useCallback((control: MediaActionControl) => {
    const value = nodeData.params?.[control.id] ?? control.defaultValue ?? '';
    const label = <span className="min-w-0 truncate text-[10px] text-zinc-500">{control.label}</span>;

    if (control.type === 'select') {
      return (
        <label key={control.id} className="grid gap-1 text-[10px]">
          {label}
          <select
            className="nodrag h-7 rounded-md border border-white/10 bg-zinc-900 px-2 text-[11px] text-zinc-300 outline-none"
            value={String(value)}
            onChange={(event) => handleParamChange(control.id, event.target.value)}
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

    if (control.type === 'switch') {
      return (
        <label key={control.id} className="flex items-center justify-between gap-2">
          {label}
          <input
            type="checkbox"
            className="nodrag h-4 w-4 accent-orange-500"
            checked={Boolean(value)}
            onChange={(event) => handleParamChange(control.id, event.target.checked)}
          />
        </label>
      );
    }

    if (control.type === 'slider') {
      const numericValue = Number(value ?? control.defaultValue ?? control.min ?? 0);
      return (
        <label key={control.id} className="grid gap-1 text-[10px]">
          <span className="flex items-center justify-between gap-2">
            {label}
            <span className="text-zinc-400">{Number.isFinite(numericValue) ? numericValue : 0}</span>
          </span>
          <input
            type="range"
            className="nodrag w-full accent-orange-500"
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            value={Number.isFinite(numericValue) ? numericValue : 0}
            onChange={(event) => handleParamChange(control.id, Number(event.target.value))}
          />
        </label>
      );
    }

    if (control.type === 'number') {
      return (
        <label key={control.id} className="grid gap-1 text-[10px]">
          {label}
          <input
            type="number"
            className="nodrag h-7 rounded-md border border-white/10 bg-zinc-900 px-2 text-[11px] text-zinc-300 outline-none"
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            value={String(value)}
            onChange={(event) => handleParamChange(control.id, event.target.value === '' ? '' : Number(event.target.value))}
          />
        </label>
      );
    }

    if (control.type === 'color') {
      return (
        <label key={control.id} className="flex items-center justify-between gap-2">
          {label}
          <input
            type="color"
            className="nodrag h-7 w-10 rounded border border-white/10 bg-zinc-900"
            value={String(value || '#ffffff')}
            onChange={(event) => handleParamChange(control.id, event.target.value)}
          />
        </label>
      );
    }

    if (control.type === 'textarea') {
      return (
        <label key={control.id} className="grid gap-1 text-[10px]">
          {label}
          <textarea
            className="nodrag nowheel min-h-16 resize-none rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 outline-none"
            value={String(value)}
            onChange={(event) => handleParamChange(control.id, event.target.value)}
          />
        </label>
      );
    }

    if (control.type === 'file') {
      return (
        <label key={control.id} className="grid gap-1 text-[10px]">
          {label}
          <input
            type="file"
            className="nodrag text-[10px] text-zinc-500 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-zinc-300"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleParamChange(control.id, file.name);
            }}
          />
        </label>
      );
    }

    return (
      <label key={control.id} className="grid gap-1 text-[10px]">
        {label}
        <input
          className="nodrag h-7 rounded-md border border-white/10 bg-zinc-900 px-2 text-[11px] text-zinc-300 outline-none"
          value={String(value)}
          onChange={(event) => handleParamChange(control.id, event.target.value)}
        />
      </label>
    );
  }, [handleParamChange, nodeData.params]);

  const handleCopyPrompt = useCallback(() => {
    const text = String(nodeData.params?.prompt ?? nodeData.params?.content ?? previewText ?? previewUrl ?? '');
    if (text) {
      void navigator.clipboard?.writeText(text);
    }
    setContextMenu(null);
  }, [nodeData.params, previewText, previewUrl]);

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = String(previewUrl);
    link.download = `${nodeData.label || 'studio-output'}`;
    link.rel = 'noopener noreferrer';
    link.click();
    setContextMenu(null);
  }, [nodeData.label, previewUrl]);

  // Hover state for node
  const [isNodeHovered, setIsNodeHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      className={cn(
        'relative flex flex-col rounded-2xl border backdrop-blur-md',
        'min-w-[280px] max-w-[320px] transition-all duration-200',
        'bg-zinc-900/95',
        statusStyles.ring,
        isNodeHovered && !selected && 'border-[rgba(249,115,22,0.12)]',
        !isNodeHovered && !selected && 'border-[rgba(249,115,22,0.08)]',
        selected && 'border-[#f97316]/50'
      )}
      style={{ 
        boxShadow: statusStyles.glow 
          ? `${statusStyles.glow}, 0 8px 32px rgba(0, 0, 0, 0.5)`
          : isNodeHovered 
            ? `0 0 24px ${primaryColor}15, 0 12px 40px rgba(0, 0, 0, 0.5)`
            : '0 8px 32px rgba(0, 0, 0, 0.4)',
        contain: 'layout paint',
      }}
    >
      <NodeHoverMenu
        isVisible={isNodeHovered}
        selectedModel={selectedModel}
        modelOptions={models}
        onModelChange={models.length ? handleModelChange : undefined}
        onGenerate={nodeData.onExecute}
        onDuplicate={nodeData.onDuplicate}
        onDelete={nodeData.onDelete}
      />
      {/* Compact Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Icon with glow */}
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ 
            backgroundColor: `${primaryColor}15`,
            boxShadow: `0 0 12px ${primaryColor}20`
          }}
        >
          <Icon className="w-4 h-4" style={{ color: primaryColor }} />
        </div>
        
        {/* Type Label */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-300">
          {action?.label ?? nodeData.label ?? nodeData.kind}
        </span>
        
        {/* Model Selector (if applicable) */}
        {models.length > 0 && (
          <div className="ml-auto flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded-md">
            <Sparkles className="w-3 h-3" />
            <span className="text-zinc-400">{models.find(m => m.id === selectedModel)?.label || selectedModel}</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        )}

        {/* Status dot */}
        <div className={cn('w-2 h-2 rounded-full', statusStyles.dot, 
          nodeData.status === 'running' && 'animate-pulse'
        )} />
        
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="nodrag p-1 hover:bg-zinc-700/50 rounded transition-colors text-zinc-500 hover:text-zinc-300"
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Content (collapsible) */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* Preview Area */}
              {nodeData.preview ? (
                <div className="h-36 min-h-36 overflow-hidden rounded-xl border border-[rgba(249,115,22,0.06)] bg-zinc-950/50">
                  {nodeData.preview.type === 'image' && previewUrl && (
                    <img 
                      src={previewUrl}
                      alt="Preview" 
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  )}
                  {nodeData.preview.type === 'video' && previewUrl && (
                    <video src={previewUrl} className="h-full w-full object-cover" controls muted preload="metadata" />
                  )}
                  {nodeData.preview.type === 'audio' && previewUrl && (
                    <div className="flex h-full items-center p-3">
                      <audio src={previewUrl} className="w-full" controls />
                    </div>
                  )}
                  {nodeData.preview.type === '3d' && (
                    <div className="flex h-full items-center justify-center gap-2 text-xs text-cyan-300">
                      <Box className="h-5 w-5" />
                      <span>3D asset ready</span>
                    </div>
                  )}
                  {nodeData.preview.type === 'text' && (
                    <div className="nowheel h-full overflow-y-auto p-2.5 text-xs text-zinc-400">
                      {String(previewText ?? '')}
                    </div>
                  )}
                  {nodeData.preview.type === 'json' && (
                    <pre className="nowheel h-full overflow-auto p-2.5 text-[10px] text-zinc-500">
                      {JSON.stringify(nodeData.preview.data ?? {}, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                /* Empty preview placeholder */
                <div className="flex h-36 min-h-36 items-center justify-center rounded-xl border border-dashed border-[rgba(249,115,22,0.06)] bg-zinc-950/30">
                  <div className="text-center">
                    <Icon className="w-8 h-8 text-zinc-700 mx-auto mb-1" />
                    <span className="text-xs text-zinc-600">No preview</span>
                  </div>
                </div>
              )}

              {actionControls.length > 0 ? (
                <div className="nowheel max-h-44 space-y-2 overflow-y-auto rounded-xl border border-white/6 bg-zinc-950/30 p-2">
                  {actionControls.map(renderControl)}
                </div>
              ) : null}

              {/* Progress bar for running state */}
              {nodeData.status === 'running' && nodeData.progress !== undefined && (
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full origin-left rounded-full transition-transform duration-200 ease-out"
                    style={{
                      backgroundColor: primaryColor,
                      transform: `scaleX(${progressValue / 100})`,
                    }}
                  />
                </div>
              )}

              {/* Quick action button */}
              <button
                onClick={nodeData.onExecute}
                className={cn(
                  'nodrag w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium',
                  'transition-all duration-200',
                  nodeData.status === 'running' 
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 hover:text-purple-300'
                )}
                disabled={nodeData.status === 'running'}
              >
                {nodeData.status === 'running' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Generate
                  </>
                )}
              </button>

              {/* Helper text */}
              {helperText && (
                <p className="text-[10px] text-zinc-600 italic leading-relaxed">
                  {helperText}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Handles (Left side) - Premium double-ring design */}
      {nodeData.inputs?.map((port, index) => {
        const totalInputs = nodeData.inputs?.length || 1;
        const baseOffset = collapsed ? 24 : 56;
        const spacing = collapsed ? 0 : 44;
        const top = baseOffset + index * spacing;
        const color = HANDLE_COLORS[port.datatype as DataType] || HANDLE_COLORS.any;
        const glowColor = HANDLE_GLOW_COLORS[port.datatype as DataType] || HANDLE_GLOW_COLORS.any;
        const isHovered = hoveredHandle === port.id;

        return (
          <React.Fragment key={port.id}>
            {/* Outer glow ring on hover */}
            {isHovered && (
              <div
                className="absolute rounded-full pointer-events-none animate-pulse"
                style={{
                  width: 24,
                  height: 24,
                  left: -12,
                  top: top - 12,
                  background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                }}
              />
            )}
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              className="!rounded-full transition-all duration-200 ease-out"
              style={{
                width: isHovered ? 16 : 14,
                height: isHovered ? 16 : 14,
                background: '#09090b',
                border: `2.5px solid ${color}`,
                top,
                left: isHovered ? -8 : -7,
                boxShadow: isHovered 
                  ? `0 0 16px ${color}, 0 0 8px ${glowColor}, inset 0 0 4px ${color}40`
                  : `0 0 6px ${color}40`,
                transform: isHovered ? 'scale(1.15)' : 'scale(1)',
              }}
              onMouseEnter={() => setHoveredHandle(port.id)}
              onMouseLeave={() => setHoveredHandle(null)}
              isValidConnection={isValidConnection}
            />
            {/* Inner dot */}
            <div
              className="absolute rounded-full pointer-events-none transition-all duration-200"
              style={{
                width: isHovered ? 6 : 5,
                height: isHovered ? 6 : 5,
                background: color,
                left: isHovered ? -3 : -2.5,
                top: top - (isHovered ? 3 : 2.5),
              }}
            />
            {/* Label tooltip */}
            <AnimatePresence>
              {isHovered && !collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 5 }}
                  className="absolute left-0 -translate-x-full pr-3 pointer-events-none z-50"
                  style={{ top: top - 10 }}
                >
                  <div 
                    className="px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap"
                    style={{ 
                      background: `${color}15`,
                      color: color,
                      border: `1px solid ${color}30`,
                    }}
                  >
                    {port.name}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </React.Fragment>
        );
      })}

      {/* Output Handles (Right side) - Premium double-ring design */}
      {nodeData.outputs?.map((port, index) => {
        const baseOffset = collapsed ? 24 : 56;
        const spacing = collapsed ? 0 : 44;
        const top = baseOffset + index * spacing;
        const color = HANDLE_COLORS[port.datatype as DataType] || HANDLE_COLORS.any;
        const glowColor = HANDLE_GLOW_COLORS[port.datatype as DataType] || HANDLE_GLOW_COLORS.any;
        const isHovered = hoveredHandle === port.id;

        return (
          <React.Fragment key={port.id}>
            {/* Outer glow ring on hover */}
            {isHovered && (
              <div
                className="absolute rounded-full pointer-events-none animate-pulse"
                style={{
                  width: 24,
                  height: 24,
                  right: -12,
                  top: top - 12,
                  background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                }}
              />
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              className="!rounded-full transition-all duration-200 ease-out"
              style={{
                width: isHovered ? 16 : 14,
                height: isHovered ? 16 : 14,
                background: '#09090b',
                border: `2.5px solid ${color}`,
                top,
                right: isHovered ? -8 : -7,
                boxShadow: isHovered 
                  ? `0 0 16px ${color}, 0 0 8px ${glowColor}, inset 0 0 4px ${color}40`
                  : `0 0 6px ${color}40`,
                transform: isHovered ? 'scale(1.15)' : 'scale(1)',
              }}
              onMouseEnter={() => setHoveredHandle(port.id)}
              onMouseLeave={() => setHoveredHandle(null)}
            />
            {/* Inner dot */}
            <div
              className="absolute rounded-full pointer-events-none transition-all duration-200"
              style={{
                width: isHovered ? 6 : 5,
                height: isHovered ? 6 : 5,
                background: color,
                right: isHovered ? -3 : -2.5,
                top: top - (isHovered ? 3 : 2.5),
              }}
            />
            {/* Label tooltip */}
            <AnimatePresence>
              {isHovered && !collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  className="absolute right-0 translate-x-full pl-3 pointer-events-none z-50"
                  style={{ top: top - 10 }}
                >
                  <div 
                    className="px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap"
                    style={{ 
                      background: `${color}15`,
                      color: color,
                      border: `1px solid ${color}30`,
                    }}
                  >
                    {port.name}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </React.Fragment>
        );
      })}

      {contextMenu ? (
        <div
          className="nodrag fixed z-[1200] w-56 overflow-hidden rounded-xl border border-white/10 bg-[#151515]/98 p-1 text-sm text-zinc-300 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/6" onClick={handleCopyPrompt}>
            <Copy className="h-3.5 w-3.5" />
            Copy prompt
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleDownload}
            disabled={!previewUrl}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/6" onClick={() => setContextMenu(null)}>
            <Star className="h-3.5 w-3.5" />
            Set thumbnail
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10" onClick={() => setContextMenu(null)}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear contents
          </button>
        </div>
      ) : null}
    </div>
  );
});

ComputeNode.displayName = 'ComputeNode';
