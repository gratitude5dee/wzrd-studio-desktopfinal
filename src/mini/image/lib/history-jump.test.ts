import { describe, expect, it } from 'vitest';

import { createHistory, undo, type HistoryState } from '@/qcut/editor-core/commands/history';

import { jumpToPast } from './history-jump';

function undoTimes(
  history: HistoryState<string>,
  current: string,
  times: number
): { history: HistoryState<string>; restoredState: string } {
  let state = { history, restoredState: current };
  for (let i = 0; i < times; i += 1) {
    const next = undo(state.history, state.restoredState);
    if (!next) break;
    state = next;
  }
  return state;
}

const HISTORY: HistoryState<string> = { past: ['a', 'b', 'c'], future: [] };

describe('jumpToPast', () => {
  it('lands on the requested state', () => {
    expect(jumpToPast(HISTORY, 'd', 0)?.restoredState).toBe('a');
    expect(jumpToPast(HISTORY, 'd', 2)?.restoredState).toBe('c');
  });

  it('is indistinguishable from pressing undo repeatedly', () => {
    for (let index = 0; index < HISTORY.past.length; index += 1) {
      const steps = HISTORY.past.length - index;
      expect(jumpToPast(HISTORY, 'd', index)).toEqual(undoTimes(HISTORY, 'd', steps));
    }
  });

  it('refuses out-of-range indices', () => {
    expect(jumpToPast(HISTORY, 'd', -1)).toBeNull();
    expect(jumpToPast(HISTORY, 'd', 3)).toBeNull();
    expect(jumpToPast(createHistory<string>(), 'd', 0)).toBeNull();
  });
});
