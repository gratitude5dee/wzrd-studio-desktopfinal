import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Background,
  BackgroundVariant,
  Connection,
  ConnectionMode,
  Edge,
  EdgeTypes,
  Node,
  NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { AlertTriangle, Gauge } from 'lucide-react';

import { ReactFlowTextNode } from './nodes/ReactFlowTextNode';
import { ReactFlowImageNode } from './nodes/ReactFlowImageNode';
import { ReactFlowImageEditNode } from './nodes/ReactFlowImageEditNode';
import { ReactFlowVideoNode } from './nodes/ReactFlowVideoNode';
import { ReactFlowUploadNode } from './nodes/ReactFlowUploadNode';
import { ComputeNode } from './nodes/ComputeNode';
import { ComputeEdge } from './edges/ComputeEdge';
import { ImprovedEdge } from './edges/ImprovedEdge';
import { GlowingEdge } from './edges/GlowingEdge';
import { BezierConnection } from './connections/BezierConnection';
import { CustomConnectionLine } from './ConnectionLine';
import { ConnectionNodeSelector } from './ConnectionNodeSelector';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { ConnectionModeIndicator } from './canvas/ConnectionModeIndicator';
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay';
import { QueueIndicator } from './QueueIndicator';

import EmptyCanvasState from './EmptyCanvasState';
import { FloraCollaboratorCursors } from './canvas/FloraCollaboratorCursors';
import { FloraPromptBar } from './canvas/FloraPromptBar';
import { StudioErrorBoundary } from './StudioErrorBoundary';
import { NodeErrorBoundary } from './NodeErrorBoundary';
import CommentNode from './nodes/CommentNode';
import { UploadImageNode } from './nodes/UploadImageNode';
import { UploadVideoNode } from './nodes/UploadVideoNode';
import { UploadAudioNode } from './nodes/UploadAudioNode';
import { UploadDocumentNode } from './nodes/UploadDocumentNode';
import { Upload3DNode } from './nodes/Upload3DNode';
import { ReactFlowAudioNode } from './nodes/ReactFlowAudioNode';
import { ReactFlow3DNode } from './nodes/ReactFlow3DNode';
import { OutputNode } from './nodes/OutputNode';

import { useStrictConnectionValidation } from '@/hooks/useStrictConnectionValidation';
import { useConnectionFeedback } from '@/hooks/useConnectionFeedback';
import { ConnectionErrorTooltip } from './ConnectionErrorTooltip';
import { useConnectionMode } from '@/hooks/useConnectionMode';
import { useStudioKeyboardShortcuts } from '@/hooks/studio/useStudioKeyboardShortcuts';
import { useNodePositionSync } from '@/hooks/studio/useNodePositionSync';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useComputeFlowRealtime } from '@/hooks/useComputeFlowRealtime';
import { usePresence } from '@/hooks/usePresence';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import { useStudioGraphActions } from '@/hooks/studio/useStudioGraphActions';
import { useAdaptivePreviewPerformance } from '@/hooks/studio/useAdaptivePreviewPerformance';
import { useStudioNodeGeneration } from '@/hooks/studio/useStudioNodeGeneration';
import { useStudioPopulationTestHarness } from '@/hooks/studio/useStudioPopulationTestHarness';
import { HANDLE_COLORS, type DataType, type EdgeDefinition, type NodeDefinition } from '@/types/computeFlow';
import { useAuth } from '@/providers/AuthProvider';
import { getNodeImagePreviewUrl } from '@/lib/imageEdit';
import { resolveIncomingForUI } from '@/lib/compute/applyBinding';
import { buildFloraSeedGraph, FLORA_EXAMPLE_COPY, isFloraSeedNode } from '@/lib/studio/floraSeed';
import { getMediaActionById } from '@/lib/studio/mediaActionRegistry';
import {
  buildReactFlowNodeDataSignature,
  ReactFlowNodeDataBuilderCache,
  reconcileReactFlowEdges,
  reconcileReactFlowNodes,
  stableStringify,
} from '@/lib/studio/reactFlowReconciliation';
import {
  getStudioExecutionPlatform,
  resolveStudioNodeExecutionRoute,
  type StudioWebCompatibilityState,
} from '@/platform/studioExecutionPlatform';
import { supabase } from '@/integrations/supabase/client';

