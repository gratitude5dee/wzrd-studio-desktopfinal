import type { CropRect } from './canvas-ops';

export type CropHandleId = 'nw' | 'ne' | 'sw' | 'se' | 'move';

/** Smallest crop edge, as a fraction of the frame. */
export const MIN_CROP_SIZE = 0.05;

/**
 * Apply a pointer delta to the crop rect, honouring the locked aspect.
 *
 * `ratio` is expressed in frame-normalized units (rect width / rect height),
 * i.e. the target pixel ratio already divided by the image aspect.
 */
export function resizeRect(
  rect: CropRect,
  handle: CropHandleId,
  dx: number,
  dy: number,
  ratio: number | null
): CropRect {
  if (handle === 'move') {
    return {
      ...rect,
      x: clamp(rect.x + dx, 0, 1 - rect.width),
      y: clamp(rect.y + dy, 0, 1 - rect.height),
    };
  }

  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const anchorX = handle === 'nw' || handle === 'sw' ? right : rect.x;
  const anchorY = handle === 'nw' || handle === 'ne' ? bottom : rect.y;

  let width = clamp(
    handle === 'nw' || handle === 'sw' ? rect.width - dx : rect.width + dx,
    MIN_CROP_SIZE,
    1
  );
  let height = clamp(
    handle === 'nw' || handle === 'ne' ? rect.height - dy : rect.height + dy,
    MIN_CROP_SIZE,
    1
  );

  if (ratio !== null) {
    height = width / ratio;
    if (height > 1) {
      height = 1;
      width = height * ratio;
    }
  }

  const x = handle === 'nw' || handle === 'sw' ? anchorX - width : anchorX;
  const y = handle === 'nw' || handle === 'ne' ? anchorY - height : anchorY;

  return {
    x: clamp(x, 0, 1 - width),
    y: clamp(y, 0, 1 - height),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
