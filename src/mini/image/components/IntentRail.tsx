import { cn } from '@/lib/utils';

import { controlsForGroup, INTENT_GROUPS, type ControlGroup } from '../app-schema';
import { ControlRenderer, type ControlHandlers } from './ControlRenderer';

interface IntentRailProps extends ControlHandlers {
  activeGroup: ControlGroup;
  onGroupChange: (group: ControlGroup) => void;
  /** Mobile renders the same schema in a bottom sheet instead of the rail. */
  onOpenSheet: () => void;
  /** §5.2: reset is per-group, never global. */
  onResetGroup: (group: ControlGroup) => void;
}

/** Intent rail (§3.1): Reframe / Retouch / Style plus the active group's controls. */
export function IntentRail({
  activeGroup,
  onGroupChange,
  onOpenSheet,
  onResetGroup,
  ...handlers
}: IntentRailProps) {
  const active = INTENT_GROUPS.find((group) => group.id === activeGroup);

  return (
    <div className="shrink-0 border-t border-wzrd-hairline">
      <div className="flex items-center gap-1 overflow-x-auto px-4 pt-2">
        {INTENT_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onGroupChange(group.id)}
            className={cn(
              'h-8 rounded-full px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
              activeGroup === group.id
                ? 'bg-wzrd-deep text-wzrd-mist'
                : 'text-wzrd-chrome hover:text-wzrd-mist',
              !group.available && 'text-wzrd-steel'
            )}
          >
            {group.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onOpenSheet}
          className="ml-auto h-8 rounded-full px-3 text-[13px] text-wzrd-chrome md:hidden"
        >
          More
        </button>
      </div>

      <div className="hidden min-h-[44px] flex-wrap items-center gap-2 px-4 py-2 md:flex">
        {controlsForGroup(activeGroup, 'desktop').map((control) => (
          <ControlRenderer key={control.id} control={control} surface="desktop" {...handlers} />
        ))}
        {active?.available && (
          <button
            type="button"
            onClick={() => onResetGroup(activeGroup)}
            className="ml-auto h-8 rounded-full px-3 text-[13px] text-wzrd-muted-text hover:text-wzrd-mist"
          >
            Reset {active.label}
          </button>
        )}
      </div>
    </div>
  );
}
