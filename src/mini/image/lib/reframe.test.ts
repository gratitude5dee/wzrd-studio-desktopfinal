import { describe, expect, it } from 'vitest';

import { ceilingScale, centeredCropForRatio, largestInnerRect, MAX_LONG_EDGE } from './canvas-ops';
import { MIN_CROP_SIZE, resizeRect } from './crop-rect';

describe('ceilingScale', () => {
  it('leaves sources within the ceiling untouched', () => {
    expect(ceilingScale(1024, 768)).toBe(1);
    expect(ceilingScale(MAX_LONG_EDGE, 10)).toBe(1);
  });

  it('scales the long edge down to the ceiling', () => {
    expect(ceilingScale(8192, 4096)).toBe(0.5);
    expect(ceilingScale(2000, 10000)).toBeCloseTo(MAX_LONG_EDGE / 10000);
  });
});

describe('centeredCropForRatio', () => {
  it('is the whole frame when freeform', () => {
    expect(centeredCropForRatio(1600, 900, null)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('pillarboxes a wide source cropped to square', () => {
    const rect = centeredCropForRatio(1600, 900, 1);
    expect(rect.height).toBe(1);
    expect(rect.width).toBeCloseTo(900 / 1600);
    expect(rect.x).toBeCloseTo((1 - 900 / 1600) / 2);
  });

  it('letterboxes a tall source cropped to 16:9', () => {
    const rect = centeredCropForRatio(1080, 1920, 16 / 9);
    expect(rect.width).toBe(1);
    expect(rect.height).toBeCloseTo((1080 / 1920) / (16 / 9));
    expect(rect.y).toBeCloseTo((1 - rect.height) / 2);
  });
});

describe('resizeRect', () => {
  const rect = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };

  it('moves without resizing and stays inside the frame', () => {
    expect(resizeRect(rect, 'move', 0.1, -0.05, null)).toEqual({
      x: 0.30000000000000004,
      y: 0.15000000000000002,
      width: 0.5,
      height: 0.5,
    });
    const clamped = resizeRect(rect, 'move', 5, 5, null);
    expect(clamped.x).toBeCloseTo(0.5);
    expect(clamped.y).toBeCloseTo(0.5);
  });

  it('grows from the anchored corner', () => {
    const next = resizeRect(rect, 'se', 0.1, 0.1, null);
    expect(next.x).toBeCloseTo(0.2);
    expect(next.y).toBeCloseTo(0.2);
    expect(next.width).toBeCloseTo(0.6);
    expect(next.height).toBeCloseTo(0.6);
  });

  it('keeps the north-west corner anchored to the opposite edge', () => {
    const next = resizeRect(rect, 'nw', -0.1, -0.1, null);
    expect(next.x + next.width).toBeCloseTo(0.7);
    expect(next.y + next.height).toBeCloseTo(0.7);
  });

  it('never shrinks below the minimum edge', () => {
    const next = resizeRect(rect, 'se', -1, -1, null);
    expect(next.width).toBe(MIN_CROP_SIZE);
    expect(next.height).toBe(MIN_CROP_SIZE);
  });

  it('locks the aspect when a ratio is supplied', () => {
    const next = resizeRect(rect, 'se', 0.2, 0, 2);
    expect(next.width / next.height).toBeCloseTo(2);
  });

  it('clamps a locked aspect that would overflow the frame', () => {
    const next = resizeRect(rect, 'se', 0.6, 0, 0.5);
    expect(next.height).toBeLessThanOrEqual(1);
    expect(next.width / next.height).toBeCloseTo(0.5);
  });
});

describe('largestInnerRect', () => {
  it('is the source itself at zero rotation', () => {
    const inner = largestInnerRect(1000, 800, 0);
    expect(inner.width).toBeCloseTo(1000);
    expect(inner.height).toBeCloseTo(800);
  });

  it('shrinks as the angle grows', () => {
    const small = largestInnerRect(1000, 800, (5 * Math.PI) / 180);
    const large = largestInnerRect(1000, 800, (15 * Math.PI) / 180);
    expect(small.width).toBeLessThan(1000);
    expect(large.width).toBeLessThan(small.width);
    expect(large.height).toBeLessThan(small.height);
  });

  it('keeps the source aspect, so zooming by it leaves no empty corners', () => {
    for (const [width, height] of [
      [1200, 800],
      [675, 380],
      [800, 800],
      [400, 900],
    ]) {
      for (const degrees of [1, 8, 15, -12]) {
        const angle = (degrees * Math.PI) / 180;
        const inner = largestInnerRect(width, height, angle);
        expect(inner.width / inner.height).toBeCloseTo(width / height);

        // The zoomed source, rotated, must still cover the original frame.
        const zoom = width / inner.width;
        const sin = Math.abs(Math.sin(angle));
        const cos = Math.abs(Math.cos(angle));
        expect(zoom * width).toBeGreaterThanOrEqual(width * cos + height * sin - 1e-9);
        expect(zoom * height).toBeGreaterThanOrEqual(width * sin + height * cos - 1e-9);
      }
    }
  });

  it('is symmetric in the sign of the angle', () => {
    const positive = largestInnerRect(1000, 800, (7 * Math.PI) / 180);
    const negative = largestInnerRect(1000, 800, (-7 * Math.PI) / 180);
    expect(positive.width).toBeCloseTo(negative.width);
    expect(positive.height).toBeCloseTo(negative.height);
  });
});
