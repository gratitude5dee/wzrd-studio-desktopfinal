import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushStudioSave,
  resetStudioSaveCoordinatorForTests,
  scheduleStudioSave,
} from './studioSaveCoordinator';

afterEach(() => {
  resetStudioSaveCoordinatorForTests();
  vi.useRealTimers();
});

describe('studioSaveCoordinator', () => {
  it('coalesces schedules from multiple consumers for one project', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    scheduleStudioSave('project-1', save);
    scheduleStudioSave('project-1', save);
    await vi.advanceTimersByTimeAsync(350);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('runs one trailing save requested while another is in flight', async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const save = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(undefined);
    scheduleStudioSave('project-1', save, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduleStudioSave('project-1', save, 0);
    resolveFirst();
    await flushStudioSave('project-1', save);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
