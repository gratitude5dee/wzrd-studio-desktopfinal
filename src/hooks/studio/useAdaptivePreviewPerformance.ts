import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AdaptivePreviewPerformanceController,
  NORMAL_STUDIO_PREVIEW_PERFORMANCE,
  STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS,
  percentile95,
  setActiveStudioPreviewPerformanceConfig,
  type StudioPreviewPerformanceConfig,
} from '@/lib/studio/adaptivePreviewPerformance';

interface UseAdaptivePreviewPerformanceResult {
  config: StudioPreviewPerformanceConfig;
  getMetrics: () => {
    p95FrameDeltaMs: number;
    maxDroppedFrameStreak: number;
  };
  resetMetrics: () => void;
}

export function useAdaptivePreviewPerformance(
  interacting: boolean
): UseAdaptivePreviewPerformanceResult {
  const interactingRef = useRef(interacting);
  const controllerRef = useRef(new AdaptivePreviewPerformanceController());
  const samplesRef = useRef<Array<{ at: number; delta: number }>>([]);
  const droppedFrameStreakRef = useRef(0);
  const p95FrameDeltaMsRef = useRef(0);
  const maxDroppedFrameStreakRef = useRef(0);
  const configRef = useRef(NORMAL_STUDIO_PREVIEW_PERFORMANCE);
  const [config, setConfig] = useState(NORMAL_STUDIO_PREVIEW_PERFORMANCE);

  useEffect(() => {
    interactingRef.current = interacting;
  }, [interacting]);

  useEffect(() => {
    let animationFrameId = 0;
    let previousFrameAt: number | null = null;
    let lastPublishedAt = 0;

    const sampleFrame = (now: number) => {
      if (previousFrameAt !== null) {
        const delta = now - previousFrameAt;
        const samples = samplesRef.current;
        samples.push({ at: now, delta });
        while (
          samples.length > 0 &&
          now - samples[0].at > STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.sampleWindowMs
        ) {
          samples.shift();
        }

        if (delta > STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.triggerP95Ms) {
          droppedFrameStreakRef.current += 1;
          maxDroppedFrameStreakRef.current = Math.max(
            maxDroppedFrameStreakRef.current,
            droppedFrameStreakRef.current
          );
        } else {
          droppedFrameStreakRef.current = 0;
        }

        const windowSpan = samples.length > 1 ? now - samples[0].at : 0;
        if (now - lastPublishedAt >= 250) {
          lastPublishedAt = now;
          const p95 = percentile95(samples.map((sample) => sample.delta));
          p95FrameDeltaMsRef.current = p95;
          const nextConfig = controllerRef.current.update({
            now,
            p95FrameDeltaMs:
              windowSpan >= STUDIO_PREVIEW_PERFORMANCE_THRESHOLDS.sampleWindowMs * 0.95
                ? p95
                : 0,
            interacting: interactingRef.current,
          });
          if (configRef.current.mode !== nextConfig.mode) {
            configRef.current = nextConfig;
            setConfig(nextConfig);
          }
          setActiveStudioPreviewPerformanceConfig(nextConfig);
        }
      }

      previousFrameAt = now;
      animationFrameId = requestAnimationFrame(sampleFrame);
    };

    animationFrameId = requestAnimationFrame(sampleFrame);
    return () => {
      cancelAnimationFrame(animationFrameId);
      setActiveStudioPreviewPerformanceConfig(NORMAL_STUDIO_PREVIEW_PERFORMANCE);
    };
  }, []);

  const getMetrics = useCallback(
    () => ({
      p95FrameDeltaMs: p95FrameDeltaMsRef.current,
      maxDroppedFrameStreak: maxDroppedFrameStreakRef.current,
    }),
    []
  );

  const resetMetrics = useCallback(() => {
    p95FrameDeltaMsRef.current = 0;
    droppedFrameStreakRef.current = 0;
    maxDroppedFrameStreakRef.current = 0;
  }, []);

  return { config, getMetrics, resetMetrics };
}
