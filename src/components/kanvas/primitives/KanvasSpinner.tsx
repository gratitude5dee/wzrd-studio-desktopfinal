import { forwardRef } from "react";
import type { SVGProps } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type KanvasSpinnerProps = SVGProps<SVGSVGElement> & {
  /** Accessible label announced while the spinner is visible. */
  label?: string;
};

/**
 * Busy indicator. The spin animation is dropped under
 * `prefers-reduced-motion`, leaving a static glyph.
 */
export const KanvasSpinner = forwardRef<SVGSVGElement, KanvasSpinnerProps>(
  ({ className, label = "Loading", ...props }, ref) => (
    <Loader2
      ref={ref}
      role="status"
      aria-label={label}
      className={cn("h-4 w-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  ),
);
KanvasSpinner.displayName = "KanvasSpinner";
