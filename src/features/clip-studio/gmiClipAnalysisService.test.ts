import { describe, expect, it } from 'vitest';

import {
  analyzeVideoWithGmiGemini,
  buildGmiClipAnalysisMessages,
  hasRequiredAnalysisSourceInfo,
  MISSING_ANALYSIS_SOURCE_INFO_MESSAGE,
} from './gmiClipAnalysisService';
import { DEFAULT_GMI_GEMINI_SETTINGS } from './settings';
import type { GmiClipAnalysisInput } from './types';

const input: GmiClipAnalysisInput = {
  source: {
    id: 'source-1',
    type: 'local',
    name: 'local.mp4',
    localPath: '/Users/example/private/local.mp4',
    importedAt: '2026-05-25T00:00:00.000Z',
    durationSeconds: 5400,
    status: 'ready',
  },
  settings: {
    ...DEFAULT_GMI_GEMINI_SETTINGS,
    apiKey: 'test-key',
  },
  heatmapImages: [{ id: 'heatmap-1', name: 'graph.png', dataUrl: 'data:image/png;base64,abc' }],
  frameImages: [{ id: 'frame-1', name: 'frame.jpg', timestampSeconds: 120, dataUrl: 'data:image/jpeg;base64,def' }],
  userTimestamps: [{ id: 'stamp-1', label: 'replay peak', seconds: 123 }],
};

