import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { railWidth, railWidthCompact } from "@/lib/kanvasTheme";

export interface KanvasRailProps extends HTMLAttributes<HTMLElement> {
  /** Uses the narrower rail width for secondary layouts. */
  compact?: boolean;
  /** Which edge the rail sits on; drives the divider side. */
  side?: "left" | "right";
  /** Accessible name of the rail region. */
  label: string;
}

/**
 * Fixed-width scrollable studio control rail. Collapses to full width below
 * `md` so mobile layouts stack instead of overflowing.
 */
export const KanvasRail = forwardRef<HTMLElement, KanvasRailProps>(
  ({ className, compact = false, side = "left", label, style, ...props }, ref) => (
    <aside
      ref={ref}
      aria-label={label}
      style={{ ["--kanvas-rail" as string]: `${compact ? railWidthCompact : railWidth}px`, ...style }}
      className={cn(
        "flex w-full shrink-0 flex-col gap-4 overflow-y-auto bg-kanvas-surface-1 p-4 md:w-[var(--kanvas-rail)]",
        side === "left"
          ? "md:border-r md:border-kanvas-border-subtle"
          : "md:border-l md:border-kanvas-border-subtle",
        className,
      )}
      {...props}
    />
  ),
);
KanvasRail.displayName = "KanvasRail";
