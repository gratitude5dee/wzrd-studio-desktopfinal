import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { kanvasEyebrow } from "@/lib/kanvasTheme";
import { KanvasDisplayHeading } from "./KanvasDisplayHeading";

export interface KanvasSectionHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing control (e.g. "View all"), rendered opposite the title. */
  action?: ReactNode;
  /** Heading level of the title. */
  level?: 2 | 3 | 4;
}

export const KanvasSectionHeader = forwardRef<
  HTMLDivElement,
  KanvasSectionHeaderProps
>(({ className, eyebrow, title, description, action, level = 3, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-end justify-between gap-4", className)}
    {...props}
  >
    <div className="min-w-0">
      {eyebrow ? <p className={cn(kanvasEyebrow, "mb-1")}>{eyebrow}</p> : null}
      <KanvasDisplayHeading level={level}>{title}</KanvasDisplayHeading>
      {description ? (
        <p className="mt-1 text-sm text-kanvas-text-secondary">{description}</p>
      ) : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
));
KanvasSectionHeader.displayName = "KanvasSectionHeader";
