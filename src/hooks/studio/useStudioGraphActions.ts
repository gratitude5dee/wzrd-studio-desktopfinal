import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { flushStudioSave, scheduleStudioSave } from '@/lib/studio/studioSaveCoordinator';

import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { ArtifactRef, DataType, EdgeDefinition, NodeDefinition, Port } from '@/types/computeFlow';
import { isTypeCompatible } from '@/types/computeFlow';
import { validateConnection } from '@/utils/edgeValidation';
import { cloneImageEditParams } from '@/lib/imageEdit';
import { DEFAULT_IMAGE_EDIT_PARAMS } from '@/types/imageEdit';
import {
  type WorkflowBlueprint,
  type WorkflowBlueprintNodeIntent,
  type WorkflowBlueprintNodeRef,
  type WorkflowBlueprintLayout,
} from '@/lib/studio/workflowBlueprint';
import { getDefaultModelForNodeKind } from '@/lib/studio/nodeUtils';
import { getModelById } from '@/lib/studio-model-constants';
import { normalizeNodeKind, type CanonicalNodeKind } from '@/lib/compute/contract';
import { applyOnConnect } from '@/lib/compute/applyBinding';
import {
  getActionDefaults,
  getMediaActionById,
  type MediaActionDefinition,
} from '@/lib/studio/mediaActionRegistry';

export type StudioNodeType = 'text' | 'image' | 'imageEdit' | 'video' | 'audio';

export interface StudioNodeSeedOptions {
  label?: string;
  params?: Record<string, unknown>;
  preview?: ArtifactRef;
  metadata?: Record<string, unknown>;
  size?: NodeDefinition['size'];
}

