import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { railChip } from "@/lib/kanvasTheme";
import type { RailChipVariants } from "@/lib/kanvasTheme";

export interface KanvasChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">,
    RailChipVariants {
  /** Renders the chip as a toggle and reflects state via `aria-pressed`. */
  toggle?: boolean;
}

/**
 * Pill toggle used for aspect ratios, presets and filters. Always a real
 * `<button>` with a 44px minimum hit target.
 */
export const KanvasChip = forwardRef<HTMLButtonElement, KanvasChipProps>(
  ({ className, size, active, toggle = true, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={toggle ? Boolean(active) : undefined}
      className={cn(railChip({ size, active }), className)}
      {...props}
    />
  ),
);
KanvasChip.displayName = "KanvasChip";
