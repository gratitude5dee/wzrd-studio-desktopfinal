import { useEffect } from 'react';

import { controlsForGroup, INTENT_GROUPS, type ControlGroup } from '../app-schema';
import { ControlRenderer, type ControlHandlers } from './ControlRenderer';

interface ControlSheetProps extends ControlHandlers {
  open: boolean;
  activeGroup: ControlGroup;
  onGroupChange: (group: ControlGroup) => void;
  onClose: () => void;
}

/** Mobile bottom sheet — the same schema the rail renders (§5.1). */
export function ControlSheet({
  open,
  activeGroup,
  onGroupChange,
  onClose,
  ...handlers
}: ControlSheetProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
      <button
        type="button"
        aria-label="Close controls"
        onClick={onClose}
        className="flex-1 bg-wzrd-abyss/70"
      />
      <div
        role="dialog"
        aria-label="Controls"
        className="rounded-t-2xl border-t border-wzrd-hairline bg-wzrd-ink px-4 pb-6 pt-3"
        style={{ animation: 'var(--wzrd-duration-base) var(--wzrd-ease-decelerate) both' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-wzrd-steel" />
        <div className="mb-3 flex gap-1">
          {INTENT_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => onGroupChange(group.id)}
              className={
                activeGroup === group.id
                  ? 'h-9 rounded-full bg-wzrd-deep px-3 text-[13px] text-wzrd-mist'
                  : 'h-9 rounded-full px-3 text-[13px] text-wzrd-chrome'
              }
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {controlsForGroup(activeGroup, 'sheet').map((control) => (
            <ControlRenderer key={control.id} control={control} layout="sheet" {...handlers} />
          ))}
        </div>
      </div>
    </div>
  );
}
