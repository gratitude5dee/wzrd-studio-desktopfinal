import type { GmiChatMessage } from '@/lib/gmiCloud';
import { DEFAULT_CLIPPER_ANALYSIS_PROMPT } from './settings';
import { enforceUniqueClipCandidates } from './candidateUniqueness';
import { gmiGeminiClient, textPart, type SupabaseFunctionInvoker } from './gmiGeminiClient';
import { normalizeClipCandidates } from './validation';
import { isLikelyYoutubeUrl } from './youtubeImport';
import type { AnalysisContextPackage, ClipCandidateSeed, GmiClipAnalysisInput, GmiClipAnalysisResult, YouTubeViewmapPeak } from './types';

function compactTranscript(input: GmiClipAnalysisInput): string {
  const windows = input.analysisContext?.transcriptWindows ?? [];
  if (windows.length > 0) {
    return windows
      .slice(0, 20)
      .map((window) => `[${window.startSeconds.toFixed(1)}-${window.endSeconds.toFixed(1)}] ${window.reason}: ${window.text}`)
      .join('\n');
  }

  const segments = input.transcript?.segments ?? [];
  if (segments.length === 0) {
    return 'Transcript unavailable.';
  }

  return segments
    .slice(0, 500)
    .map((segment) => `[${segment.startSeconds.toFixed(1)}-${segment.endSeconds.toFixed(1)}] ${segment.text}`)
    .join('\n');
}

export function resolveAnalysisYoutubeUrl(source: GmiClipAnalysisInput['source']): string | undefined {
  return source.url && isLikelyYoutubeUrl(source.url) ? source.url : undefined;
}

export function hasRequiredAnalysisSourceInfo(source: GmiClipAnalysisInput['source']): boolean {
  const duration = source.durationSeconds;
  return (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) || Boolean(resolveAnalysisYoutubeUrl(source));
}

export const MISSING_ANALYSIS_SOURCE_INFO_MESSAGE =
  'Viral analysis needs the video duration or a YouTube source URL. Wait for the video preview to load its metadata, or import the source from a YouTube link, then run analysis again.';

function sourceMetadata(input: GmiClipAnalysisInput) {
  const source = input.source;
  return {
    id: source.id,
    type: source.type,
    name: source.name,
    url: source.url,
    creator: source.creator,
    durationSeconds: source.durationSeconds,
    durationSec: source.durationSeconds,
    sourceMeta: {
      youtubeUrl: resolveAnalysisYoutubeUrl(source),
    },
    width: source.width,
    height: source.height,
    fps: source.fps,
    warning: source.warning,
    localVideoSubmission: 'Raw local file paths are intentionally omitted. Direct full-video analysis is unavailable unless an accessible URI is provided by the app.',
  };
}

function compactSignals(context?: AnalysisContextPackage) {
  return (context?.signals ?? []).map((signal) => ({
    id: signal.id,
    label: signal.label,
    status: signal.status,
    detail: signal.detail,
    count: signal.count,
  }));
}

function compactViewmapPeaks(peaks: YouTubeViewmapPeak[] = []) {
  return peaks.slice(0, 10).map((peak) => ({
    rank: peak.rank,
    peakSeconds: peak.peakSeconds,
    windowStartSeconds: peak.windowStartSeconds,
    windowEndSeconds: peak.windowEndSeconds,
    score: peak.score,
    source: peak.source,
  }));
}

function compactCandidateSeeds(seeds: ClipCandidateSeed[] = []) {
  return seeds.slice(0, 16).map((seed) => ({
    id: seed.id,
    source: seed.source,
    startSeconds: seed.startSeconds,
    endSeconds: seed.endSeconds,
    anchorSeconds: seed.anchorSeconds,
    score: seed.score,
    evidenceLabels: seed.evidenceLabels,
    evidenceSummary: seed.evidenceSummary,
    transcriptExcerpt: seed.transcriptExcerpt,
    viewmapPeakRank: seed.viewmapPeakRank,
    viewmapScore: seed.viewmapScore,
  }));
}

