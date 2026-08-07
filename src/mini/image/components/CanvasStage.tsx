import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { largestInnerRect, type CropRect } from '../lib/canvas-ops';
import { resizeRect, type CropHandleId } from '../lib/crop-rect';
import { usePinchZoom } from '../lib/use-pinch-zoom';
import type { ImageSnapshot } from '../state/useImageEditor';
import { EmptyCanvas } from './EmptyCanvas';

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
  onExamplePrompt?: (prompt: string) => void;
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
  onExamplePrompt,
  busy,
}: CanvasStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<CropHandleId | null>(null);
  const zoom = usePinchZoom(Boolean(snapshot), Boolean(cropRect));
  const dragOrigin = useRef<{ x: number; y: number; rect: CropRect } | null>(null);
  const activePointers = useRef(new Set<number>());

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
    // A handle claims the gesture by defaulting it, so the rect underneath
    // stands down. Propagation is left alone: the second finger of a pinch has
    // to reach the zoom handlers even while the overlay is up.
    if (!cropRect || event.defaultPrevented || activePointers.current.size > 0) return;
    event.preventDefault();
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

  // A mouse gets no implicit capture, so a release outside the stage never
  // reaches its handler — the window owns the end of every gesture.
  useEffect(() => {
    const release = (event: PointerEvent) => activePointers.current.delete(event.pointerId);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  // A new working image is always shown fit-to-frame.
  const resetZoom = zoom.reset;
  useEffect(() => {
    resetZoom();
  }, [resetZoom, snapshot?.url]);

  if (!snapshot) {
    return <EmptyCanvas onPickFile={onPickFile} onExamplePrompt={onExamplePrompt} />;
  }

  return (
    <div
      className="relative flex flex-1 touch-none items-center justify-center overflow-hidden p-3"
      {...zoom.handlers}
      onPointerDown={(event) => {
        activePointers.current.add(event.pointerId);
        // A second finger means a pinch, not a crop drag.
        if (activePointers.current.size > 1) {
          dragOrigin.current = null;
          setDragging(null);
        }
        zoom.handlers.onPointerDown(event);
      }}
    >
      <div
        ref={frameRef}
        className="relative max-h-full max-w-full"
        style={{
          aspectRatio: `${snapshot.width} / ${snapshot.height}`,
          // Transforming the frame itself keeps the crop overlay's normalized
          // coordinates valid — every rect it measures already carries the zoom.
          transform: `translate(${zoom.view.x}px, ${zoom.view.y}px) scale(${zoom.view.scale})`,
        }}
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
