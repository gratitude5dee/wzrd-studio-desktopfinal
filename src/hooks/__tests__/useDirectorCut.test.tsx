import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirectorCut } from '@/hooks/useDirectorCut';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

describe('useDirectorCut', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.info.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs then starts and polls a director cut job to completion', async () => {
    let statusCalls = 0;
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 5,
              syncedAssets: 5,
              readyVideos: 3,
              fallbackImages: 2,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: {
            jobId: 'job-1',
            progress: 8,
            provider: 'fal',
            providerStatus: 'queued',
            fallbackUsed: false,
          },
          error: null,
        };
      }

      if (action === 'status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              status: 'processing',
              progress: 52,
              provider: 'fal',
              providerStatus: 'IN_PROGRESS',
              providerPayload: { stage: 'provider_processing' },
              fallbackUsed: false,
            },
            error: null,
          };
        }
        return {
          data: {
            status: 'completed',
            progress: 100,
            outputUrl: 'https://cdn.example.com/final.mp4',
            provider: 'fal',
            providerStatus: 'COMPLETED',
            providerPayload: { stage: 'completed' },
            fallbackUsed: false,
          },
          error: null,
        };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    // After startDirectorCut resolves, the first immediate poll has already run,
    // so the stage reflects the first status poll's provider_payload.stage.
    expect(result.current.job?.status).toBe('processing');
    expect(result.current.job?.jobId).toBe('job-1');
    expect(result.current.job?.stage).toBe('provider_processing');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.status).toBe('completed');
    expect(result.current.job?.outputUrl).toBe('https://cdn.example.com/final.mp4');
    expect(result.current.job?.stage).toBe('completed');
    expect(result.current.isPolling).toBe(false);
  });

  it('surfaces sync errors', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'sync failed' },
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      const response = await result.current.syncAssets();
      expect(response).toBeNull();
    });

    expect(result.current.error).toBe('sync failed');
  });

  it('extracts stage from provider payload during polling', async () => {
    let statusCalls = 0;
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 3,
              syncedAssets: 3,
              readyVideos: 3,
              fallbackImages: 0,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: { jobId: 'job-stages', progress: 5, provider: 'fal', providerStatus: 'queued' },
          error: null,
        };
      }

      if (action === 'status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              status: 'processing',
              progress: 20,
              providerPayload: { stage: 'submitting_to_provider' },
            },
            error: null,
          };
        }
        if (statusCalls === 2) {
          return {
            data: {
              status: 'processing',
              progress: 50,
              providerPayload: { stage: 'provider_processing' },
            },
            error: null,
          };
        }
        return {
          data: {
            status: 'completed',
            progress: 100,
            outputUrl: 'https://cdn.example.com/final.mp4',
            providerPayload: { stage: 'completed' },
          },
          error: null,
        };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    // The first immediate poll has already run, so stage is 'submitting_to_provider'
    expect(result.current.job?.stage).toBe('submitting_to_provider');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.stage).toBe('provider_processing');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.stage).toBe('completed');
    expect(result.current.job?.status).toBe('completed');
  });

  it('reports partial success with shot failures', async () => {
    let statusCalls = 0;
    const shotFailures = [
      { assetId: 'asset-2', orderIndex: 1, reason: 'Download failed: 404 Not Found' },
    ];

    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 4,
              syncedAssets: 4,
              readyVideos: 2,
              fallbackImages: 2,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: { jobId: 'job-partial', progress: 5, provider: 'fal' },
          error: null,
        };
      }

      if (action === 'status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return {
            data: {
              status: 'completed',
              progress: 100,
              outputUrl: 'https://cdn.example.com/partial.mp4',
              providerPayload: {
                stage: 'completed',
                partialSuccess: true,
                shotFailures,
                failedShotCount: 1,
                totalShots: 4,
              },
            },
            error: null,
          };
        }
        return { data: {}, error: null };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.job?.status).toBe('completed');
    expect(result.current.job?.outputUrl).toBe('https://cdn.example.com/partial.mp4');
    expect(result.current.job?.partialSuccess).toBe(true);
    expect(result.current.job?.shotFailures).toHaveLength(1);
    expect(result.current.job?.shotFailures?.[0].assetId).toBe('asset-2');
    expect(result.current.job?.shotFailures?.[0].reason).toBe('Download failed: 404 Not Found');

    // Verify partial success toast
    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining('1 shot(s) skipped')
    );
  });

  it('normalizes failed polling diagnostics from fal and Editframe fallback', async () => {
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      const action = args.body.action;
      if (action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 1,
              syncedAssets: 1,
              readyVideos: 0,
              fallbackImages: 1,
              missingShots: 0,
            },
          },
          error: null,
        };
      }

      if (action === 'create') {
        return {
          data: { jobId: 'job-failed', progress: 5, provider: 'fal_remote', providerStatus: 'queued' },
          error: null,
        };
      }

      if (action === 'status') {
        return {
          data: {
            status: 'failed',
            progress: 50,
            error: 'Fal render failed; Editframe fallback failed: render rejected. Fal error: bad source',
            provider: 'editframe_remote',
            providerStatus: 'failed',
            providerJobId: 'editframe-render-1',
            fallbackUsed: true,
            providerPayload: {
              stage: 'failed',
              renderer: 'editframe/render-api',
              falRequestId: 'fal-request-1',
              falError: 'bad source',
              fallbackReason: 'fal_failed',
              fallbackStatus: 'failed',
              fallbackError: 'render rejected',
              failedShotCount: 1,
              shotFailures: [
                { assetId: 'asset-1', orderIndex: 0, reason: 'URL range preflight failed (403)' },
              ],
            },
          },
          error: null,
        };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.startDirectorCut();
    });

    expect(result.current.job?.status).toBe('failed');
    expect(result.current.job?.renderer).toBe('editframe/render-api');
    expect(result.current.job?.falRequestId).toBe('fal-request-1');
    expect(result.current.job?.providerJobId).toBe('editframe-render-1');
    expect(result.current.job?.falError).toBe('bad source');
    expect(result.current.job?.fallbackStatus).toBe('failed');
    expect(result.current.job?.fallbackError).toBe('render rejected');
    expect(result.current.job?.failedShotCount).toBe(1);
    expect(result.current.job?.shotFailures).toHaveLength(1);
    expect(result.current.error).toContain('Editframe fallback failed');
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('Editframe fallback failed'));
  });

  it('does not start when no synced assets', async () => {
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      if (args.body.action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 3,
              syncedAssets: 0,
              readyVideos: 0,
              fallbackImages: 0,
              missingShots: 3,
            },
          },
          error: null,
        };
      }
      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      const response = await result.current.startDirectorCut();
      expect(response).toBeNull();
    });

    expect(result.current.error).toBe(
      "3 ordered shots are missing an image or video. Generate all visuals before starting Director's Cut."
    );
    expect(invokeMock).not.toHaveBeenCalledWith('director-cut', {
      body: { action: 'create', projectId: 'project-1' },
    });
  });

  it('blocks audio-only synced assets before creating a job', async () => {
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      if (args.body.action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 2,
              syncedAssets: 1,
              visualAssets: 0,
              readyShots: 0,
              readyVideos: 0,
              fallbackImages: 0,
              missingShots: 2,
              audioAssets: 1,
              canExport: false,
              blockingReason:
                "2 ordered shots are missing an image or video. Generate all visuals before starting Director's Cut.",
            },
          },
          error: null,
        };
      }
      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      const response = await result.current.startDirectorCut();
      expect(response).toBeNull();
    });

    expect(result.current.error).toBe(
      "2 ordered shots are missing an image or video. Generate all visuals before starting Director's Cut."
    );
    expect(invokeMock).not.toHaveBeenCalledWith('director-cut', {
      body: { action: 'create', projectId: 'project-1' },
    });
  });

  it('can retry using already synced assets without another sync call', async () => {
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string } }) => {
      if (args.body.action === 'sync') {
        return {
          data: {
            summary: {
              totalShots: 1,
              syncedAssets: 1,
              readyVideos: 1,
              fallbackImages: 0,
              missingShots: 0,
            },
          },
          error: null,
        };
      }
      if (args.body.action === 'retry') {
        return {
          data: { jobId: 'retry-job', progress: 5, provider: 'fal_remote', providerStatus: 'queued' },
          error: null,
        };
      }
      if (args.body.action === 'status') {
        return {
          data: { status: 'processing', progress: 20, providerPayload: { stage: 'provider_processing' } },
          error: null,
        };
      }
      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      await result.current.syncAssets();
    });

    invokeMock.mockClear();

    await act(async () => {
      await result.current.startDirectorCut({ reuseSyncedAssets: true });
    });

    expect(invokeMock).toHaveBeenCalledWith('director-cut', {
      body: { action: 'retry', projectId: 'project-1' },
    });
    expect(invokeMock).not.toHaveBeenCalledWith('director-cut', {
      body: { action: 'sync', projectId: 'project-1' },
    });
    expect(result.current.job?.jobId).toBe('retry-job');
  });

  it('loads render history and sends completed jobs to the editor', async () => {
    invokeMock.mockImplementation(async (_name: string, args: { body: { action: string; jobId?: string } }) => {
      if (args.body.action === 'history') {
        return {
          data: {
            history: [
              {
                id: 'job-history',
                jobId: 'job-history',
                status: 'completed',
                progress: 100,
                outputUrl: 'https://cdn.example.com/final.mp4',
                provider: 'fal_remote',
                providerStatus: 'completed',
                providerPayload: {
                  stage: 'completed',
                  source: 'director_cut',
                  renderer: 'fal/ffmpeg-api',
                },
                finalAssetId: 'asset-history',
                createdAt: '2026-07-03T12:00:00.000Z',
                completedAt: '2026-07-03T12:03:00.000Z',
              },
            ],
          },
          error: null,
        };
      }

      if (args.body.action === 'send_to_editor') {
        return {
          data: {
            asset: {
              id: 'asset-history',
              file_url: 'https://cdn.example.com/final.mp4',
            },
          },
          error: null,
        };
      }

      return { data: {}, error: null };
    });

    const { result } = renderHook(() => useDirectorCut('project-1'));

    await act(async () => {
      const history = await result.current.loadHistory();
      expect(history).toHaveLength(1);
    });

    expect(result.current.history[0].outputUrl).toBe('https://cdn.example.com/final.mp4');
    expect(result.current.history[0].stage).toBe('completed');
    expect(result.current.history[0].renderer).toBe('fal/ffmpeg-api');

    await act(async () => {
      const asset = await result.current.sendToEditor('job-history');
      expect(asset).toEqual({
        id: 'asset-history',
        file_url: 'https://cdn.example.com/final.mp4',
      });
    });

    expect(invokeMock).toHaveBeenCalledWith('director-cut', {
      body: { action: 'send_to_editor', projectId: 'project-1', jobId: 'job-history' },
    });
  });
});
