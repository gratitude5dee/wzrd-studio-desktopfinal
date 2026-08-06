import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1 rounded-full font-bold uppercase leading-none",
  {
    variants: {
      tone: {
        accent: "bg-kanvas-accent-soft text-kanvas-accent",
        neutral: "bg-kanvas-surface-3 text-kanvas-text-secondary",
        outline:
          "border border-kanvas-border-default bg-transparent text-kanvas-text-secondary",
        glass:
          "border border-kanvas-border-strong bg-black/45 text-kanvas-text-secondary backdrop-blur",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[8px] tracking-[0.16em]",
        md: "px-3 py-1 text-[10px] tracking-[0.18em]",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface KanvasBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

/** Non-interactive status/metadata pill (provider, credits, "New", style tags). */
export const KanvasBadge = forwardRef<HTMLSpanElement, KanvasBadgeProps>(
  ({ className, tone, size, ...props }, ref) => (
    <span ref={ref} className={cn(badge({ tone, size }), className)} {...props} />
  ),
);
KanvasBadge.displayName = "KanvasBadge";
