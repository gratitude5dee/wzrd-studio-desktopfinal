import type { Edge, Node } from '@xyflow/react';
import type { EdgeDefinition, NodeDefinition } from '@/types/computeFlow';

const SIGNATURE_METADATA_OMITS = new Set([
  'clientWriteId',
  'client_write_id',
  'runId',
  'run_id',
  'startedAt',
  'started_at',
  'finishedAt',
  'finished_at',
  'queuedAt',
  'queued_at',
  'completedAt',
  'completed_at',
  'lastSavedAt',
  'last_saved_at',
  'lastModifiedAt',
  'last_modified_at',
  'status',
  'progress',
  'error',
  'isDirty',
  'is_dirty',
]);

interface ReactFlowNodeDataSignatureInput {
  node: NodeDefinition;
  chips?: unknown;
  byHandle?: unknown;
  incomingPrompt?: unknown;
  inputValue?: unknown;
  inputType?: unknown;
  includeRuntime?: boolean;
}

export interface ReactFlowNodeDataBuildInput {
  node: NodeDefinition;
  incomingEdges: readonly EdgeDefinition[];
  incomingSourceNodes: readonly NodeDefinition[];
  includeRuntime: boolean;
}

export interface ReactFlowNodeBuildInstrumentation {
  builderInvocations: number;
  fullSignatureRecomputes: number;
  reconciliationRuns: number;
  builderInvocationsByNode: Record<string, number>;
}

interface ReactFlowNodeDataCacheEntry<TData> {
  input: ReactFlowNodeDataBuildInput;
  data: TData;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function getDataSignature(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as Record<string, unknown>).__signature;
}

function sanitizeSignatureMetadata(metadata: NodeDefinition['metadata']): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !SIGNATURE_METADATA_OMITS.has(key))
  );
}

function sanitizeSignatureBatch(batch: NodeDefinition['batch']): NodeDefinition['batch'] | undefined {
  if (!batch) {
    return undefined;
  }

  return {
    policy: batch.policy,
    items: batch.items,
  };
}

function haveSameNodeDataFields(
  left: NodeDefinition,
  right: NodeDefinition,
  includeRuntime: boolean
): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.actionId === right.actionId &&
    left.mediaType === right.mediaType &&
    left.workflowType === right.workflowType &&
    left.executor === right.executor &&
    left.controls === right.controls &&
    left.batch === right.batch &&
    left.variants === right.variants &&
    left.assetRefs === right.assetRefs &&
    left.version === right.version &&
    left.label === right.label &&
    left.size === right.size &&
    left.inputs === right.inputs &&
    left.outputs === right.outputs &&
    left.params === right.params &&
    left.metadata === right.metadata &&
    left.preview === right.preview &&
    (!includeRuntime ||
      (left.status === right.status &&
        left.progress === right.progress &&
        left.error === right.error &&
        left.isDirty === right.isDirty))
  );
}

function haveSameIncomingEdges(
  left: readonly EdgeDefinition[],
  right: readonly EdgeDefinition[]
): boolean {
  return left.length === right.length && left.every((edge, index) => Object.is(edge, right[index]));
}

function haveSameIncomingSourceNodes(
  left: readonly NodeDefinition[],
  right: readonly NodeDefinition[]
): boolean {
  return (
    left.length === right.length &&
    left.every((node, index) => {
      const other = right[index];
      return Boolean(other) && haveSameNodeDataFields(node, other, false);
    })
  );
}

export function areReactFlowNodeDataBuildInputsEqual(
  left: ReactFlowNodeDataBuildInput,
  right: ReactFlowNodeDataBuildInput
): boolean {
  return (
    left.includeRuntime === right.includeRuntime &&
    haveSameNodeDataFields(left.node, right.node, left.includeRuntime) &&
    haveSameIncomingEdges(left.incomingEdges, right.incomingEdges) &&
    haveSameIncomingSourceNodes(left.incomingSourceNodes, right.incomingSourceNodes)
  );
}

export class ReactFlowNodeDataBuilderCache<TData> {
  private readonly entries = new Map<string, ReactFlowNodeDataCacheEntry<TData>>();
  private instrumentation: ReactFlowNodeBuildInstrumentation = {
    builderInvocations: 0,
    fullSignatureRecomputes: 0,
    reconciliationRuns: 0,
    builderInvocationsByNode: {},
  };

