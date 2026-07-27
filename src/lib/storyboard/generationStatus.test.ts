import { describe, expect, it } from 'vitest';
import {
  buildStoryboardGenerationCounts,
  buildStoryboardInsufficientCreditsMessage,
  buildStoryboardProgressSummary,
  determineStoryboardGenerationPhase,
  estimateStoryboardBatchCredits,
  getStoryboardGenerationFailures,
  getStoryboardShotsToProcess,
  hasEnoughStoryboardCredits,
  type StoryboardGenerationShot,
} from './generationStatus';

const shot = (overrides: Partial<StoryboardGenerationShot>): StoryboardGenerationShot => ({
  id: overrides.id ?? crypto.randomUUID(),
  scene_id: overrides.scene_id ?? 'scene-1',
  shot_number: overrides.shot_number ?? 1,
  image_url: null,
  image_status: 'pending',
  video_url: null,
  video_status: 'pending',
  failure_reason: null,
  ...overrides,
});

describe('storyboard generation status helpers', () => {
  it('targets only non-completed image shots before the video phase', () => {
    const shots = [
      shot({ id: 'done-image', image_status: 'completed', image_url: 'https://cdn/image.png' }),
      shot({ id: 'missing-image', image_status: 'pending' }),
      shot({ id: 'failed-image', image_status: 'failed', image_generation_error: 'provider timeout' }),
    ];

    expect(determineStoryboardGenerationPhase(shots)).toBe('images');
    expect(getStoryboardShotsToProcess('images', shots).map((entry) => entry.id)).toEqual([
      'missing-image',
      'failed-image',
    ]);
    expect(buildStoryboardGenerationCounts(shots)).toMatchObject({
      totalShots: 3,
      missingImages: 2,
      missingVideos: 1,
      failedImages: 1,
      needsAttention: 1,
    });
  });

  it('targets only image-complete shots with missing videos during the video phase', () => {
    const shots = [
      shot({
        id: 'done-video',
        image_status: 'completed',
        image_url: 'https://cdn/image.png',
        video_status: 'completed',
        video_url: 'https://cdn/video.mp4',
      }),
      shot({
        id: 'missing-video',
        image_status: 'completed',
        image_url: 'https://cdn/image-2.png',
        video_status: 'pending',
      }),
      shot({
        id: 'failed-video',
        image_status: 'completed',
        image_url: 'https://cdn/image-3.png',
        video_status: 'failed',
        video_generation_error: 'queue failed',
        video_generation_attempts: 2,
      }),
    ];

    expect(determineStoryboardGenerationPhase(shots)).toBe('videos');
    expect(getStoryboardShotsToProcess('videos', shots).map((entry) => entry.id)).toEqual([
      'missing-video',
      'failed-video',
    ]);
    expect(getStoryboardGenerationFailures(shots)).toEqual([
      {
        shotId: 'failed-video',
        sceneId: 'scene-1',
        shotNumber: 1,
        media: 'video',
        status: 'failed',
        error: 'queue failed',
        attempts: 2,
      },
    ]);
  });

  it('estimates batch credits and formats insufficient-credit hard-stop messages', () => {
    expect(estimateStoryboardBatchCredits('images', 4, { image: 3, video: 20 })).toBe(12);
    expect(estimateStoryboardBatchCredits('videos', 4, { image: 3, video: 20 })).toBe(80);
    expect(hasEnoughStoryboardCredits(null, 80)).toBe(true);
    expect(hasEnoughStoryboardCredits(79, 80)).toBe(false);
    expect(buildStoryboardInsufficientCreditsMessage(80, 79)).toBe(
      'Not enough credits for the remaining batch. Required 80 / available 79.'
    );
  });

  it('summarizes storyboard output progress across image and video phases', () => {
    const shots = [
      shot({
        id: 'complete',
        image_status: 'completed',
        image_url: 'https://cdn/image.png',
        video_status: 'completed',
        video_url: 'https://cdn/video.mp4',
      }),
      shot({
        id: 'image-only',
        image_status: 'completed',
        image_url: 'https://cdn/image-2.png',
        video_status: 'generating',
      }),
      shot({
        id: 'waiting-image',
        image_status: 'queued',
        video_status: 'pending',
      }),
    ];

    expect(buildStoryboardProgressSummary(shots)).toMatchObject({
      totalShots: 3,
      completedImages: 2,
      completedVideos: 1,
      completedOutputs: 3,
      totalOutputs: 6,
      activeOutputs: 2,
      progressPercent: 50,
      missingImages: 1,
      missingVideos: 1,
    });
  });
});
