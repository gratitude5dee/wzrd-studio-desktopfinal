import { describe, expect, it } from 'vitest';
import {
  AdaptivePreviewPerformanceController,
  STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS,
  percentile95,
} from './adaptivePreviewPerformance';

describe('AdaptivePreviewPerformanceController', () => {
  it('reduces work when interactive frame p95 exceeds the trigger', () => {
    const controller = new AdaptivePreviewPerformanceController();
    expect(controller.update({ now: 2_000, p95FrameDeltaMs: 35, interacting: true })).toMatchObject({
      mode: 'reduced',
      feedbackVisible: true,
      visualsEnabled: false,
    });
  });

  it('uses hysteresis and stepped recovery before returning to normal', () => {
    const controller = new AdaptivePreviewPerformanceController();
    controller.update({ now: 2_000, p95FrameDeltaMs: 40, interacting: true });
    expect(controller.update({ now: 3_000, p95FrameDeltaMs: 19, interacting: false }).mode).toBe('reduced');
    expect(controller.update({
      now: 3_000 + STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.recoverySustainMs,
      p95FrameDeltaMs: 19,
      interacting: false,
    }).mode).toBe('recovering-flush');
    expect(controller.update({ now: 9_000, p95FrameDeltaMs: 19, interacting: false }).mode).toBe('recovering-cursor');
    expect(controller.update({ now: 10_000, p95FrameDeltaMs: 19, interacting: false }).mode).toBe('normal');
  });

  it('returns to reduced mode if recovery performance regresses', () => {
    const controller = new AdaptivePreviewPerformanceController();
    controller.update({ now: 2_000, p95FrameDeltaMs: 40, interacting: true });
    controller.update({ now: 3_000, p95FrameDeltaMs: 19, interacting: false });
    expect(controller.update({ now: 8_000, p95FrameDeltaMs: 19, interacting: false }).mode).toBe('recovering-flush');
    expect(controller.update({ now: 8_100, p95FrameDeltaMs: 25, interacting: false }).mode).toBe('reduced');
  });
});

describe('percentile95', () => {
  it('computes the p95 without mutating the input', () => {
    const values = [30, 10, 20];
    expect(percentile95(values)).toBe(30);
    expect(values).toEqual([30, 10, 20]);
  });
});
