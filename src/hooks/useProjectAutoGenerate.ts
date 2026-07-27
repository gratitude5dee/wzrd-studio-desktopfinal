import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  isRateLimitError,
  processWithAdaptiveConcurrency,
} from '@/utils/processWithAdaptiveConcurrency';
import { extractInsufficientCreditsError, routeToBillingTopUp } from '@/lib/billing-errors';
import {
  buildStoryboardGenerationCounts,
  buildStoryboardInsufficientCreditsMessage,
  determineStoryboardGenerationPhase,
  estimateStoryboardBatchCredits,
  getStoryboardGenerationFailures,
  getStoryboardShotsToProcess,
  hasEnoughStoryboardCredits,
  type StoryboardGenerationPhase,
} from '@/lib/storyboard/generationStatus';

type GenerationPhase = 'idle' | 'images' | 'videos' | 'complete';

interface ShotData {
  id: string;
  scene_id: string;
  shot_number?: number | null;
  image_url: string | null;
  image_status: string;
  image_generation_error?: string | null;
  image_generation_attempts?: number | null;
  video_url: string | null;
  video_status: string;
  video_generation_error?: string | null;
  video_generation_attempts?: number | null;
  failure_reason?: string | null;
  visual_prompt?: string;
}

interface AutoGenerateState {
  phase: GenerationPhase;
  progress: {
    total: number;
    completed: number;
    active: number;
    concurrency: number;
  };
  errors: Array<{ shotId: string; error: string }>;
}

interface StartAutoGenerateOptions {
  imageModelId?: string | null;
  videoModelId?: string | null;
  availableCredits?: number | null;
  imageCreditCost?: number;
  videoCreditCost?: number;
}