interface MaterializedWorkflow {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

const TYPE_TO_KIND: Record<StudioNodeType, NodeDefinition['kind']> = {
  text: 'Text',
  image: 'Image',
  imageEdit: 'ImageEdit',
  video: 'Video',
  audio: 'Audio',
};

const DEFAULT_LABELS: Record<StudioNodeType, string> = {
  text: 'Text',
  image: 'Image',
  imageEdit: 'Image Edit',
  video: 'Video',
  audio: 'Audio',
};

function getCompatibleWorkflowModel(kind: 'Text' | 'Image' | 'Video', requestedModel?: string) {
  if (requestedModel) {
    const requested = getModelById(requestedModel);
    const matchesKind =
      (kind === 'Text' && requested?.mediaType === 'text') ||
      (kind === 'Image' && requested?.mediaType === 'image') ||
      (kind === 'Video' && requested?.mediaType === 'video');

    if (requested && matchesKind && requested.uiGroup === 'generation') {
      return requested.id;
    }
  }

  return getDefaultModelForNodeKind(kind);
}

function normalizePortHandle(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function findPortByHandle(ports: Port[], handle?: string | null): Port | null {
  const normalized = normalizePortHandle(handle);
  if (!normalized) return null;
  return (
    ports.find((port) => normalizePortHandle(port.id) === normalized) ??
    ports.find((port) => normalizePortHandle(port.name) === normalized) ??
    ports.find((port) => normalizePortHandle(port.paramKey) === normalized) ??
    null
  );
}

function normalizeBlueprintRef(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function resolveBlueprintNodeReference(
  ref: WorkflowBlueprintNodeRef,
  intents: WorkflowBlueprintNodeIntent[],
  nodes: NodeDefinition[]
): NodeDefinition | null {
  if (typeof ref === 'number' && Number.isInteger(ref)) {
    return nodes[ref] ?? null;
  }

  const normalizedRef = normalizeBlueprintRef(ref);
  if (!normalizedRef) {
    return null;
  }

  const numericIndex = Number(normalizedRef);
  if (Number.isInteger(numericIndex) && String(numericIndex) === normalizedRef) {
    return nodes[numericIndex] ?? null;
  }

  const matchingIntentIndex = intents.findIndex((intent) =>
    [intent.id, intent.name, intent.label].some(
      (candidate) => normalizeBlueprintRef(candidate) === normalizedRef
    )
  );

  if (matchingIntentIndex >= 0) {
    return nodes[matchingIntentIndex] ?? null;
  }

  return nodes.find((node) =>
    [node.id, node.label].some((candidate) => normalizeBlueprintRef(candidate) === normalizedRef)
  ) ?? null;
}

function getPreferredTargetPort(
  node: NodeDefinition,
  sourceType: DataType,
  edgeDefinitions: EdgeDefinition[],
  preferredHandle?: string | null
): Port | null {
  const inputPorts = node.inputs ?? [];
  if (inputPorts.length === 0) {
    return null;
  }

  const availablePorts = inputPorts.filter((port) => {
    if (port.cardinality !== '1') {
      return true;
    }

    return !edgeDefinitions.some(
      (edge) => edge.target.nodeId === node.id && edge.target.portId === port.id
    );
  });

  const preferredPortNames: Record<DataType, string[]> = {
    text: ['prompt', 'input', 'context'],
    image: ['reference', 'image', 'context', 'input'],
    video: ['video', 'context', 'input'],
    audio: ['audio', 'context', 'input'],
    json: ['context', 'input'],
    tensor: ['context', 'input'],
    '3d': ['model', 'context', 'input'],
    string: ['input', 'context'],
    number: ['input', 'context'],
    boolean: ['input', 'context'],
    any: ['input', 'context'],
  };

  const compatibleAvailablePorts = availablePorts.filter((port) =>
    isTypeCompatible(sourceType, port.datatype)
  );
  const compatibleInputPorts = inputPorts.filter((port) =>
    isTypeCompatible(sourceType, port.datatype)
  );
  const candidates =
    compatibleAvailablePorts.length > 0
      ? compatibleAvailablePorts
      : compatibleInputPorts.length > 0
        ? compatibleInputPorts
        : availablePorts.length > 0
          ? availablePorts
          : inputPorts;
  const namePreferences = preferredPortNames[sourceType] ?? preferredPortNames.any;
  const requestedPort = findPortByHandle(candidates, preferredHandle) ?? findPortByHandle(inputPorts, preferredHandle);
  if (requestedPort && candidates.some((port) => port.id === requestedPort.id)) {
    return requestedPort;
  }

  for (const preferredName of namePreferences) {
    const normalizedPreferredName = normalizePortHandle(preferredName);
    const match = candidates.find((port) =>
      [port.name, port.id, port.paramKey].some((value) => normalizePortHandle(value) === normalizedPreferredName)
    );
    if (match) {
      return match;
    }
  }

  return candidates[0] ?? null;
}

function buildPreviewFromParams(type: StudioNodeType, params: Record<string, unknown>): ArtifactRef | undefined {
  if (type === 'text') {
    const text = params.content ?? params.prompt ?? params.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return {
        id: uuidv4(),
        type: 'text',
        data: { text },
      };
    }
    return undefined;
  }

  if (type === 'image' || type === 'imageEdit') {
    const imageUrl =
      (typeof params.previewAssetUrl === 'string' && params.previewAssetUrl) ||
      (typeof params.outputAssetUrl === 'string' && params.outputAssetUrl) ||
      (typeof params.imageUrl === 'string' && params.imageUrl) ||
      undefined;

    if (imageUrl) {
      return {
        id: uuidv4(),
        type: 'image',
        url: imageUrl,
        data: { url: imageUrl },
      };
    }
  }

  if (type === 'video') {
    const videoUrl = typeof params.videoUrl === 'string' ? params.videoUrl : undefined;
    if (videoUrl) {
      return {
        id: uuidv4(),
        type: 'video',
        url: videoUrl,
        data: { url: videoUrl },
      };
    }
  }

  return undefined;
}

function buildPreviewFromCanonicalKind(
  kind: CanonicalNodeKind,
  params: Record<string, unknown>
): ArtifactRef | undefined {
  if (kind === 'Text' || kind === 'Prompt') {
    return buildPreviewFromParams('text', params);
  }

  if (kind === 'Image' || kind === 'ImageEdit') {
    return buildPreviewFromParams(kind === 'ImageEdit' ? 'imageEdit' : 'image', params);
  }

  if (kind === 'Video') {
    return buildPreviewFromParams('video', params);
  }

  return undefined;
}

function toPortDefinition(
  port: MediaActionDefinition['inputs'][number],
  fallbackPosition: Port['position']
): Port {
  return {
    id: port.id,
    name: port.name,
    datatype: port.datatype as DataType,
    cardinality: port.cardinality,
    optional: port.optional,
    position: port.position ?? fallbackPosition,
    paramKey: port.paramKey,
  };
}

function buildActionPorts(action: MediaActionDefinition): { inputs: Port[]; outputs: Port[] } {
  return {
    inputs: action.inputs.map((port) => toPortDefinition(port, 'left')),
    outputs: action.outputs.map((port) => toPortDefinition(port, 'right')),
  };
}

function getWorkflowOrigin(nodes: NodeDefinition[]) {
  if (nodes.length === 0) {
    return { x: 220, y: 160 };
  }

  const rightMost = Math.max(...nodes.map((node) => node.position.x + (node.size?.w ?? 420)));
  const topMost = Math.min(...nodes.map((node) => node.position.y));

  return {
    x: rightMost + 180,
    y: Math.max(120, topMost),
  };
}

function getWorkflowPosition(
  layout: WorkflowBlueprintLayout,
  index: number,
  origin: { x: number; y: number }
) {
  const spacingX = 420;
  const spacingY = 240;

  switch (layout) {
    case 'vertical':
      return { x: origin.x, y: origin.y + index * spacingY };
    case 'tree':
      if (index === 0) {
        return { x: origin.x + spacingX * 0.65, y: origin.y };
      }

      return {
        x: origin.x + ((index - 1) % 2) * spacingX * 1.35,
        y: origin.y + Math.ceil(index / 2) * spacingY,
      };
    case 'horizontal':
    default:
      return { x: origin.x + index * spacingX, y: origin.y };
  }
}

export function useStudioGraphActions(projectId?: string) {
  const {
    nodeDefinitions,
    edgeDefinitions,
    createNode,
    addNode,
    addNodesAndEdgesAtomic,
    addEdge,
    saveGraph,
    updateNode,
    setGraphAtomic,
  } = useComputeFlowStore();

  const nodeDefinitionsById = useMemo(
    () => new Map(nodeDefinitions.map((node) => [node.id, node])),
    [nodeDefinitions]
  );

  const flushSave = useCallback(
    () => (projectId ? flushStudioSave(projectId, () => saveGraph(projectId)) : Promise.resolve()),
    [projectId, saveGraph]
  );

  const scheduleSave = useCallback(() => {
    if (!projectId) {
      return;
    }

    scheduleStudioSave(projectId, () => saveGraph(projectId));
  }, [projectId, saveGraph]);

  const buildNode = useCallback(
    (
      type: StudioNodeType,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ): NodeDefinition => {
      const kind = TYPE_TO_KIND[type];
      const baseNode = createNode(kind, position);
      const isImageEdit = type === 'imageEdit';
      const baseParams = isImageEdit
        ? (cloneImageEditParams(DEFAULT_IMAGE_EDIT_PARAMS) as unknown as Record<string, unknown>)
        : {};
      const params = {
        ...baseParams,
        ...(options?.params ?? {}),
      };

      const node: NodeDefinition = {
        ...baseNode,
        label: options?.label ?? DEFAULT_LABELS[type],
        params,
        metadata: options?.metadata ? { ...(baseNode.metadata ?? {}), ...options.metadata } : baseNode.metadata,
        size: options?.size ?? baseNode.size,
      };

      const preview = options?.preview ?? buildPreviewFromParams(type, params);
      if (preview) {
        node.preview = preview;
      }

      return node;
    },
    [createNode]
  );

  const buildCanonicalNode = useCallback(
    (
      kind: CanonicalNodeKind,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ): NodeDefinition => {
      const baseNode = createNode(kind, position);
      const isImageEdit = kind === 'ImageEdit';
      const baseParams = isImageEdit
        ? (cloneImageEditParams(DEFAULT_IMAGE_EDIT_PARAMS) as unknown as Record<string, unknown>)
        : {};
      const params = {
        ...baseParams,
        ...(options?.params ?? {}),
      };

      const node: NodeDefinition = {
        ...baseNode,
        label: options?.label ?? kind,
        params,
        metadata: options?.metadata ? { ...(baseNode.metadata ?? {}), ...options.metadata } : baseNode.metadata,
        size: options?.size ?? baseNode.size,
      };

      const preview = options?.preview ?? buildPreviewFromCanonicalKind(kind, params);
      if (preview) {
        node.preview = preview;
      }

      return node;
    },
    [createNode]
  );

  const addNodeOfType = useCallback(
    (
      type: StudioNodeType,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ): NodeDefinition => {
      const node = buildNode(type, position, options);
      addNode(node);
      scheduleSave();
      return node;
    },
    [addNode, buildNode, scheduleSave]
  );

  const buildActionNode = useCallback(
    (
      actionId: string,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ): NodeDefinition | null => {
      const action = getMediaActionById(actionId);
      if (!action) {
        return null;
      }

      const baseNode = createNode(action.nodeKind as CanonicalNodeKind, position);
      const ports = buildActionPorts(action);
      const params = {
        ...getActionDefaults(action),
        ...(options?.params ?? {}),
      };
      const node: NodeDefinition = {
        ...baseNode,
        actionId: action.actionId,
        mediaType: action.mediaType,
        workflowType: action.workflowType,
        executor: action.executor,
        controls: action.controls,
        batch: { policy: action.batchPolicy },
        label: options?.label ?? action.label,
        inputs: ports.inputs,
        outputs: ports.outputs,
        params,
        metadata: {
          ...(baseNode.metadata ?? {}),
          ...(options?.metadata ?? {}),
          actionId: action.actionId,
          mediaActionLabel: action.label,
          mediaType: action.mediaType,
          workflowType: action.workflowType,
          batchPolicy: action.batchPolicy,
          executor: action.executor,
        },
        size: options?.size ?? baseNode.size,
      };

      const preview =
        options?.preview ?? buildPreviewFromCanonicalKind(action.nodeKind as CanonicalNodeKind, params);
      if (preview) {
        node.preview = preview;
      }
      return node;
    },
    [createNode]
  );

  const addActionNode = useCallback(
    (
      actionId: string,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ): NodeDefinition | null => {
      const node = buildActionNode(actionId, position, options);
      if (!node) {
        toast.error('Unknown action');
        return null;
      }
      addNode(node);
      scheduleSave();
      return node;
    },
    [addNode, buildActionNode, scheduleSave]
  );

  const materializeWorkflowBlueprint = useCallback(
    (blueprint: WorkflowBlueprint): MaterializedWorkflow => {
      const layout = blueprint.layout ?? 'horizontal';
      const origin = getWorkflowOrigin(nodeDefinitions);

      const nodes = blueprint.nodes
        .map((intent, index) => {
          const kind = normalizeNodeKind(intent.kind);
          if (!kind) {
            return null;
          }

          const metadata = {
            generatedByWorkflow: true,
            generatedByWzrdAgent: Boolean(intent.actionId || blueprint.provider === 'codex'),
            executionPolicy: intent.executionPolicy ?? 'manual',
            ...(intent.metadata ?? {}),
          };
          const model =
            kind === 'Text' || kind === 'Image' || kind === 'Video'
              ? getCompatibleWorkflowModel(kind, intent.modelId ?? intent.model)
              : getDefaultModelForNodeKind(kind);
          const params: Record<string, unknown> = {
            ...(intent.controls ?? {}),
            ...(intent.params ?? {}),
          };

          if (intent.actionId) {
            const actionNode = buildActionNode(intent.actionId, getWorkflowPosition(layout, index, origin), {
              label: intent.label,
              params: {
                ...params,
                ...(typeof intent.prompt === 'string' ? { prompt: intent.prompt } : {}),
              },
              metadata,
            });
            if (!actionNode) {
              return null;
            }
            return {
              ...actionNode,
              assetRefs: intent.assetRefs?.map((assetRef) => ({
                id: assetRef.id,
                type: assetRef.type,
                url: assetRef.url,
                data: {
                  name: assetRef.name,
                  durationMs: assetRef.durationMs,
                  trimStartMs: assetRef.trimStartMs,
                  trimEndMs: assetRef.trimEndMs,
                  role: assetRef.role,
                },
                metadata: assetRef.metadata,
              })),
            } satisfies NodeDefinition;
          }

          if (kind !== 'comment') {
            params.model = typeof params.model === 'string' ? params.model : model;
            params.selectedModels = Array.isArray(params.selectedModels)
              ? params.selectedModels
              : [params.model];
            params.useMultipleModels = Boolean(params.useMultipleModels);
            params.modelAuto = Boolean(params.modelAuto);
          }

          if (typeof intent.prompt === 'string') {
            params.prompt = intent.prompt;
            if (kind === 'Text' || kind === 'Prompt') {
              params.content = intent.prompt;
            }
          }

          return buildCanonicalNode(kind, getWorkflowPosition(layout, index, origin), {
            label: intent.label,
            params,
            metadata,
          });
        })
        .filter(Boolean) as NodeDefinition[];

      const edges: EdgeDefinition[] = [];
      const droppedEdges: string[] = [];

      blueprint.edges.forEach((intent, edgeIndex) => {
        const sourceNode = resolveBlueprintNodeReference(intent.from, blueprint.nodes, nodes);
        const targetNode = resolveBlueprintNodeReference(intent.to, blueprint.nodes, nodes);

        if (!sourceNode || !targetNode) {
          droppedEdges.push(`Edge ${edgeIndex + 1} references a missing node.`);
          return;
        }

        const sourcePort =
          findPortByHandle(sourceNode.outputs, intent.sourceHandle) ?? sourceNode.outputs[0];
        const targetPort = getPreferredTargetPort(
          targetNode,
          sourcePort?.datatype ?? 'text',
          edges,
          intent.targetHandle
        );

        if (!sourcePort || !targetPort) {
          droppedEdges.push(`Edge ${edgeIndex + 1} could not resolve compatible ports.`);
          return;
        }

        const validation = validateConnection({
          sourceNode,
          sourcePort,
          targetNode,
          targetPort,
          existingEdges: edges,
        });

        if (!validation.valid) {
          droppedEdges.push(validation.error ?? `Edge ${edgeIndex + 1} failed validation.`);
          return;
        }

        edges.push({
          id: uuidv4(),
          source: { nodeId: sourceNode.id, portId: sourcePort.id, handle: sourcePort.name },
          target: { nodeId: targetNode.id, portId: targetPort.id, handle: targetPort.name },
          dataType: sourcePort.datatype,
          status: 'idle',
        });
      });

      // Auto-connect isolated nodes in a chain if blueprint had no valid edges
      if (nodes.length > 1 && edges.length === 0) {
        for (let i = 0; i < nodes.length - 1; i++) {
          const sourceNode = nodes[i];
          const targetNode = nodes[i + 1];
          const sourcePort = sourceNode.outputs[0];
          const targetPort = getPreferredTargetPort(
            targetNode,
            sourcePort?.datatype ?? 'text',
            edges
          );

          if (!sourcePort || !targetPort) {
            continue;
          }

          const validation = validateConnection({
            sourceNode,
            sourcePort,
            targetNode,
            targetPort,
            existingEdges: edges,
          });

          if (validation.valid) {
            edges.push({
              id: uuidv4(),
              source: { nodeId: sourceNode.id, portId: sourcePort.id, handle: sourcePort.name },
              target: { nodeId: targetNode.id, portId: targetPort.id, handle: targetPort.name },
              dataType: sourcePort.datatype,
              status: 'idle',
            });
          }
        }
      }

      if (droppedEdges.length > 0) {
        console.warn('WZRD blueprint dropped edges', droppedEdges);
        toast.warning(
          edges.length > 0
            ? `Created workflow with ${droppedEdges.length} repaired/skipped connection${droppedEdges.length === 1 ? '' : 's'}.`
            : 'WZRD returned connections that needed repair; auto-connected the generated nodes instead.'
        );
      }

      return { nodes, edges };
    },
    [buildActionNode, buildCanonicalNode, nodeDefinitions]
  );

  const connectNodes = useCallback(
    (
      sourceNodeId: string,
      sourcePortId: string,
      targetNodeId: string,
      targetPortId: string
    ) => {
      const sourceNode = nodeDefinitionsById.get(sourceNodeId);
      const targetNode = nodeDefinitionsById.get(targetNodeId);

      if (!sourceNode || !targetNode) {
        toast.error('Unable to connect nodes');
        return false;
      }

      const resolvedSourcePort = sourceNode.outputs.find((port) => port.id === sourcePortId);
      if (!resolvedSourcePort) {
        toast.error('Source node has no matching output port');
        return false;
      }

      const resolvedTargetPort = targetNode.inputs.find((port) => port.id === targetPortId);

      if (!resolvedTargetPort) {
        toast.error('Target node has no matching input port');
        return false;
      }

      const validation = validateConnection({
        sourceNode,
        sourcePort: resolvedSourcePort,
        targetNode,
        targetPort: resolvedTargetPort,
        existingEdges: edgeDefinitions,
      });

      if (!validation.valid) {
        toast.error(validation.error ?? 'Invalid connection');
        return false;
      }

      const result = addEdge({
        id: uuidv4(),
        source: { nodeId: sourceNodeId, portId: resolvedSourcePort.id, handle: resolvedSourcePort.name },
        target: { nodeId: targetNodeId, portId: resolvedTargetPort.id, handle: resolvedTargetPort.name },
        dataType: resolvedSourcePort.datatype,
        status: 'idle',
      });

      if (!result.valid) {
        toast.error(result.error ?? 'Invalid connection');
        return false;
      }

      // PR-3: write the bound param immediately so UI chip and runtime input agree.
      const delta = applyOnConnect({
        sourceNode,
        targetNode,
        sourcePort: resolvedSourcePort,
        targetPort: resolvedTargetPort,
        edgeDataType: resolvedSourcePort.datatype,
      });
      if (Object.keys(delta).length > 0) {
        updateNode(targetNodeId, {
          params: { ...targetNode.params, ...delta },
        });
      }

      scheduleSave();
      return true;
    },
    [addEdge, edgeDefinitions, nodeDefinitionsById, scheduleSave, updateNode]
  );

  const createConnectedNode = useCallback(
    (
      sourceNodeId: string,
      sourcePortId: string,
      type: StudioNodeType,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ) => {
      const sourceNode = nodeDefinitionsById.get(sourceNodeId);
      const sourcePort = sourceNode?.outputs.find((port) => port.id === sourcePortId);

      if (!sourceNode || !sourcePort) {
        toast.error('Unable to create connected node');
        return null;
      }

      const node = buildNode(type, position, options);
      const targetPort = getPreferredTargetPort(node, sourcePort.datatype, edgeDefinitions);

      if (!targetPort) {
        toast.error('New node has no compatible input port');
        return null;
      }

      const validation = validateConnection({
        sourceNode,
        sourcePort,
        targetNode: node,
        targetPort,
        existingEdges: edgeDefinitions,
      });

      if (!validation.valid) {
        toast.error(validation.error ?? 'Invalid connection');
        return null;
      }

      // PR-3: seed bound param into the new node before the atomic add.
      const delta = applyOnConnect({
        sourceNode,
        targetNode: node,
        sourcePort,
        targetPort,
        edgeDataType: sourcePort.datatype,
      });
      const seededNode =
        Object.keys(delta).length > 0
          ? { ...node, params: { ...node.params, ...delta } }
          : node;

      addNodesAndEdgesAtomic(
        [seededNode],
        [
          {
            id: uuidv4(),
            source: { nodeId: sourceNodeId, portId: sourcePort.id, handle: sourcePort.name },
            target: { nodeId: seededNode.id, portId: targetPort.id, handle: targetPort.name },
            dataType: sourcePort.datatype,
            status: 'idle',
          },
        ],
        `Connected ${sourceNode.label} to ${seededNode.label}`
      );
      scheduleSave();
      return seededNode;
    },
    [addNodesAndEdgesAtomic, buildNode, edgeDefinitions, nodeDefinitionsById, scheduleSave]
  );

  const createConnectedActionNode = useCallback(
    (
      sourceNodeId: string,
      sourcePortId: string,
      actionId: string,
      position: { x: number; y: number },
      options?: StudioNodeSeedOptions
    ) => {
      const sourceNode = nodeDefinitionsById.get(sourceNodeId);
      const sourcePort = sourceNode?.outputs.find((port) => port.id === sourcePortId);

      if (!sourceNode || !sourcePort) {
        toast.error('Unable to create connected action');
        return null;
      }

      const node = buildActionNode(actionId, position, options);
      if (!node) {
        toast.error('Unknown action');
        return null;
      }

      const targetPort = getPreferredTargetPort(node, sourcePort.datatype, edgeDefinitions);
      if (!targetPort) {
        toast.error('Action has no compatible input port');
        return null;
      }

      const validation = validateConnection({
        sourceNode,
        sourcePort,
        targetNode: node,
        targetPort,
        existingEdges: edgeDefinitions,
      });

      if (!validation.valid) {
        toast.error(validation.error ?? 'Invalid connection');
        return null;
      }

      const delta = applyOnConnect({
        sourceNode,
        targetNode: node,
        sourcePort,
        targetPort,
        edgeDataType: sourcePort.datatype,
      });
      const seededNode =
        Object.keys(delta).length > 0
          ? { ...node, params: { ...node.params, ...delta } }
          : node;

      addNodesAndEdgesAtomic(
        [seededNode],
        [
          {
            id: uuidv4(),
            source: { nodeId: sourceNodeId, portId: sourcePort.id, handle: sourcePort.name },
            target: { nodeId: seededNode.id, portId: targetPort.id, handle: targetPort.name },
            dataType: sourcePort.datatype,
            status: 'idle',
          },
        ],
        `Connected ${sourceNode.label} to ${seededNode.label}`
      );
      scheduleSave();
      return seededNode;
    },
    [addNodesAndEdgesAtomic, buildActionNode, edgeDefinitions, nodeDefinitionsById, scheduleSave]
  );

  const insertActionOnEdge = useCallback(
    (edgeId: string, actionId: string, position: { x: number; y: number }) => {
      const state = useComputeFlowStore.getState();
      const edge = state.edgeDefinitions.find((candidate) => candidate.id === edgeId);
      if (!edge) {
        toast.error('Edge no longer exists');
        return null;
      }

      const sourceNode = state.nodeDefinitions.find((node) => node.id === edge.source.nodeId);
      const targetNode = state.nodeDefinitions.find((node) => node.id === edge.target.nodeId);
      const sourcePort = sourceNode?.outputs.find((port) => port.id === edge.source.portId);
      const targetPort = targetNode?.inputs.find((port) => port.id === edge.target.portId);

      if (!sourceNode || !targetNode || !sourcePort || !targetPort) {
        toast.error('Unable to insert action on this edge');
        return null;
      }

      const actionNode = buildActionNode(actionId, position);
      if (!actionNode) {
        toast.error('Unknown action');
        return null;
      }

      const actionInput = getPreferredTargetPort(
        actionNode,
        sourcePort.datatype,
        state.edgeDefinitions.filter((candidate) => candidate.id !== edgeId)
      );
      const actionOutput =
        actionNode.outputs.find((port) => isTypeCompatible(port.datatype, targetPort.datatype)) ??
        actionNode.outputs[0];

      if (!actionInput || !actionOutput) {
        toast.error('Action cannot be inserted between these port types');
        return null;
      }

      const existingWithoutEdge = state.edgeDefinitions.filter((candidate) => candidate.id !== edgeId);
      const firstValidation = validateConnection({
        sourceNode,
        sourcePort,
        targetNode: actionNode,
        targetPort: actionInput,
        existingEdges: existingWithoutEdge,
      });
      const secondValidation = validateConnection({
        sourceNode: actionNode,
        sourcePort: actionOutput,
        targetNode,
        targetPort,
        existingEdges: existingWithoutEdge,
      });

      if (!firstValidation.valid || !secondValidation.valid) {
        toast.error(firstValidation.error ?? secondValidation.error ?? 'Invalid insertion');
        return null;
      }

      const firstDelta = applyOnConnect({
        sourceNode,
        targetNode: actionNode,
        sourcePort,
        targetPort: actionInput,
        edgeDataType: sourcePort.datatype,
      });
      const seededActionNode =
        Object.keys(firstDelta).length > 0
          ? { ...actionNode, params: { ...actionNode.params, ...firstDelta } }
          : actionNode;

      const nextEdges: EdgeDefinition[] = [
        ...existingWithoutEdge,
        {
          id: uuidv4(),
          source: { nodeId: sourceNode.id, portId: sourcePort.id, handle: sourcePort.name },
          target: { nodeId: seededActionNode.id, portId: actionInput.id, handle: actionInput.name },
          dataType: sourcePort.datatype,
          status: 'idle',
          metadata: { insertedFromEdgeId: edge.id },
        },
        {
          id: uuidv4(),
          source: { nodeId: seededActionNode.id, portId: actionOutput.id, handle: actionOutput.name },
          target: { nodeId: targetNode.id, portId: targetPort.id, handle: targetPort.name },
          dataType: actionOutput.datatype,
          status: 'idle',
          metadata: { insertedFromEdgeId: edge.id },
        },
      ];

      setGraphAtomic([...state.nodeDefinitions, seededActionNode], nextEdges);
      scheduleSave();
      return seededActionNode;
    },
    [buildActionNode, scheduleSave, setGraphAtomic]
  );

  return {
    buildNode,
    buildCanonicalNode,
    buildActionNode,
    addNodeOfType,
    addActionNode,
    materializeWorkflowBlueprint,
    connectNodes,
    createConnectedNode,
    createConnectedActionNode,
    insertActionOnEdge,
    scheduleSave,
    flushSave,
  };
}

export default useStudioGraphActions;
