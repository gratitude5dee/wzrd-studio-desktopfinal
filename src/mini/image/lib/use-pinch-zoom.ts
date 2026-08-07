import { useCallback, useEffect, useRef, useState } from 'react';

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export const FIT_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };

const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;

/**
 * Pinch-zoom and double-tap-to-fit for the canvas (§3.1).
 *
 * The transform is applied to the frame element itself, so every rect the crop
 * overlay measures already carries it — normalized crop coordinates stay valid
 * at any zoom without a second coordinate space.
 *
 * While the crop overlay is up, one finger belongs to the crop rect and a
 * double-tap would throw away the zoom the user just set to place it, so both
 * are suppressed. Pinch still works: zooming in to refine a crop is the whole
 * reason to zoom at all.
 */
export function usePinchZoom(enabled: boolean, cropping = false) {
  const [view, setView] = useState<ViewTransform>(FIT_VIEW);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  const reset = useCallback(() => setView(FIT_VIEW), []);

  const clamp = (next: ViewTransform): ViewTransform => {
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    // At fit scale there is nothing to pan to; snap the offset back.
    if (scale === 1) return FIT_VIEW;
    return { scale, x: next.x, y: next.y };
  };

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.current.size === 1 && !cropping) {
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          reset();
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }

      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
      }
    },
    [cropping, enabled, reset, view.scale]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || !pointers.current.has(event.pointerId)) return;
      const previous = pointers.current.get(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current.distance > 0) {
          const ratio = distance / pinch.current.distance;
          setView((current) => clamp({ ...current, scale: pinch.current!.scale * ratio }));
        }
        return;
      }

      // One finger pans, but only once there is something to pan.
      if (previous && view.scale > 1 && !cropping) {
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        setView((current) => clamp({ ...current, x: current.x + dx, y: current.y + dy }));
      }
    },
    [cropping, enabled, view.scale]
  );

  // A mouse gets no implicit capture, so a release outside the canvas would
  // never reach an element handler and the pointer would be tracked forever.
  useEffect(() => {
    const release = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  const onDoubleClick = useCallback(() => {
    if (enabled && !cropping) reset();
  }, [cropping, enabled, reset]);

  return {
    view,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onDoubleClick,
    },
  };
}