export function buildGmiClipAnalysisMessages(input: GmiClipAnalysisInput): GmiChatMessage[] {
  const frameParts = (input.frameImages ?? []).slice(0, 6).flatMap((image) => [
    textPart(`Representative frame at ${image.timestampSeconds.toFixed(2)}s: ${image.name}`),
    {
      type: 'image_url' as const,
      image_url: { url: image.dataUrl },
    },
  ]);
  const heatmapParts = (input.heatmapImages ?? []).slice(0, 8).map((image) => ({
    type: 'image_url' as const,
    image_url: { url: image.dataUrl },
  }));
  const timestampText = (input.userTimestamps ?? [])
    .map((stamp) => `${stamp.label}: ${stamp.seconds.toFixed(2)}s`)
    .join('\n') || 'No user timestamps supplied.';

  const userText = JSON.stringify(
    {
      task: 'Rank and refine 15-60 second viral short-form clip candidates from a deterministic signal-fusion package.',
      targetCandidateCount:
        input.source.durationSeconds && input.source.durationSeconds >= 85 * 60 && input.source.durationSeconds <= 95 * 60
          ? 'Target 15-20 strong candidates if content supports it.'
          : 'Return only strong candidates; do not pad weak moments.',
      rankingRules: [
        'Treat candidateSeeds as the primary search space. Prefer refining their start/end points over inventing unrelated ranges.',
        'Preserve evidence fields when a candidate is supported by a YouTube viewmap peak, manual timestamp, transcript hook, visual frame, or screenshot fallback.',
        'If no seeds are available, rank the transcript windows, frames, screenshots, timestamps, and notes directly and explain the reduced confidence.',
        'Start slightly before the hook and end immediately after the payoff. Avoid dead air and ranges that need full-video context.',
        'Do not return overlapping candidate variants from the same moment. Pick the best representative clip when windows compete.',
        'Make every title unique and TikTok caption-ready: readable text plus 2 to 4 short ASCII hashtags, with no filename extension.',
      ],
      sourceMetadata: sourceMetadata(input),
      analysisSummary: input.analysisContext?.summary ?? 'No deterministic analysis context was built.',
      analysisSignals: compactSignals(input.analysisContext),
      contextWarnings: input.analysisContext?.warnings ?? [],
      viewmapPeaks: compactViewmapPeaks(input.viewmapPeaks ?? input.analysisContext?.viewmapPeaks),
      candidateSeeds: compactCandidateSeeds(input.candidateSeeds ?? input.analysisContext?.candidateSeeds),
      userTimestamps: timestampText,
      transcript: compactTranscript(input),
      notes: input.notes || 'No extra notes supplied.',
      requiredJsonShape: {
        sourceSummary: 'string',
        clipCandidates: [
          {
            title: 'unique TikTok caption title with readable text, 2 to 4 hashtags, and no file extension',
            hook: 'string',
            startSeconds: 'number',
            endSeconds: 'number',
            durationSeconds: 'number',
            score: '0-100 number',
            reason: 'string',
            archetype: 'string',
            platformFit: ['shorts', 'reels', 'tiktok'],
            transcriptExcerpt: 'string',
            signalBadges: ['viewmap_peak', 'transcript_hook'],
            viewmapScore: '0-100 number or omitted',
            viewmapPeakRank: 'number or omitted',
            evidenceSummary: 'string explaining the strongest signals',
            confidence: '0-100 number',
          },
        ],
        topFiveMustCut: ['string'],
        suggestedPostingOrder: ['string'],
        hookOverlaySuggestions: ['string'],
        editingStrategy: 'string',
        avoidLowPrioritySections: ['string'],
        confidenceNotes: ['string'],
      },
    },
    null,
    2,
  );

  return [
    { role: 'system', content: input.settings.analysisPrompt?.trim() || DEFAULT_CLIPPER_ANALYSIS_PROMPT },
    {
      role: 'user',
      content:
        frameParts.length > 0 || heatmapParts.length > 0
          ? [textPart(userText), ...frameParts, ...heatmapParts]
          : userText,
    },
  ];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isOverlapWarning(value: string): boolean {
  return /\bOverlaps with\b/i.test(value);
}

export async function analyzeVideoWithGmiGemini(
  input: GmiClipAnalysisInput,
  options: { fetchImpl?: typeof fetch; invokeFunction?: SupabaseFunctionInvoker } = {},
): Promise<GmiClipAnalysisResult> {
  if (!hasRequiredAnalysisSourceInfo(input.source)) {
    throw new Error(MISSING_ANALYSIS_SOURCE_INFO_MESSAGE);
  }
  const messages = buildGmiClipAnalysisMessages(input);
  const response = await gmiGeminiClient(input.settings, messages, options);
  const payload = response.json && typeof response.json === 'object' ? (response.json as Record<string, unknown>) : {};
  const normalized = normalizeClipCandidates(payload.clipCandidates, input.source);
  if (normalized.candidates.length === 0 && normalized.errors.length > 0) {
    throw new Error(normalized.errors.join(' '));
  }
  const unique = enforceUniqueClipCandidates(normalized.candidates);

  const warnings = [...normalized.warnings.filter((warning) => !isOverlapWarning(warning)), ...unique.warnings];
  if (input.analysisContext?.warnings.length) {
    warnings.push(...input.analysisContext.warnings);
  }
  if (response.repaired) {
    warnings.push('Analysis JSON needed one local repair pass before parsing.');
  }
  if (normalized.errors.length > 0) {
    warnings.push(...normalized.errors);
  }

  return {
    sourceSummary: readString(payload.sourceSummary, 'AI analyzed the available context package.'),
    clipCandidates: unique.candidates,
    topFiveMustCut: readStringArray(payload.topFiveMustCut),
    suggestedPostingOrder: readStringArray(payload.suggestedPostingOrder),
    hookOverlaySuggestions: readStringArray(payload.hookOverlaySuggestions),
    editingStrategy: readString(payload.editingStrategy, ''),
    avoidLowPrioritySections: readStringArray(payload.avoidLowPrioritySections),
    confidenceNotes: readStringArray(payload.confidenceNotes),
    warnings,
    rawJson: response.json,
  };
}

export const analyzeVideoWithAiProvider = analyzeVideoWithGmiGemini;
