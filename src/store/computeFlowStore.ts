import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { 
  NodeDefinition, 
  EdgeDefinition,
  NodeStatus,
  DataType,
  Port,
  ArtifactRef,
} from '@/types/computeFlow';
import { NODE_TYPE_CONFIGS } from '@/types/computeFlow';
import { tryAdvance } from '@/types/nodeStatusMachine';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { extractInsufficientCreditsFromResponse, routeToBillingTopUp } from '@/lib/billing-errors';
import {
  ComputeFlowHistoryManager,
  edgesMeaningfullyChanged,
  nodesMeaningfullyChanged,
} from '@/store/computeFlowHistory';
import {
  validateConnection,
  type ValidationResult as EdgeValidationResult,
} from '@/utils/edgeValidation';
import { useHistoryStore, type HistoryEntry } from '@/store/historyStore';
import {
  normalizeDataType,
  normalizeNodeKind,
  normalizeNodeStatus,
} from '@/lib/compute/contract';
import {
  getActionDefaults,
  getDefaultMediaActionForKind,
  getMediaActionById,
  type MediaActionDefinition,
} from '@/lib/studio/mediaActionRegistry';
import { markLocalSave, withClientWriteId } from '@/lib/studio/clientWriteId';
import { getStudioSseProgressFlushMs } from '@/lib/studio/adaptivePreviewPerformance';
import {
  getStudioExecutionPlatform,
  getStudioNodeActionId,
  resolveStudioNodeExecutionRoute,
} from '@/platform/studioExecutionPlatform';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

function deriveHistoryType(description?: string): HistoryEntry['type'] {
  if (!description) return 'batch';
  if (description.startsWith('Added')) return 'add_node';
  if (description.startsWith('Updated')) return 'edit_node';
  if (description.startsWith('Connected')) return 'add_edge';
  if (description.includes('Removed node')) return 'delete_node';
  if (description.includes('Removed edge')) return 'delete_edge';
  if (description.includes('Loaded graph') || description.includes('Graph replaced')) return 'load_flow';
  return 'batch';
}

// PR-6: edit-session coalescing for the parallel useHistoryStore (audit panel).
// While the ComputeFlowHistoryManager is in an edit session, we defer the audit
// entry too so the panel records one entry per edit, not one per keystroke.
let pendingAuditEntry:
  | { description: string; nodes: NodeDefinition[]; edges: EdgeDefinition[] }
  | null = null;

function pushHistoryEntry(
  description: string | undefined,
  nodes: NodeDefinition[],
  edges: EdgeDefinition[]
): void {
  // If the manager is mid-edit, store the latest payload — the store will
  // flush it on endEditSession.
  // We can't read the manager here without circular access, so the store-side
  // wrappers in beginEditSession/endEditSession own the flush instead.
  if (pendingAuditEntry !== null && pendingAuditEntry.description === (description ?? 'Updated graph')) {
    pendingAuditEntry = { description: description ?? 'Updated graph', nodes, edges };
    return;
  }
  if (pendingAuditEntry !== null) {
    // A different description came in — flush the previous one first.
    flushPendingAuditEntry();
  }
  useHistoryStore.getState().pushEntry(
    description ?? 'Updated graph',
    deriveHistoryType(description),
    { nodes, edges }
  );
}

function deferAuditEntry(
  description: string | undefined,
  nodes: NodeDefinition[],
  edges: EdgeDefinition[]
): void {
  pendingAuditEntry = { description: description ?? 'Updated graph', nodes, edges };
}

function flushPendingAuditEntry(): void {
  if (!pendingAuditEntry) return;
  const { description, nodes, edges } = pendingAuditEntry;
  pendingAuditEntry = null;
  useHistoryStore.getState().pushEntry(
    description,
    deriveHistoryType(description),
    { nodes, edges }
  );
}

/**
 * Normalize graph IDs to ensure all node/edge IDs are valid UUIDs.
 * This repairs any legacy IDs (e.g., "node-1234567890-0") that may exist.
 */
function normalizeGraphIds(
  nodes: NodeDefinition[],
  edges: EdgeDefinition[]
): { nodes: NodeDefinition[]; edges: EdgeDefinition[]; changed: boolean } {
  const nodeIdMap = new Map<string, string>();
  const portIdMap = new Map<string, string>();
  let changed = false;

  // First pass: map old node IDs to new UUIDs
  const normalizedNodes = nodes.map(node => {
    if (!isValidUuid(node.id)) {
      const newId = uuidv4();
      nodeIdMap.set(node.id, newId);
      changed = true;
      
      // Regenerate ports with new node ID
      const inputs = (node.inputs || []).map((port, i) => {
        const oldPortId = port.id;
        const newPortId = `${newId}-input-${i}`;
        portIdMap.set(oldPortId, newPortId);
        return { ...port, id: newPortId };
      });
      
      const outputs = (node.outputs || []).map((port, i) => {
        const oldPortId = port.id;
        const newPortId = `${newId}-output-${i}`;
        portIdMap.set(oldPortId, newPortId);
        return { ...port, id: newPortId };
      });
      
      return { ...node, id: newId, inputs, outputs };
    }
    return node;
  });

  // Second pass: remap edge references
  const normalizedEdges = edges.map(edge => {
    let edgeChanged = false;
    const newEdge = { ...edge };
    
    // Fix edge ID if invalid
    if (!isValidUuid(edge.id)) {
      newEdge.id = uuidv4();
      edgeChanged = true;
    }
    
    // Remap source node/port
    const newSourceNodeId = nodeIdMap.get(edge.source.nodeId) || edge.source.nodeId;
    const newSourcePortId = portIdMap.get(edge.source.portId) || edge.source.portId;
    if (newSourceNodeId !== edge.source.nodeId || newSourcePortId !== edge.source.portId) {
      newEdge.source = { nodeId: newSourceNodeId, portId: newSourcePortId };
      edgeChanged = true;
    }
    
    // Remap target node/port
    const newTargetNodeId = nodeIdMap.get(edge.target.nodeId) || edge.target.nodeId;
    const newTargetPortId = portIdMap.get(edge.target.portId) || edge.target.portId;
    if (newTargetNodeId !== edge.target.nodeId || newTargetPortId !== edge.target.portId) {
      newEdge.target = { nodeId: newTargetNodeId, portId: newTargetPortId };
      edgeChanged = true;
    }
    
    if (edgeChanged) changed = true;
    return newEdge;
  });

  return { nodes: normalizedNodes, edges: normalizedEdges, changed };
}

function toPortDefinition(
  port: MediaActionDefinition['inputs'][number],
  fallbackPosition: Port['position']
): Port {
  return {
    id: port.id,
    name: port.name,
    datatype: normalizeDataType(port.datatype) as DataType,
    cardinality: port.cardinality,
    optional: port.optional,
    position: port.position ?? fallbackPosition,
    paramKey: port.paramKey,
  };
}

function buildPortsFromAction(action: MediaActionDefinition): { inputs: Port[]; outputs: Port[] } {
  return {
    inputs: action.inputs.map((port) => toPortDefinition(port, 'left')),
    outputs: action.outputs.map((port) => toPortDefinition(port, 'right')),
  };
}

