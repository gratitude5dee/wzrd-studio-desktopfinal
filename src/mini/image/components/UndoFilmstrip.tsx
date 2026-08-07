import { useEffect } from 'react';

import type { ImageSnapshot } from '../state/useImageEditor';

/** How many prior states the filmstrip shows (§5.3). */
export const FILMSTRIP_LENGTH = 8;

interface UndoFilmstripProps {
  open: boolean;
  /** Oldest-first, as stored in `history.past`. */
  past: ImageSnapshot[];
  current: ImageSnapshot | null;
  onJumpTo: (pastIndex: number) => void;
  onClose: () => void;
}

/**
 * Long-press `↺` filmstrip (§5.3) — the last eight states as thumbnails. This
 * is the closest thing to layers the app ships, and it is enough.
 */
export function UndoFilmstrip({ open, past, current, onJumpTo, onClose }: UndoFilmstripProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  const start = Math.max(0, past.length - FILMSTRIP_LENGTH);
  const shown = past.slice(start);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close history"
        onClick={onClose}
        className="flex-1 bg-wzrd-abyss/70"
      />
      <div
        role="dialog"
        aria-label="History"
        className="border-t border-wzrd-hairline bg-wzrd-ink px-4 pb-6 pt-3"
      >
        <p className="mb-2 text-[13px] text-wzrd-chrome">History</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((snapshot, index) => (
            <Frame
              key={snapshot.url}
              snapshot={snapshot}
              label={`${shown.length - index} back`}
              onClick={() => {
                onJumpTo(start + index);
                onClose();
              }}
            />
          ))}
          {current && <Frame snapshot={current} label="Now" active />}
        </div>
      </div>
    </div>
  );
}

function Frame({
  snapshot,
  label,
  active,
  onClick,
}: {
  snapshot: ImageSnapshot;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={active}
      onClick={onClick}
      className={
        active
          ? 'shrink-0 rounded-lg border border-wzrd-blue p-1'
          : 'shrink-0 rounded-lg border border-wzrd-hairline p-1 hover:border-wzrd-chrome'
      }
    >
      <img
        src={snapshot.url}
        alt=""
        className="h-16 w-16 rounded object-cover"
        draggable={false}
      />
      <span className="mt-1 block font-mono text-[10px] text-wzrd-muted-text">{label}</span>
    </button>
  );
}
