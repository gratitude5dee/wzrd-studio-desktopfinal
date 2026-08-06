import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { panelSurface } from "@/lib/kanvasTheme";
import type { PanelSurfaceVariants } from "@/lib/kanvasTheme";

export interface KanvasPanelProps
  extends HTMLAttributes<HTMLDivElement>,
    PanelSurfaceVariants {
  /** Render as a plain block instead of the default padded panel. */
  padded?: boolean;
}

export const KanvasPanel = forwardRef<HTMLDivElement, KanvasPanelProps>(
  ({ className, surface, radius, border, padded = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        panelSurface({ surface, radius, border }),
        padded && "p-4 md:p-6",
        className,
      )}
      {...props}
    />
  ),
);
KanvasPanel.displayName = "KanvasPanel";
