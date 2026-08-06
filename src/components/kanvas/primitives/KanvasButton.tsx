import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { KanvasSpinner } from "./KanvasSpinner";

const button = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-xs font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        accent:
          "bg-kanvas-accent text-kanvas-accent-contrast hover:bg-kanvas-accent-hover",
        neutral:
          "bg-kanvas-surface-3 text-kanvas-text-primary hover:bg-kanvas-surface-3/80",
        outline:
          "border border-kanvas-border-default text-kanvas-text-secondary hover:border-kanvas-border-strong hover:text-kanvas-text-primary",
        ghost:
          "text-kanvas-text-muted hover:bg-kanvas-surface-3 hover:text-kanvas-text-primary",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "accent", fullWidth: false },
  },
);

export interface KanvasButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Leading icon; replaced by a spinner while `busy`. */
  icon?: ReactNode;
  busy?: boolean;
}

export const KanvasButton = forwardRef<HTMLButtonElement, KanvasButtonProps>(
  (
    {
      className,
      variant,
      fullWidth,
      icon,
      busy = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(button({ variant, fullWidth }), className)}
      {...props}
    >
      {busy ? <KanvasSpinner label="Working" /> : icon}
      {children}
    </button>
  ),
);
KanvasButton.displayName = "KanvasButton";
