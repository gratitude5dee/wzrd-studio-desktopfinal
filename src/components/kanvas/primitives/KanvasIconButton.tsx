import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { KanvasSpinner } from "./KanvasSpinner";

const iconButton = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg disabled:cursor-not-allowed disabled:opacity-30",
  {
    variants: {
      tone: {
        subtle:
          "border border-kanvas-border-default bg-white/5 text-kanvas-text-secondary hover:bg-white/10",
        ghost: "text-kanvas-text-muted hover:text-kanvas-text-primary",
        accent:
          "bg-kanvas-accent text-kanvas-accent-contrast hover:bg-kanvas-accent-hover",
      },
      size: {
        /** Compact visual size, kept tappable by an invisible 44px target. */
        sm: "h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
        md: "h-11 w-11",
      },
    },
    defaultVariants: { tone: "subtle", size: "md" },
  },
);

export interface KanvasIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">,
    VariantProps<typeof iconButton> {
  /** Required: icon-only controls need an accessible name. */
  label: string;
  icon: ReactNode;
  /** Swaps the icon for a spinner and disables the control. */
  busy?: boolean;
}

export const KanvasIconButton = forwardRef<
  HTMLButtonElement,
  KanvasIconButtonProps
>(({ className, tone, size, label, icon, busy = false, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    aria-busy={busy || undefined}
    disabled={disabled || busy}
    className={cn(iconButton({ tone, size }), className)}
    {...props}
  >
    {busy ? <KanvasSpinner label={label} /> : icon}
  </button>
));
KanvasIconButton.displayName = "KanvasIconButton";
