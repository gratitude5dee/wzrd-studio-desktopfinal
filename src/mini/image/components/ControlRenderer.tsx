import { cn } from '@/lib/utils';

import type { ControlDefinition, ControlValues } from '../app-schema';

export interface ControlHandlers {
  values: ControlValues;
  onValueChange: (controlId: string, value: string | number | boolean) => void;
  onAction: (controlId: string) => void;
}

/**
 * Renders one schema control. The same renderer backs the desktop rail and the
 * mobile sheet so the two surfaces can never drift (§5.1).
 */
export function ControlRenderer({
  control,
  values,
  onValueChange,
  onAction,
  layout,
}: ControlHandlers & { control: ControlDefinition; layout: 'rail' | 'sheet' }) {
  const disabled = control.available === false;

  if (control.type === 'action') {
    return (
      <button
        type="button"
        disabled={disabled}
        title={control.hint}
        onClick={() => onAction(control.id)}
        className={cn(
          'flex items-center gap-1.5 whitespace-nowrap rounded-full border border-wzrd-hairline px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
          layout === 'sheet' ? 'h-11 justify-center' : 'h-8',
          disabled ? 'text-wzrd-steel' : 'text-wzrd-mist hover:border-wzrd-blue hover:bg-wzrd-deep'
        )}
      >
        {control.label}
        <CostDot cost={control.cost} />
      </button>
    );
  }

  if (control.type === 'choice') {
    const current = values[control.id];
    return (
      <div className={cn('flex items-center gap-1', layout === 'sheet' && 'flex-wrap')}>
        {control.options?.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onValueChange(control.id, option.value)}
            className={cn(
              'rounded-full px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
              layout === 'sheet' ? 'h-11' : 'h-8',
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
      </div>
    );
  }

  if (control.type === 'range' && control.range) {
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

  const enabled = Boolean(values[control.id]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onValueChange(control.id, !enabled)}
      className={cn(
        'rounded-full border px-3 text-[13px] transition-colors duration-wzrd-fast ease-wzrd-standard',
        layout === 'sheet' ? 'h-11' : 'h-8',
        enabled ? 'border-wzrd-blue text-wzrd-mist' : 'border-wzrd-hairline text-wzrd-chrome'
      )}
    >
      {control.label}
    </button>
  );
}

/** Cost dot: on-device controls render nothing, credit-spending ones a dot per tier. */
function CostDot({ cost }: { cost: number }) {
  if (cost === 0) return null;
  return (
    <span className="flex gap-0.5" aria-label={`${cost} credit tier`}>
      {Array.from({ length: cost }, (_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-wzrd-blue" />
      ))}
    </span>
  );
}
