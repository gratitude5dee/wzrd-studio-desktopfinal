/**
 * useNodePositionSync Hook
 *
 * Handles compute-flow node position synchronization between React Flow and the store
 * without creating bidirectional update loops.
 */

import { useCallback, useRef } from 'react';
import type { Node } from '@xyflow/react';
import { useComputeFlowStore } from '@/store/computeFlowStore';

// Define NodeDragHandler type locally since it's not exported from @xyflow/react
type NodeDragHandler = (event: React.MouseEvent, node: Node, nodes: Node[]) => void;

interface Position {
  x: number;
  y: number;
}

interface UseNodePositionSyncOptions {
  useComputeFlow: boolean;
  onUpdateBlockPosition?: (id: string, position: Position) => void;
  scheduleSave?: () => void;
  /** @deprecated Position saves use the shared Studio save debounce. */
  saveDebounceMs?: number;
  /** @deprecated The shared Studio save coordinator owns the project id. */
  projectId?: string;
}

interface NodePositionSyncResult {
  /** Handler for node drag end - triggers position save */
  onNodeDragStop: NodeDragHandler;
  /** Handler for node drag start */
  onNodeDragStart: NodeDragHandler;
  /** Filter function for node changes - returns filtered changes */
  filterNodeChanges: (changes: any[]) => any[];
  /** Whether a save is pending */
  isSavePending: boolean;
}

export function useNodePositionSync({
  useComputeFlow,
  onUpdateBlockPosition,
  scheduleSave,
}: UseNodePositionSyncOptions): NodePositionSyncResult {
  const { updateNodeSilent, setDragging } = useComputeFlowStore();

  // Track pending save state
  const savePendingRef = useRef(false);

  // Track which nodes have been dragged (to batch saves)
  const draggedNodesRef = useRef<Set<string>>(new Set());

  /**
   * Detect whether a node is a compute-flow node.
   * We prefer a data marker (node.data.nodeDefinition) to avoid relying on node type.
   */
  const isComputeNodeInstance = useCallback(
    (node: Node): boolean => {
      if (!useComputeFlow) return false;

      const maybeData = (node as any)?.data as any;
      if (maybeData?.nodeDefinition) return true;

      // Fallback: check store membership (handles cases where node.data isn't hydrated yet)
      return useComputeFlowStore.getState().nodeDefinitions.some((n) => n.id === node.id);
    },
    [useComputeFlow]
  );

  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, node, nodes) => {
      const draggedNodes = nodes?.length ? nodes : [node];
      const hasComputeNodes = draggedNodes.some(isComputeNodeInstance);

      if (hasComputeNodes) {
        setDragging(false);
      }

      draggedNodes.forEach((draggedNode) => {
        const position = { x: draggedNode.position.x, y: draggedNode.position.y };

        if (isComputeNodeInstance(draggedNode)) {
          updateNodeSilent(draggedNode.id, { position });
          draggedNodesRef.current.add(draggedNode.id);
          savePendingRef.current = true;
        } else if (onUpdateBlockPosition) {
          onUpdateBlockPosition(draggedNode.id, position);
        }
      });

      if (hasComputeNodes) {
        scheduleSave?.();
        savePendingRef.current = false;
        draggedNodesRef.current.clear();
      }
    },
    [isComputeNodeInstance, onUpdateBlockPosition, scheduleSave, setDragging, updateNodeSilent]
  );

  const onNodeDragStart: NodeDragHandler = useCallback(
    (_event, node, nodes) => {
      if (!useComputeFlow) return;

      const draggedNodes = nodes?.length ? nodes : [node];
      const hasComputeNodes = draggedNodes.some(isComputeNodeInstance);

      if (hasComputeNodes) {
        setDragging(true);
      }
    },
    [isComputeNodeInstance, setDragging, useComputeFlow]
  );

  /**
   * Filter node changes (position during drag, selection, etc.)
   * This is a pure function that returns filtered changes.
   */
  const filterNodeChanges = useCallback((changes: any[]): any[] => {
    // Currently we allow all changes through; position persistence happens on drag stop.
    return changes;
  }, []);

  return {
    onNodeDragStop,
    onNodeDragStart,
    filterNodeChanges,
    isSavePending: savePendingRef.current,
  };
}

export default useNodePositionSync;
