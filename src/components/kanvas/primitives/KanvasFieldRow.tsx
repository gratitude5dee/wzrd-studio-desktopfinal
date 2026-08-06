import { forwardRef, useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { kanvasEyebrow } from "@/lib/kanvasTheme";

export interface KanvasFieldRowProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  hint?: ReactNode;
  /** Lays the control out beneath the label instead of beside it. */
  stacked?: boolean;
  /** Receives the generated id so the control can be labelled. */
  children: (ids: { labelId: string }) => ReactNode;
}

/** Label + control row used throughout the studio rails. */
export const KanvasFieldRow = forwardRef<HTMLDivElement, KanvasFieldRowProps>(
  ({ className, label, hint, stacked = false, children, ...props }, ref) => {
    const labelId = useId();
    return (
      <div
        ref={ref}
        className={cn(
          stacked ? "flex flex-col gap-2" : "flex items-center justify-between gap-3",
          className,
        )}
        {...props}
      >
        <div className="min-w-0">
          <span id={labelId} className={kanvasEyebrow}>
            {label}
          </span>
          {hint ? (
            <span className="mt-0.5 block text-xs text-kanvas-text-faint">{hint}</span>
          ) : null}
        </div>
        {children({ labelId })}
      </div>
    );
  },
);
KanvasFieldRow.displayName = "KanvasFieldRow";
