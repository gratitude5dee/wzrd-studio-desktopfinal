import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { accentText, kanvasDisplay } from "@/lib/kanvasTheme";

type HeadingLevel = 1 | 2 | 3 | 4;

const sizeClass: Record<HeadingLevel, string> = {
  1: "text-4xl leading-[0.9] md:text-6xl lg:text-7xl",
  2: "text-2xl leading-[0.95] md:text-4xl",
  3: "text-xl md:text-2xl",
  4: "text-base md:text-lg",
};

export interface KanvasDisplayHeadingProps
  extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level; also drives the display size step. */
  level?: HeadingLevel;
  /** Trailing fragment rendered in the accent colour. */
  accent?: React.ReactNode;
}

/**
 * Condensed uppercase studio headline. `accent` renders inside the same
 * heading so screen readers read one continuous title.
 */
export const KanvasDisplayHeading = forwardRef<
  HTMLHeadingElement,
  KanvasDisplayHeadingProps
>(({ className, level = 2, accent, children, ...props }, ref) => {
  const Tag = `h${level}` as const;
  return (
    <Tag ref={ref} className={cn(kanvasDisplay, sizeClass[level], className)} {...props}>
      {children}
      {accent ? <span className={accentText}>{accent}</span> : null}
    </Tag>
  );
});
KanvasDisplayHeading.displayName = "KanvasDisplayHeading";
