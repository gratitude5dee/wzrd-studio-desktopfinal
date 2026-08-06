import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { mediaTile } from "@/lib/kanvasTheme";
import type { MediaTileVariants } from "@/lib/kanvasTheme";

export interface KanvasMediaTileProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onClick">,
    MediaTileVariants {
  /** Image source; omit to render only `children` (e.g. a video element). */
  src?: string;
  alt?: string;
  /** Overlay content (labels, badges, hover actions). */
  overlay?: ReactNode;
  /** Renders the tile as a button with an accessible name of `alt`. */
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  selected?: boolean;
}

/**
 * Aspect-ratio-locked media thumbnail. Images always fill the tile via
 * `object-cover` so the ratio never depends on intrinsic image size.
 */
export const KanvasMediaTile = forwardRef<HTMLElement, KanvasMediaTileProps>(
  (
    {
      className,
      ratio,
      radius,
      interactive,
      src,
      alt = "",
      overlay,
      onClick,
      selected,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(
      mediaTile({ ratio, radius, interactive: interactive ?? Boolean(onClick) }),
      "border border-kanvas-border-subtle",
      selected && "border-kanvas-accent ring-1 ring-kanvas-accent",
      onClick &&
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg",
      className,
    );

    const content = (
      <>
        {src ? (
          <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        {children}
        {overlay ? <div className="absolute inset-0">{overlay}</div> : null}
      </>
    );

    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          aria-label={alt || undefined}
          aria-pressed={selected ?? undefined}
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
KanvasMediaTile.displayName = "KanvasMediaTile";
