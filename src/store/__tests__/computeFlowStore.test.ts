/**
 * Integration Tests for Compute Flow Store
 * 
 * Tests the complete lifecycle of compute graph operations including:
 * - Node CRUD operations
 * - Edge management
 * - Graph serialization
 * - Execution state management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { NodeDefinition, EdgeDefinition } from '@/types/computeFlow';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { revision: 1 }, error: null }),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

// Helper to create test nodes
function createTestNode(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  const id = overrides.id || `node-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    kind: 'Text',
    version: '1.0.0',
    label: 'Test Node',
    position: { x: 0, y: 0 },
    inputs: [
      { id: `${id}-input-0`, name: 'input', datatype: 'text', cardinality: '1', position: 'left' }
    ],
    outputs: [
      { id: `${id}-output-0`, name: 'output', datatype: 'text', cardinality: 'n', position: 'right' }
    ],
    params: {},
    status: 'idle',
    ...overrides,
  };
}

// Helper to create test edges
function createTestEdge(
  sourceNodeId: string,
  targetNodeId: string,
  overrides: Partial<EdgeDefinition> = {}
): EdgeDefinition {
  return {
    id: `edge-${sourceNodeId}-${targetNodeId}`,
    source: { nodeId: sourceNodeId, portId: `${sourceNodeId}-output-0` },
    target: { nodeId: targetNodeId, portId: `${targetNodeId}-input-0` },
    dataType: 'text',
    status: 'idle',
    ...overrides,
  };
}

describe('ComputeFlowStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useComputeFlowStore());
    act(() => {
      result.current.clearGraph();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete (window as typeof window & { wzrdDesktop?: unknown }).wzrdDesktop;
  });

  describe('Node Operations', () => {
    describe('createNode', () => {
      it('creates a node with valid UUID', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        let newNode: NodeDefinition;
        act(() => {
          newNode = result.current.createNode('Text', { x: 100, y: 200 });
        });
        
        // Verify UUID format
        expect(newNode!.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        
        // Verify position
        expect(newNode!.position).toEqual({ x: 100, y: 200 });
        
        // Verify kind
        expect(newNode!.kind).toBe('Text');
      });

      it('creates registry-backed semantic ports for new nodes', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        let newNode: NodeDefinition;
        act(() => {
          newNode = result.current.createNode('Image', { x: 0, y: 0 });
        });
        
        expect(newNode!.actionId).toBe('image.generate');
        expect(newNode!.inputs.map((port) => port.id)).toContain('prompt');
        expect(newNode!.outputs.map((port) => port.id)).toContain('image');
        expect(newNode!.params.model).toBe('fal-ai/nano-banana-2');
      });
    });

    describe('addNode', () => {
      it('adds node to store', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode();
        
        act(() => {
          result.current.addNode(testNode);
        });
        
        expect(result.current.nodeDefinitions).toHaveLength(1);
        expect(result.current.nodeDefinitions[0].id).toBe(testNode.id);
      });

      it('preserves existing nodes when adding', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const node1 = createTestNode({ id: 'node-1' });
        const node2 = createTestNode({ id: 'node-2' });
        
        act(() => {
          result.current.addNode(node1);
          result.current.addNode(node2);
        });
        
        expect(result.current.nodeDefinitions).toHaveLength(2);
        expect(result.current.nodeDefinitions.map(n => n.id)).toEqual(['node-1', 'node-2']);
      });
    });

    describe('updateNode', () => {
      it('updates node properties', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode({ id: 'node-1', label: 'Original' });
        
        act(() => {
          result.current.addNode(testNode);
          result.current.updateNode('node-1', { label: 'Updated' });
        });
        
        expect(result.current.nodeDefinitions[0].label).toBe('Updated');
      });

      it('preserves unmodified properties', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode({ 
          id: 'node-1', 
          label: 'Test',
          position: { x: 100, y: 200 }
        });
        
        act(() => {
          result.current.addNode(testNode);
          result.current.updateNode('node-1', { label: 'Updated' });
        });
        
        // Position should remain unchanged
        expect(result.current.nodeDefinitions[0].position).toEqual({ x: 100, y: 200 });
      });

      it('does nothing for non-existent node', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode({ id: 'node-1' });
        
        act(() => {
          result.current.addNode(testNode);
          result.current.updateNode('non-existent', { label: 'Updated' });
        });
        
        expect(result.current.nodeDefinitions).toHaveLength(1);
        expect(result.current.nodeDefinitions[0].label).toBe('Test Node');
      });
    });

    describe('removeNode', () => {
      it('removes node from store', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode({ id: 'node-1' });
        
        act(() => {
          result.current.addNode(testNode);
          result.current.removeNode('node-1');
        });
        
        expect(result.current.nodeDefinitions).toHaveLength(0);
      });

      it('removes connected edges when node is removed', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const node1 = createTestNode({ id: 'node-1' });
        const node2 = createTestNode({ id: 'node-2' });
        const edge = createTestEdge('node-1', 'node-2');
        
        act(() => {
          result.current.addNode(node1);
          result.current.addNode(node2);
          const validation = result.current.addEdge(edge);
          expect(validation.valid).toBe(true);
        });
        
        expect(result.current.edgeDefinitions).toHaveLength(1);
        
        act(() => {
          result.current.removeNode('node-1');
        });
        
        // Edge should be removed since source node was removed
        expect(result.current.edgeDefinitions).toHaveLength(0);
      });
    });
  });

  describe('Edge Operations', () => {
    describe('addEdge', () => {
      it('adds edge to store', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const node1 = createTestNode({ id: 'node-1' });
        const node2 = createTestNode({ id: 'node-2' });
        const edge = createTestEdge('node-1', 'node-2');
        
        act(() => {
          result.current.addNode(node1);
          result.current.addNode(node2);
          const validation = result.current.addEdge(edge);
          expect(validation.valid).toBe(true);
        });
        
        expect(result.current.edgeDefinitions).toHaveLength(1);
        expect(result.current.edgeDefinitions[0].source.nodeId).toBe('node-1');
        expect(result.current.edgeDefinitions[0].target.nodeId).toBe('node-2');
      });
    });

    describe('removeEdge', () => {
      it('removes edge from store', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const node1 = createTestNode({ id: 'node-1' });
        const node2 = createTestNode({ id: 'node-2' });
        const edge = createTestEdge('node-1', 'node-2');
        
        act(() => {
          result.current.addNode(node1);
          result.current.addNode(node2);
          const validation = result.current.addEdge(edge);
          expect(validation.valid).toBe(true);
          result.current.removeEdge(edge.id);
        });
        
        expect(result.current.edgeDefinitions).toHaveLength(0);
      });
    });
  });

  describe('Status Operations', () => {
    describe('setNodeStatus', () => {
      it('updates node status', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode({ id: 'node-1', status: 'idle' });
        
        act(() => {
          result.current.addNode(testNode);
          result.current.setNodeStatus('node-1', 'queued', 0);
          result.current.setNodeStatus('node-1', 'running', 50);
        });
        
        expect(result.current.nodeDefinitions[0].status).toBe('running');
        expect(result.current.nodeDefinitions[0].progress).toBe(50);
      });

      it('updates preview when provided', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const testNode = createTestNode({ id: 'node-1' });
        const preview = { type: 'image', url: 'https://example.com/image.png' };
        
        act(() => {
          result.current.addNode(testNode);
          result.current.setNodeStatus('node-1', 'queued', 0);
          result.current.setNodeStatus('node-1', 'running', 50);
          result.current.setNodeStatus('node-1', 'succeeded', 100, preview);
        });
        
        expect(result.current.nodeDefinitions[0].preview).toEqual(preview);
      });
    });

    describe('resetNodeStatuses', () => {
      it('resets all nodes to idle', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const node1 = createTestNode({ id: 'node-1', status: 'succeeded' });
        const node2 = createTestNode({ id: 'node-2', status: 'failed' });
        
        act(() => {
          result.current.addNode(node1);
          result.current.addNode(node2);
          result.current.resetNodeStatuses();
        });
        
        expect(result.current.nodeDefinitions.every(n => n.status === 'idle')).toBe(true);
      });

      it('clears execution state', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        act(() => {
          // Simulate execution state
          result.current.addNode(createTestNode({ id: 'node-1' }));
        });
        
        act(() => {
          result.current.resetNodeStatuses();
        });
        
        expect(result.current.execution.isRunning).toBe(false);
        expect(result.current.execution.runId).toBeNull();
      });
    });
  });

  describe('Graph Operations', () => {
    describe('clearGraph', () => {
      it('removes all nodes and edges', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const node1 = createTestNode({ id: 'node-1' });
        const node2 = createTestNode({ id: 'node-2' });
        const edge = createTestEdge('node-1', 'node-2');
        
        act(() => {
          result.current.addNode(node1);
          result.current.addNode(node2);
          const validation = result.current.addEdge(edge);
          expect(validation.valid).toBe(true);
          result.current.clearGraph();
        });
        
        expect(result.current.nodeDefinitions).toHaveLength(0);
        expect(result.current.edgeDefinitions).toHaveLength(0);
      });

      it('resets execution state', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        act(() => {
          result.current.clearGraph();
        });
        
        expect(result.current.execution).toEqual({
          runId: null,
          projectId: null,
          isRunning: false,
          completed: 0,
          total: 0,
          completedNodeIds: new Set(),
          startedAt: null,
          error: null,
        });
      });
    });

    describe('addGeneratedWorkflow', () => {
      it('preserves existing node object identity when atomically appending populated nodes', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const existingNode = createTestNode({ id: '00000000-0000-4000-8000-000000000001' });
        const populatedNode = createTestNode({ id: '00000000-0000-4000-8000-000000000002' });

        act(() => {
          result.current.addNodeSilent(existingNode);
        });
        const existingRef = result.current.nodeDefinitions[0];

        act(() => {
          result.current.addNodesAndEdgesAtomic([populatedNode], [], 'Append populated node');
        });

        expect(result.current.nodeDefinitions.find((node) => node.id === existingNode.id)).toBe(existingRef);
      });

      it('adds nodes and edges from generated workflow', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        const nodes = [
          createTestNode({ id: 'gen-node-1' }),
          createTestNode({ id: 'gen-node-2' }),
        ];
        const edges = [
          createTestEdge('gen-node-1', 'gen-node-2'),
        ];
        
        act(() => {
          result.current.addGeneratedWorkflow(nodes, edges);
        });
        // PR-2: edges are queued; in real app StudioCanvas flushes once
        // useNodesInitialized fires. Simulate that here.
        act(() => {
          result.current.flushPendingEdges();
        });

        expect(result.current.nodeDefinitions).toHaveLength(2);
        expect(result.current.edgeDefinitions).toHaveLength(1);
      });

      it('preserves existing node identity through generated node population and pending edge flush', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const existingNode = createTestNode({ id: '00000000-0000-4000-8000-000000000011' });
        const generatedImageEdit = createTestNode({
          id: '00000000-0000-4000-8000-000000000012',
          kind: 'ImageEdit',
          label: 'Generated Image Edit',
        });
        const generatedVideo = createTestNode({
          id: '00000000-0000-4000-8000-000000000013',
          kind: 'Video',
          label: 'Generated Video',
        });
        const edge = createTestEdge(generatedImageEdit.id, generatedVideo.id, {
          id: '00000000-0000-4000-8000-000000000014',
        });
        const fitViewListener = vi.fn();
        window.addEventListener('fitViewToWorkflow', fitViewListener);

        try {
          act(() => {
            result.current.addNodeSilent(existingNode);
          });
          const existingRef = result.current.nodeDefinitions[0];

          act(() => {
            result.current.addGeneratedWorkflow([generatedImageEdit, generatedVideo], [edge]);
          });

          expect(result.current.nodeDefinitions.find((node) => node.id === existingNode.id)).toBe(existingRef);

          act(() => {
            result.current.flushPendingEdges();
          });

          expect(result.current.nodeDefinitions.find((node) => node.id === existingNode.id)).toBe(existingRef);
          expect(fitViewListener).not.toHaveBeenCalled();
        } finally {
          window.removeEventListener('fitViewToWorkflow', fitViewListener);
        }
      });

      it('only dispatches fitView for generated workflows that opt in', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const generatedImageEdit = createTestNode({
          id: '00000000-0000-4000-8000-000000000021',
          kind: 'ImageEdit',
          label: 'Generated Image Edit',
        });
        const generatedVideo = createTestNode({
          id: '00000000-0000-4000-8000-000000000022',
          kind: 'Video',
          label: 'Generated Video',
        });
        const edge = createTestEdge(generatedImageEdit.id, generatedVideo.id, {
          id: '00000000-0000-4000-8000-000000000023',
        });
        const fitViewListener = vi.fn();
        window.addEventListener('fitViewToWorkflow', fitViewListener);

        try {
          act(() => {
            result.current.addGeneratedWorkflow([generatedImageEdit, generatedVideo], [edge], {
              fitViewOnFlush: true,
            });
            result.current.flushPendingEdges();
          });

          expect(fitViewListener).toHaveBeenCalledTimes(1);
          expect((fitViewListener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
            nodeIds: [generatedImageEdit.id, generatedVideo.id],
            animate: true,
          });
        } finally {
          window.removeEventListener('fitViewToWorkflow', fitViewListener);
        }
      });

      it('resolves generated workflow edge ports by id, name, or param key before flushing', async () => {
        const { result } = renderHook(() => useComputeFlowStore());
        const source = createTestNode({
          id: '00000000-0000-4000-8000-000000000031',
          outputs: [
            { id: 'caption', name: 'Caption', datatype: 'text', cardinality: 'n', position: 'right' },
            { id: 'image-out', name: 'Image', datatype: 'image', cardinality: 'n', position: 'right' },
          ],
        });
        const target = createTestNode({
          id: '00000000-0000-4000-8000-000000000032',
          inputs: [
            { id: 'prompt', name: 'Prompt', datatype: 'text', cardinality: '1', position: 'left' },
            {
              id: 'reference',
              name: 'Reference',
              datatype: 'image',
              cardinality: '1',
              position: 'left',
              paramKey: 'referenceImageUrls',
            },
          ],
        });
        const edge = createTestEdge(source.id, target.id, {
          id: '00000000-0000-4000-8000-000000000033',
          source: { nodeId: source.id, portId: 'IMAGE', handle: 'Image' },
          target: { nodeId: target.id, portId: 'referenceimageurls', handle: 'Reference' },
          dataType: 'text',
        });

        let flushed: Promise<{ edgeIds: string[] }>;
        act(() => {
          flushed = result.current.addGeneratedWorkflow([source, target], [edge]).flushed;
        });
        act(() => {
          result.current.flushPendingEdges();
        });

        await expect(flushed!).resolves.toMatchObject({ edgeIds: [edge.id] });
        expect(result.current.edgeDefinitions[0]).toMatchObject({
          id: edge.id,
          source: { nodeId: source.id, portId: 'image-out', handle: 'Image' },
          target: { nodeId: target.id, portId: 'reference', handle: 'Reference' },
          dataType: 'image',
        });
      });

      it('normalizes legacy IDs to UUIDs', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        // Legacy node with non-UUID ID
        const legacyNode: NodeDefinition = {
          id: 'node-legacy-1234567890',
          kind: 'Text',
          version: '1.0.0',
          label: 'Legacy Node',
          position: { x: 0, y: 0 },
          inputs: [{ id: 'node-legacy-1234567890-input-0', name: 'input', datatype: 'text', cardinality: '1', position: 'left' }],
          outputs: [{ id: 'node-legacy-1234567890-output-0', name: 'output', datatype: 'text', cardinality: 'n', position: 'right' }],
          params: {},
          status: 'idle',
        };
        
        act(() => {
          result.current.addGeneratedWorkflow([legacyNode], []);
        });
        
        // ID should be normalized to UUID
        expect(result.current.nodeDefinitions[0].id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });
    });
  });

  describe('Execution State', () => {
    describe('cancelExecution', () => {
      it('sets execution to not running', () => {
        const { result } = renderHook(() => useComputeFlowStore());
        
        act(() => {
          result.current.cancelExecution();
        });
        
        expect(result.current.execution.isRunning).toBe(false);
        expect(result.current.execution.error).toBe('Cancelled');
      });
    });

    it('runs local FFmpeg Studio nodes locally in mixed graphs and posts only remote nodes to compute-execute', async () => {
      const runStudioMediaAction = vi.fn().mockResolvedValue({
        outputPath: '/tmp/wzrd-studio/video-trim.mp4',
        outputs: [
          {
            type: 'video',
            path: '/tmp/wzrd-studio/video-trim.mp4',
            name: 'video-trim.mp4',
          },
        ],
      });
      const selectExportFolder = vi.fn().mockResolvedValue('/tmp/wzrd-studio');
      const resolveMediaFileUrl = vi.fn().mockResolvedValue('wzrd-media://clip-studio/video-trim.mp4');

      (window as typeof window & { wzrdDesktop?: unknown }).wzrdDesktop = {
        isDesktop: true,
        platform: 'darwin',
        openExternal: vi.fn(),
        getDeepLink: (path: string) => `wzrd-studio://${path}`,
        selectExportFolder,
        resolveMediaFileUrl,
        runStudioMediaAction,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : ''),
        },
        json: vi.fn().mockResolvedValue({ runId: 'remote-run-1' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useComputeFlowStore());
      const localNode = createTestNode({
        id: '00000000-0000-4000-8000-000000000101',
        kind: 'Video',
        label: 'Trim locally',
        actionId: 'video.trim',
        executor: 'ffmpeg',
        params: {
          sourcePath: '/tmp/source.mp4',
          startMs: 1000,
          durationMs: 5000,
        },
      });
      const remoteNode = createTestNode({
        id: '00000000-0000-4000-8000-000000000102',
        kind: 'Image',
        label: 'Generate remotely',
        actionId: 'image.generate',
        params: {
          prompt: 'a cinematic frame',
        },
      });

      act(() => {
        result.current.addNode(localNode);
        result.current.addNode(remoteNode);
      });

      await act(async () => {
        await result.current.executeGraphStreaming('project-1');
      });

      expect(selectExportFolder).toHaveBeenCalledTimes(1);
      expect(runStudioMediaAction).toHaveBeenCalledWith(expect.objectContaining({
        actionId: 'video.trim',
        outputFolder: '/tmp/wzrd-studio',
        inputs: expect.objectContaining({
          sourcePath: '/tmp/source.mp4',
        }),
      }));
      expect(resolveMediaFileUrl).toHaveBeenCalledWith({ filePath: '/tmp/wzrd-studio/video-trim.mp4' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
        projectId: 'project-1',
        nodeIds: ['00000000-0000-4000-8000-000000000102'],
        excludedNodeIds: [],
      });
      expect(result.current.nodeDefinitions.find((node) => node.id === '00000000-0000-4000-8000-000000000101')).toMatchObject({
        status: 'succeeded',
        preview: expect.objectContaining({
          type: 'video',
          url: 'wzrd-media://clip-studio/video-trim.mp4',
        }),
        params: expect.objectContaining({
          outputPath: '/tmp/wzrd-studio/video-trim.mp4',
          localOutputPath: '/tmp/wzrd-studio/video-trim.mp4',
          localMediaUrl: 'wzrd-media://clip-studio/video-trim.mp4',
        }),
      });
    });

    it('skips unsupported local FFmpeg Studio nodes on web without failing the graph', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useComputeFlowStore());
      const localNode = createTestNode({
        id: '00000000-0000-4000-8000-000000000103',
        kind: 'Video',
        label: 'Trim locally',
        actionId: 'video.trim',
        executor: 'ffmpeg',
        params: {
          sourcePath: '/tmp/source.mp4',
          startMs: 1000,
          durationMs: 5000,
        },
      });

      act(() => {
        result.current.addNode(localNode);
      });

      await act(async () => {
        await result.current.executeGraphStreaming('project-1');
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.execution).toMatchObject({
        isRunning: false,
        error: null,
      });
      expect(result.current.nodeDefinitions.find((node) => node.id === localNode.id)).toMatchObject({
        status: 'skipped',
        progress: 100,
      });
    });
  });

  describe('PR-1: out-of-order status transitions', () => {
    it('does not throw and keeps terminal status when SSE delivers running → succeeded → running', () => {
      const { result } = renderHook(() => useComputeFlowStore());
      const node = createTestNode({ id: 'sse-node-1', status: 'queued' });

      act(() => {
        result.current.addNode(node);
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        act(() => {
          result.current.setNodeStatus('sse-node-1', 'running');
          result.current.setNodeStatus('sse-node-1', 'succeeded');
          // Out-of-order replay of an earlier event — must NOT crash, must NOT mutate.
          result.current.setNodeStatus('sse-node-1', 'running');
        });
      }).not.toThrow();

      const updated = result.current.nodeDefinitions.find(n => n.id === 'sse-node-1');
      expect(updated?.status).toBe('succeeded');
      expect(warnSpy).toHaveBeenCalledWith(
        '[computeFlowStore] rejected status transition',
        expect.objectContaining({ nodeId: 'sse-node-1', from: 'succeeded', to: 'running' }),
      );

      warnSpy.mockRestore();
    });
  });
});
