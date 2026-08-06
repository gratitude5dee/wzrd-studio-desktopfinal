import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { railRow } from "@/lib/kanvasTheme";
import type { RailRowVariants } from "@/lib/kanvasTheme";

type RowContent = {
  /** Leading icon or swatch. */
  leading?: ReactNode;
  label: ReactNode;
  /** Secondary line under the label. */
  hint?: ReactNode;
  /** Trailing value, chevron or control. */
  trailing?: ReactNode;
};

const body = ({ leading, label, hint, trailing }: RowContent) => (
  <>
    {leading ? <span className="shrink-0">{leading}</span> : null}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-kanvas-text-primary">{label}</span>
      {hint ? (
        <span className="block truncate text-xs text-kanvas-text-muted">{hint}</span>
      ) : null}
    </span>
    {trailing ? (
      <span className="shrink-0 text-xs text-kanvas-text-secondary">{trailing}</span>
    ) : null}
  </>
);

export interface KanvasRailRowProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onClick">,
    RailRowVariants,
    RowContent {
  /** Renders a real `<button>` and switches on interactive styling. */
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
}

/**
 * A labelled row inside a studio control rail. With `onClick` it renders a
 * button with a 44px hit target; otherwise a plain div.
 */
export const KanvasRailRow = forwardRef<HTMLElement, KanvasRailRowProps>(
  (
    {
      className,
      surface,
      interactive,
      active,
      leading,
      label,
      hint,
      trailing,
      onClick,
      disabled,
      ...props
    },
    ref,
  ) => {
    const classes = cn(
      railRow({ surface, interactive: interactive ?? Boolean(onClick), active }),
      onClick &&
        "min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg disabled:cursor-not-allowed disabled:opacity-40",
      className,
    );
    const content = body({ leading, label, hint, trailing });

    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-pressed={active ?? undefined}
          className={classes}
          {...(props as unknown as ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {content}
        </button>
      );
    }

    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={classes} {...props}>
        {content}
      </div>
    );
  },
);
KanvasRailRow.displayName = "KanvasRailRow";
