/**
 * Local, zero-network raster operations for the Image Editor mini-app (§6).
 *
 * Every operation is pure: it takes a source bitmap and returns a brand new
 * canvas, so the caller can push the result onto the history stack without
 * worrying about aliasing.
 */

/** Memory ceiling: no snapshot may exceed this on its long edge. */
export const MAX_LONG_EDGE = 4096;

export type AspectPresetId = '1:1' | '4:5' | '9:16' | '16:9' | 'free';

export interface AspectPreset {
  id: AspectPresetId;
  label: string;
  /** width / height, or null for a freeform crop. */
  ratio: number | null;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: 'free', label: 'Free', ratio: null },
];

/** Normalized crop rectangle, all values in the 0..1 range of the source. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Bitmap = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

function bitmapSize(source: Bitmap): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/**
 * Scale factor that brings `source` under the memory ceiling, or 1 when the
 * source already fits.
 */
export function ceilingScale(width: number, height: number, maxLongEdge = MAX_LONG_EDGE): number {
  const longEdge = Math.max(width, height);
  return longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
}

/** Copy `source` into a canvas, downscaling if it breaches the memory ceiling. */
export function toCanvas(source: Bitmap, maxLongEdge = MAX_LONG_EDGE): HTMLCanvasElement {
  const { width, height } = bitmapSize(source);
  const scale = ceilingScale(width, height, maxLongEdge);
  const canvas = createCanvas(width * scale, height * scale);
  context2d(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Largest rectangle of the given aspect ratio that is centered inside the
 * source. Used to seed the crop overlay when a preset is picked.
 */
export function centeredCropForRatio(
  sourceWidth: number,
  sourceHeight: number,
  ratio: number | null
): CropRect {
  if (ratio === null) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > ratio) {
    const width = ratio / sourceRatio;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = sourceRatio / ratio;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

export function crop(source: Bitmap, rect: CropRect): HTMLCanvasElement {
  const { width, height } = bitmapSize(source);
  const sx = Math.round(clamp01(rect.x) * width);
  const sy = Math.round(clamp01(rect.y) * height);
  const sw = Math.max(1, Math.round(clamp01(rect.width) * width));
  const sh = Math.max(1, Math.round(clamp01(rect.height) * height));
  const canvas = createCanvas(sw, sh);
  context2d(canvas).drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

export function rotate(source: Bitmap, quarterTurns: number): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const { width, height } = bitmapSize(source);
  const swap = turns % 2 === 1;
  const canvas = createCanvas(swap ? height : width, swap ? width : height);
  const ctx = context2d(canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  return canvas;
}

export function flip(source: Bitmap, axis: 'horizontal' | 'vertical'): HTMLCanvasElement {
  const { width, height } = bitmapSize(source);
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.translate(axis === 'horizontal' ? width : 0, axis === 'vertical' ? height : 0);
  ctx.scale(axis === 'horizontal' ? -1 : 1, axis === 'vertical' ? -1 : 1);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Rotate by an arbitrary angle and crop back to the largest axis-aligned
 * rectangle of the original aspect that still fits inside the rotated frame,
 * so straightening never reveals empty corners.
 */
export function straighten(source: Bitmap, degrees: number): HTMLCanvasElement {
  const angle = (degrees * Math.PI) / 180;
  const { width, height } = bitmapSize(source);
  if (Math.abs(degrees) < 0.01) {
    return toCanvas(source);
  }

  const zoom = width / largestInnerRect(width, height, angle).width;
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);
  ctx.scale(zoom, zoom);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  return canvas;
}

/**
 * Largest same-aspect axis-aligned rectangle that fits inside a `width`×`height`
 * rectangle rotated by `angle` radians.
 */
export function largestInnerRect(
  width: number,
  height: number,
  angle: number
): { width: number; height: number } {
  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));
  const widthIsLonger = width >= height;
  const longSide = widthIsLonger ? width : height;
  const shortSide = widthIsLonger ? height : width;

  if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 1e-10) {
    const half = 0.5 * shortSide;
    const a = sin < cos ? half / cos : half / sin;
    const b = sin < cos ? half / sin : half / cos;
    return widthIsLonger ? { width: b, height: a } : { width: a, height: b };
  }

  const cos2a = cos * cos - sin * sin;
  return {
    width: (width * cos - height * sin) / cos2a,
    height: (height * cos - width * sin) / cos2a,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality
    );
  });
}

/** Decode a user-supplied file into a canvas already clamped to the ceiling. */
export async function fileToCanvas(file: File, maxLongEdge = MAX_LONG_EDGE): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return toCanvas(image, maxLongEdge);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}
