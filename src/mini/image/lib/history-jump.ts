import type { HistoryState } from '@/qcut/editor-core/commands/history';

/**
 * Jump straight to a state in `past`, exactly as if the user had pressed ↺
 * until they got there: everything skipped lands on the redo stack in the same
 * order repeated undos would have left it, so ↻ walks back the way it came.
 * Backs the long-press undo filmstrip (§5.3).
 */
export function jumpToPast<T>(
  history: HistoryState<T>,
  current: T,
  pastIndex: number
): { history: HistoryState<T>; restoredState: T } | null {
  if (pastIndex < 0 || pastIndex >= history.past.length) return null;
  const skipped = history.past.slice(pastIndex + 1).reverse();
  return {
    history: {
      past: history.past.slice(0, pastIndex),
      future: [...history.future, current, ...skipped],
    },
    restoredState: history.past[pastIndex],
  };
}
