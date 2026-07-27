import { describe, expect, it } from 'vitest';
import type { NodeDefinition } from '@/types/computeFlow';

import {
  areStringArraysEqual,
  buildFrameNodeForSelection,
  normalizeSelectionIds,
  toggleSelectionId,
} from './selection';

function node(id: string, position: { x: number; y: number }, size?: { w: number; h: number }): NodeDefinition {
  return {
    id,
    kind: 'Image',
    version: '1.0.0',
    label: id,
    position,
    size,
    inputs: [],
    outputs: [],
    params: {},
    status: 'idle',
    progress: 0,
  };
}

describe('studio selection helpers', () => {
  it('normalizes selected ids against available nodes and keeps stable order', () => {
    expect(normalizeSelectionIds(['b', 'missing', 'a', 'b'], new Set(['a', 'b']))).toEqual(['b', 'a']);
  });

  it('toggles selection ids without reordering existing selections', () => {
    expect(toggleSelectionId(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleSelectionId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('compares ordered string arrays', () => {
    expect(areStringArraysEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(areStringArraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('builds a labeled frame around selected nodes', () => {
    const frame = buildFrameNodeForSelection('frame-1', [
      node('a', { x: 100, y: 80 }, { w: 200, h: 100 }),
      node('b', { x: 420, y: 260 }, { w: 160, h: 140 }),
    ], 'Shot Group');

    expect(frame).toMatchObject({
      id: 'frame-1',
      kind: 'comment',
      label: 'Shot Group',
      position: { x: 52, y: 8 },
      size: { w: 576, h: 432 },
      params: {
        frame: true,
        title: 'Shot Group',
        color: '#f97316',
      },
      metadata: {
        role: 'frame',
        groupedNodeIds: ['a', 'b'],
      },
    });
  });

  it('does not build a frame for a single node', () => {
    expect(buildFrameNodeForSelection('frame-1', [node('a', { x: 0, y: 0 })])).toBeNull();
  });
});
