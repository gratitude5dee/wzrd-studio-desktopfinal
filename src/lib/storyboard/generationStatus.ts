export type StoryboardGenerationPhase = 'images' | 'videos';
export type StoryboardGenerationMedia = 'image' | 'video';

export interface StoryboardGenerationShot {
  id: string;
  scene_id?: string | null;
  shot_number?: number | null;
  image_url?: string | null;
  image_status?: string | null;
  image_generation_error?: string | null;
  image_generation_attempts?: number | null;
  video_url?: string | null;
  video_status?: string | null;
  video_generation_error?: string | null;
  video_generation_attempts?: number | null;
  failure_reason?: string | null;
  visual_prompt?: string | null;
}

export interface StoryboardGenerationCounts {
  totalShots: number;
  missingImages: number;
  missingVideos: number;
  failedImages: number;
  failedVideos: number;
  needsAttention: number;
}

export interface StoryboardGenerationProgressSummary extends StoryboardGenerationCounts {
  completedImages: number;
  completedVideos: number;
  completedOutputs: number;
  totalOutputs: number;
  activeOutputs: number;
  progressPercent: number;
}

export interface StoryboardGenerationFailure {
  shotId: string;
  sceneId: string | null;
  shotNumber: number | null;
  media: StoryboardGenerationMedia;
  status: string | null;
  error: string;
  attempts: number;
}

const hasOutput = (url: string | null | undefined) =>
  typeof url === 'string' && url.trim().length > 0;

export const isShotImageComplete = (shot: StoryboardGenerationShot) =>
  shot.image_status === 'completed' && hasOutput(shot.image_url);

export const isShotVideoComplete = (shot: StoryboardGenerationShot) =>
  shot.video_status === 'completed' && hasOutput(shot.video_url);

export const determineStoryboardGenerationPhase = (
  shots: StoryboardGenerationShot[]
): StoryboardGenerationPhase => {
  if (shots.length === 0) return 'images';
  return shots.every(isShotImageComplete) ? 'videos' : 'images';
};

export const getStoryboardShotsToProcess = (
  phase: StoryboardGenerationPhase,
  shots: StoryboardGenerationShot[]
) => {
  if (phase === 'images') {
    return shots.filter((shot) => !isShotImageComplete(shot));
  }

  return shots.filter((shot) => isShotImageComplete(shot) && !isShotVideoComplete(shot));
};

export const buildStoryboardGenerationCounts = (
  shots: StoryboardGenerationShot[]
): StoryboardGenerationCounts => {
  const failedImages = shots.filter((shot) => shot.image_status === 'failed').length;
  const failedVideos = shots.filter((shot) => shot.video_status === 'failed').length;

  return {
    totalShots: shots.length,
    missingImages: shots.filter((shot) => !isShotImageComplete(shot)).length,
    missingVideos: shots.filter((shot) => isShotImageComplete(shot) && !isShotVideoComplete(shot)).length,
    failedImages,
    failedVideos,
    needsAttention: failedImages + failedVideos,
  };
};

export const buildStoryboardProgressSummary = (
  shots: StoryboardGenerationShot[]
): StoryboardGenerationProgressSummary => {
  const counts = buildStoryboardGenerationCounts(shots);
  const completedImages = counts.totalShots - counts.missingImages;
  const completedVideos = completedImages - counts.missingVideos;
  const completedOutputs = Math.max(0, completedImages) + Math.max(0, completedVideos);
  const totalOutputs = counts.totalShots * 2;
  const activeOutputs = shots.reduce(
    (total, shot) =>
      total +
      (shot.image_status === 'queued' || shot.image_status === 'generating' ? 1 : 0) +
      (shot.video_status === 'queued' || shot.video_status === 'generating' ? 1 : 0),
    0
  );

  return {
    ...counts,
    completedImages: Math.max(0, completedImages),
    completedVideos: Math.max(0, completedVideos),
    completedOutputs,
    totalOutputs,
    activeOutputs,
    progressPercent: totalOutputs > 0 ? Math.round((completedOutputs / totalOutputs) * 100) : 0,
  };
};

export const getStoryboardGenerationFailures = (
  shots: StoryboardGenerationShot[]
): StoryboardGenerationFailure[] =>
  shots.flatMap((shot) => {
    const failures: StoryboardGenerationFailure[] = [];

    if (shot.image_status === 'failed') {
      failures.push({
        shotId: shot.id,
        sceneId: shot.scene_id ?? null,
        shotNumber: shot.shot_number ?? null,
        media: 'image',
        status: shot.image_status,
        error: shot.image_generation_error || shot.failure_reason || 'Image generation failed',
        attempts: shot.image_generation_attempts ?? 0,
      });
    }

    if (shot.video_status === 'failed') {
      failures.push({
        shotId: shot.id,
        sceneId: shot.scene_id ?? null,
        shotNumber: shot.shot_number ?? null,
        media: 'video',
        status: shot.video_status,
        error: shot.video_generation_error || shot.failure_reason || 'Video generation failed',
        attempts: shot.video_generation_attempts ?? 0,
      });
    }

    return failures;
  });

export const estimateStoryboardBatchCredits = (
  phase: StoryboardGenerationPhase,
  pendingCount: number,
  costs: { image: number; video: number }
) => pendingCount * (phase === 'images' ? costs.image : costs.video);

export const hasEnoughStoryboardCredits = (
  availableCredits: number | null | undefined,
  requiredCredits: number
) => availableCredits == null || availableCredits >= requiredCredits;

export const buildStoryboardInsufficientCreditsMessage = (
  requiredCredits: number,
  availableCredits: number | null | undefined
) => {
  const available = Math.max(0, Math.floor(availableCredits ?? 0));
  return `Not enough credits for the remaining batch. Required ${Math.ceil(requiredCredits)} / available ${available}.`;
};
