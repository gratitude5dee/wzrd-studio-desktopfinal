import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useDirectorCutMock, setActiveProjectMock } = vi.hoisted(() => ({
  useDirectorCutMock: vi.fn(),
  setActiveProjectMock: vi.fn(),
}));

vi.mock('@/components/AppHeader', () => ({
  default: () => <div data-testid="app-header" />,
}));

vi.mock('@/services/supabaseService', () => ({
  supabaseService: {
    projects: {
      find: vi.fn(async () => ({ id: 'project-1', title: 'Test Project' })),
    },
  },
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: () => ({
    setActiveProject: setActiveProjectMock,
  }),
}));

vi.mock('@/hooks/useDirectorCut', () => ({
  STAGE_LABELS: {
    idle: 'Idle',
    syncing_assets: 'Syncing timeline assets',
    preflighting_assets: 'Checking media URLs',
    submitting_to_provider: 'Submitting to provider',
    provider_processing: 'Provider processing',
    fallback_processing: 'Editframe fallback',
    downloading_assets: 'Downloading assets',
    uploading_final_video: 'Uploading final video',
    failed: 'Failed',
    completed: 'Completed',
  },
  useDirectorCut: useDirectorCutMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import DirectorCutPage from './DirectorCutPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/projects/project-1/directors-cut']}>
      <Routes>
        <Route path="/projects/:projectId/directors-cut" element={<DirectorCutPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('DirectorCutPage', () => {
  beforeEach(() => {
    setActiveProjectMock.mockReset();
    useDirectorCutMock.mockReset();
    useDirectorCutMock.mockReturnValue({
      summary: {
        totalShots: 1,
        syncedAssets: 1,
        visualAssets: 1,
        readyShots: 1,
        readyVideos: 0,
        fallbackImages: 1,
        missingShots: 0,
        missingShotDetails: [],
        audioAssets: 0,
        canExport: true,
        blockingReason: null,
      },
      job: {
        jobId: 'job-failed',
        status: 'failed',
        progress: 50,
        stage: 'failed',
        error: 'Fal render failed; Editframe fallback failed: render rejected. Fal error: bad source',
        provider: 'editframe_remote',
        providerStatus: 'failed',
        providerJobId: 'editframe-render-1',
        fallbackUsed: true,
        renderer: 'editframe/render-api',
        falRequestId: 'fal-request-1',
        falError: 'bad source',
        fallbackReason: 'fal_failed',
        fallbackStatus: 'failed',
        fallbackError: 'render rejected',
        failedShotCount: 1,
        debugSummary: {
          stage: 'failed',
          renderer: 'editframe/render-api',
          falRequestId: 'fal-request-1',
          fallbackStatus: 'failed',
          fallbackError: 'render rejected',
          falError: 'bad source',
          failedShotCount: 1,
        },
        providerPayload: {
          stage: 'failed',
          renderer: 'editframe/render-api',
        },
        shotFailures: [
          { assetId: 'asset-1', orderIndex: 0, reason: 'URL range preflight failed (403)' },
        ],
        partialSuccess: false,
      },
      error: 'Fal render failed; Editframe fallback failed: render rejected. Fal error: bad source',
      isSyncing: false,
      isStarting: false,
      isPolling: false,
      syncAssets: vi.fn(async () => null),
      startDirectorCut: vi.fn(async () => null),
    });
  });

  it('renders fal and Editframe failure diagnostics from polling status', () => {
    renderPage();

    expect(screen.getByText("Director's Cut failed")).toBeInTheDocument();
    expect(screen.getByText('Render diagnostics')).toBeInTheDocument();
    expect(screen.getByText('editframe/render-api')).toBeInTheDocument();
    expect(screen.getByText('fal-request-1')).toBeInTheDocument();
    expect(screen.getByText('editframe-render-1')).toBeInTheDocument();
    expect(screen.getAllByText('render rejected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bad source').length).toBeGreaterThan(0);
    expect(screen.getByText('Shot #1: URL range preflight failed (403)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy debug details/i })).toBeInTheDocument();
  });

  it('disables export and shows missing-shot preflight details', () => {
    useDirectorCutMock.mockReturnValue({
      summary: {
        totalShots: 2,
        syncedAssets: 1,
        visualAssets: 1,
        readyShots: 1,
        readyVideos: 1,
        fallbackImages: 0,
        missingShots: 1,
        missingShotDetails: [
          {
            shotId: 'shot-2',
            sceneId: 'scene-1',
            sceneNumber: 1,
            shotNumber: 2,
            reason: 'Missing shot image or video',
          },
        ],
        audioAssets: 0,
        canExport: false,
        blockingReason:
          "1 ordered shot is missing an image or video. Generate all visuals before starting Director's Cut.",
      },
      job: null,
      error: null,
      isSyncing: false,
      isStarting: false,
      isPolling: false,
      syncAssets: vi.fn(async () => null),
      startDirectorCut: vi.fn(async () => null),
    });

    renderPage();

    expect(screen.getByText('Full-cut export is blocked')).toBeInTheDocument();
    expect(screen.getByText(/Scene 1, shot 2: Missing shot image or video/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start director/i })).toBeDisabled();
  });
});