function normalizePortReference(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function findPortByReference(ports: Port[] | undefined, ...references: Array<string | null | undefined>): Port | null {
  const normalizedReferences = references
    .map(normalizePortReference)
    .filter((reference) => reference.length > 0);
  if (!ports?.length || normalizedReferences.length === 0) {
    return null;
  }

  for (const reference of normalizedReferences) {
    const match = ports.find((port) =>
      [port.id, port.name, port.paramKey].some(
        (candidate) => normalizePortReference(candidate) === reference
      )
    );
    if (match) {
      return match;
    }
  }

  return null;
}

function fileUrlFromPath(filePath: string): string {
  return `file://${filePath
    .split('/')
    .map((part, index) => (index === 0 ? '' : encodeURIComponent(part)))
    .join('/')}`;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function localPathLikeFromNode(node: NodeDefinition | undefined): string | undefined {
  if (!node) return undefined;
  const params = node.params ?? {};
  const preview = node.preview as ArtifactRef | undefined;
  const previewData = preview?.data && typeof preview.data === 'object' ? preview.data as Record<string, unknown> : {};
  return (
    stringFromUnknown(params.outputPath) ||
    stringFromUnknown(params.localOutputPath) ||
    stringFromUnknown(params.sourcePath) ||
    stringFromUnknown(params.videoPath) ||
    stringFromUnknown(params.audioPath) ||
    stringFromUnknown(params.filePath) ||
    stringFromUnknown(params.url) ||
    stringFromUnknown(preview?.url) ||
    stringFromUnknown(previewData.path) ||
    stringFromUnknown(previewData.url)
  );
}

function collectStudioLocalInputs(
  node: NodeDefinition,
  nodeDefinitions: NodeDefinition[],
  edgeDefinitions: EdgeDefinition[]
): Record<string, unknown> {
  const nodeById = new Map(nodeDefinitions.map((candidate) => [candidate.id, candidate]));
  const inputs: Record<string, unknown> = { ...(node.params ?? {}) };

  for (const edge of edgeDefinitions.filter((candidate) => candidate.target.nodeId === node.id)) {
    const sourcePath = localPathLikeFromNode(nodeById.get(edge.source.nodeId));
    if (!sourcePath) continue;
    const targetPort = node.inputs.find((port) => port.id === edge.target.portId);
    const key = targetPort?.paramKey ?? targetPort?.name ?? edge.target.handle ?? edge.target.portId;
    if (targetPort?.cardinality === 'n') {
      const existing = inputs[key];
      inputs[key] = Array.isArray(existing)
        ? [...existing, sourcePath]
        : existing
          ? [existing, sourcePath]
          : [sourcePath];
    } else {
      inputs[key] = sourcePath;
    }
  }

  return inputs;
}

type StudioMediaActionResult = {
  outputPath?: string;
  outputs?: Array<{ type: string; path?: string; url?: string; data?: unknown; name?: string }>;
  metadata?: unknown;
};

async function previewFromStudioActionResult(
  result: StudioMediaActionResult,
  resolveMediaFileUrl?: (params: { filePath: string }) => Promise<string>
): Promise<ArtifactRef | undefined> {
  const primary = result.outputs?.[0];
  if (!primary) return undefined;

  if (primary.type === 'json') {
    return {
      id: uuidv4(),
      type: 'json',
      data: primary.data,
    };
  }

  const pathValue = primary.path ?? result.outputPath;
  let url = primary.url;
  if (!url && pathValue) {
    try {
      url = resolveMediaFileUrl ? await resolveMediaFileUrl({ filePath: pathValue }) : undefined;
    } catch (error) {
      console.warn('[computeFlowStore] failed to resolve desktop media URL for local Studio output', error);
    }
    url = url ?? fileUrlFromPath(pathValue);
  }
  if (!url) return undefined;

  const type = primary.type === 'image' || primary.type === 'video' || primary.type === 'audio'
    ? primary.type
    : 'json';
  return {
    id: uuidv4(),
    type,
    url,
    data: { url, path: pathValue, name: primary.name },
  };
}

function normalizeNodeDefinition(node: Partial<NodeDefinition> & { id: string }): NodeDefinition {
  const kind = normalizeNodeKind(String(node.kind ?? 'Transform')) ?? 'Transform';
  const action = getMediaActionById(getStudioNodeActionId(node));
  const actionPorts = action ? buildPortsFromAction(action) : null;
  const params = {
    ...(action ? getActionDefaults(action) : {}),
    ...(node.params ?? {}),
  };
  const metadata = {
    ...(node.metadata ?? {}),
    ...(action
      ? {
          actionId: action.actionId,
          mediaActionLabel: action.label,
          mediaType: action.mediaType,
          workflowType: action.workflowType,
          batchPolicy: action.batchPolicy,
        }
      : {}),
  };

  return {
    id: node.id,
    kind,
    actionId: action?.actionId ?? getStudioNodeActionId(node),
    mediaType: action?.mediaType ?? node.mediaType,
    workflowType: action?.workflowType ?? node.workflowType,
    executor: action?.executor ?? node.executor,
    controls: action?.controls ?? node.controls,
    batch: node.batch ?? (action ? { policy: action.batchPolicy } : undefined),
    variants: node.variants,
    assetRefs: node.assetRefs,
    version: typeof node.version === 'string' ? node.version : '1.0.0',
    label:
      typeof node.label === 'string' && node.label.trim().length > 0
        ? node.label
        : action?.label ?? 'Untitled Node',
    position: node.position ?? { x: 0, y: 0 },
    size: node.size,
    inputs: Array.isArray(node.inputs) && node.inputs.length > 0 ? node.inputs : actionPorts?.inputs ?? [],
    outputs: Array.isArray(node.outputs) && node.outputs.length > 0 ? node.outputs : actionPorts?.outputs ?? [],
    params,
    metadata,
    preview: node.preview,
    status: normalizeNodeStatus(node.status),
    progress: typeof node.progress === 'number' ? node.progress : 0,
    error: node.error,
    isDirty: Boolean(node.isDirty),
  };
}

function toCanonicalViewState(value: unknown): GraphViewState {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const zoom = typeof record.zoom === 'number' ? record.zoom : 1;
    const center = Array.isArray(record.center)
      ? [Number(record.center[0] ?? 0), Number(record.center[1] ?? 0)] as [number, number]
      : [Number(record.x ?? 0), Number(record.y ?? 0)] as [number, number];
    return { zoom, center };
  }

  return DEFAULT_GRAPH_VIEW_STATE;
}

function mapLegacyBlockTypeToKind(value: string | null | undefined): NodeDefinition['kind'] {
  return normalizeNodeKind(value) ?? 'Transform';
}

interface ExecutionProgress {
  runId: string | null;
  projectId: string | null;
  isRunning: boolean;
  completed: number;
  total: number;
  completedNodeIds: Set<string>;
  startedAt: Date | null;
  error: string | null;
}

interface DirtyState {
  dirtyNodeIds: Set<string>;
  dirtyEdgeIds: Set<string>;
  isGraphDirty: boolean;
  lastSavedAt: Date | null;
  lastModifiedAt: Date | null;
}

interface GraphViewState {
  zoom: number;
  center: [number, number];
}

interface GraphHeaderState {
  schemaVersion: string;
  graphMetadata: Record<string, unknown>;
  viewState: GraphViewState;
  revision: number;
}

interface PendingEdgeMeta {
  nodeIds: string[];
  edgeIds: string[];
  description: string;
  fitViewOnFlush?: boolean;
  imports?: PendingWorkflowImport[];
}

interface AddGeneratedWorkflowOptions {
  fitViewOnFlush?: boolean;
}

interface WorkflowImportFlushResult {
  importId: string;
  nodeIds: string[];
  edgeIds: string[];
}

interface WorkflowImportResult extends WorkflowImportFlushResult {
  flushed: Promise<WorkflowImportFlushResult>;
}

interface PendingWorkflowImport extends WorkflowImportFlushResult {
  resolve: (result: WorkflowImportFlushResult) => void;
}

function mergePendingEdgeMeta(
  current: PendingEdgeMeta | null,
  next?: PendingEdgeMeta
): PendingEdgeMeta | null {
  if (!next) return current;
  if (!current) return next;
  return {
    nodeIds: Array.from(new Set([...current.nodeIds, ...next.nodeIds])),
    edgeIds: Array.from(new Set([...current.edgeIds, ...next.edgeIds])),
    description: `${current.description}; ${next.description}`,
    fitViewOnFlush: Boolean(current.fitViewOnFlush || next.fitViewOnFlush),
    imports: [...(current.imports ?? []), ...(next.imports ?? [])],
  };
}

const DEFAULT_GRAPH_VIEW_STATE: GraphViewState = {
  zoom: 1,
  center: [0, 0],
};

interface ComputeFlowState {
  schemaVersion: GraphHeaderState['schemaVersion'];
  graphMetadata: GraphHeaderState['graphMetadata'];
  viewState: GraphHeaderState['viewState'];
  revision: GraphHeaderState['revision'];
  nodeDefinitions: NodeDefinition[];
  edgeDefinitions: EdgeDefinition[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  execution: ExecutionProgress;
  historyManager: ComputeFlowHistoryManager;
  canUndo: boolean;
  canRedo: boolean;
  dirtyNodeIds: DirtyState['dirtyNodeIds'];
  dirtyEdgeIds: DirtyState['dirtyEdgeIds'];
  isGraphDirty: DirtyState['isGraphDirty'];
  lastSavedAt: DirtyState['lastSavedAt'];
  lastModifiedAt: DirtyState['lastModifiedAt'];
  
  // Actions
  loadGraph: (projectId: string) => Promise<void>;
  saveGraph: (projectId: string) => Promise<void>;
  setViewState: (viewState: GraphViewState) => void;
  setGraphMetadata: (metadata: Record<string, unknown>) => void;
  addNode: (node: NodeDefinition) => void;
  addNodeSilent: (node: NodeDefinition) => void;
  createNode: (kind: NodeDefinition['kind'], position: { x: number; y: number }) => NodeDefinition;
  updateNode: (nodeId: string, updates: Partial<NodeDefinition>) => void;
  updateNodeSilent: (nodeId: string, updates: Partial<NodeDefinition>) => void;
  updateNodesSilent: (updates: Map<string, Partial<NodeDefinition>>) => void;
  removeNode: (nodeId: string) => void;
  removeNodeSilent: (nodeId: string) => void;
  addEdge: (edge: EdgeDefinition) => EdgeValidationResult;
  addEdgeSilent: (edge: EdgeDefinition) => void;
  removeEdge: (edgeId: string) => void;
  removeEdgeSilent: (edgeId: string) => void;
  setNodeStatus: (nodeId: string, status: NodeStatus, progress?: number, preview?: any) => void;
  setNodePreview: (nodeId: string, preview: any) => void;
  executeGraph: (projectId: string, nodeIds?: string[]) => Promise<void>;
  executeGraphStreaming: (projectId: string, nodeIds?: string[]) => Promise<void>;
  cancelExecution: () => void;
  cancelRun: (runId: string, projectId: string) => Promise<void>;
  clearGraph: () => void;
  resetNodeStatuses: () => void;
  resetAllNodeStatus: () => void;
  updateGraphAtomic: (
    nodeUpdates: Array<{ id: string; updates: Partial<NodeDefinition> }>,
    edgeUpdates: Array<{ id: string; updates: Partial<EdgeDefinition> }>,
    description?: string
  ) => void;
  addNodesAndEdgesAtomic: (
    nodes: NodeDefinition[],
    edges: EdgeDefinition[],
    description?: string
  ) => void;
  setGraphAtomic: (
    nodes: NodeDefinition[],
    edges: EdgeDefinition[],
    options?: { skipHistory?: boolean; skipDirty?: boolean }
  ) => void;
  undo: () => void;
  redo: () => void;
  setDragging: (dragging: boolean) => void;
  markNodeDirty: (nodeId: string) => void;
  markEdgeDirty: (edgeId: string) => void;
  markGraphDirty: () => void;
  clearDirtyState: () => void;
  isNodeDirty: (nodeId: string) => boolean;
  getDirtySummary: () => {
    nodeCount: number;
    edgeCount: number;
    isGraphDirty: boolean;
    timeSinceLastSave: number | null;
  };
  
  // AI Workflow Generation
  addGeneratedWorkflow: (
    nodes: NodeDefinition[],
    edges: EdgeDefinition[],
    options?: AddGeneratedWorkflowOptions
  ) => WorkflowImportResult;

  // Pending-edge queue (PR-2): edges queued during workflow import that should
  // be flushed once React Flow reports nodes-initialized.
  pendingEdges: EdgeDefinition[];
  pendingEdgeMeta: PendingEdgeMeta | null;
  enqueuePendingEdges: (edges: EdgeDefinition[], meta?: PendingEdgeMeta) => void;
  flushPendingEdges: () => void;

  // PR-6: edit-session coalescing — typing in a node only produces one undo entry.
  beginEditSession: (nodeId?: string | null) => void;
  endEditSession: () => void;
}

// Abort controller for cancellation
let executionAbortController: AbortController | null = null;

const pendingSseNodeUpdates = new Map<string, Partial<NodeDefinition>>();
let pendingSseNodeFlushScheduled = false;

function shouldApplyNodeUpdates(
  node: NodeDefinition | undefined,
  updates: Partial<NodeDefinition>
): boolean {
  if (!node) return false;
  return Object.entries(updates).some(([key, value]) => {
    return !Object.is(node[key as keyof NodeDefinition], value);
  });
}

function flushQueuedSseNodeUpdates(get: () => ComputeFlowState): void {
  pendingSseNodeFlushScheduled = false;
  if (pendingSseNodeUpdates.size === 0) {
    return;
  }

  const updates = new Map(pendingSseNodeUpdates);
  pendingSseNodeUpdates.clear();
  get().updateNodesSilent(updates);
}

function queueSseNodeUpdate(
  get: () => ComputeFlowState,
  nodeId: string,
  updates: Partial<NodeDefinition>
): void {
  const existing = pendingSseNodeUpdates.get(nodeId) ?? {};
  pendingSseNodeUpdates.set(nodeId, { ...existing, ...updates });

  if (pendingSseNodeFlushScheduled) {
    return;
  }

  pendingSseNodeFlushScheduled = true;
  setTimeout(() => flushQueuedSseNodeUpdates(get), getStudioSseProgressFlushMs());
}

export const useComputeFlowStore = create<ComputeFlowState>((set, get) => ({
  schemaVersion: '1',
  graphMetadata: {},
  viewState: DEFAULT_GRAPH_VIEW_STATE,
  revision: 0,
  nodeDefinitions: [],
  edgeDefinitions: [],
  pendingEdges: [],
  pendingEdgeMeta: null,
  isLoading: false,
  isSaving: false,
  error: null,
  historyManager: new ComputeFlowHistoryManager(),
  canUndo: false,
  canRedo: false,
  dirtyNodeIds: new Set(),
  dirtyEdgeIds: new Set(),
  isGraphDirty: false,
  lastSavedAt: null,
  lastModifiedAt: null,
  execution: {
    runId: null,
        projectId: null,
    isRunning: false,
    completed: 0,
    total: 0,
    completedNodeIds: new Set(),
    startedAt: null,
    error: null,
  },

  setViewState: (viewState) => set({ viewState }),
  setGraphMetadata: (graphMetadata) => set({ graphMetadata }),

  loadGraph: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      // compute_graphs table may not exist yet — treat 404/42P01 as "no header"
      let graphHeader: any = null;
      try {
        const result = await (supabase
          .from('compute_graphs' as any)
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle() as any);
        if (result.error && result.error.code !== '42P01') {
          throw result.error;
        }
        graphHeader = result.data ?? null;
      } catch (e: any) {
        if (e?.code === '42P01') {
          console.warn('[loadGraph] compute_graphs table does not exist yet — skipping header.');
        } else {
          throw e;
        }
      }

      const { data: nodes, error: nodesError } = await supabase
        .from('compute_nodes')
        .select('*')
        .eq('project_id', projectId);

      const { data: edges, error: edgesError } = await supabase
        .from('compute_edges')
        .select('*')
        .eq('project_id', projectId);

      if (nodesError) throw nodesError;
      if (edgesError) throw edgesError;

      if (!graphHeader && (nodes?.length ?? 0) === 0 && (edges?.length ?? 0) === 0) {
        const { data: legacyGraph, error: legacyError } = await supabase.functions.invoke('studio-load-state', {
          body: { projectId },
        });

        if (legacyError) {
          throw legacyError;
        }

        const legacyBlocks = Array.isArray(legacyGraph?.blocks) ? legacyGraph.blocks : [];
        if (legacyBlocks.length > 0) {
          const legacyNodes = legacyBlocks.map((block: any) => {
            const kind = mapLegacyBlockTypeToKind(block.type);
            const baseNode = get().createNode(kind, block.position ?? { x: 0, y: 0 });
            const imageUrl =
              block.initialData?.imageUrl ??
              block.generated_output_url ??
              null;

            const preview =
              typeof imageUrl === 'string' && imageUrl.length > 0
                ? ({
                    id: `${baseNode.id}-preview`,
                    type: kind === 'Video' ? 'video' : kind === 'Text' || kind === 'Prompt' ? 'text' : 'image',
                    url: kind === 'Text' || kind === 'Prompt' ? undefined : imageUrl,
                    data:
                      kind === 'Text' || kind === 'Prompt'
                        ? { text: block.initialData?.prompt ?? '' }
                        : { url: imageUrl },
                  } as ArtifactRef)
                : undefined;

            return normalizeNodeDefinition({
              ...baseNode,
              label: typeof block.type === 'string' ? block.type.replace(/[_-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : baseNode.label,
              params: {
                ...(baseNode.params ?? {}),
                prompt: block.initialData?.prompt ?? undefined,
                content: kind === 'Text' || kind === 'Prompt' ? block.initialData?.prompt ?? undefined : undefined,
                imageUrl: imageUrl ?? undefined,
                model: block.selectedModel ?? undefined,
              },
              metadata: {
                backfilledFromLegacy: true,
              },
              preview,
            });
          });

          const legacyViewState = toCanonicalViewState(legacyGraph?.canvasState?.viewport);
          const historyManager = get().historyManager;
          historyManager.clear();
          historyManager.pushSnapshot(legacyNodes, [], 'Loaded graph');
          pushHistoryEntry('Loaded graph', legacyNodes, []);
          const historyState = historyManager.getState();

          set({
            schemaVersion: '1',
            graphMetadata: { backfilledFromLegacy: true },
            viewState: legacyViewState,
            revision: 0,
            nodeDefinitions: legacyNodes,
            edgeDefinitions: [],
            isLoading: false,
            canUndo: historyState.canUndo,
            canRedo: historyState.canRedo,
            dirtyNodeIds: new Set(),
            dirtyEdgeIds: new Set(),
            isGraphDirty: false,
            lastSavedAt: null,
            lastModifiedAt: null,
          });

          await get().saveGraph(projectId);
          return;
        }
      }

      // Transform database format to frontend format
      const nodeDefinitions: NodeDefinition[] = (nodes || []).map((n) =>
        normalizeNodeDefinition({
          id: n.id,
          kind: n.kind as NodeDefinition['kind'],
          version: n.version,
          label: n.label,
          position: n.position as { x: number; y: number },
          size: n.size as { w: number; h: number } | undefined,
          inputs: (n.inputs as unknown as Port[]) || [],
          outputs: (n.outputs as unknown as Port[]) || [],
          params: (n.params as Record<string, unknown>) || {},
          metadata: (n.metadata as Record<string, unknown>) || undefined,
          preview: (n.preview as unknown as ArtifactRef) || undefined,
          status: n.status as NodeStatus,
          progress: n.progress || 0,
          error: n.error || undefined,
          isDirty: n.is_dirty || false,
        })
      );

      const edgeDefinitions: EdgeDefinition[] = (edges || []).map(e => ({
        id: e.id,
        source: {
          nodeId: e.source_node_id,
          portId: e.source_port_id,
          handle: (e as any).source_handle ?? undefined,
        },
        target: {
          nodeId: e.target_node_id,
          portId: e.target_port_id,
          handle: (e as any).target_handle ?? undefined,
        },
        dataType: normalizeDataType(e.data_type) as DataType,
        status: e.status as EdgeDefinition['status'],
        metadata: (e.metadata as EdgeDefinition['metadata']) || undefined,
      }));

      console.log('📥 Loaded compute graph:', { nodes: nodeDefinitions.length, edges: edgeDefinitions.length });
      const historyManager = get().historyManager;
      historyManager.clear();
      historyManager.pushSnapshot(nodeDefinitions, edgeDefinitions, 'Loaded graph');
      pushHistoryEntry('Loaded graph', nodeDefinitions, edgeDefinitions);
      const historyState = historyManager.getState();
      set({
        schemaVersion: typeof graphHeader?.schema_version === 'string' ? graphHeader.schema_version : '1',
        graphMetadata:
          graphHeader?.graph_metadata && typeof graphHeader.graph_metadata === 'object'
            ? (graphHeader.graph_metadata as Record<string, unknown>)
            : {},
        viewState: toCanonicalViewState(graphHeader?.view_state),
        revision: typeof graphHeader?.revision === 'number' ? graphHeader.revision : 0,
        nodeDefinitions,
        edgeDefinitions,
        isLoading: false,
        canUndo: historyState.canUndo,
        canRedo: historyState.canRedo,
        dirtyNodeIds: new Set(),
        dirtyEdgeIds: new Set(),
        isGraphDirty: false,
        lastSavedAt: new Date(),
        lastModifiedAt: null,
      });

      if (!graphHeader) {
        void get().saveGraph(projectId);
      }
    } catch (error: any) {
      console.error('Error loading graph:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  saveGraph: async (projectId: string) => {
    let { nodeDefinitions, edgeDefinitions } = get();
    const { schemaVersion, graphMetadata, viewState, revision } = get();
    set({ isSaving: true });

    try {
      // Normalize IDs before saving to ensure all are valid UUIDs
      const { nodes: normalizedNodes, edges: normalizedEdges, changed } = normalizeGraphIds(
        nodeDefinitions,
        edgeDefinitions
      );
      
      if (changed) {
        console.log('🔧 Normalized legacy node/edge IDs to UUIDs');
        toast.info('Repaired legacy node IDs for compatibility');
        // Update store with normalized IDs
        set({ nodeDefinitions: normalizedNodes, edgeDefinitions: normalizedEdges });
        nodeDefinitions = normalizedNodes;
        edgeDefinitions = normalizedEdges;
      }

      markLocalSave(projectId);
      const graphMetadataForSave = withClientWriteId(graphMetadata);
      const dbNodes = nodeDefinitions.map((node) => ({
        ...node,
        metadata: withClientWriteId(node.metadata),
      }));

      // Map edge definitions to flat DB columns expected by RPC
      const dbEdges = edgeDefinitions.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceNodeId: e.source.nodeId,
        source_node_id: e.source.nodeId,
        sourcePortId: e.source.portId,
        source_port_id: e.source.portId,
        sourceHandle: e.source.handle ?? null,
        source_handle: e.source.handle ?? null,
        targetNodeId: e.target.nodeId,
        target_node_id: e.target.nodeId,
        targetPortId: e.target.portId,
        target_port_id: e.target.portId,
        targetHandle: e.target.handle ?? null,
        target_handle: e.target.handle ?? null,
        dataType: e.dataType,
        data_type: e.dataType,
        status: e.status,
        metadata: withClientWriteId(e.metadata),
      }));

      const { data, error } = await (supabase.rpc('save_compute_graph' as any, {
        p_project_id: projectId,
        p_expected_revision: revision,
        p_schema_version: schemaVersion,
        p_graph_metadata: graphMetadataForSave,
        p_view_state: viewState,
        p_nodes: dbNodes,
        p_edges: dbEdges,
      }) as any);

      if (error) throw error;
      console.log('💾 Compute graph saved');
      const saveResult = Array.isArray(data) ? data[0] : data;
      set({
        revision: typeof saveResult?.revision === 'number' ? saveResult.revision : revision + 1,
        isSaving: false,
        dirtyNodeIds: new Set(),
        dirtyEdgeIds: new Set(),
        isGraphDirty: false,
        lastSavedAt: new Date(),
      });
    } catch (error: any) {
      console.error('Error saving graph:', error);
      const isRevisionMismatch =
        typeof error?.message === 'string' && error.message.toLowerCase().includes('revision mismatch');
      if (isRevisionMismatch) {
        toast.error('Graph save rejected because a newer revision exists. Reload the project and try again.');
      }
      set({ error: error.message, isSaving: false });
    }
  },

  createNode: (kind: NodeDefinition['kind'], position: { x: number; y: number }) => {
    const action = getDefaultMediaActionForKind(kind);
    const config = action ? buildPortsFromAction(action) : NODE_TYPE_CONFIGS[kind];
    const nodeId = uuidv4();
    
    // Generate port IDs
    const inputs: Port[] = (config?.inputs || []).map((input, i) => {
      const semanticId = (input as Partial<Port>).id;
      return {
        ...input,
        id: typeof semanticId === 'string' && semanticId.length > 0 ? semanticId : `${nodeId}-input-${i}`,
      };
    });
    
    const outputs: Port[] = (config?.outputs || []).map((output, i) => {
      const semanticId = (output as Partial<Port>).id;
      return {
        ...output,
        id: typeof semanticId === 'string' && semanticId.length > 0 ? semanticId : `${nodeId}-output-${i}`,
      };
    });

    const node: NodeDefinition = {
      id: nodeId,
      kind,
      actionId: action?.actionId,
      mediaType: action?.mediaType,
      workflowType: action?.workflowType,
      executor: action?.executor,
      controls: action?.controls,
      batch: action ? { policy: action.batchPolicy } : undefined,
      version: '1.0.0',
      label: action?.label ?? `${kind} Node`,
      position,
      size: { w: 420, h: 300 },
      inputs,
      outputs,
      params: action ? getActionDefaults(action) : {},
      metadata: action
        ? {
            actionId: action.actionId,
            mediaActionLabel: action.label,
            mediaType: action.mediaType,
            workflowType: action.workflowType,
            batchPolicy: action.batchPolicy,
          }
        : undefined,
      status: 'idle',
      progress: 0,
    };

    return node;
  },

  addNode: (node) => {
    set(state => ({
      nodeDefinitions: [...state.nodeDefinitions, node],
    }));
    get().markNodeDirty(node.id);
    get().historyManager.pushSnapshot(
      get().nodeDefinitions,
      get().edgeDefinitions,
      `Added ${node.label}`
    );
    pushHistoryEntry(
      `Added ${node.label}`,
      get().nodeDefinitions,
      get().edgeDefinitions
    );
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
  },

  addNodeSilent: (node) => {
    set(state => ({
      nodeDefinitions: [...state.nodeDefinitions, node],
    }));
  },

  updateNode: (nodeId, updates) => {
    const previousNodes = get().nodeDefinitions;
    set(state => ({
      nodeDefinitions: state.nodeDefinitions.map(n =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    }));
    get().markNodeDirty(nodeId);
    const nextNodes = get().nodeDefinitions;
    if (nodesMeaningfullyChanged(previousNodes, nextNodes)) {
      const description = `Updated ${get().nodeDefinitions.find(n => n.id === nodeId)?.label ?? 'node'}`;
      const manager = get().historyManager;
      manager.pushSnapshot(nextNodes, get().edgeDefinitions, description);
      // PR-6: during an edit session, defer the audit-panel entry too so
      // streaming keystrokes produce one entry, not one per character.
      if (manager.isInEditSession()) {
        deferAuditEntry(description, nextNodes, get().edgeDefinitions);
      } else {
        pushHistoryEntry(description, nextNodes, get().edgeDefinitions);
      }
      const historyState = manager.getState();
      set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
    }
  },

  updateNodeSilent: (nodeId, updates) => {
    set(state => {
      let changed = false;
      const nodeDefinitions = state.nodeDefinitions.map(n => {
        if (n.id !== nodeId || !shouldApplyNodeUpdates(n, updates)) {
          return n;
        }
        changed = true;
        return { ...n, ...updates };
      });
      return changed ? { nodeDefinitions } : state;
    });
  },

  updateNodesSilent: (updates) => {
    if (updates.size === 0) {
      return;
    }
    set(state => {
      let changed = false;
      const nodeDefinitions = state.nodeDefinitions.map(n => {
        const nodeUpdates = updates.get(n.id);
        if (!nodeUpdates || !shouldApplyNodeUpdates(n, nodeUpdates)) {
          return n;
        }
        changed = true;
        return { ...n, ...nodeUpdates };
      });
      return changed ? { nodeDefinitions } : state;
    });
  },

  removeNode: (nodeId) => {
    const previousNodes = get().nodeDefinitions;
    const previousEdges = get().edgeDefinitions;
    set(state => ({
      nodeDefinitions: state.nodeDefinitions.filter(n => n.id !== nodeId),
      edgeDefinitions: state.edgeDefinitions.filter(
        e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
      ),
    }));
    get().markGraphDirty();
    const nextNodes = get().nodeDefinitions;
    const nextEdges = get().edgeDefinitions;
    if (
      nodesMeaningfullyChanged(previousNodes, nextNodes) ||
      edgesMeaningfullyChanged(previousEdges, nextEdges)
    ) {
      get().historyManager.pushSnapshot(
        nextNodes,
        nextEdges,
        'Removed node'
      );
      pushHistoryEntry('Removed node', nextNodes, nextEdges);
      const historyState = get().historyManager.getState();
      set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
    }
  },

  removeNodeSilent: (nodeId) => {
    set(state => ({
      nodeDefinitions: state.nodeDefinitions.filter(n => n.id !== nodeId),
      edgeDefinitions: state.edgeDefinitions.filter(
        e => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId
      ),
    }));
  },

  addEdge: (edge) => {
    const state = get();
    const sourceNode = state.nodeDefinitions.find(n => n.id === edge.source.nodeId);
    const targetNode = state.nodeDefinitions.find(n => n.id === edge.target.nodeId);

    if (!sourceNode || !targetNode) {
      return { valid: false, error: 'Source or target node not found' };
    }

    const sourcePort = sourceNode.outputs?.find(p => p.id === edge.source.portId);
    const targetPort = targetNode.inputs?.find(p => p.id === edge.target.portId);

    if (!sourcePort || !targetPort) {
      return { valid: false, error: 'Source or target port not found' };
    }

    const validation = validateConnection({
      sourceNode,
      sourcePort,
      targetNode,
      targetPort,
      existingEdges: state.edgeDefinitions,
    });

    if (!validation.valid) {
      return validation;
    }

    set(current => ({
      edgeDefinitions: [...current.edgeDefinitions, edge],
    }));

    get().markEdgeDirty(edge.id);
    get().historyManager.pushSnapshot(
      get().nodeDefinitions,
      get().edgeDefinitions,
      `Connected ${sourceNode.label} to ${targetNode.label}`
    );
    pushHistoryEntry(
      `Connected ${sourceNode.label} to ${targetNode.label}`,
      get().nodeDefinitions,
      get().edgeDefinitions
    );
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });

    return validation;
  },

  addEdgeSilent: (edge) => {
    set(state => ({
      edgeDefinitions: [...state.edgeDefinitions, edge],
    }));
  },

  removeEdge: (edgeId) => {
    const previousEdges = get().edgeDefinitions;
    set(state => ({
      edgeDefinitions: state.edgeDefinitions.filter(e => e.id !== edgeId),
    }));
    get().markEdgeDirty(edgeId);
    const nextEdges = get().edgeDefinitions;
    if (edgesMeaningfullyChanged(previousEdges, nextEdges)) {
      get().historyManager.pushSnapshot(
        get().nodeDefinitions,
        nextEdges,
        'Removed edge'
      );
      pushHistoryEntry('Removed edge', get().nodeDefinitions, nextEdges);
      const historyState = get().historyManager.getState();
      set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
    }
  },

  removeEdgeSilent: (edgeId) => {
    set(state => ({
      edgeDefinitions: state.edgeDefinitions.filter(e => e.id !== edgeId),
    }));
  },

  setNodeStatus: (nodeId, status, progress, preview) => {
    const node = get().nodeDefinitions.find(n => n.id === nodeId);
    if (node) {
      const result = tryAdvance(node.status, status, nodeId);
      if (!result.ok) {
        // Out-of-order SSE / realtime events must not crash the consumer.
        // Drop the illegal transition and keep current state intact.
        console.warn('[computeFlowStore] rejected status transition', {
          nodeId,
          from: node.status,
          to: status,
          reason: result.rejected,
        });
        return;
      }
    }
    get().updateNodeSilent(nodeId, {
      status,
      progress: progress ?? node?.progress,
      preview: preview ?? node?.preview,
    });
  },

  setNodePreview: (nodeId, preview) => {
    get().updateNodeSilent(nodeId, { preview });
  },

  resetNodeStatuses: () => {
    get().resetAllNodeStatus();
  },

  resetAllNodeStatus: () => {
    const updates = new Map<string, Partial<NodeDefinition>>();
    for (const node of get().nodeDefinitions) {
      updates.set(node.id, {
        status: 'idle',
        progress: 0,
        preview: undefined,
        error: undefined,
      });
    }
    get().updateNodesSilent(updates);
    set({
      execution: {
        runId: null,
        projectId: null,
        isRunning: false,
        completed: 0,
        total: 0,
        completedNodeIds: new Set(),
        startedAt: null,
        error: null,
      },
    });
  },

  updateGraphAtomic: (nodeUpdates, edgeUpdates, description) => {
    const previousNodes = get().nodeDefinitions;
    const previousEdges = get().edgeDefinitions;

    set((state) => {
      const nodeUpdateMap = new Map(nodeUpdates.map((update) => [update.id, update.updates]));
      const edgeUpdateMap = new Map(edgeUpdates.map((update) => [update.id, update.updates]));

      return {
        nodeDefinitions: state.nodeDefinitions.map((node) => {
          const updates = nodeUpdateMap.get(node.id);
          return updates ? { ...node, ...updates } : node;
        }),
        edgeDefinitions: state.edgeDefinitions.map((edge) => {
          const updates = edgeUpdateMap.get(edge.id);
          return updates ? { ...edge, ...updates } : edge;
        }),
      };
    });

    set((state) => ({
      dirtyNodeIds: new Set([...state.dirtyNodeIds, ...nodeUpdates.map((u) => u.id)]),
      dirtyEdgeIds: new Set([...state.dirtyEdgeIds, ...edgeUpdates.map((u) => u.id)]),
      isGraphDirty: true,
      lastModifiedAt: new Date(),
    }));

    const nextNodes = get().nodeDefinitions;
    const nextEdges = get().edgeDefinitions;

    if (
      nodesMeaningfullyChanged(previousNodes, nextNodes) ||
      edgesMeaningfullyChanged(previousEdges, nextEdges)
    ) {
      get().historyManager.pushSnapshot(
        nextNodes,
        nextEdges,
        description ?? 'Batch update'
      );
      pushHistoryEntry(description ?? 'Batch update', nextNodes, nextEdges);
      const historyState = get().historyManager.getState();
      set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
    }
  },

  addNodesAndEdgesAtomic: (nodes, edges, description) => {
    set((state) => ({
      nodeDefinitions: [...state.nodeDefinitions, ...nodes],
      edgeDefinitions: [...state.edgeDefinitions, ...edges],
    }));

    set((state) => ({
      dirtyNodeIds: new Set([...state.dirtyNodeIds, ...nodes.map((node) => node.id)]),
      dirtyEdgeIds: new Set([...state.dirtyEdgeIds, ...edges.map((edge) => edge.id)]),
      isGraphDirty: true,
      lastModifiedAt: new Date(),
    }));

    get().historyManager.pushSnapshot(
      get().nodeDefinitions,
      get().edgeDefinitions,
      description ?? `Added ${nodes.length} nodes and ${edges.length} edges`
    );
    pushHistoryEntry(
      description ?? `Added ${nodes.length} nodes and ${edges.length} edges`,
      get().nodeDefinitions,
      get().edgeDefinitions
    );
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
  },

  setGraphAtomic: (nodes, edges, options) => {
    const previousNodes = get().nodeDefinitions;
    const previousEdges = get().edgeDefinitions;

    set({ nodeDefinitions: nodes, edgeDefinitions: edges });

    if (!options?.skipDirty) {
      set({
        dirtyNodeIds: new Set(nodes.map((node) => node.id)),
        dirtyEdgeIds: new Set(edges.map((edge) => edge.id)),
        isGraphDirty: true,
        lastModifiedAt: new Date(),
      });
    }

    if (!options?.skipHistory) {
      if (
        nodesMeaningfullyChanged(previousNodes, nodes) ||
        edgesMeaningfullyChanged(previousEdges, edges)
      ) {
        get().historyManager.pushSnapshot(nodes, edges, 'Graph replaced');
        pushHistoryEntry('Graph replaced', nodes, edges);
        const historyState = get().historyManager.getState();
        set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
      }
    }
  },

  undo: () => {
    const snapshot = get().historyManager.undo();
    if (!snapshot) return;
    get().setGraphAtomic(snapshot.nodes, snapshot.edges, { skipHistory: true });
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
  },

  redo: () => {
    const snapshot = get().historyManager.redo();
    if (!snapshot) return;
    get().setGraphAtomic(snapshot.nodes, snapshot.edges, { skipHistory: true });
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
  },

  setDragging: (dragging) => {
    get().historyManager.setDragging(dragging);
  },

  markNodeDirty: (nodeId) => {
    set((state) => ({
      dirtyNodeIds: new Set([...state.dirtyNodeIds, nodeId]),
      isGraphDirty: true,
      lastModifiedAt: new Date(),
    }));
  },

  markEdgeDirty: (edgeId) => {
    set((state) => ({
      dirtyEdgeIds: new Set([...state.dirtyEdgeIds, edgeId]),
      isGraphDirty: true,
      lastModifiedAt: new Date(),
    }));
  },

  markGraphDirty: () => {
    set({
      isGraphDirty: true,
      lastModifiedAt: new Date(),
    });
  },

  clearDirtyState: () => {
    set({
      dirtyNodeIds: new Set(),
      dirtyEdgeIds: new Set(),
      isGraphDirty: false,
      lastSavedAt: new Date(),
    });
  },

  isNodeDirty: (nodeId) => {
    return get().dirtyNodeIds.has(nodeId);
  },

  getDirtySummary: () => {
    const state = get();
    return {
      nodeCount: state.dirtyNodeIds.size,
      edgeCount: state.dirtyEdgeIds.size,
      isGraphDirty: state.isGraphDirty,
      timeSinceLastSave: state.lastSavedAt
        ? Date.now() - state.lastSavedAt.getTime()
        : null,
    };
  },

  /**
   * Execute graph with SSE streaming updates
   */
  executeGraphStreaming: async (projectId: string, nodeIds?: string[]) => {
    const { execution, nodeDefinitions } = get();
    
    if (execution.isRunning) {
      console.warn('Execution already in progress');
      return;
    }

    console.log('🚀 Executing compute graph with streaming...');

    const requestedNodeIds = new Set(nodeIds ?? []);
    const statusUpdates = new Map<string, Partial<NodeDefinition>>();
    for (const node of nodeDefinitions) {
      if (requestedNodeIds.size > 0 && !requestedNodeIds.has(node.id)) {
        continue;
      }
      statusUpdates.set(node.id, {
        status: 'queued',
        progress: 0,
        error: undefined,
      });
    }
    get().updateNodesSilent(statusUpdates);
    set({
        execution: {
          runId: null,
          projectId,
          isRunning: true,
          completed: 0,
          total: requestedNodeIds.size > 0 ? requestedNodeIds.size : nodeDefinitions.length,
          completedNodeIds: new Set(),
          startedAt: new Date(),
          error: null,
        },
    });

    const targetNodes = nodeDefinitions.filter((node) => requestedNodeIds.size === 0 || requestedNodeIds.has(node.id));
    const studioPlatform = getStudioExecutionPlatform();
    const routedTargetNodes = targetNodes.map((node) => ({
      node,
      route: resolveStudioNodeExecutionRoute(node, studioPlatform.runtime),
    }));
    const localFfmpegNodes = routedTargetNodes
      .filter(({ route }) => route.type === 'desktop-local')
      .map(({ node }) => node);
    const webBlockedNodes = routedTargetNodes
      .filter(({ route }) => route.type === 'web-blocked')
      .map(({ node }) => node);
    const remoteTargetNodes = routedTargetNodes
      .filter(({ route }) => route.type === 'remote')
      .map(({ node }) => node);

    if (webBlockedNodes.length > 0) {
      const skippedUpdates = new Map<string, Partial<NodeDefinition>>();
      for (const node of webBlockedNodes) {
        skippedUpdates.set(node.id, { status: 'skipped', progress: 100, error: undefined });
      }
      get().updateNodesSilent(skippedUpdates);
      set(state => ({
        execution: {
          ...state.execution,
          completed: state.execution.completed + webBlockedNodes.length,
          completedNodeIds: new Set([
            ...state.execution.completedNodeIds,
            ...webBlockedNodes.map((node) => node.id),
          ]),
        },
      }));
      toast.info(
        `${webBlockedNodes.length} desktop-only node${webBlockedNodes.length === 1 ? '' : 's'} kept in the graph and skipped on web.`
      );
    }

    if (localFfmpegNodes.length > 0) {
      const desktop = studioPlatform.localMedia;
      if (!desktop) {
        const message = 'Open the Electron desktop app to run local FFmpeg Studio actions.';
        const failedUpdates = new Map<string, Partial<NodeDefinition>>();
        for (const node of localFfmpegNodes) {
          failedUpdates.set(node.id, { status: 'failed', progress: 0, error: message });
        }
        get().updateNodesSilent(failedUpdates);
        set(state => ({
          execution: {
            ...state.execution,
            isRunning: false,
            error: message,
          },
        }));
        toast.error(message);
        return;
      }

      const outputFolder = await desktop.selectExportFolder();
      if (!outputFolder) {
        set(state => ({
          execution: {
            ...state.execution,
            isRunning: false,
            error: null,
          },
        }));
        return;
      }

      let completedLocalNodes = 0;
      let failedLocalNodes = 0;
      for (const node of localFfmpegNodes) {
        const actionId = getStudioNodeActionId(node);
        if (!actionId) continue;

        get().updateNodeSilent(node.id, { status: 'running', progress: 10, error: undefined });
        try {
          const currentNode = get().nodeDefinitions.find((candidate) => candidate.id === node.id) ?? node;
          const result = await desktop.runStudioMediaAction({
            operationId: `studio-${node.id}-${Date.now()}`,
            actionId,
            inputs: collectStudioLocalInputs(currentNode, get().nodeDefinitions, get().edgeDefinitions),
            params: currentNode.params,
            outputFolder,
          });
          const preview = await previewFromStudioActionResult(result, desktop.resolveMediaFileUrl);
          get().updateNodeSilent(node.id, {
            status: 'succeeded',
            progress: 100,
            error: undefined,
            preview,
            params: {
              ...(currentNode.params ?? {}),
              outputPath: result.outputPath,
              localOutputPath: result.outputPath,
              localMediaUrl: preview?.url,
            },
          });
          completedLocalNodes += 1;
          set(state => ({
            execution: {
              ...state.execution,
              completed: state.execution.completed + 1,
              completedNodeIds: new Set([...state.execution.completedNodeIds, node.id]),
            },
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Local Studio FFmpeg action failed.';
          failedLocalNodes += 1;
          get().updateNodeSilent(node.id, { status: 'failed', progress: 0, error: message });
          set(state => ({
            execution: {
              ...state.execution,
              error: message,
            },
          }));
          toast.error(message);
        }
      }

      if (failedLocalNodes > 0) {
        const message = `${failedLocalNodes} local Studio FFmpeg action${failedLocalNodes === 1 ? '' : 's'} failed. Fix the local action before running cloud-dependent nodes.`;
        set(state => ({
          execution: {
            ...state.execution,
            isRunning: false,
            error: message,
          },
        }));
        return;
      }

      if (remoteTargetNodes.length === 0) {
        set(state => ({
          execution: {
            ...state.execution,
            isRunning: false,
          },
        }));
        toast.success('Local Studio FFmpeg actions completed');
        return;
      }

      await get().saveGraph(projectId);
      if (completedLocalNodes > 0) {
        toast.success('Local Studio FFmpeg actions completed; running remaining cloud nodes');
      }
    }

    if (remoteTargetNodes.length === 0) {
      set(state => ({
        execution: {
          ...state.execution,
          isRunning: false,
        },
      }));
      return;
    }

    // Create abort controller
    executionAbortController = new AbortController();
    const remoteNodeIdsForRequest = remoteTargetNodes.map((node) => node.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/compute-execute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            projectId,
            nodeIds: remoteNodeIdsForRequest,
            excludedNodeIds: webBlockedNodes.map((node) => node.id),
          }),
          signal: executionAbortController.signal,
        }
      );

      if (!response.ok) {
        const insufficient = await extractInsufficientCreditsFromResponse(response);
        if (insufficient) {
          routeToBillingTopUp(insufficient);
          throw new Error(
            `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
              insufficient.available
            )}.`
          );
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // Process SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('event:')) {
              currentEvent = trimmedLine.slice(6).trim();
              continue;
            }
            
            if (trimmedLine.startsWith('data:')) {
              const jsonStr = trimmedLine.slice(5).trim();
              if (!jsonStr) continue;

              try {
                const data = JSON.parse(jsonStr);
                handleSSEEvent(currentEvent || 'message', data, set, get);
              } catch (e) {
                console.warn('Failed to parse SSE data:', jsonStr);
              }
            }
          }
        }
      } else {
        // Handle JSON response (fallback)
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        set(state => ({
          execution: {
            ...state.execution,
            runId: data.runId,
            isRunning: false,
          },
        }));
      }

    } catch (error: any) {
      flushQueuedSseNodeUpdates(get);
      console.error('Execution error:', error);
      
      const errorMessage = error.name === 'AbortError' ? 'Cancelled' : error.message;
      
      set(state => ({
        error: errorMessage,
        execution: {
          ...state.execution,
          isRunning: false,
          error: errorMessage,
        },
      }));
    }
  },

  /**
   * Cancel the current execution
   */
  cancelExecution: () => {
    console.log('🛑 Cancelling execution');

    const { runId, projectId } = get().execution;

    // PR-4: notify the server BEFORE aborting the SSE stream so it can
    // mark the run canceled and stop spending credits.
    if (runId && projectId) {
      void get().cancelRun(runId, projectId);
    }

    if (executionAbortController) {
      executionAbortController.abort();
      executionAbortController = null;
    }

    flushQueuedSseNodeUpdates(get);

    set(state => ({
      execution: {
        ...state.execution,
        isRunning: false,
        error: 'Cancelled',
      },
    }));
  },

  cancelRun: async (runId: string, projectId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(
        `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/compute-cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ runId, projectId }),
        }
      );
    } catch (err) {
      console.warn('[computeFlowStore] cancelRun request failed', err);
    }
  },

  /**
   * Legacy execute (kept for backwards compatibility)
   */
  executeGraph: async (projectId: string, nodeIds?: string[]) => {
    // Use streaming version by default
    return get().executeGraphStreaming(projectId, nodeIds);
  },

  clearGraph: () => {
    const historyManager = get().historyManager;
    historyManager.clear();
    set({
      nodeDefinitions: [],
      edgeDefinitions: [],
      error: null,
      canUndo: false,
      canRedo: false,
      dirtyNodeIds: new Set(),
      dirtyEdgeIds: new Set(),
      isGraphDirty: false,
      lastSavedAt: null,
      lastModifiedAt: null,
      execution: {
        runId: null,
        projectId: null,
        isRunning: false,
        completed: 0,
        total: 0,
        completedNodeIds: new Set(),
        startedAt: null,
        error: null,
      },
    });
  },

  /**
   * Add AI-generated workflow nodes and edges to the canvas
   * Uses phased approach: add nodes first, then edges after React Flow initializes
   */
  addGeneratedWorkflow: (nodes: NodeDefinition[], edges: EdgeDefinition[], options) => {
    console.log('🎨 Adding generated workflow:', { nodes: nodes.length, edges: edges.length });
    const importId = uuidv4();
    const generatedAt = new Date().toISOString();
    
    // Log incoming data for debugging
    console.log('📦 Incoming nodes:', nodes.map(n => ({ id: n.id, kind: n.kind, outputs: n.outputs?.map(o => o.id) })));
    console.log('📦 Incoming edges:', edges.map(e => ({ id: e.id, source: e.source, target: e.target })));
    
    // Normalize incoming workflow IDs to ensure they're valid UUIDs
    const { nodes: normalizedNodes, edges: normalizedEdges, changed } = normalizeGraphIds(nodes, edges);
    
    if (changed) {
      console.log('🔧 Normalized incoming workflow IDs to UUIDs');
      console.log('📦 Normalized edges:', normalizedEdges.map(e => ({ id: e.id, source: e.source, target: e.target })));
    }
    
    // Verify edge port IDs match actual node port IDs
    const stagedNodes = normalizedNodes.map((node) => ({
      ...node,
      metadata: {
        ...(node.metadata ?? {}),
        generatedWorkflowImportId: importId,
        generatedAt,
        generationPhase: 'staged',
      },
    }));

    const stagedNodeById = new Map(stagedNodes.map((node) => [node.id, node]));
    const existingEdges = get().edgeDefinitions;
    const validatedEdges: EdgeDefinition[] = [];

    normalizedEdges.forEach((edge) => {
      const sourceNode = stagedNodeById.get(edge.source.nodeId);
      const targetNode = stagedNodeById.get(edge.target.nodeId);

      if (!sourceNode || !targetNode) {
        console.warn('⚠️ Edge references non-existent node:', edge);
        return;
      }

      const sourcePort = findPortByReference(sourceNode.outputs, edge.source.portId, edge.source.handle);
      const targetPort = findPortByReference(targetNode.inputs, edge.target.portId, edge.target.handle);

      if (!sourcePort) {
        console.warn('⚠️ No matching output port on source node:', {
          nodeId: sourceNode.id,
          portId: edge.source.portId,
          handle: edge.source.handle,
        });
        return;
      }

      if (!targetPort) {
        console.warn('⚠️ No matching input port on target node:', {
          nodeId: targetNode.id,
          portId: edge.target.portId,
          handle: edge.target.handle,
        });
        return;
      }

      const repairedEdge: EdgeDefinition = {
        ...edge,
        source: { nodeId: sourceNode.id, portId: sourcePort.id, handle: sourcePort.name },
        target: { nodeId: targetNode.id, portId: targetPort.id, handle: targetPort.name },
        dataType: sourcePort.datatype,
        status: edge.status ?? 'idle',
      };
      const validation = validateConnection({
        sourceNode,
        sourcePort,
        targetNode,
        targetPort,
        existingEdges: [...existingEdges, ...validatedEdges],
      });

      if (!validation.valid) {
        console.warn('⚠️ Generated workflow edge failed validation:', validation.error, repairedEdge);
        return;
      }

      validatedEdges.push(repairedEdge);
    });
    
    console.log('✅ Validated edges:', validatedEdges.length, 'of', normalizedEdges.length);
    const resultBase: WorkflowImportFlushResult = {
      importId,
      nodeIds: stagedNodes.map((node) => node.id),
      edgeIds: validatedEdges.map((edge) => edge.id),
    };
    let resolveImport: (result: WorkflowImportFlushResult) => void = () => undefined;
    const flushed = new Promise<WorkflowImportFlushResult>((resolve) => {
      resolveImport = resolve;
    });
    
    // Phase 1: Add nodes first (mark that we're adding a workflow)
    set(state => ({
      nodeDefinitions: [...state.nodeDefinitions, ...stagedNodes],
      dirtyNodeIds: new Set([...state.dirtyNodeIds, ...stagedNodes.map(node => node.id)]),
      isGraphDirty: true,
      lastModifiedAt: new Date(),
    }));
    
    // Phase 2 (PR-2): enqueue edges; StudioCanvas flushes them once
    // React Flow reports nodes-initialized. No setTimeout synchronization.
    if (validatedEdges.length > 0) {
      get().enqueuePendingEdges(validatedEdges, {
        nodeIds: stagedNodes.map(n => n.id),
        edgeIds: validatedEdges.map(e => e.id),
        description: `Added ${stagedNodes.length} nodes and ${validatedEdges.length} edges`,
        fitViewOnFlush: Boolean(options?.fitViewOnFlush),
        imports: [{ ...resultBase, resolve: resolveImport }],
      });
    } else {
      get().historyManager.pushSnapshot(
        get().nodeDefinitions,
        get().edgeDefinitions,
        `Added ${stagedNodes.length} nodes`
      );
      pushHistoryEntry(
        `Added ${stagedNodes.length} nodes`,
        get().nodeDefinitions,
        get().edgeDefinitions
      );
      const historyState = get().historyManager.getState();
      set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
      resolveImport(resultBase);
    }

    return { ...resultBase, flushed };
  },

  enqueuePendingEdges: (edges, meta) => {
    set(state => ({
      pendingEdges: [...state.pendingEdges, ...edges],
      pendingEdgeMeta: mergePendingEdgeMeta(state.pendingEdgeMeta, meta),
    }));
  },

  flushPendingEdges: () => {
    const { pendingEdges, pendingEdgeMeta } = get();
    if (pendingEdges.length === 0) return;

    set(state => ({
      edgeDefinitions: [...state.edgeDefinitions, ...pendingEdges],
      dirtyEdgeIds: new Set([...state.dirtyEdgeIds, ...pendingEdges.map(e => e.id)]),
      isGraphDirty: true,
      lastModifiedAt: new Date(),
      pendingEdges: [],
      pendingEdgeMeta: null,
    }));

    const description = pendingEdgeMeta?.description ?? `Added ${pendingEdges.length} edges`;
    get().historyManager.pushSnapshot(
      get().nodeDefinitions,
      get().edgeDefinitions,
      description
    );
    pushHistoryEntry(description, get().nodeDefinitions, get().edgeDefinitions);
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });

    if (pendingEdgeMeta?.fitViewOnFlush && pendingEdgeMeta.nodeIds.length) {
      window.dispatchEvent(new CustomEvent('fitViewToWorkflow', {
        detail: { nodeIds: pendingEdgeMeta.nodeIds, animate: true },
      }));
    }

    pendingEdgeMeta?.imports?.forEach((workflowImport) => {
      workflowImport.resolve({
        importId: workflowImport.importId,
        nodeIds: workflowImport.nodeIds,
        edgeIds: workflowImport.edgeIds,
      });
    });
  },

  // PR-6: edit-session coalescing.
  beginEditSession: (nodeId = null) => {
    get().historyManager.beginEditSession(nodeId ?? null);
  },
  endEditSession: () => {
    get().historyManager.endEditSession();
    // Flush the deferred audit-panel entry, if any.
    flushPendingAuditEntry();
    const historyState = get().historyManager.getState();
    set({ canUndo: historyState.canUndo, canRedo: historyState.canRedo });
  },
}));

/**
 * Handle SSE events from compute-execute
 */
function handleSSEEvent(
  event: string,
  data: any,
  set: any,
  get: () => ComputeFlowState
) {
  console.log(`📨 SSE Event: ${event}`, data);

  switch (event) {
    case 'meta':
      set((state: ComputeFlowState) => ({
        execution: {
          ...state.execution,
          runId: data.run_id,
          total: Math.max(state.execution.total, Number(data.total_nodes) || 0),
        },
      }));
      break;

    case 'node_status': {
      const { node_id, status, output, error } = data;
      const mappedStatus = mapStatus(status);
      const isCompleted = ['succeeded', 'failed', 'skipped'].includes(mappedStatus);
      const statusProgress = isCompleted ? 100 : mappedStatus === 'running' ? 50 : 0;
      const existingNode = get().nodeDefinitions.find(n => n.id === node_id);
      queueSseNodeUpdate(get, node_id, {
        status: mappedStatus,
        progress: statusProgress,
        preview: output ?? existingNode?.preview,
        error: error || undefined,
      });
      if (isCompleted) {
        flushQueuedSseNodeUpdates(get);
      }
      set((state: ComputeFlowState) => ({
        execution: {
          ...state.execution,
          completed: isCompleted && !state.execution.completedNodeIds.has(node_id)
            ? state.execution.completed + 1
            : state.execution.completed,
          completedNodeIds: isCompleted
            ? new Set([...state.execution.completedNodeIds, node_id])
            : state.execution.completedNodeIds,
        },
      }));
      break;
    }

    case 'node_progress': {
      const { node_id: progressNodeId, progress: nodeProgress } = data;
      const existingProgressNode = get().nodeDefinitions.find(n => n.id === progressNodeId);
      queueSseNodeUpdate(get, progressNodeId, {
        progress: nodeProgress ?? existingProgressNode?.progress,
      });
      break;
    }

    case 'complete':
      flushQueuedSseNodeUpdates(get);
      set((state: ComputeFlowState) => ({
        execution: {
          ...state.execution,
          isRunning: false,
          completed: Math.max(
            state.execution.completed,
            state.execution.completedNodeIds.size,
            Number(data.completed_nodes) || 0
          ),
          total: Math.max(state.execution.total, Number(data.total_nodes) || 0),
        },
      }));
      break;

    case 'error':
      flushQueuedSseNodeUpdates(get);
      set((state: ComputeFlowState) => ({
        error: data.error,
        execution: {
          ...state.execution,
          isRunning: false,
          error: data.error,
        },
      }));
      break;
  }
}

/**
 * Map backend status to frontend NodeStatus
 */
function mapStatus(backendStatus: string): NodeStatus {
  return normalizeNodeStatus(backendStatus);
}
