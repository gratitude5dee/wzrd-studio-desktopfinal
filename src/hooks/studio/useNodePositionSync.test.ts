import { describe, expect, it } from 'vitest';

import { filterUserNodeChanges } from './useNodePositionSync';

describe('filterUserNodeChanges', () => {
  it('keeps user-originated visual changes and drops store reconciliation changes', () => {
    const changes = [
      { id: 'node-1', type: 'position', position: { x: 10, y: 20 } },
      { id: 'node-1', type: 'select', selected: true },
      { id: 'node-1', type: 'dimensions', dimensions: { width: 400, height: 240 } },
      { item: { id: 'node-2' }, type: 'add' },
      { id: 'node-3', type: 'replace', item: { id: 'node-3' } },
      { id: 'node-4', type: 'remove' },
    ];

    expect(filterUserNodeChanges(changes)).toEqual(changes.slice(0, 3));
  });
});
