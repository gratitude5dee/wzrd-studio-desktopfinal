import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeVideoWithGmiGemini = vi.hoisted(() => vi.fn());

vi.mock('@/features/clip-studio/gmiClipAnalysisService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/clip-studio/gmiClipAnalysisService')>();
  return {
    ...actual,
    analyzeVideoWithAiProvider: analyzeVideoWithGmiGemini,
    analyzeVideoWithGmiGemini,
  };
});

import ClipStudio from './ClipStudio';

describe('ClipStudio analysis signals', () => {
  beforeEach(() => {
    window.localStorage.clear();
    analyzeVideoWithGmiGemini.mockResolvedValue({
      sourceSummary: 'Structured viewmap peak produced one strong candidate.',
      clipCandidates: [
        {
          id: 'candidate-1',
          sourceId: 'video-1',
          title: 'Replay spike',
          hook: 'The payoff lands fast',
          startSeconds: 44,
          endSeconds: 84,
          durationSeconds: 40,
          score: 93,
          reason: 'Replay peak and transcript hook align.',
          archetype: 'viewmap-spike',
          platformFit: ['shorts'],
          include: true,
          source: 'gmi',
          order: 1,
          transcriptExcerpt: 'Wait until you see why this mistake changes everything.',
          signalBadges: ['viewmap_peak', 'transcript_hook'],
          viewmapScore: 100,
          viewmapPeakRank: 1,
          evidenceSummary: 'YouTube replay spike with a strong transcript hook.',
          confidence: 91,
          warnings: [],
        },
      ],
      topFiveMustCut: ['Replay spike'],
      suggestedPostingOrder: ['Replay spike'],
      hookOverlaySuggestions: ['He almost missed it'],
      editingStrategy: 'Start before the viewmap peak.',
      avoidLowPrioritySections: [],
      confidenceNotes: [],
      warnings: [],
      rawJson: {},
    });

    Object.defineProperty(window, 'wzrdDesktop', {
      configurable: true,
      value: {
        isDesktop: true,
        platform: 'darwin',
        validateFfmpegAvailable: vi.fn(async () => ({ available: true, ffmpegPath: '/usr/local/bin/ffmpeg', ffprobeAvailable: true })),
        validateYoutubeDownloaderAvailable: vi.fn(async () => ({ available: true, version: 'yt-dlp 2026.01.01' })),
        downloadYoutubeVideo: vi.fn(async () => ({
          id: 'video-1',
          url: 'https://youtu.be/demo',
          title: 'Viewmap Demo',
          uploader: 'WZRD',
          localPath: '/tmp/viewmap-demo.mp4',
          durationSeconds: 120,
          subtitleText: `WEBVTT

00:00:40.000 --> 00:00:48.000
Wait until you see why this mistake changes everything.
`,
          viewmapStatus: 'found',
          viewmap: [
            { startSeconds: 40, endSeconds: 45, value: 1, normalizedScore: 10 },
            { startSeconds: 45, endSeconds: 50, value: 10, normalizedScore: 100 },
            { startSeconds: 50, endSeconds: 55, value: 3, normalizedScore: 30 },
          ],
        })),
        getVideoMetadata: vi.fn(async () => ({ durationSeconds: 120, width: 1920, height: 1080, fps: 30 })),
        extractRepresentativeFrames: vi.fn(async () => [
          { id: 'frame-1', name: 'peak frame', timestampSeconds: 47.5, dataUrl: 'data:image/jpeg;base64,frame' },
        ]),
        resolveMediaFileUrl: vi.fn(async () => 'wzrd://media/viewmap-demo.mp4'),
        selectExportFolder: vi.fn(async () => '/tmp/exports'),
        exportVerticalClip: vi.fn(async () => ({ outputPath: '/tmp/exports/clip.mp4' })),
        cutClip: vi.fn(async () => ({ outputPath: '/tmp/exports/clip.mp4' })),
        generateThumbnail: vi.fn(async () => ({ outputPath: '/tmp/exports/clip.jpg' })),
        onFfmpegProgress: vi.fn(() => () => undefined),
        onYoutubeDownloadProgress: vi.fn(() => () => undefined),
      },
    });
  });

  afterEach(() => {
    analyzeVideoWithGmiGemini.mockReset();
    window.localStorage.clear();
    Reflect.deleteProperty(window, 'wzrdDesktop');
  });

  it('does not render provider names in Clipper UI copy', async () => {
    render(<ClipStudio showAppHeader={false} />);

    await waitFor(() => expect(window.wzrdDesktop?.validateFfmpegAvailable).toHaveBeenCalled());
    expect(screen.queryByText(/gemini/i)).not.toBeInTheDocument();
  });

  it('renders analysis signal statuses and passes viewmap seeds to analysis', async () => {
    render(<ClipStudio showAppHeader={false} />);

    expect(screen.getByText('Analysis Signals')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Paste YouTube URL/i), { target: { value: 'https://youtu.be/demo' } });
    fireEvent.click(screen.getByRole('button', { name: /Download & Analyze/i }));

    expect(await screen.findByText(/Viewmap found: 1 replay peak/i)).toBeInTheDocument();
    expect((await screen.findAllByText('Replay spike')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewmap peak').length).toBeGreaterThan(0);

    await waitFor(() => expect(analyzeVideoWithGmiGemini).toHaveBeenCalled());
    const analysisInput = analyzeVideoWithGmiGemini.mock.calls[0][0];
    expect(analysisInput.candidateSeeds[0]).toMatchObject({
      source: 'viewmap_peak',
      viewmapPeakRank: 1,
      viewmapScore: 100,
    });
  }, 10000);

  it('renders only the strongest unique candidate when analysis returns overlapping variants', async () => {
    analyzeVideoWithGmiGemini.mockResolvedValueOnce({
      sourceSummary: 'Overlapping variants should collapse.',
      clipCandidates: [
        {
          id: 'candidate-weak',
          sourceId: 'video-1',
          title: 'Weaker replay setup',
          hook: 'The setup starts here',
          startSeconds: 44,
          endSeconds: 74,
          durationSeconds: 30,
          score: 82,
          reason: 'Transcript hook.',
          archetype: 'viewmap-spike',
          platformFit: ['shorts'],
          include: true,
          source: 'gmi',
          order: 1,
          transcriptExcerpt: 'Wait until you see why this mistake changes everything.',
          signalBadges: ['transcript_hook'],
          evidenceSummary: 'Transcript hook.',
          confidence: 80,
          warnings: [],
        },
        {
          id: 'candidate-strong',
          sourceId: 'video-1',
          title: 'Strongest replay payoff',
          hook: 'The payoff lands faster',
          startSeconds: 52,
          endSeconds: 82,
          durationSeconds: 30,
          score: 95,
          reason: 'Viewmap peak.',
          archetype: 'viewmap-spike',
          platformFit: ['shorts'],
          include: true,
          source: 'gmi',
          order: 2,
          transcriptExcerpt: 'The payoff lands faster.',
          signalBadges: ['viewmap_peak'],
          viewmapScore: 100,
          viewmapPeakRank: 1,
          evidenceSummary: 'Viewmap peak.',
          confidence: 92,
          warnings: [],
        },
      ],
      topFiveMustCut: ['Strongest replay payoff'],
      suggestedPostingOrder: ['Strongest replay payoff'],
      hookOverlaySuggestions: ['He almost missed it'],
      editingStrategy: 'Keep the strongest replay peak.',
      avoidLowPrioritySections: [],
      confidenceNotes: [],
      warnings: [],
      rawJson: {},
    });

    const { container } = render(<ClipStudio showAppHeader={false} />);

    fireEvent.change(screen.getByPlaceholderText(/Paste YouTube URL/i), { target: { value: 'https://youtu.be/demo' } });
    fireEvent.click(screen.getByRole('button', { name: /Download & Analyze/i }));

    expect(await screen.findByText(/Overlapping variants should collapse/i)).toBeInTheDocument();
    expect(await screen.findByText(/Removed 1 overlapping candidate variant/i)).toBeInTheDocument();
    expect(screen.getAllByText('Strongest replay payoff').length).toBeGreaterThan(0);
    expect(container.querySelector('[title^="Weaker replay setup"]')).toBeNull();
  }, 10000);

  it('exports included clips with unique readable TikTok caption filenames', async () => {
    analyzeVideoWithGmiGemini.mockResolvedValueOnce({
      sourceSummary: 'Two duplicate moments should export with unique caption filenames.',
      clipCandidates: [
        {
          id: 'candidate-1',
          sourceId: 'video-1',
          title: 'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou',
          hook: 'The first drop lands fast',
          startSeconds: 44,
          endSeconds: 84,
          durationSeconds: 40,
          score: 93,
          reason: 'Replay peak and transcript hook align.',
          archetype: 'viewmap-spike',
          platformFit: ['shorts', 'tiktok'],
          include: true,
          source: 'gmi',
          order: 1,
          transcriptExcerpt: 'Wait until you see why this mistake changes everything.',
          signalBadges: ['viewmap_peak'],
          viewmapScore: 100,
          viewmapPeakRank: 1,
          evidenceSummary: 'YouTube replay spike with a strong transcript hook.',
          confidence: 91,
          warnings: [],
        },
        {
          id: 'candidate-2',
          sourceId: 'video-1',
          title: 'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou',
          hook: 'The second payoff keeps the energy moving',
          startSeconds: 88,
          endSeconds: 118,
          durationSeconds: 30,
          score: 89,
          reason: 'Adjacent replay peak and payoff.',
          archetype: 'viewmap-spike',
          platformFit: ['shorts', 'tiktok'],
          include: true,
          source: 'gmi',
          order: 2,
          transcriptExcerpt: 'The crowd hears the trance line come back.',
          signalBadges: ['viewmap_peak'],
          viewmapScore: 92,
          viewmapPeakRank: 2,
          evidenceSummary: 'Second replay spike with clear payoff.',
          confidence: 87,
          warnings: [],
        },
      ],
      topFiveMustCut: ['Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou'],
      suggestedPostingOrder: ['Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou'],
      hookOverlaySuggestions: ['He brought trance back'],
      editingStrategy: 'Start before each replay peak.',
      avoidLowPrioritySections: [],
      confidenceNotes: [],
      warnings: [],
      rawJson: {},
    });

    render(<ClipStudio showAppHeader={false} />);

    fireEvent.change(screen.getByPlaceholderText(/Paste YouTube URL/i), { target: { value: 'https://youtu.be/demo' } });
    fireEvent.click(screen.getByRole('button', { name: /Download & Analyze/i }));

    expect(await screen.findByText(/Two duplicate moments/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export included/i }));

    const desktop = window.wzrdDesktop as unknown as {
      exportVerticalClip: ReturnType<typeof vi.fn>;
      generateThumbnail: ReturnType<typeof vi.fn>;
    };

    await waitFor(() => expect(desktop.exportVerticalClip).toHaveBeenCalledTimes(2));
    expect(desktop.exportVerticalClip.mock.calls.map(([params]) => params.outputPath)).toEqual([
      '/tmp/exports/Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou.mp4',
      '/tmp/exports/Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou #Part2.mp4',
    ]);
    expect(desktop.exportVerticalClip.mock.calls.map(([params]) => params.clipTitle)).toEqual([
      'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou',
      'Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou #Part2',
    ]);
    expect(desktop.generateThumbnail.mock.calls.map(([params]) => params.outputPath)).toEqual([
      '/tmp/exports/Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou.jpg',
      '/tmp/exports/Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou #Part2.jpg',
    ]);
    expect(await screen.findAllByText('Tiesto taking it back to his trance roots #Tiesto #Trance #ForYou #Part2')).not.toHaveLength(0);
  }, 10000);

  it('skips overlapping included ranges before sending clips to local ffmpeg export', async () => {
    render(<ClipStudio showAppHeader={false} />);

    fireEvent.change(screen.getByPlaceholderText(/Paste YouTube URL/i), { target: { value: 'https://youtu.be/demo' } });
    fireEvent.click(screen.getByRole('button', { name: /Download & Analyze/i }));

    expect(await screen.findByText(/Structured viewmap peak produced one strong candidate/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add range/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add range/i }));
    fireEvent.click(screen.getByRole('button', { name: /Export included/i }));

    const desktop = window.wzrdDesktop as unknown as {
      exportVerticalClip: ReturnType<typeof vi.fn>;
    };

    await waitFor(() => expect(desktop.exportVerticalClip).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByText(/Excluded from export because it overlaps/i)).not.toHaveLength(0);
  }, 10000);
});
