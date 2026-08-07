import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { largestInnerRect, type CropRect } from '../lib/canvas-ops';
import { resizeRect, type CropHandleId } from '../lib/crop-rect';
import type { ImageSnapshot } from '../state/useImageEditor';

interface CanvasStageProps {
  snapshot: ImageSnapshot | null;
  /** Non-null while the crop overlay is active. */
  cropRect: CropRect | null;
  onCropRectChange: (rect: CropRect) => void;
  /**
   * Locked aspect expressed in *frame-normalized* units (rect width / rect
   * height), i.e. the target pixel ratio already divided by the image aspect.
   * Null for freeform.
   */
  cropRatio: number | null;
  straightenDegrees: number;
  onPickFile: (file: File) => void;
  busy: boolean;
}

/**
 * The canvas fills all space between the header and the history bar (§3.1).
 * When nothing has been imported yet it doubles as the drop target.
 */
export function CanvasStage({
  snapshot,
  cropRect,
  onCropRectChange,
  cropRatio,
  straightenDegrees,
  onPickFile,
  busy,
}: CanvasStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<CropHandleId | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; rect: CropRect } | null>(null);

  // Mirrors the zoom `straighten()` applies, so preview and result agree.
  const straightenZoom = useMemo(() => {
    if (!snapshot || !straightenDegrees) return 1;
    const angle = (straightenDegrees * Math.PI) / 180;
    return snapshot.width / largestInnerRect(snapshot.width, snapshot.height, angle).width;
  }, [snapshot, straightenDegrees]);

  const cropRectStyle = useMemo(
    () =>
      cropRect
        ? {
            left: `${cropRect.x * 100}%`,
            top: `${cropRect.y * 100}%`,
            width: `${cropRect.width * 100}%`,
            height: `${cropRect.height * 100}%`,
          }
        : undefined,
    [cropRect]
  );

  const toNormalized = useCallback((event: PointerEvent | React.PointerEvent) => {
    const frame = frameRef.current;
    if (!frame) return { x: 0, y: 0 };
    const bounds = frame.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }, []);

  const startDrag = (handle: CropHandleId) => (event: React.PointerEvent) => {
    if (!cropRect) return;
    event.preventDefault();
    event.stopPropagation();
    dragOrigin.current = { ...toNormalized(event), rect: cropRect };
    setDragging(handle);
  };

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (event: PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      const point = toNormalized(event);
      onCropRectChange(
        resizeRect(origin.rect, dragging, point.x - origin.x, point.y - origin.y, cropRatio)
      );
    };
    const onUp = () => {
      dragOrigin.current = null;
      setDragging(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [cropRatio, dragging, onCropRectChange, toNormalized]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file?.type.startsWith('image/')) onPickFile(file);
  };

  if (!snapshot) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-6"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-wzrd-hairline-strong bg-wzrd-ink/60 px-8 py-16 text-center transition-colors duration-wzrd-fast ease-wzrd-standard hover:border-wzrd-blue"
        >
          <span className="text-base text-wzrd-mist">Drop a photo</span>
          <span className="text-[13px] text-wzrd-muted-text">or tap to choose from your device</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-3">
      <div
        ref={frameRef}
        className="relative max-h-full max-w-full"
        style={{ aspectRatio: `${snapshot.width} / ${snapshot.height}` }}
      >
        {/* Clipped so the preview shows the same zoomed-in framing as the applied result. */}
        <div className="h-full w-full overflow-hidden">
          <img
            src={snapshot.url}
            alt="Working image"
            className="h-full w-full select-none object-contain"
            style={{
              transform: straightenDegrees
                ? `rotate(${straightenDegrees}deg) scale(${straightenZoom})`
                : undefined,
              transition: 'transform var(--wzrd-duration-fast) var(--wzrd-ease-standard)',
            }}
            draggable={false}
          />
        </div>

        {cropRect && (
          <div className="absolute inset-0" onPointerDown={startDrag('move')}>
            {/* The scrim is a huge outward shadow, so it needs its own clip; the
             * handle layer must stay unclipped or edge-flush handles get halved. */}
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="absolute shadow-[0_0_0_9999px_rgba(5,7,11,0.62)]"
                style={cropRectStyle}
              />
            </div>
            <div
              className={cn(
                'absolute touch-none border border-wzrd-mist/90',
                dragging && 'border-wzrd-blue'
              )}
              style={cropRectStyle}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                <span
                  key={handle}
                  role="presentation"
                  onPointerDown={startDrag(handle)}
                  className={cn(
                    'absolute h-6 w-6 touch-none rounded-full border-2 border-wzrd-mist bg-wzrd-ink/80',
                    handle === 'nw' && '-left-3 -top-3 cursor-nwse-resize',
                    handle === 'ne' && '-right-3 -top-3 cursor-nesw-resize',
                    handle === 'sw' && '-bottom-3 -left-3 cursor-nesw-resize',
                    handle === 'se' && '-bottom-3 -right-3 cursor-nwse-resize'
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {busy && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-wzrd-abyss/40">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-wzrd-chrome">
            working
          </span>
        </div>
      )}
    </div>
  );
}
