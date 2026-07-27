import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import {
  buildReactFlowNodeDataSignature,
  reconcileReactFlowEdges,
  reconcileReactFlowNodes,
  stableStringify,
} from './reactFlowReconciliation';
import type { NodeDefinition } from '@/types/computeFlow';

function node(id: string, signature: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: 'compute',
    position: { x: 10, y: 20 },
    selected: false,
    data: { __signature: signature },
    ...overrides,
  };
}

function nodeDefinition(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: 'node-1',
    kind: 'ImageEdit',
    actionId: 'image.edit',
    mediaType: 'image',
    workflowType: 'image-edit',
    version: '1.0.0',
    label: 'Edit Image',
    position: { x: 100, y: 200 },
    inputs: [
      { id: 'prompt', name: 'Prompt', datatype: 'text', cardinality: '1', position: 'left' },
      { id: 'image', name: 'Image', datatype: 'image', cardinality: 'n', position: 'left' },
    ],
    outputs: [
      { id: 'image', name: 'Image', datatype: 'image', cardinality: 'n', position: 'right' },
    ],
    params: { prompt: 'make it cinematic', aspectRatio: '16:9' },
    metadata: { clientWriteId: 'client-a', mediaActionLabel: 'Image Edit' },
    preview: { id: 'preview-1', type: 'image', url: 'https://example.com/a.png' },
    status: 'idle',
    progress: 0,
    isDirty: false,
    ...overrides,
  };
}

function edge(id: string, signature: string, overrides: Partial<Edge> = {}): Edge {
  return {
    id,
    source: 'source',
    target: 'target',
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'compute',
    data: { __signature: signature },
    ...overrides,
  };
}

describe('reactFlowReconciliation', () => {
  it('uses stable signatures independent of object key order', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it('preserves unchanged node array and object identity across unrelated ticks', () => {
    const previous = [node('a', 'same'), node('b', 'same')];
    const next = [node('a', 'same'), node('b', 'same')];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).toBe(previous);
    expect(reconciled[0]).toBe(previous[0]);
    expect(reconciled[1]).toBe(previous[1]);
  });

  it('ignores regenerated callback/data object identities when the stable signature is unchanged', () => {
    const previousCallback = () => 'previous';
    const nextCallback = () => 'next';
    const previous = [
      node('a', 'same', {
        data: { __signature: 'same', label: 'Image', onExecute: previousCallback },
      }),
    ];
    const next = [
      node('a', 'same', {
        data: { __signature: 'same', label: 'Image', onExecute: nextCallback },
      }),
    ];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).toBe(previous);
    expect(reconciled[0].data).toBe(previous[0].data);
  });

  it('replaces only the moved node when a position changes', () => {
    const previous = [node('a', 'same'), node('b', 'same')];
    const next = [
      node('a', 'same', { position: { x: 20, y: 20 } }),
      node('b', 'same'),
    ];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled[0]).not.toBe(previous[0]);
    expect(reconciled[1]).toBe(previous[1]);
  });

  it('updates node data without replacing the stable shell when only content changes', () => {
    const previous = [node('a', 'old', { data: { __signature: 'old', progress: 10 } })];
    const next = [node('a', 'new', { data: { __signature: 'new', progress: 20 } })];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled[0]).not.toBe(previous[0]);
    expect(reconciled[0]).toMatchObject({
      id: 'a',
      type: 'compute',
      position: { x: 10, y: 20 },
      selected: false,
      data: { __signature: 'new', progress: 20 },
    });
  });

  it('preserves node data identity when runtime-only fields change behind a stable signature', () => {
    const previous = [node('a', 'stable', { data: { __signature: 'stable', status: 'idle', progress: 0 } })];
    const next = [node('a', 'stable', { data: { __signature: 'stable', status: 'running', progress: 42 } })];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).toBe(previous);
    expect(reconciled[0].data).toBe(previous[0].data);
    expect(reconciled[0].data).toEqual({ __signature: 'stable', status: 'idle', progress: 0 });
  });

  it('preserves existing node object and data identity when appending new nodes', () => {
    const previous = [
      node('existing-image-edit', 'stable-image-edit', {
        data: { __signature: 'stable-image-edit', preview: 'same' },
      }),
      node('existing-video', 'stable-video', {
        data: { __signature: 'stable-video', preview: 'same' },
      }),
    ];
    const next = [
      node('existing-image-edit', 'stable-image-edit', {
        data: { __signature: 'stable-image-edit', preview: 'same' },
      }),
      node('existing-video', 'stable-video', {
        data: { __signature: 'stable-video', preview: 'same' },
      }),
      node('new-image-edit', 'new-image-edit'),
      node('new-video', 'new-video'),
    ];

    const reconciled = reconcileReactFlowNodes(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled).toHaveLength(4);
    expect(reconciled[0]).toBe(previous[0]);
    expect(reconciled[0].data).toBe(previous[0].data);
    expect(reconciled[1]).toBe(previous[1]);
    expect(reconciled[1].data).toBe(previous[1].data);
    expect(reconciled[2]).toBe(next[2]);
    expect(reconciled[3]).toBe(next[3]);
  });

  it('preserves unchanged edge identity and replaces changed edge signatures', () => {
    const previous = [edge('a', 'same'), edge('b', 'old')];
    const next = [edge('a', 'same'), edge('b', 'new')];

    const reconciled = reconcileReactFlowEdges(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled[0]).toBe(previous[0]);
    expect(reconciled[1]).not.toBe(previous[1]);
    expect(reconciled[1].data).toEqual({ __signature: 'new' });
  });

  it('omits volatile runtime fields from stable node data signatures', () => {
    const idle = buildReactFlowNodeDataSignature({
      node: nodeDefinition(),
      chips: [{ id: 'chip-1', preview: 'prompt' }],
      byHandle: { prompt: 'prompt' },
    });
    const running = buildReactFlowNodeDataSignature({
      node: nodeDefinition({
        status: 'running',
        progress: 67,
        error: 'temporary',
        isDirty: true,
        metadata: { clientWriteId: 'client-b', mediaActionLabel: 'Image Edit' },
      }),
      chips: [{ id: 'chip-1', preview: 'prompt' }],
      byHandle: { prompt: 'prompt' },
    });

    expect(running).toBe(idle);
  });

  it('updates stable node signatures when structural preview or params change', () => {
    const base = buildReactFlowNodeDataSignature({
      node: nodeDefinition(),
      chips: [{ id: 'chip-1', preview: 'prompt' }],
      byHandle: { prompt: 'prompt' },
    });
    const previewChanged = buildReactFlowNodeDataSignature({
      node: nodeDefinition({
        preview: { id: 'preview-2', type: 'image', url: 'https://example.com/b.png' },
      }),
      chips: [{ id: 'chip-1', preview: 'prompt' }],
      byHandle: { prompt: 'prompt' },
    });
    const paramsChanged = buildReactFlowNodeDataSignature({
      node: nodeDefinition({
        params: { prompt: 'make it noir', aspectRatio: '16:9' },
      }),
      chips: [{ id: 'chip-1', preview: 'prompt' }],
      byHandle: { prompt: 'prompt' },
    });

    expect(previewChanged).not.toBe(base);
    expect(paramsChanged).not.toBe(base);
  });
});