interface StudioCanvasProps {
  projectId?: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

interface StudioNodeHandlers {
  onExecute: () => void;
  onGenerate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onModelSelectionChange: (selection: {
    auto: boolean;
    selectedModelIds: string[];
    useMultipleModels: boolean;
  }) => void;
  onUpdateNode: (updates: Partial<NodeDefinition>) => void;
  onUpdateParams: (updates: Record<string, unknown>) => void;
  onOpenConnectionMenu: (sourcePortId: string, rect?: DOMRect | null) => void;
  onSelectNode: (id: string | null) => void;
}

interface StudioCanvasPerformanceInstrumentation {
  getMetrics: () => {
    p95FrameDeltaMs: number;
    maxDroppedFrameStreak: number;
    builderInvocations: number;
    fullSignatureRecomputes: number;
    reconciliationRuns: number;
    builderInvocationsByNode: Record<string, number>;
  };
  resetMetrics: () => void;
}

declare global {
  interface Window {
    __WZRD_STUDIO_PERFORMANCE__?: StudioCanvasPerformanceInstrumentation;
  }
}

function withErrorBoundary(Component: React.ComponentType<any>) {
  return React.memo((props: any) => (
    <NodeErrorBoundary nodeId={props.id}>
      <Component {...props} />
    </NodeErrorBoundary>
  ));
}

const nodeTypes: NodeTypes = {
  text: withErrorBoundary(ReactFlowTextNode),
  image: withErrorBoundary(ReactFlowImageNode),
  imageEdit: withErrorBoundary(ReactFlowImageEditNode),
  video: withErrorBoundary(ReactFlowVideoNode),
  upload: withErrorBoundary(ReactFlowUploadNode),
  compute: withErrorBoundary(ComputeNode),
  uploadImage: withErrorBoundary(UploadImageNode),
  uploadVideo: withErrorBoundary(UploadVideoNode),
  uploadAudio: withErrorBoundary(UploadAudioNode),
  uploadDocument: withErrorBoundary(UploadDocumentNode),
  upload3D: withErrorBoundary(Upload3DNode),
  audio: withErrorBoundary(ReactFlowAudioNode),
  '3d': withErrorBoundary(ReactFlow3DNode),
  output: withErrorBoundary(OutputNode),
  comment: withErrorBoundary(CommentNode),
};

const edgeTypes: EdgeTypes = {
  glow: GlowingEdge,
  compute: ComputeEdge,
  improved: ImprovedEdge,
  default: BezierConnection,
};

const defaultEdgeOptions = {
  type: 'compute',
  animated: false,
  data: {
    status: 'idle',
    dataType: 'data',
  },
};



function getNodeTextValue(node?: Pick<NodeDefinition, 'preview' | 'params'> | null): string | undefined {
  if (!node) {
    return undefined;
  }

  const preview = node.preview as { data?: unknown } | undefined;
  if (typeof preview?.data === 'string' && preview.data.trim().length > 0) {
    return preview.data;
  }

  if (preview?.data && typeof preview.data === 'object') {
    const textData = preview.data as Record<string, unknown>;
    const previewText = textData.text ?? textData.prompt ?? textData.content;
    if (typeof previewText === 'string' && previewText.trim().length > 0) {
      return previewText;
    }
  }

  const params = node.params as Record<string, unknown> | undefined;
  const paramText = params?.prompt ?? params?.text ?? params?.content;
  if (typeof paramText === 'string' && paramText.trim().length > 0) {
    return paramText;
  }

  return undefined;
}

function truncatePromptLabel(prompt: string) {
  return prompt
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ')
    .replace(/[^\w\s'-]/g, '')
    .trim() || 'Generated Image';
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

const StudioCanvasInner: React.FC<StudioCanvasProps> = ({
  projectId,
  selectedNodeId,
  onSelectNode,
}) => {
  const { user } = useAuth();
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const pendingEdgesCount = useComputeFlowStore(s => s.pendingEdges.length);
  const flushPendingEdges = useComputeFlowStore(s => s.flushPendingEdges);
  const { validateNewEdge } = useStrictConnectionValidation();
  const { rejection, showRejection, clearRejection } = useConnectionFeedback();
  const {
    connectionState,
    isClickMode,
    isConnecting,
    toggleMode,
    cancelClickConnection,
  } = useConnectionMode();
  const nodeDefinitions = useComputeFlowStore((state) => state.nodeDefinitions);
  const edgeDefinitions = useComputeFlowStore((state) => state.edgeDefinitions);
  const loadGraph = useComputeFlowStore((state) => state.loadGraph);
  const saveGraph = useComputeFlowStore((state) => state.saveGraph);
  const addNodesAndEdgesAtomic = useComputeFlowStore((state) => state.addNodesAndEdgesAtomic);
  const addNode = useComputeFlowStore((state) => state.addNode);
  const executeGraphStreaming = useComputeFlowStore((state) => state.executeGraphStreaming);
  const cancelExecution = useComputeFlowStore((state) => state.cancelExecution);
  const execution = useComputeFlowStore((state) => state.execution);
  const isSaving = useComputeFlowStore((state) => state.isSaving);
  const removeNode = useComputeFlowStore((state) => state.removeNode);
  const removeEdge = useComputeFlowStore((state) => state.removeEdge);
  const {
    buildNode,
    addNodeOfType,
    addActionNode,
    connectNodes,
    createConnectedNode,
    createConnectedActionNode,
    insertActionOnEdge,
    scheduleSave,
  } =
    useStudioGraphActions(projectId);
  const { generateNode, updateNodeModelSelection } = useStudioNodeGeneration(projectId);
  useStudioPopulationTestHarness(onSelectNode);

  useComputeFlowRealtime(projectId);
  const { onlineUsers, updateCursor, clearCursor, updateSelection } = usePresence(projectId ?? null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const cursorThrottleRef = useRef<number | null>(null);
  const pendingCursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  const nodeDefinitionsById = useMemo(
    () => new Map(nodeDefinitions.map((node) => [node.id, node])),
    [nodeDefinitions]
  );
  const nodeIdsSignature = useMemo(
    () => nodeDefinitions.map((node) => node.id).sort().join('|'),
    [nodeDefinitions]
  );
  const nodeIds = useMemo(
    () => new Set(nodeIdsSignature ? nodeIdsSignature.split('|') : []),
    [nodeIdsSignature]
  );
  const incomingEdgesByTargetNode = useMemo(() => {
    const next = new Map<string, typeof edgeDefinitions>();
    edgeDefinitions.forEach((edge) => {
      const existing = next.get(edge.target.nodeId);
      if (existing) {
        existing.push(edge);
      } else {
        next.set(edge.target.nodeId, [edge]);
      }
    });
    return next;
  }, [edgeDefinitions]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [isInteracting, setIsInteracting] = useState(false);
  const {
    config: previewPerformance,
    getMetrics: getPreviewPerformanceMetrics,
    resetMetrics: resetPreviewPerformanceMetrics,
  } = useAdaptivePreviewPerformance(isInteracting);
  const { onNodeDragStart, onNodeDragStop, filterNodeChanges } = useNodePositionSync({
    useComputeFlow: true,
    scheduleSave,
  });
  const nodeDataBuilderCacheRef = useRef(
    new ReactFlowNodeDataBuilderCache<Record<string, unknown>>()
  );
  const nodeHandlersRef = useRef(new Map<string, StudioNodeHandlers>());
  const studioExecutionRuntime = useMemo(
    () => getStudioExecutionPlatform().runtime,
    []
  );
  const webCompatibilityByNodeId = useMemo(() => {
    const compatibilityByNodeId = new Map<string, StudioWebCompatibilityState>();
    nodeDefinitions.forEach((node) => {
      const route = resolveStudioNodeExecutionRoute(node, studioExecutionRuntime);
      if (route.type === 'web-blocked') {
        compatibilityByNodeId.set(node.id, route.compatibility);
      }
    });
    return compatibilityByNodeId;
  }, [nodeDefinitions, studioExecutionRuntime]);

  const [showNodeSelector, setShowNodeSelector] = useState(false);
  const [nodeSelectorFlowPosition, setNodeSelectorFlowPosition] = useState({ x: 0, y: 0 });
  const [nodeSelectorScreenPosition, setNodeSelectorScreenPosition] = useState({ x: 0, y: 0 });
  const [activeConnection, setActiveConnection] = useState<{
    sourceNodeId: string;
    sourcePortId: string;
  } | null>(null);
  const [activeEdgeInsertion, setActiveEdgeInsertion] = useState<{ edgeId: string } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [promptDraft, setPromptDraft] = useState('');
  const [isPromptSubmitting, setIsPromptSubmitting] = useState(false);

  useUnsavedChangesWarning();

  const getNodeTypeFromKind = useCallback((kind: string): string => {
    const kindToType: Record<string, string> = {
      upload: 'upload',
      upload_image: 'uploadImage',
      upload_video: 'uploadVideo',
      upload_audio: 'uploadAudio',
      upload_document: 'uploadDocument',
      upload_3d: 'upload3D',
      text_to_image: 'image',
      image_edit: 'imageEdit',
      text_to_video: 'video',
      text_to_text: 'text',
      image_to_video: 'video',
      audio_generate: 'audio',
      '3d_generate': '3d',
      output: 'output',
      Text: 'text',
      Image: 'image',
      ImageEdit: 'imageEdit',
      Video: 'video',
      Prompt: 'text',
      Model: 'compute',
      Transform: 'compute',
      Output: 'output',
      Gateway: 'compute',
      Audio: 'audio',
      Comment: 'comment',
      comment: 'comment',
    };

    return kindToType[kind] || 'compute';
  }, []);

  const flushCursorUpdate = useCallback(() => {
    cursorThrottleRef.current = null;
    if (!pendingCursorPositionRef.current) {
      return;
    }

    const { x, y } = pendingCursorPositionRef.current;
    void updateCursor(x, y);
  }, [updateCursor]);

  const handleCanvasPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!projectId || !canvasContainerRef.current) {
        return;
      }

      const rect = canvasContainerRef.current.getBoundingClientRect();
      pendingCursorPositionRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      if (cursorThrottleRef.current === null) {
        cursorThrottleRef.current = window.setTimeout(
          flushCursorUpdate,
          previewPerformance.cursorBroadcastMs
        );
      }
    },
    [flushCursorUpdate, previewPerformance.cursorBroadcastMs, projectId]
  );

  const handleCanvasPointerLeave = useCallback(() => {
    pendingCursorPositionRef.current = null;
    if (cursorThrottleRef.current !== null) {
      window.clearTimeout(cursorThrottleRef.current);
      cursorThrottleRef.current = null;
    }
    void clearCursor();
  }, [clearCursor]);

  const onNodesChange = useCallback(
    (changes: any[]) => {
      const safeChanges = changes.filter((change) => change.type !== 'remove');
      onNodesChangeBase(filterNodeChanges(safeChanges));
    },
    [filterNodeChanges, onNodesChangeBase]
  );

  const handleNodeDragStart = useCallback(
    (...args: Parameters<typeof onNodeDragStart>) => {
      setIsInteracting(true);
      onNodeDragStart(...args);
    },
    [onNodeDragStart]
  );

  const handleNodeDragStop = useCallback(
    (...args: Parameters<typeof onNodeDragStop>) => {
      onNodeDragStop(...args);
      setIsInteracting(false);
    },
    [onNodeDragStop]
  );

  const handleInteractionStart = useCallback(() => {
    setIsInteracting(true);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    setIsInteracting(false);
  }, []);

  const onEdgesChange = useCallback(
    (changes: any[]) => {
      const removedEdgeIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id as string);

      if (removedEdgeIds.length > 0) {
        removedEdgeIds.forEach((edgeId) => removeEdge(edgeId));
        scheduleSave();
      }

      const visualOnlyChanges = changes.filter(
        (change) => change.type !== 'remove' && change.type !== 'add' && change.type !== 'replace'
      );
      if (visualOnlyChanges.length > 0) {
        onEdgesChangeBase(visualOnlyChanges);
      }
    },
    [onEdgesChangeBase, removeEdge, scheduleSave]
  );

  const handleDuplicateNode = useCallback(
    (nodeDef: NodeDefinition) => {
      const duplicated = cloneValue(nodeDef);
      const newId = uuidv4();
      const nextNode: NodeDefinition = {
        ...duplicated,
        id: newId,
        label: `${nodeDef.label} Copy`,
        position: {
          x: nodeDef.position.x + 40,
          y: nodeDef.position.y + 40,
        },
        status: 'idle',
        progress: 0,
        error: undefined,
        inputs: (duplicated.inputs || []).map((port, index) => ({
          ...port,
          id: `${newId}-input-${index}`,
        })),
        outputs: (duplicated.outputs || []).map((port, index) => ({
          ...port,
          id: `${newId}-output-${index}`,
        })),
      };
      addNode(nextNode);
      scheduleSave();
      return nextNode;
    },
    [addNode, scheduleSave]
  );

  const openConnectionMenuFromPort = useCallback(
    (sourceNodeId: string, sourcePortId: string, rect?: DOMRect | null) => {
      const fallbackX = rect ? rect.right + 14 : (canvasContainerRef.current?.getBoundingClientRect().left ?? 0) + 240;
      const fallbackY = rect ? rect.top + rect.height / 2 : (canvasContainerRef.current?.getBoundingClientRect().top ?? 0) + 240;
      const flowPosition = screenToFlowPosition({
        x: fallbackX,
        y: fallbackY,
      });

      setNodeSelectorFlowPosition(flowPosition);
      setNodeSelectorScreenPosition({ x: fallbackX, y: fallbackY });
      setShowNodeSelector(true);
      setActiveConnection({ sourceNodeId, sourcePortId });
    },
    [screenToFlowPosition]
  );

  const generateNodeRef = useLatestRef(generateNode);
  const handleDuplicateNodeRef = useLatestRef(handleDuplicateNode);
  const removeNodeRef = useLatestRef(removeNode);
  const scheduleSaveRef = useLatestRef(scheduleSave);
  const onSelectNodeRef = useLatestRef(onSelectNode);
  const selectedNodeIdRef = useLatestRef(selectedNodeId);
  const updateNodeModelSelectionRef = useLatestRef(updateNodeModelSelection);
  const openConnectionMenuFromPortRef = useLatestRef(openConnectionMenuFromPort);

  const getStableNodeHandlers = useCallback((nodeId: string): StudioNodeHandlers => {
    const existing = nodeHandlersRef.current.get(nodeId);
    if (existing) {
      return existing;
    }

    const getCurrentNode = () =>
      useComputeFlowStore.getState().nodeDefinitions.find((node) => node.id === nodeId);
    const execute = () => generateNodeRef.current(nodeId);
    const handlers: StudioNodeHandlers = {
      onExecute: execute,
      onGenerate: execute,
      onDuplicate: () => {
        const currentNode = getCurrentNode();
        if (currentNode) {
          handleDuplicateNodeRef.current(currentNode);
        }
      },
      onDelete: () => {
        removeNodeRef.current(nodeId);
        scheduleSaveRef.current();
        if (selectedNodeIdRef.current === nodeId) {
          onSelectNodeRef.current(null);
        }
      },
      onModelSelectionChange: (selection) =>
        updateNodeModelSelectionRef.current(nodeId, selection),
      onUpdateNode: (nodeUpdates) => {
        useComputeFlowStore.getState().updateNode(nodeId, nodeUpdates);
        scheduleSaveRef.current();
      },
      onUpdateParams: (paramUpdates) => {
        const store = useComputeFlowStore.getState();
        const currentNode = getCurrentNode();
        if (!currentNode) {
          return;
        }

        // PR-6: open a coalesced edit session so streaming keystrokes
        // produce a single undo entry. The session auto-closes after
        // 400ms of idle (or via onBlur from text inputs).
        store.beginEditSession(nodeId);
        store.updateNode(nodeId, {
          params: {
            ...currentNode.params,
            ...paramUpdates,
          },
        });
        scheduleSaveRef.current();
      },
      onOpenConnectionMenu: (sourcePortId, rect) =>
        openConnectionMenuFromPortRef.current(nodeId, sourcePortId, rect),
      onSelectNode: (id) => onSelectNodeRef.current(id),
    };
    nodeHandlersRef.current.set(nodeId, handlers);
    return handlers;
  }, []);

  useEffect(() => {
    const activeNodeIds = new Set(nodeDefinitions.map((node) => node.id));
    const nodeDataBuilderCache = nodeDataBuilderCacheRef.current;
    const computeNodes: Node[] = nodeDefinitions.map((nodeDef) => {
      const incomingEdges = incomingEdgesByTargetNode.get(nodeDef.id) || [];
      const isolateRuntimeFromNodeData = nodeDef.kind === 'ImageEdit' || nodeDef.kind === 'Video';
      const incomingSourceNodes = incomingEdges.flatMap((edge) => {
        const sourceNode = nodeDefinitionsById.get(edge.source.nodeId);
        return sourceNode ? [sourceNode] : [];
      });
      const nodeData = nodeDataBuilderCache.getOrBuild({
        node: nodeDef,
        incomingEdges,
        incomingSourceNodes,
        includeRuntime: !isolateRuntimeFromNodeData,
      }, () => {
        // PR-3: single source of truth for handle → param resolution.
        const { byHandle, chips } = resolveIncomingForUI({
          targetNode: nodeDef,
          edges: incomingEdges,
          getNode: (id) => nodeDefinitionsById.get(id),
        });

        // Backward-compatible derived shapes consumed by existing node components.
        const incomingReferenceSources = chips
          .filter((c) => c.type === 'image' || c.type === 'video')
          .map((c) => ({
            sourceNodeId: c.sourceNodeId,
            name: c.name,
            type: c.type as 'image' | 'video',
            url: c.url ?? '',
          }));
        const incomingImageSources = incomingReferenceSources.filter(
          (s): s is { sourceNodeId: string; name: string; type: 'image' | 'video'; url: string } =>
            s.type === 'image'
        );
        const incomingPrompt =
          typeof byHandle.prompt === 'string'
            ? (byHandle.prompt as string)
            : chips.find((c) => c.type === 'text')?.preview;

        // Pass-through input chip for relay-style nodes (Output/Gateway/Transform/Combine).
        let inputValue: string | undefined;
        let inputType: 'image' | 'video' | 'audio' | 'text' | '3d' | 'unknown' = 'unknown';
        if (
          nodeDef.kind === 'Output' ||
          nodeDef.kind === 'Gateway' ||
          nodeDef.kind === 'Transform' ||
          nodeDef.kind === 'Combine'
        ) {
          const firstChip = chips[0];
          if (firstChip) {
            inputType = firstChip.type;
            inputValue = firstChip.url ?? firstChip.preview;
          }
        }

        const dataSignature = buildReactFlowNodeDataSignature({
          node: nodeDef,
          chips,
          byHandle,
          incomingPrompt,
          inputValue,
          inputType,
          includeRuntime: !isolateRuntimeFromNodeData,
        });
        return {
          __signature: dataSignature,
          nodeDefinition: nodeDef,
          label: nodeDef.label,
          kind: nodeDef.kind,
          actionId: nodeDef.actionId ?? (typeof nodeDef.params?.actionId === 'string' ? nodeDef.params.actionId : undefined),
          mediaType: nodeDef.mediaType,
          workflowType: nodeDef.workflowType,
          controls: nodeDef.controls,
          batch: nodeDef.batch,
          variants: nodeDef.variants,
          inputs: nodeDef.inputs,
          outputs: nodeDef.outputs,
          params: nodeDef.params,
          status: nodeDef.status || 'idle',
          progress: nodeDef.progress || 0,
          preview: nodeDef.preview,
          error: nodeDef.error,
          modelSelection: {
            auto: Boolean(nodeDef.params?.modelAuto),
            selectedModelIds: Array.isArray(nodeDef.params?.selectedModels)
              ? (nodeDef.params?.selectedModels as string[])
              : [String(nodeDef.params?.model || nodeDef.metadata?.model || '')].filter(Boolean),
            useMultipleModels: Boolean(nodeDef.params?.useMultipleModels),
          },
          initialData: nodeDef.params,
          blockPosition: nodeDef.position,
          incomingImageSources,
          incomingReferenceSources,
          incomingPrompt,
          inputValue,
          inputType,
          compatibility: webCompatibilityByNodeId.get(nodeDef.id),
          popoverBoundary: canvasContainerRef.current,
          popoverContainer: canvasContainerRef.current,
          ...getStableNodeHandlers(nodeDef.id),
        };
      });

      return {
        id: nodeDef.id,
        type: getNodeTypeFromKind(nodeDef.kind),
        position: nodeDef.position,
        selected: selectedNodeIdRef.current === nodeDef.id,
        data: nodeData,
        className: [
          nodeDef.metadata?.generatedWorkflowImportId ? 'wzrd-generated-node' : '',
          webCompatibilityByNodeId.has(nodeDef.id) ? 'wzrd-web-blocked-node' : '',
        ].filter(Boolean).join(' ') || undefined,
        draggable: true,
        selectable: true,
        connectable: true,
      };
    });

    nodeDataBuilderCache.prune(activeNodeIds);
    for (const nodeId of nodeHandlersRef.current.keys()) {
      if (!activeNodeIds.has(nodeId)) {
        nodeHandlersRef.current.delete(nodeId);
      }
    }
    nodeDataBuilderCache.noteReconciliationRun();

    // Reconcile against the previous React Flow nodes so unchanged nodes keep
    // their object identity. This prevents XYFlow from remounting/measuring
    // the entire graph on every store tick (which is what was producing the
    // visible canvas jitter when generating a node).
    setNodes((previousNodes) => reconcileReactFlowNodes(previousNodes, computeNodes));
  }, [
    getNodeTypeFromKind,
    getStableNodeHandlers,
    incomingEdgesByTargetNode,
    nodeDefinitions,
    nodeDefinitionsById,
    setNodes,
    webCompatibilityByNodeId,
  ]);

  useEffect(() => {
    setNodes((previousNodes) => {
      let changed = false;
      const nextNodes = previousNodes.map((node) => {
        const selected = node.id === selectedNodeId;
        if (node.selected === selected) {
          return node;
        }
        changed = true;
        return { ...node, selected };
      });
      return changed ? nextNodes : previousNodes;
    });
  }, [selectedNodeId, setNodes]);

  const openActionMenuForEdge = useCallback(
    (edgeId: string, screenPosition: { x: number; y: number }) => {
      setNodeSelectorFlowPosition(screenToFlowPosition(screenPosition));
      setNodeSelectorScreenPosition(screenPosition);
      setActiveConnection(null);
      setActiveEdgeInsertion({ edgeId });
      setShowNodeSelector(true);
    },
    [screenToFlowPosition]
  );

  useEffect(() => {
    const computeEdges: Edge[] = edgeDefinitions.flatMap((edgeDef) => {
      if (!nodeIds.has(edgeDef.source.nodeId) || !nodeIds.has(edgeDef.target.nodeId)) {
        return [];
      }

      const color = HANDLE_COLORS[edgeDef.dataType as DataType] || HANDLE_COLORS.any;
      const label = edgeDef.metadata?.label ?? edgeDef.target.handle ?? edgeDef.target.portId;
      const edgeSignature = stableStringify({
        source: edgeDef.source,
        target: edgeDef.target,
        dataType: edgeDef.dataType,
        status: edgeDef.status,
        label,
        color,
        animationsEnabled: previewPerformance.visualsEnabled,
      });

      return [
        {
          id: edgeDef.id,
          source: edgeDef.source.nodeId,
          target: edgeDef.target.nodeId,
          sourceHandle: edgeDef.source.portId,
          targetHandle: edgeDef.target.portId,
          type: 'compute',
          data: {
            __signature: edgeSignature,
            edgeId: edgeDef.id,
            dataType: edgeDef.dataType,
            status: edgeDef.status,
            label,
            animationsEnabled: previewPerformance.visualsEnabled,
            onInsertAction: openActionMenuForEdge,
          },
          style: {
            stroke: color,
            strokeWidth: 2,
          },
        },
      ];
    });

    setEdges((previousEdges) => reconcileReactFlowEdges(previousEdges, computeEdges));
  }, [edgeDefinitions, nodeIds, openActionMenuForEdge, previewPerformance.visualsEnabled, setEdges]);

  useEffect(() => {
    if (projectId) {
      void loadGraph(projectId);
    }
  }, [loadGraph, projectId]);

  const fitInFlightRef = useRef(false);
  useEffect(() => {
    const handleFitViewEvent = (event: Event) => {
      if (fitInFlightRef.current) return;
      const customEvent = event as CustomEvent<{ animate: boolean }>;
      const duration = customEvent.detail?.animate ? 400 : 0;
      fitInFlightRef.current = true;
      requestAnimationFrame(() => {
        fitView({ padding: 0.3, duration });
        window.setTimeout(() => {
          fitInFlightRef.current = false;
        }, duration + 60);
      });
    };

    window.addEventListener('fitViewToWorkflow', handleFitViewEvent);
    return () => window.removeEventListener('fitViewToWorkflow', handleFitViewEvent);
  }, [fitView]);

  // PR-2: flush queued edges once React Flow has measured the new nodes.
  useEffect(() => {
    if (nodesInitialized && pendingEdgesCount > 0) {
      flushPendingEdges();
    }
  }, [nodesInitialized, pendingEdgesCount, flushPendingEdges]);

  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes]);
  const selectedCount = selectedNodes.length;
  const selectedImageEditNode = useMemo(
    () => (selectedNodeId ? nodeDefinitionsById.get(selectedNodeId) : null),
    [nodeDefinitionsById, selectedNodeId]
  );
  const hasFloraSeedNodes = useMemo(
    () => nodeDefinitions.some((node) => isFloraSeedNode(node)),
    [nodeDefinitions]
  );
  const showPromptBar = nodeDefinitions.length === 0 || hasFloraSeedNodes;

