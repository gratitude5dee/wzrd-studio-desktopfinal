export const STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS = {
  sampleWindowMs: 2_000,
  triggerP95Ms: 34,
  recoveryP95Ms: 20,
  recoverySustainMs: 5_000,
  recoveryStepMs: 1_000,
  normalCursorBroadcastMs: 60,
  reducedCursorBroadcastMs: 120,
  normalSseProgressFlushMs: 225,
  reducedSseProgressFlushMs: 450,
} as const;

export type StudioPreviewPerformanceMode =
  | 'normal'
  | 'reduced'
  | 'recovering-flush'
  | 'recovering-cursor';

export interface StudioPreviewPerformanceConfig {
  mode: StudioPreviewPerformanceMode;
  feedbackVisible: boolean;
  cursorBroadcastMs: number;
  sseProgressFlushMs: number;
  visualsEnabled: boolean;
}

export interface StudioPreviewPerformanceSample {
  now: number;
  p95FrameDeltaMs: number;
  interacting: boolean;
}

export const NORMAL_STUDIO_PREVIEW_PERFORMANCE: StudioPreviewPerformanceConfig = {
  mode: 'normal',
  feedbackVisible: false,
  cursorBroadcastMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.normalCursorBroadcastMs,
  sseProgressFlushMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.normalSseProgressFlushMs,
  visualsEnabled: true,
};

const REDUCED_STUDIO_PREVIEW_PERFORMANCE: StudioPreviewPerformanceConfig = {
  mode: 'reduced',
  feedbackVisible: true,
  cursorBroadcastMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.reducedCursorBroadcastMs,
  sseProgressFlushMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.reducedSseProgressFlushMs,
  visualsEnabled: false,
};

function configForMode(mode: StudioPreviewPerformanceMode): StudioPreviewPerformanceConfig {
  switch (mode) {
    case 'reduced':
      return REDUCED_STUDIO_PREVIEW_PERFORMANCE;
    case 'recovering-flush':
      return {
        mode,
        feedbackVisible: true,
        cursorBroadcastMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.reducedCursorBroadcastMs,
        sseProgressFlushMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.normalSseProgressFlushMs,
        visualsEnabled: false,
      };
    case 'recovering-cursor':
      return {
        mode,
        feedbackVisible: true,
        cursorBroadcastMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.normalCursorBroadcastMs,
        sseProgressFlushMs: STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.normalSseProgressFlushMs,
        visualsEnabled: false,
      };
    case 'normal':
    default:
      return NORMAL_STUDIO_PREVIEW_PERFORMANCE;
  }
}

export class AdaptivePreviewPerformanceController {
  private mode: StudioPreviewPerformanceMode = 'normal';
  private recoveryBelowThresholdSince: number | null = null;
  private nextRecoveryStepAt: number | null = null;

  update(sample: StudioPreviewPerformanceSample): StudioPreviewPerformanceConfig {
    const thresholds = STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS;
    if (sample.interacting && sample.p95FrameDeltaMs > thresholds.triggerP95Ms) {
      this.mode = 'reduced';
      this.recoveryBelowThresholdSince = null;
      this.nextRecoveryStepAt = null;
      return configForMode(this.mode);
    }

    if (this.mode === 'normal') {
      return configForMode(this.mode);
    }

    if (sample.p95FrameDeltaMs >= thresholds.recoveryP95Ms) {
      this.mode = 'reduced';
      this.recoveryBelowThresholdSince = null;
      this.nextRecoveryStepAt = null;
      return configForMode(this.mode);
    }

    if (this.recoveryBelowThresholdSince === null) {
      this.recoveryBelowThresholdSince = sample.now;
    }

    if (this.mode === 'reduced') {
      if (sample.now - this.recoveryBelowThresholdSince >= thresholds.recoverySustainMs) {
        this.mode = 'recovering-flush';
        this.nextRecoveryStepAt = sample.now + thresholds.recoveryStepMs;
      }
      return configForMode(this.mode);
    }

    if (this.nextRecoveryStepAt !== null && sample.now >= this.nextRecoveryStepAt) {
      if (this.mode === 'recovering-flush') {
        this.mode = 'recovering-cursor';
        this.nextRecoveryStepAt = sample.now + thresholds.recoveryStepMs;
      } else {
        this.mode = 'normal';
        this.recoveryBelowThresholdSince = null;
        this.nextRecoveryStepAt = null;
      }
    }

    return configForMode(this.mode);
  }
}

let activeStudioPreviewPerformanceConfig = NORMAL_STUDIO_PREVIEW_PERFORMANCE;

export function setActiveStudioPreviewPerformanceConfig(
  config: StudioPreviewPerformanceConfig
): void {
  activeStudioPreviewPerformanceConfig = config;
}

export function getStudioSseProgressFlushMs(): number {
  return activeStudioPreviewPerformanceConfig.sseProgressFlushMs;
}

export function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}
