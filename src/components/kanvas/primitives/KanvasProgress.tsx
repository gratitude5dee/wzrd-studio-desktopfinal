import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface KanvasProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0-100. Omit for an indeterminate bar. */
  value?: number;
  label: string;
}

/**
 * Job progress bar. Indeterminate mode animates a sweep, which is replaced by
 * a static half-filled track under `prefers-reduced-motion`.
 */
export const KanvasProgress = forwardRef<HTMLDivElement, KanvasProgressProps>(
  ({ className, value, label, ...props }, ref) => {
    const determinate = typeof value === "number";
    const clamped = determinate ? Math.min(100, Math.max(0, value)) : undefined;
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        className={cn(
          "h-1 w-full overflow-hidden rounded-full bg-kanvas-surface-3",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full bg-kanvas-accent transition-[width] duration-300 motion-reduce:transition-none",
            !determinate && "w-1/2 animate-pulse motion-reduce:animate-none",
          )}
          style={determinate ? { width: `${clamped}%` } : undefined}
        />
      </div>
    );
  },
);
KanvasProgress.displayName = "KanvasProgress";