  getOrBuild(input: ReactFlowNodeDataBuildInput, builder: () => TData): TData {
    const previous = this.entries.get(input.node.id);
    if (previous && areReactFlowNodeDataBuildInputsEqual(previous.input, input)) {
      return previous.data;
    }

    const data = builder();
    this.entries.set(input.node.id, { input, data });
    this.instrumentation.builderInvocations += 1;
    this.instrumentation.fullSignatureRecomputes += 1;
    this.instrumentation.builderInvocationsByNode[input.node.id] =
      (this.instrumentation.builderInvocationsByNode[input.node.id] ?? 0) + 1;
    return data;
  }

  noteReconciliationRun(): void {
    this.instrumentation.reconciliationRuns += 1;
  }

  prune(activeNodeIds: ReadonlySet<string>): void {
    for (const nodeId of this.entries.keys()) {
      if (!activeNodeIds.has(nodeId)) {
        this.entries.delete(nodeId);
      }
    }
  }

  resetInstrumentation(): void {
    this.instrumentation = {
      builderInvocations: 0,
      fullSignatureRecomputes: 0,
      reconciliationRuns: 0,
      builderInvocationsByNode: {},
    };
  }

  getInstrumentation(): ReactFlowNodeBuildInstrumentation {
    return {
      ...this.instrumentation,
      builderInvocationsByNode: { ...this.instrumentation.builderInvocationsByNode },
    };
  }
}

export function buildReactFlowNodeDataSignature({
  node,
  chips,
  byHandle,
  incomingPrompt,
  inputValue,
  inputType,
  includeRuntime = false,
}: ReactFlowNodeDataSignatureInput): string {
  return stableStringify({
    node: {
      id: node.id,
      kind: node.kind,
      actionId: node.actionId,
      mediaType: node.mediaType,
      workflowType: node.workflowType,
      executor: node.executor,
      controls: node.controls,
      batch: sanitizeSignatureBatch(node.batch),
      variants: node.variants,
      assetRefs: node.assetRefs,
      version: node.version,
      label: node.label,
      size: node.size,
      inputs: node.inputs,
      outputs: node.outputs,
      params: node.params,
      metadata: sanitizeSignatureMetadata(node.metadata),
      preview: node.preview,
      ...(includeRuntime
        ? {
            status: node.status,
            progress: node.progress,
            error: node.error,
            isDirty: node.isDirty,
          }
        : {}),
    },
    chips,
    byHandle,
    incomingPrompt,
    inputValue,
    inputType,
  });
}

export function reconcileReactFlowNodes<TNode extends Node>(
  previousNodes: TNode[],
  nextNodes: TNode[]
): TNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  let changed = previousNodes.length !== nextNodes.length;

  const reconciled = nextNodes.map((next, index) => {
    const prev = previousById.get(next.id);
    if (!prev) {
      changed = true;
      return next;
    }

    if (previousNodes[index]?.id !== next.id) {
      changed = true;
    }

    const sameShell =
      prev.type === next.type &&
      prev.selected === next.selected &&
      prev.position.x === next.position.x &&
      prev.position.y === next.position.y;

    if (sameShell && getDataSignature(prev.data) === getDataSignature(next.data)) {
      return prev;
    }

    changed = true;
    if (sameShell) {
      return { ...prev, data: next.data };
    }

    return next;
  });

  return changed ? reconciled : previousNodes;
}

export function reconcileReactFlowEdges<TEdge extends Edge>(
  previousEdges: TEdge[],
  nextEdges: TEdge[]
): TEdge[] {
  const previousById = new Map(previousEdges.map((edge) => [edge.id, edge]));
  let changed = previousEdges.length !== nextEdges.length;

  const reconciled = nextEdges.map((next, index) => {
    const prev = previousById.get(next.id);
    if (!prev) {
      changed = true;
      return next;
    }

    if (previousEdges[index]?.id !== next.id) {
      changed = true;
    }

    const sameShell =
      prev.source === next.source &&
      prev.target === next.target &&
      prev.sourceHandle === next.sourceHandle &&
      prev.targetHandle === next.targetHandle &&
      prev.type === next.type;

    if (sameShell && getDataSignature(prev.data) === getDataSignature(next.data)) {
      return prev;
    }

    changed = true;
    return next;
  });

  return changed ? reconciled : previousEdges;
}
