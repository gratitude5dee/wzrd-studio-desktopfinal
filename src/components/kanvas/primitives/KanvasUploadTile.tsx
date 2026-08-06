import { forwardRef, useId } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaTile } from "@/lib/kanvasTheme";
import type { MediaTileVariants } from "@/lib/kanvasTheme";

export interface KanvasUploadTileProps extends Pick<MediaTileVariants, "ratio" | "radius"> {
  label: string;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}

/**
 * Dashed upload target. The real `<input type="file">` is visually hidden but
 * focusable, so the tile is keyboard- and screen-reader-operable.
 */
export const KanvasUploadTile = forwardRef<HTMLInputElement, KanvasUploadTileProps>(
  (
    { className, ratio = "square", radius, label, hint, accept, multiple, disabled, onFiles },
    ref,
  ) => {
    const inputId = useId();
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) onFiles(files);
      event.target.value = "";
    };

    return (
      <div
        className={cn(
          mediaTile({ ratio, radius, interactive: !disabled }),
          "border border-dashed border-kanvas-border-default bg-transparent focus-within:border-kanvas-accent",
          disabled && "cursor-not-allowed opacity-40",
          className,
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className="flex h-full min-h-[44px] w-full cursor-pointer flex-col items-center justify-center gap-1 p-3 text-center peer-focus-visible:ring-2 peer-focus-visible:ring-kanvas-accent"
        >
          <Upload className="h-4 w-4 text-kanvas-text-muted" aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-kanvas-text-secondary">
            {label}
          </span>
          {hint ? <span className="text-[10px] text-kanvas-text-faint">{hint}</span> : null}
        </label>
      </div>
    );
  },
);
KanvasUploadTile.displayName = "KanvasUploadTile";