describe('GMI clip analysis service', () => {
  it('requires a positive duration or a YouTube URL before analysis', async () => {
    expect(hasRequiredAnalysisSourceInfo(input.source)).toBe(true);
    expect(
      hasRequiredAnalysisSourceInfo({ ...input.source, durationSeconds: undefined, url: 'https://youtu.be/demo' }),
    ).toBe(true);
    expect(
      hasRequiredAnalysisSourceInfo({ ...input.source, durationSeconds: undefined, url: 'https://example.com/video' }),
    ).toBe(false);
    expect(hasRequiredAnalysisSourceInfo({ ...input.source, durationSeconds: Number.NaN })).toBe(false);
    expect(hasRequiredAnalysisSourceInfo({ ...input.source, durationSeconds: 0 })).toBe(false);

    await expect(
      analyzeVideoWithGmiGemini(
        { ...input, source: { ...input.source, durationSeconds: undefined } },
        { invokeFunction: async () => ({ data: {}, error: null }) } as never,
      ),
    ).rejects.toThrow(MISSING_ANALYSIS_SOURCE_INFO_MESSAGE);
  });

  it('sends sourceMeta.youtubeUrl for YouTube sources', () => {
    const messages = buildGmiClipAnalysisMessages({
      ...input,
      source: { ...input.source, type: 'youtube', url: 'https://youtu.be/demo', durationSeconds: undefined },
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('youtubeUrl');
    expect(serialized).toContain('https://youtu.be/demo');
  });

  it('uses the editable viral finder prompt as the system message', () => {
    const customPrompt = 'Find only explosive crowd moments and keep every answer as JSON.';
    const messages = buildGmiClipAnalysisMessages({
      ...input,
      settings: {
        ...input.settings,
        analysisPrompt: customPrompt,
      },
    } as GmiClipAnalysisInput);

    expect(messages[0]).toEqual({ role: 'system', content: customPrompt });
  });

  it('omits raw local paths and sends heatmaps as image_url parts', () => {
    const messages = buildGmiClipAnalysisMessages(input);
    const serialized = JSON.stringify(messages);

    expect(serialized).not.toContain('/Users/example/private/local.mp4');
    expect(serialized).not.toContain('video_url');
    expect(serialized).toContain('image_url');
    expect(serialized).toContain('Representative frame at 120.00s');
    expect(serialized).toContain('Direct full-video analysis is unavailable');
  });

  it('sends deterministic viewmap seeds and transcript windows as the ranking surface', () => {
    const messages = buildGmiClipAnalysisMessages({
      ...input,
      analysisContext: {
        generatedAt: '2026-06-01T00:00:00.000Z',
        summary: '2 deterministic seeds from 3 active signal lanes.',
        signals: [
          { id: 'viewmap', label: 'YouTube viewmap', status: 'ready', detail: 'Viewmap found with 1 replay peak.', count: 1 },
        ],
        warnings: [],
        viewmapPeaks: [
          { id: 'peak-1', rank: 1, peakSeconds: 120, windowStartSeconds: 115, windowEndSeconds: 125, score: 98, source: 'structured' },
        ],
        candidateSeeds: [
          {
            id: 'seed-1',
            source: 'viewmap_peak',
            startSeconds: 112,
            endSeconds: 155,
            anchorSeconds: 120,
            score: 94,
            evidenceLabels: ['viewmap_peak', 'transcript_hook'],
            evidenceSummary: 'Replay peak plus quotable hook.',
            transcriptExcerpt: 'Wait until you see the payoff.',
            viewmapPeakRank: 1,
            viewmapScore: 98,
          },
        ],
        transcriptWindows: [
          { id: 'window-1', startSeconds: 110, endSeconds: 150, reason: 'viewmap peak 1', text: 'Wait until you see the payoff.' },
        ],
      },
    });
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('candidateSeeds');
    expect(serialized).toContain('Replay peak plus quotable hook');
    expect(serialized).toContain('viewmap peak 1');
    expect(serialized).not.toContain('/Users/example/private/local.mp4');
  });

  it('asks GMI for caption-ready unique titles with hashtags', () => {
    const messages = buildGmiClipAnalysisMessages(input);
    const serialized = JSON.stringify(messages);

    expect(serialized).toContain('2 to 4 short ASCII hashtags');
    expect(serialized).toContain('no filename extension');
    expect(serialized).toContain('unique TikTok caption title');
    expect(serialized).toContain('Do not return overlapping candidate variants');
  });

  it('normalizes candidates from a GMI chat-completions response', async () => {
    const invokeFunction = async () => ({
      data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sourceSummary: 'Strong sections around the replay peak.',
                  clipCandidates: [
                    {
                      title: 'Replay peak setup',
                      hook: 'The conflict starts fast',
                      startSeconds: 100,
                      endSeconds: 220,
                      score: 91,
                      signalBadges: ['viewmap_peak'],
                      viewmapScore: 99,
                      viewmapPeakRank: 1,
                      evidenceSummary: 'YouTube replay spike with transcript hook.',
                      confidence: 90,
                      platformFit: ['shorts'],
                    },
                  ],
                  topFiveMustCut: ['Replay peak setup'],
                  suggestedPostingOrder: ['Replay peak setup'],
                  hookOverlaySuggestions: ['He almost missed it'],
                  editingStrategy: 'Start before the peak and end after payoff.',
                  avoidLowPrioritySections: ['Intro'],
                  confidenceNotes: ['Transcript unavailable.'],
                }),
              },
            },
          ],
        },
      error: null,
    });

    const result = await analyzeVideoWithGmiGemini(input, { invokeFunction } as never);

    expect(result.clipCandidates).toHaveLength(1);
    expect(result.clipCandidates[0]).toMatchObject({
      title: 'Replay peak setup',
      durationSeconds: 60,
      signalBadges: ['viewmap_peak'],
      viewmapScore: 99,
      viewmapPeakRank: 1,
      evidenceSummary: 'YouTube replay spike with transcript hook.',
      confidence: 90,
    });
    expect(result.clipCandidates[0].warnings.join(' ')).toMatch(/trimmed/i);
  });

  it('prunes overlapping Gemini variants after normalization', async () => {
    const invokeFunction = async () => ({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                sourceSummary: 'Multiple variants around one replay peak.',
                clipCandidates: [
                  {
                    title: 'Weaker replay setup',
                    hook: 'The setup starts here',
                    startSeconds: 100,
                    endSeconds: 135,
                    score: 82,
                    signalBadges: ['transcript_hook'],
                    evidenceSummary: 'Transcript hook.',
                    confidence: 80,
                  },
                  {
                    title: 'Strongest replay payoff',
                    hook: 'The payoff lands faster',
                    startSeconds: 118,
                    endSeconds: 148,
                    score: 94,
                    signalBadges: ['viewmap_peak'],
                    viewmapScore: 99,
                    viewmapPeakRank: 1,
                    evidenceSummary: 'Viewmap peak.',
                    confidence: 92,
                  },
                  {
                    title: 'Separate later moment',
                    hook: 'A different beat',
                    startSeconds: 220,
                    endSeconds: 250,
                    score: 88,
                  },
                ],
              }),
            },
          },
        ],
      },
      error: null,
    });

    const result = await analyzeVideoWithGmiGemini(input, { invokeFunction } as never);

    expect(result.clipCandidates.map((candidate) => candidate.title)).toEqual([
      'Strongest replay payoff',
      'Separate later moment',
    ]);
    expect(result.clipCandidates[0]).toMatchObject({
      signalBadges: ['viewmap_peak', 'transcript_hook'],
      viewmapScore: 99,
      viewmapPeakRank: 1,
    });
    expect(result.warnings.join(' ')).toContain('Removed 1 overlapping candidate variant');
    expect(result.warnings.join(' ')).not.toContain('Overlaps with');
  });
});
