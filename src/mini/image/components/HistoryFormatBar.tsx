import { cn } from '@/lib/utils';

interface HistoryFormatBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Long-press opens the undo filmstrip; absent until that surface ships. */
  onLongPressUndo?: () => void;
  format: string | null;
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
  format,
}: HistoryFormatBarProps) {
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-t border-wzrd-hairline px-4">
      <div className="flex items-center gap-1">
        <HistoryButton
          label="Undo"
          glyph="↺"
          disabled={!canUndo}
          onClick={onUndo}
          onPointerDown={() => {
            if (onLongPressUndo) longPressTimer = setTimeout(onLongPressUndo, 500);
          }}
          onPointerUp={() => clearTimeout(longPressTimer)}
          onPointerLeave={() => clearTimeout(longPressTimer)}
        />
        <HistoryButton label="Redo" glyph="↻" disabled={!canRedo} onClick={onRedo} />
      </div>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-wzrd-muted-text">
        {format ?? '—'}
      </span>
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
        'flex h-8 w-8 items-center justify-center rounded-full text-[15px] transition-colors duration-wzrd-fast ease-wzrd-standard',
        disabled ? 'text-wzrd-steel' : 'text-wzrd-mist hover:bg-wzrd-deep'
      )}
    >
      {glyph}
    </button>
  );
}