const isRetryableError = (error: unknown) => {
  if (isRateLimitError(error)) return true;
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : JSON.stringify(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('temporarily unavailable') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

export function useProjectAutoGenerate(projectId: string) {
  const [state, setState] = useState<AutoGenerateState>({
    phase: 'idle',
    progress: { total: 0, completed: 0, active: 0, concurrency: 0 },
    errors: [],
  });
  const [allShots, setAllShots] = useState<ShotData[]>([]);

  const isRunningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const rateLimitNotifiedRef = useRef(false);

  const fetchAllProjectShots = useCallback(async (): Promise<ShotData[]> => {
    try {
      const { data: scenes, error: scenesError } = await supabase
        .from('scenes')
        .select('id')
        .eq('project_id', projectId);

      if (scenesError) throw scenesError;
      if (!scenes || scenes.length === 0) {
        setAllShots([]);
        return [];
      }

      const sceneIds = scenes.map((scene) => scene.id);
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('id, scene_id, shot_number, image_url, image_status, image_generation_error, image_generation_attempts, video_url, video_status, video_generation_error, video_generation_attempts, failure_reason, visual_prompt')
        .in('scene_id', sceneIds)
        .order('shot_number');

      if (shotsError) throw shotsError;
      const nextShots = (shots || []) as ShotData[];
      setAllShots(nextShots);
      return nextShots;
    } catch (error) {
      console.error('Failed to fetch project shots:', error);
      return [];
    }
  }, [projectId]);

  const markShotsQueued = useCallback(async (phase: StoryboardGenerationPhase, shots: ShotData[]) => {
    const ids = shots.map((shot) => shot.id);
    if (ids.length === 0) return;

    const updates =
      phase === 'images'
        ? {
            image_status: 'queued',
            image_generation_error: null,
            failure_reason: null,
          }
        : {
            video_status: 'queued',
            video_generation_error: null,
            failure_reason: null,
          };

    const { error } = await supabase.from('shots').update(updates).in('id', ids);
    if (error) {
      console.warn('Failed to mark storyboard shots queued:', error);
    }
  }, []);

  const generateImage = useCallback(async (shot: ShotData, modelId?: string | null) => {
    if (!shot.visual_prompt) {
      const { error: promptError } = await supabase.functions.invoke('generate-visual-prompt', {
        body: { shot_id: shot.id },
      });
      if (promptError) {
        const message = promptError.message || 'Failed to generate visual prompt';
        await supabase
          .from('shots')
          .update({
            image_status: 'failed',
            image_generation_error: message,
            failure_reason: message,
          })
          .eq('id', shot.id);
        throw new Error(message);
      }
    }

    const { error } = await supabase.functions.invoke('generate-shot-image', {
      body: { shot_id: shot.id, image_model: modelId || undefined },
    });
    if (error) {
      const insufficient = await extractInsufficientCreditsError(error);
      if (insufficient) {
        routeToBillingTopUp(insufficient);
        throw new Error(
          `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
            insufficient.available
          )}.`
        );
      }
      throw new Error(error.message || 'Failed to generate image');
    }
  }, []);

  const generateVideo = useCallback(async (shot: ShotData, modelId?: string | null) => {
    const { error } = await supabase.functions.invoke('generate-video-from-image', {
      body: {
        shot_id: shot.id,
        image_url: shot.image_url,
        prompt: shot.visual_prompt,
        model_id: modelId || undefined,
        duration: 6,
        resolution: '1920x1080',
        fps: 25,
        generate_audio: true,
      },
    });
    if (error) {
      const insufficient = await extractInsufficientCreditsError(error);
      if (insufficient) {
        routeToBillingTopUp(insufficient);
        throw new Error(
          `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
            insufficient.available
          )}.`
        );
      }
      throw new Error(error.message || 'Failed to generate video');
    }
  }, []);

  const cancelAutoGenerate = useCallback(() => {
    if (!isRunningRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    isRunningRef.current = false;
    setState((prev) => ({
      ...prev,
      phase: 'idle',
      progress: {
        ...prev.progress,
        active: 0,
      },
    }));
    toast.info('Project-wide generation cancelled');
  }, []);

  const startAutoGenerate = useCallback(async (options?: StartAutoGenerateOptions) => {
    if (isRunningRef.current) {
      toast.info('Generation already in progress');
      return;
    }

    const shots = await fetchAllProjectShots();
    if (shots.length === 0) {
      toast.error('No shots found in this project');
      return;
    }

    const phase = determineStoryboardGenerationPhase(shots);
    const shotsToProcess = getStoryboardShotsToProcess(phase, shots) as ShotData[];

    if (shotsToProcess.length === 0) {
      if (phase === 'images') {
        toast.info('All images already generated. Click again to generate videos.');
        setState({
          phase: 'videos',
          progress: { total: 0, completed: 0, active: 0, concurrency: 0 },
          errors: [],
        });
      } else {
        toast.success('All content already generated');
        setState({
          phase: 'complete',
          progress: { total: 0, completed: 0, active: 0, concurrency: 0 },
          errors: [],
        });
      }
      return;
    }

    const requiredCredits = estimateStoryboardBatchCredits(phase, shotsToProcess.length, {
      image: options?.imageCreditCost ?? 0,
      video: options?.videoCreditCost ?? 0,
    });
    if (!hasEnoughStoryboardCredits(options?.availableCredits, requiredCredits)) {
      const message = buildStoryboardInsufficientCreditsMessage(requiredCredits, options?.availableCredits);
      routeToBillingTopUp({
        code: 'insufficient_credits',
        required: requiredCredits,
        available: options?.availableCredits ?? 0,
        top_up_url: '/settings/billing',
      });
      toast.error(message);
      return;
    }

    const initialConcurrency = phase === 'images' ? 4 : 3;
    const abortController = new AbortController();
    abortRef.current = abortController;
    isRunningRef.current = true;
    rateLimitNotifiedRef.current = false;
    await markShotsQueued(phase, shotsToProcess);

    setState({
      phase,
      progress: {
        total: shotsToProcess.length,
        completed: 0,
        active: 0,
        concurrency: initialConcurrency,
      },
      errors: [],
    });

    toast.info(
      `Starting ${phase === 'images' ? 'image' : 'video'} generation for ${shotsToProcess.length} shots`
    );

    const { results, errors } = await processWithAdaptiveConcurrency({
      items: shotsToProcess,
      initialConcurrency,
      minConcurrency: 1,
      maxRetries: 2,
      isCancelled: () => abortController.signal.aborted,
      shouldRetry: isRetryableError,
      onRateLimit: () => {
        if (!rateLimitNotifiedRef.current) {
          rateLimitNotifiedRef.current = true;
          toast.warning('Rate limit detected. Reducing concurrency to stabilize generation.');
        }
      },
      onProgress: ({ completed, active, concurrency }) => {
        setState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            completed,
            active,
            concurrency,
          },
        }));
      },
      processor: async (shot) => {
        if (abortController.signal.aborted) {
          throw new Error('Cancelled');
        }

        if (phase === 'images') {
          await generateImage(shot, options?.imageModelId);
        } else {
          await generateVideo(shot, options?.videoModelId);
        }

        return shot.id;
      },
    });

    const wasCancelled = abortController.signal.aborted;
    const mappedErrors = errors.map((entry) => ({
      shotId: shotsToProcess[entry.itemIndex]?.id ?? 'unknown',
      error: getErrorMessage(entry.error),
    }));
    const successCount = results.filter((entry) => entry?.success).length;

    setState((prev) => ({
      ...prev,
      phase: wasCancelled ? 'idle' : phase === 'images' ? 'videos' : 'complete',
      errors: mappedErrors,
      progress: {
        ...prev.progress,
        active: 0,
      },
    }));

    await fetchAllProjectShots();
    isRunningRef.current = false;
    abortRef.current = null;

    if (wasCancelled) {
      toast.info('Generation cancelled');
      return;
    }

    if (mappedErrors.length > 0) {
      toast.warning(
        `Generated ${successCount}/${shotsToProcess.length} ${phase}. ${mappedErrors.length} failed.`
      );
      return;
    }

    toast.success(
      `${phase === 'images' ? 'Images' : 'Videos'} generated successfully (${successCount}/${shotsToProcess.length})`
    );
  }, [fetchAllProjectShots, generateImage, generateVideo, markShotsQueued]);

  const nextPhase = allShots.length > 0 ? determineStoryboardGenerationPhase(allShots) : 'images';
  const generationCounts = buildStoryboardGenerationCounts(allShots);
  const failures = getStoryboardGenerationFailures(allShots);

  return {
    state,
    allShots,
    generationCounts,
    failures,
    startAutoGenerate,
    cancelAutoGenerate,
    nextPhase,
    isProcessing: isRunningRef.current || (state.phase !== 'idle' && state.phase !== 'complete'),
    fetchAllProjectShots,
  };
}
