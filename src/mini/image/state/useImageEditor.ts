import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  createHistory,
  pushState,
  redo as historyRedo,
  undo as historyUndo,
  type HistoryState,
} from '@/qcut/editor-core/commands/history';

import {
  canvasToBlob,
  crop,
  fileToCanvas,
  flip,
  loadImage,
  rotate,
  straighten,
  toCanvas,
  type Bitmap,
  type CropRect,
} from '../lib/canvas-ops';
import { jumpToPast } from '../lib/history-jump';

/** Maximum number of undo steps retained (§5.3). */
export const HISTORY_DEPTH = 20;

export interface ImageSnapshot {
  /** Object URL for rendering. Owned by the editor; revoked when evicted. */
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

async function snapshotFromCanvas(canvas: HTMLCanvasElement): Promise<ImageSnapshot> {
  const blob = await canvasToBlob(canvas, 'image/png');
  return {
    url: URL.createObjectURL(blob),
    blob,
    width: canvas.width,
    height: canvas.height,
  };
}

function trimHistory(history: HistoryState<ImageSnapshot>): HistoryState<ImageSnapshot> {
  if (history.past.length <= HISTORY_DEPTH) return history;
  const overflow = history.past.slice(0, history.past.length - HISTORY_DEPTH);
  overflow.forEach((snapshot) => URL.revokeObjectURL(snapshot.url));
  return { ...history, past: history.past.slice(-HISTORY_DEPTH) };
}

export interface ImageEditorApi {
  snapshot: ImageSnapshot | null;
  history: HistoryState<ImageSnapshot>;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  error: string | null;
  importFile: (file: File) => Promise<void>;
  importUrl: (url: string) => Promise<void>;
  applyCrop: (rect: CropRect) => Promise<void>;
  applyRotate: (quarterTurns: number) => Promise<void>;
  applyFlip: (axis: 'horizontal' | 'vertical') => Promise<void>;
  applyStraighten: (degrees: number) => Promise<void>;
  undo: () => void;
  redo: () => void;
  /** Jump straight to a state in `history.past` — backs the undo filmstrip (§5.3). */
  jumpTo: (pastIndex: number) => void;
  reset: () => void;
}

/**
 * Owns the working image and its undo stack. Operations are applied against
 * the current snapshot and pushed as new snapshots, so undo is always a
 * restore and never a recomputation (§5.3).
 */
export function useImageEditor(): ImageEditorApi {
  const [snapshot, setSnapshot] = useState<ImageSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryState<ImageSnapshot>>(() =>
    createHistory<ImageSnapshot>()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveUrls = useRef(new Set<string>());
  const track = useCallback((next: ImageSnapshot) => {
    liveUrls.current.add(next.url);
    return next;
  }, []);

  useEffect(
    () => () => {
      liveUrls.current.forEach((url) => URL.revokeObjectURL(url));
      liveUrls.current.clear();
    },
    []
  );

  const commit = useCallback(
    (next: ImageSnapshot) => {
      setHistory((current) => (snapshot ? trimHistory(pushState(current, snapshot)) : current));
      setSnapshot(track(next));
    },
    [snapshot, track]
  );

  const runOperation = useCallback(
    async (operation: (source: Bitmap) => HTMLCanvasElement) => {
      if (!snapshot) return;
      setBusy(true);
      setError(null);
      try {
        const image = await loadImage(snapshot.url);
        commit(await snapshotFromCanvas(operation(image)));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Operation failed');
      } finally {
        setBusy(false);
      }
    },
    [commit, snapshot]
  );

  const load = useCallback(
    async (produce: () => Promise<HTMLCanvasElement>) => {
      setBusy(true);
      setError(null);
      try {
        const next = await snapshotFromCanvas(await produce());
        setHistory(createHistory<ImageSnapshot>());
        setSnapshot(track(next));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open that image');
      } finally {
        setBusy(false);
      }
    },
    [track]
  );

  return {
    snapshot,
    history,
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
    busy,
    error,
    importFile: useCallback((file: File) => load(() => fileToCanvas(file)), [load]),
    importUrl: useCallback(
      (url: string) => load(async () => toCanvas(await loadImage(url))),
      [load]
    ),
    applyCrop: useCallback((rect: CropRect) => runOperation((source) => crop(source, rect)), [runOperation]),
    applyRotate: useCallback(
      (quarterTurns: number) => runOperation((source) => rotate(source, quarterTurns)),
      [runOperation]
    ),
    applyFlip: useCallback(
      (axis: 'horizontal' | 'vertical') => runOperation((source) => flip(source, axis)),
      [runOperation]
    ),
    applyStraighten: useCallback(
      (degrees: number) => runOperation((source) => straighten(source, degrees)),
      [runOperation]
    ),
    undo: useCallback(() => {
      if (!snapshot) return;
      const result = historyUndo(history, snapshot);
      if (!result) return;
      setHistory(result.history);
      setSnapshot(result.restoredState);
    }, [history, snapshot]),
    redo: useCallback(() => {
      if (!snapshot) return;
      const result = historyRedo(history, snapshot);
      if (!result) return;
      setHistory(result.history);
      setSnapshot(result.restoredState);
    }, [history, snapshot]),
    jumpTo: useCallback(
      (pastIndex: number) => {
        if (!snapshot) return;
        const result = jumpToPast(history, snapshot, pastIndex);
        if (!result) return;
        setHistory(result.history);
        setSnapshot(result.restoredState);
      },
      [history, snapshot]
    ),
    reset: useCallback(() => {
      liveUrls.current.forEach((url) => URL.revokeObjectURL(url));
      liveUrls.current.clear();
      setHistory(createHistory<ImageSnapshot>());
      setSnapshot(null);
      setError(null);
    }, []),
  };
}
