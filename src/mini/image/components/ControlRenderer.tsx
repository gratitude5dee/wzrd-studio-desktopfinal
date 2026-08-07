import { cn } from '@/lib/utils';

import type { ControlDefinition, ControlSurface, ControlValues } from '../app-schema';

export interface ControlHandlers {
  values: ControlValues;
  onValueChange: (controlId: string, value: string | number | boolean) => void;
  onAction: (controlId: string) => void;
}

/**
 * Renders one schema control. The same renderer backs the desktop panel and the
 * expanded sheet so the two surfaces can never drift (§5.1).
 */
export function ControlRenderer({
  control,
  values,
  onValueChange,
  onAction,
  surface,
}: ControlHandlers & { control: ControlDefinition; surface: ControlSurface }) {
  const disabled = control.available === false;
  // Touch targets are 44pt on the phone sheet, tighter on a pointer surface.
  const tall = surface === 'expanded';

  if (control.type === 'action') {
    return (
      <button
        type="button"
        disabled={disabled}
        title={control.hint}
        onClick={() => onAction(control.id)}
        className={cn(
          'flex items-center gap-1.5 whitespace-nowrap rounded-full border border-wzrd-hairline px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
          tall ? 'h-11 justify-center' : 'h-8',
          disabled ? 'text-wzrd-steel' : 'text-wzrd-mist hover:border-wzrd-blue hover:bg-wzrd-deep'
        )}
      >
        {control.label}
        <Cost control={control} />
      </button>
    );
  }

  if (control.type === 'segmented' || control.type === 'select' || control.type === 'grid') {
    const current = values[control.id];
    return (
      <div
        className={cn(
          'flex items-center gap-1',
          control.type === 'grid' ? 'flex-wrap' : tall && 'flex-wrap'
        )}
      >
        {control.options?.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onValueChange(control.id, option.value)}
            className={cn(
              'rounded-full px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
              tall ? 'h-11' : 'h-8',
              disabled
                ? 'text-wzrd-steel'
                : current === option.value
                  ? 'bg-wzrd-blue text-wzrd-paper'
                  : 'text-wzrd-chrome hover:bg-wzrd-deep'
            )}
          >
            {option.label}
          </button>
        ))}
        <Cost control={control} />
      </div>
    );
  }

  if (control.type === 'slider' && control.range) {
    const current = Number(values[control.id] ?? control.default ?? 0);
    return (
      <label className="flex min-w-[180px] items-center gap-2 text-[13px] text-wzrd-chrome">
        <span className="whitespace-nowrap">{control.label}</span>
        <input
          type="range"
          disabled={disabled}
          min={control.range.min}
          max={control.range.max}
          step={control.range.step}
          value={current}
          onChange={(event) => onValueChange(control.id, Number(event.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-wzrd-steel accent-wzrd-blue"
        />
        <span className="w-10 text-right font-mono text-[11px] tabular-nums text-wzrd-muted-text">
          {current}°
        </span>
      </label>
    );
  }

  const on = Boolean(values[control.id]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onValueChange(control.id, !on)}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
        tall ? 'h-11' : 'h-8',
        on ? 'border-wzrd-blue text-wzrd-mist' : 'border-wzrd-hairline text-wzrd-chrome'
      )}
    >
      {control.label}
      <Cost control={control} />
    </button>
  );
}

/**
 * §5.2: local controls show nothing — free and instant is the default
 * assumption. Job controls carry a blue dot and their credit cost in mono.
 */
function Cost({ control }: { control: ControlDefinition }) {
  if (control.cost !== 'job') return null;
  return (
    <span
      className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-wzrd-chrome"
      aria-label={`Costs ${control.credits ?? 1} credits`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-wzrd-blue" />
      {control.credits ?? 1}
    </span>
  );
}
