import { forwardRef } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { panelSurface } from "@/lib/kanvasTheme";

export interface KanvasPromptBarProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  /** Accessible name for the prompt field. */
  label: string;
  /** Controls rendered to the left of the field (upload, attachments). */
  leading?: ReactNode;
  /** Controls rendered to the right (settings, submit). */
  trailing?: ReactNode;
  /** Row rendered under the field (chips, counters). */
  footer?: ReactNode;
  className?: string;
  /** Class applied to the textarea itself. */
  inputClassName?: string;
}

/**
 * Framed prompt composer. The textarea is a real labelled form control; the
 * surrounding chrome only lays out caller-supplied controls.
 */
export const KanvasPromptBar = forwardRef<HTMLTextAreaElement, KanvasPromptBarProps>(
  ({ className, inputClassName, label, leading, trailing, footer, rows = 2, ...props }, ref) => (
    <div
      className={cn(
        panelSurface({ surface: "raised", radius: "xl", border: "default" }),
        "p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {leading ? <div className="flex shrink-0 items-center gap-1 pt-1">{leading}</div> : null}
        <textarea
          ref={ref}
          rows={rows}
          aria-label={label}
          className={cn(
            "min-h-[44px] w-full resize-none bg-transparent text-sm text-kanvas-text-primary placeholder:text-kanvas-text-faint focus:outline-none",
            inputClassName,
          )}
          {...props}
        />
        {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
      </div>
      {footer ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-kanvas-border-subtle pt-2">
          {footer}
        </div>
      ) : null}
    </div>
  ),
);
KanvasPromptBar.displayName = "KanvasPromptBar";
