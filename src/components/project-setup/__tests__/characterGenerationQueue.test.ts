import { describe, expect, it } from 'vitest';
import { runCharacterImageGenerationQueue } from '../characterGenerationQueue';
import {
  CHARACTER_GENERATION_TIMEOUT_MESSAGE,
  getStaleCharacterGenerationCutoff,
} from '../characterGenerationWatchdog';

describe('runCharacterImageGenerationQueue', () => {
  it('limits character image generation to three concurrent workers by default', async () => {
    let activeWorkers = 0;
    let maxActiveWorkers = 0;
    const processed: number[] = [];

    await runCharacterImageGenerationQueue([1, 2, 3, 4, 5, 6, 7], async (item) => {
      activeWorkers += 1;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 5));
      processed.push(item);
      activeWorkers -= 1;
    });

    expect(maxActiveWorkers).toBe(3);
    expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('uses a five minute watchdog cutoff for stale character image generations', () => {
    expect(getStaleCharacterGenerationCutoff(Date.parse('2026-07-05T12:10:00.000Z'))).toBe(
      '2026-07-05T12:05:00.000Z'
    );
    expect(CHARACTER_GENERATION_TIMEOUT_MESSAGE).toContain('5 minutes');
  });
});
