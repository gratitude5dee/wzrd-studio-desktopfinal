import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { kanvasDisplay } from "@/lib/kanvasTheme";
import { panelSurface } from "@/lib/kanvasTheme";

export interface KanvasEmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Primary call to action. */
  action?: ReactNode;
  /** Removes the panel chrome, for use inside an already-framed surface. */
  bare?: boolean;
}

/** Centered "nothing here yet" state used by studios without content. */
export const KanvasEmptyState = forwardRef<HTMLDivElement, KanvasEmptyStateProps>(
  ({ className, icon, title, description, action, bare = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        !bare && panelSurface({ surface: "raised", radius: "xl", border: "subtle" }),
        className,
      )}
      {...props}
    >
      {icon ? <div className="text-kanvas-text-faint">{icon}</div> : null}
      <p className={cn(kanvasDisplay, "text-xl md:text-2xl")}>{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-kanvas-text-muted">{description}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  ),
);
KanvasEmptyState.displayName = "KanvasEmptyState";