  const getCanvasCenterPosition = useCallback(() => {
    const bounds = canvasContainerRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: 480, y: 320 };
    }

    return screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
  }, [screenToFlowPosition]);

  const handleStartFloraExample = useCallback(() => {
    const center = getCanvasCenterPosition();
    const seedGraph = buildFloraSeedGraph({ x: center.x - 640, y: center.y - 220 });
    addNodesAndEdgesAtomic(seedGraph.nodes, seedGraph.edges, 'Inserted WZRD example');
    scheduleSave();
    toast.success('WZRD example inserted.');
    window.dispatchEvent(
      new CustomEvent('fitViewToWorkflow', { detail: { animate: true } })
    );
  }, [addNodesAndEdgesAtomic, getCanvasCenterPosition, scheduleSave]);

  const handlePromptSubmit = useCallback(async () => {
    if (!projectId) {
      toast.error('Prompt creation requires an open Studio project.');
      return;
    }

    const trimmedPrompt = promptDraft.trim();
    if (!trimmedPrompt) {
      return;
    }

    const center = getCanvasCenterPosition();
    const textNode = buildNode('text', { x: center.x - 320, y: center.y - 48 }, {
      label: 'Text 1',
      params: {
        prompt: trimmedPrompt,
        content: trimmedPrompt,
        floraSource: 'prompt-bar',
      },
    });
    const imageNode = buildNode('image', { x: center.x + 100, y: center.y - 72 }, {
      label: truncatePromptLabel(trimmedPrompt),
      params: {
        prompt: trimmedPrompt,
        aspectRatio: '16:9',
      },
    });

    const newEdges: EdgeDefinition[] = [
      {
        id: uuidv4(),
        source: { nodeId: textNode.id, portId: textNode.outputs[0]?.id ?? '' },
        target: { nodeId: imageNode.id, portId: imageNode.inputs[0]?.id ?? '' },
        dataType: 'text',
        status: 'idle',
        metadata: { label: 'prompt' },
      },
    ];

    if (selectedImageEditNode?.kind === 'ImageEdit') {
      const promptPort =
        selectedImageEditNode.inputs.find((port) => port.name === 'prompt')?.id ??
        selectedImageEditNode.inputs[0]?.id ??
        '';
      const imagePort =
        selectedImageEditNode.inputs.find((port) => port.name === 'image')?.id ??
        selectedImageEditNode.inputs[1]?.id ??
        selectedImageEditNode.inputs[0]?.id ??
        '';

      if (promptPort && imagePort) {
        newEdges.push(
          {
            id: uuidv4(),
            source: { nodeId: textNode.id, portId: textNode.outputs[0]?.id ?? '' },
            target: { nodeId: selectedImageEditNode.id, portId: promptPort },
            dataType: 'text',
            status: 'idle',
            metadata: { label: 'prompt' },
          },
          {
            id: uuidv4(),
            source: { nodeId: imageNode.id, portId: imageNode.outputs[0]?.id ?? '' },
            target: { nodeId: selectedImageEditNode.id, portId: imagePort },
            dataType: 'image',
            status: 'idle',
            metadata: { label: 'image' },
          }
        );
      }
    }

    addNodesAndEdgesAtomic([textNode, imageNode], newEdges, 'Created prompt nodes');
    useComputeFlowStore.getState().updateNode(imageNode.id, {
      status: 'running',
      progress: 15,
    });
    scheduleSave();
    setPromptDraft('');
    setIsPromptSubmitting(true);
    toast.loading('Generating image...', { id: 'flora-prompt-generate' });

    try {
      const { data, error } = await supabase.functions.invoke('gemini-image-generation', {
        body: {
          prompt: trimmedPrompt,
          editMode: false,
          aspectRatio: '16:9',
        },
      });

      if (error) {
        throw error;
      }

      const imageUrl = data?.imageUrl as string | undefined;
      if (!imageUrl) {
        throw new Error('Image generation did not return a URL.');
      }

      useComputeFlowStore.getState().updateNode(imageNode.id, {
        status: 'succeeded',
        progress: 100,
        params: {
          ...imageNode.params,
          imageUrl,
          generationSource: 'flora-prompt-bar',
        },
        preview: {
          id: `${imageNode.id}-preview`,
          type: 'image',
          url: imageUrl,
          data: { url: imageUrl },
        },
      });
      scheduleSave();
      toast.success('Image generated.', { id: 'flora-prompt-generate' });
    } catch (error) {
      useComputeFlowStore.getState().updateNode(imageNode.id, {
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Image generation failed',
      });
      toast.error(error instanceof Error ? error.message : 'Image generation failed', {
        id: 'flora-prompt-generate',
      });
    } finally {
      setIsPromptSubmitting(false);
    }
  }, [
    addNodesAndEdgesAtomic,
    buildNode,
    getCanvasCenterPosition,
    projectId,
    promptDraft,
    scheduleSave,
    selectedImageEditNode,
  ]);

  useStudioKeyboardShortcuts({
    onAddTextNode: () => {
      const node = addNodeOfType('text', getCanvasCenterPosition());
      onSelectNode(node.id);
    },
    onAddImageNode: () => {
      const node = addNodeOfType('image', getCanvasCenterPosition());
      onSelectNode(node.id);
    },
    onAddVideoNode: () => {
      const node = addNodeOfType('video', getCanvasCenterPosition());
      onSelectNode(node.id);
    },
    onDelete: (nodeIds) => {
      nodeIds.forEach((id) => removeNode(id));
      scheduleSave();
      if (nodeIds.includes(selectedNodeId || '')) {
        onSelectNode(null);
      }
    },
    onDuplicate: (nodeIds) => {
      const nodesToDuplicate = nodeDefinitions.filter((node) => nodeIds.includes(node.id));
      nodesToDuplicate.forEach((node) => {
        handleDuplicateNode(node);
      });
    },
    selectedNodeIds: selectedNodes.map((node) => node.id),
  });

  const isValidConnection = useCallback(
    (connection: Connection): boolean => {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!source || !target || !sourceHandle || !targetHandle) {
        return false;
      }

      const result = validateNewEdge(source, sourceHandle, target, targetHandle);
      if (!result.valid && result.error) {
        showRejection(result.error, target);
      }
      return result.valid;
    },
    [validateNewEdge, showRejection]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, sourceHandle, target, targetHandle } = connection;
      if (!source || !target || !sourceHandle || !targetHandle) {
        toast.error('Connect nodes from a real output port to a compatible input port.');
        return;
      }

      // Clear any lingering rejection tooltip on successful connect
      clearRejection();
      connectNodes(source, sourceHandle, target, targetHandle);
    },
    [connectNodes, clearRejection]
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionStateLike: any) => {
      setIsInteracting(false);
      if (connectionStateLike.isValid) {
        return;
      }

      const eventTarget = event.target as HTMLElement | null;
      const droppedOnPane = Boolean(
        eventTarget?.closest('.react-flow__pane') || eventTarget?.closest('.react-flow__viewport')
      );
      if (!droppedOnPane) {
        return;
      }

      const sourceNodeId = connectionStateLike.fromNode?.id as string | undefined;
      const sourcePortId =
        (typeof connectionStateLike.fromHandle === 'string'
          ? connectionStateLike.fromHandle
          : connectionStateLike.fromHandle?.id) ??
        undefined;

      if (!sourceNodeId || !sourcePortId) {
        return;
      }

      const handleElement = document.querySelector(
        `.react-flow__handle[data-nodeid="${sourceNodeId}"][data-handleid="${sourcePortId}"]`
      ) as HTMLElement | null;
      const handleRect = handleElement?.getBoundingClientRect();

      if (handleRect) {
        openConnectionMenuFromPort(sourceNodeId, sourcePortId, handleRect);
        return;
      }

      const pointer =
        'changedTouches' in event ? event.changedTouches[0] : event;
      openConnectionMenuFromPort(sourceNodeId, sourcePortId, {
        left: pointer.clientX,
        top: pointer.clientY,
        right: pointer.clientX,
        bottom: pointer.clientY,
        width: 0,
        height: 0,
        x: pointer.clientX,
        y: pointer.clientY,
        toJSON: () => ({}),
      } as DOMRect);
    },
    [openConnectionMenuFromPort]
  );

  const handleSelectNodeType = useCallback(
    (type: 'text' | 'image' | 'video' | 'imageEdit', positionOverride?: { x: number; y: number }) => {
      const position = positionOverride ?? nodeSelectorFlowPosition;
      if (activeEdgeInsertion) {
        const actionByType = {
          text: 'text.enter',
          image: 'image.generate',
          video: 'video.generate',
          imageEdit: 'image.edit',
        } as const;
        const node = insertActionOnEdge(activeEdgeInsertion.edgeId, actionByType[type], position);
        if (node) {
          onSelectNode(node.id);
        }
        requestAnimationFrame(() => {
          setShowNodeSelector(false);
          setActiveConnection(null);
          setActiveEdgeInsertion(null);
        });
        return;
      }
      const node = activeConnection
        ? createConnectedNode(activeConnection.sourceNodeId, activeConnection.sourcePortId, type, position)
        : addNodeOfType(type, position);

      if (node) {
        onSelectNode(node.id);
      }

      requestAnimationFrame(() => {
        setShowNodeSelector(false);
        setActiveConnection(null);
        setActiveEdgeInsertion(null);
      });
    },
    [
      activeConnection,
      activeEdgeInsertion,
      addNodeOfType,
      createConnectedNode,
      insertActionOnEdge,
      nodeSelectorFlowPosition,
      onSelectNode,
    ]
  );

  const handleSelectAction = useCallback(
    (actionId: string, positionOverride?: { x: number; y: number }) => {
      const position = positionOverride ?? nodeSelectorFlowPosition;
      const action = getMediaActionById(actionId);
      if (!action) {
        toast.error('Unknown action');
        return;
      }

      const node = activeEdgeInsertion
        ? insertActionOnEdge(activeEdgeInsertion.edgeId, actionId, position)
        : activeConnection
          ? createConnectedActionNode(activeConnection.sourceNodeId, activeConnection.sourcePortId, actionId, position)
          : addActionNode(actionId, position);

      if (node) {
        onSelectNode(node.id);
      }

      requestAnimationFrame(() => {
        setShowNodeSelector(false);
        setActiveConnection(null);
        setActiveEdgeInsertion(null);
      });
    },
    [
      activeConnection,
      activeEdgeInsertion,
      addActionNode,
      createConnectedActionNode,
      insertActionOnEdge,
      nodeSelectorFlowPosition,
      onSelectNode,
    ]
  );

  const handleCanvasDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node')) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setNodeSelectorFlowPosition(position);
      setNodeSelectorScreenPosition({ x: event.clientX, y: event.clientY });
      setShowNodeSelector(true);
      setActiveConnection(null);
      setActiveEdgeInsertion(null);
    },
    [screenToFlowPosition]
  );

  const handlePaneClick = useCallback(() => {
    setShowNodeSelector(false);
    onSelectNode(null);
  }, [onSelectNode]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNodeSelector(false);
        setActiveConnection(null);
        setActiveEdgeInsertion(null);
        cancelClickConnection();
      }

      if (((event.metaKey || event.ctrlKey) && event.key === '0') || event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        fitView({ padding: 0.2, duration: 300 });
      }

      if ((event.key === 'g' || event.key === 'G') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setShowGrid((current) => !current);
      }

      if ((event.key === 'c' || event.key === 'C') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        toggleMode();
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelClickConnection, fitView, toggleMode, zoomIn, zoomOut]);

  // Note: removed length-based auto-fitView effect.
  // It caused jitter (multiple fitView animations racing) and bad UX
  // (camera yanked away from user on every node add). Initial framing
  // is handled by ReactFlow's onInit; AI workflows fit via the
  // single-flighted 'fitViewToWorkflow' event.

  useEffect(() => {
    return () => {
      if (cursorThrottleRef.current !== null) {
        window.clearTimeout(cursorThrottleRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void updateSelection(selectedNodeId ?? null);
  }, [selectedNodeId, updateSelection]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const instrumentation: StudioCanvasPerformanceInstrumentation = {
      getMetrics: () => ({
        ...getPreviewPerformanceMetrics(),
        ...nodeDataBuilderCacheRef.current.getInstrumentation(),
      }),
      resetMetrics: () => {
        resetPreviewPerformanceMetrics();
        nodeDataBuilderCacheRef.current.resetInstrumentation();
      },
    };
    window.__WZRD_STUDIO_PERFORMANCE__ = instrumentation;
    return () => {
      if (window.__WZRD_STUDIO_PERFORMANCE__ === instrumentation) {
        delete window.__WZRD_STUDIO_PERFORMANCE__;
      }
    };
  }, [getPreviewPerformanceMetrics, resetPreviewPerformanceMetrics]);

  return (
    <div
      ref={canvasContainerRef}
      className="wzrd-studio-canvas relative h-full w-full overflow-hidden bg-[#0A0A0A]"
      data-walkthrough="canvas"
      onPointerMove={handleCanvasPointerMove}
      onPointerLeave={handleCanvasPointerLeave}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.6,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,165,116,0.08),transparent_42%),radial-gradient(circle_at_72%_18%,rgba(249,115,22,0.08),transparent_22%),radial-gradient(circle_at_bottom,rgba(0,0,0,0.46),transparent_48%)]" />

      <FloraCollaboratorCursors
        users={onlineUsers}
        currentUserId={user?.id}
      />

      <ConnectionErrorTooltip rejection={rejection} />

      {(webCompatibilityByNodeId.size > 0 || previewPerformance.feedbackVisible) ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[70] flex w-[min(680px,calc(100%-32px))] -translate-x-1/2 flex-col gap-2">
          {webCompatibilityByNodeId.size > 0 ? (
            <div
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-[#c7cf8d]/20 bg-[#17180f]/95 px-4 py-3 text-zinc-100 shadow-2xl backdrop-blur-xl"
              data-component-id="web-compatibility-banner"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c7cf8d]/10 text-[#c7cf8d]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">
                  {webCompatibilityByNodeId.size} {webCompatibilityByNodeId.size === 1 ? 'node needs' : 'nodes need'} attention on web
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Desktop-only tools stay in the graph but won’t run in this browser.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:border-[#c7cf8d]/30 hover:text-white"
                onClick={() => {
                  const firstBlockedNodeId = webCompatibilityByNodeId.keys().next().value;
                  if (typeof firstBlockedNodeId === 'string') {
                    onSelectNode(firstBlockedNodeId);
                  }
                }}
              >
                Review nodes
              </button>
            </div>
          ) : null}

          {previewPerformance.feedbackVisible ? (
            <div
              className="flex items-center gap-3 rounded-xl border border-[#d4a574]/20 bg-[#171412]/95 px-4 py-3 text-zinc-100 shadow-2xl backdrop-blur-xl"
              data-component-id="studio-performance-banner"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d4a574]/10 text-[#d4a574]">
                <Gauge className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">Canvas performance reduced</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Cursor sharing, progress updates, and edge animation are reduced while you edit.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {showNodeSelector ? (
          <div
            style={{
              position: 'fixed',
              left: nodeSelectorScreenPosition.x + 12,
              top: nodeSelectorScreenPosition.y - 22,
              zIndex: 1100,
            }}
          >
            <ConnectionNodeSelector
              position={nodeSelectorFlowPosition}
              onSelectType={handleSelectNodeType}
              onSelectAction={handleSelectAction}
              onNavigate={() => {
                setShowNodeSelector(false);
                setActiveConnection(null);
                setActiveEdgeInsertion(null);
              }}
              onCancel={() => {
                setShowNodeSelector(false);
                setActiveConnection(null);
                setActiveEdgeInsertion(null);
              }}
            />
          </div>
        ) : null}
      </AnimatePresence>

      <StudioErrorBoundary
        fallbackTitle="Canvas Error"
        fallbackDescription="The studio canvas encountered an error"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={handleInteractionStart}
          onConnectEnd={onConnectEnd}
          onNodeClick={handleNodeClick}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onMoveStart={handleInteractionStart}
          onMoveEnd={handleInteractionEnd}
          onPaneClick={handlePaneClick}
          onDoubleClick={handleCanvasDoubleClick}
          onSelectionChange={({ nodes: selectionNodes }) => {
            // Stabilize selection: only emit when the user actually picked
            // a different node. XYFlow can briefly report an empty selection
            // during node insertion / data updates, which previously caused
            // the right rail and node selection ring to flicker between
            // Image and ImageEdit on every store tick.
            const nextId = selectionNodes[0]?.id ?? null;
            if (nextId !== null && nextId !== selectedNodeId) {
              onSelectNode(nextId);
            }
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionLineComponent={CustomConnectionLine}
          connectionMode={ConnectionMode.Strict}
          connectionRadius={30}
          isValidConnection={isValidConnection}
          defaultEdgeOptions={defaultEdgeOptions}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          onInit={(instance) => {
            if (nodeDefinitions.length > 0) {
              instance.fitView({ padding: 0.2, duration: 0 });
            }
          }}
          minZoom={0.1}
          maxZoom={2}
          deleteKeyCode={null}
          className="bg-transparent"
        >
          {showGrid ? (
            <Background
              color="rgba(255,255,255,0.08)"
              gap={40}
              variant={BackgroundVariant.Dots}
            />
          ) : null}
        </ReactFlow>
      </StudioErrorBoundary>

      {nodeDefinitions.length === 0 ? (
        <div className="pointer-events-none absolute inset-0">
          <EmptyCanvasState
            onAddBlock={(type) => {
              const node = addNodeOfType(type, getCanvasCenterPosition());
              onSelectNode(node.id);
            }}
            onStartFloraExample={handleStartFloraExample}
          />
        </div>
      ) : null}

      <ConnectionModeIndicator
        isClickMode={isClickMode}
        isConnecting={isConnecting}
        sourceNodeLabel={connectionState.sourceNode ? `Node ${connectionState.sourceNode.slice(0, 8)}` : undefined}
        onCancel={cancelClickConnection}
      />

      <CanvasToolbar
        connectionMode={isClickMode ? 'click' : 'drag'}
        onToggleConnectionMode={toggleMode}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((current) => !current)}
        onFitView={() => fitView({ padding: 0.2, duration: 300 })}
        onZoomIn={() => zoomIn()}
        onZoomOut={() => zoomOut()}
        selectedCount={selectedCount}
        onDeleteSelected={() => {
          selectedNodes.forEach((node) => removeNode(node.id));
          scheduleSave();
          if (selectedCount > 0) {
            onSelectNode(null);
          }
        }}
        onDuplicateSelected={() => {
          selectedNodes.forEach((node) => {
            const definition = nodeDefinitionsById.get(node.id);
            if (definition) {
              const duplicated = handleDuplicateNode(definition);
              onSelectNode(duplicated.id);
            }
          });
        }}
        isExecuting={execution.isRunning}
        executionProgress={execution}
        onExecute={projectId ? () => executeGraphStreaming(projectId) : undefined}
        onCancelExecution={cancelExecution}
        onSave={projectId ? () => saveGraph(projectId) : undefined}
        isSaving={isSaving}
        interactionMode="select"
        onToggleInteractionMode={() => {}}
      />

      <KeyboardShortcutsOverlay triggerClassName="left-[56px]" />
      {projectId ? (
        <QueueIndicator alwaysVisible />
      ) : null}

      {showPromptBar ? (
        <FloraPromptBar
          value={promptDraft}
          onChange={setPromptDraft}
          onSubmit={handlePromptSubmit}
          isSubmitting={isPromptSubmitting}
          disabled={!projectId}
          placeholder={FLORA_EXAMPLE_COPY.landingPrompt}
        />
      ) : null}
    </div>
  );
};

const StudioCanvas: React.FC<StudioCanvasProps> = (props) => (
  <ReactFlowProvider>
    <StudioCanvasInner {...props} />
  </ReactFlowProvider>
);

export default StudioCanvas;
