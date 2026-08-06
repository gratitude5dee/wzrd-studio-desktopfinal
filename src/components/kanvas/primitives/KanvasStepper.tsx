import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanvasIconButton } from "./KanvasIconButton";

export interface KanvasStepperProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name of the numeric value (e.g. "Number of images"). */
  label: string;
  disabled?: boolean;
}

/** Numeric -/+ stepper (image count, duration, frames). */
export const KanvasStepper = forwardRef<HTMLDivElement, KanvasStepperProps>(
  (
    { className, value, onChange, min = 1, max = 8, step = 1, label, disabled, ...props },
    ref,
  ) => {
    const clamp = (next: number) => Math.min(max, Math.max(min, next));
    return (
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn("inline-flex items-center gap-1", className)}
        {...props}
      >
        <KanvasIconButton
          size="sm"
          tone="ghost"
          label={`Decrease ${label}`}
          icon={<Minus className="h-4 w-4" />}
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - step))}
        />
        <span
          role="status"
          aria-live="polite"
          className="min-w-[2ch] text-center text-sm font-semibold tabular-nums text-kanvas-text-primary"
        >
          {value}
        </span>
        <KanvasIconButton
          size="sm"
          tone="ghost"
          label={`Increase ${label}`}
          icon={<Plus className="h-4 w-4" />}
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + step))}
        />
      </div>
    );
  },
);
KanvasStepper.displayName = "KanvasStepper";
