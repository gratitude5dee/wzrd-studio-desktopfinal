import { useRef } from 'react';

import { cn } from '@/lib/utils';

interface HistoryFormatBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Long-press `↺` opens the filmstrip of the last eight states (§5.3). */
  onLongPressUndo?: () => void;
  /** The active crop preset, shown as the format chip (§3.1). */
  formatLabel: string;
  onFormatClick: () => void;
  /** Working buffer size, in mono, as a secondary readout. */
  dimensions: string | null;
}

/**
 * History + format bar (§3.1). `↺/↻` are permanent — they stay mounted and
 * merely disable, so the bar never reflows.
 */
export function HistoryFormatBar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onLongPressUndo,
  formatLabel,
  onFormatClick,
  dimensions,
}: HistoryFormatBarProps) {
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);

  const cancelLongPress = () => clearTimeout(longPress.current);

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-t border-wzrd-hairline px-4">
      <div className="flex items-center gap-1">
        <HistoryButton
          label="Undo"
          glyph="↺"
          disabled={!canUndo}
          onClick={() => {
            if (fired.current) {
              fired.current = false;
              return;
            }
            onUndo();
          }}
          onPointerDown={() => {
            if (!onLongPressUndo) return;
            fired.current = false;
            longPress.current = setTimeout(() => {
              fired.current = true;
              onLongPressUndo();
            }, 450);
          }}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onContextMenu={(event) => event.preventDefault()}
        />
        <HistoryButton label="Redo" glyph="↻" disabled={!canRedo} onClick={onRedo} />
      </div>

      <div className="flex items-center gap-3">
        {dimensions && (
          <span className="font-mono text-[11px] tabular-nums text-wzrd-muted-text">
            {dimensions}
          </span>
        )}
        <button
          type="button"
          onClick={onFormatClick}
          className="flex h-8 items-center gap-1.5 rounded-full border border-wzrd-hairline px-3 text-[13px] text-wzrd-mist"
        >
          <span aria-hidden className="text-wzrd-chrome">
            ⬚
          </span>
          {formatLabel}
          <span aria-hidden className="text-wzrd-chrome">
            ⌄
          </span>
        </button>
      </div>
    </div>
  );
}

function HistoryButton({
  label,
  glyph,
  disabled,
  onClick,
  ...handlers
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      {...handlers}
      className={cn(
        'flex h-11 w-11 select-none items-center justify-center rounded-full text-[15px] transition-colors duration-wzrd-fast ease-wzrd-standard',
        disabled ? 'text-wzrd-steel' : 'text-wzrd-mist hover:bg-wzrd-deep'
      )}
    >
      {glyph}
    </button>
  );
}
