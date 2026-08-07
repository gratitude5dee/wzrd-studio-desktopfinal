import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileVideo,
  FolderOpen,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import AppHeader from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getDesktopBridge } from '@/lib/desktop';
import { fitSelection, zoomAroundTime } from '@/lib/editor/timelineZoom';
import {
  analyzeVideoWithAiProvider,
  hasRequiredAnalysisSourceInfo,
  MISSING_ANALYSIS_SOURCE_INFO_MESSAGE,
} from '@/features/clip-studio/gmiClipAnalysisService';
import {
  buildCaptionTitleTargets,
  buildExistingCaptionCollisionInputs,
  buildUniqueClipCaptionTitles,
  captionTitleSourceFromVideo,
  type UniqueClipCaptionTitle,
} from '@/features/clip-studio/captionTitles';
import { enforceUniqueClipCandidates } from '@/features/clip-studio/candidateUniqueness';
import {
  buildAnalysisContextPackage,
  detectYouTubeViewmapPeaks,
  selectFrameTimestampsForAnalysis,
} from '@/features/clip-studio/analysisContext';
import { buildClipperExportReadiness, getUsableBrandLogoPath } from '@/features/clip-studio/exportReadiness';
import { createAutoSegments, createClipStudioId } from '@/features/clip-studio/segmentation';
import { DEFAULT_AI_ANALYSIS_SETTINGS, DEFAULT_CLIPPER_ANALYSIS_PROMPT, loadClipStudioSettings, saveClipStudioSettings } from '@/features/clip-studio/settings';
import { listExportedClips, saveExportedClip, deleteExportedClip } from '@/features/clip-studio/localLibrary';
import { createDownloadedYoutubeSource, formatTranscriptForEditor, isLikelyYoutubeUrl, parseVttTranscript } from '@/features/clip-studio/youtubeImport';
import {
  clampClipperPixelsPerSecond,
  createClipperTimelineLayout,
  getClipperZoomPreset,
  resolveClipperPointerTime,
  CLIPPER_FRAME_PIXELS_PER_SECOND,
  CLIPPER_MIN_PIXELS_PER_SECOND,
  CLIPPER_SECOND_PIXELS_PER_SECOND,
  type ClipperZoomPreset,
} from '@/features/clip-studio/timelineLayout';
import {
  createTimestampClipCandidates,
  normalizeClipLengthRange,
  parseTimestamp,
  parseTimestampRanges,
} from '@/features/clip-studio/validation';
import type {
  ClipCandidate,
  ClipStudioMode,
  ClipStudioPlatformPreset,
  AiAnalysisSettings,
  AnalysisSignalStatus,
  DesktopFfmpegStatus,
  DesktopFfmpegProgress,
  DesktopYoutubeDownloadProgress,
  ExportedClip,
  HeatmapImageInput,
  RepresentativeFrameInput,
  Transcript,
  UserTimestampInput,
  VideoSource,
  YouTubeViewmapPeak,
} from '@/features/clip-studio/types';

const PANEL_CLASS = 'rounded-2xl border border-white/10 bg-zinc-950/72 shadow-[0_18px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl';
const FIELD_CLASS = 'border-white/10 bg-black/35 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-orange-500/40';

function secondsToClock(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe % 1) * 10);
  const base = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
  return ms > 0 ? `${base}.${ms}` : base;
}

function filePathToUrl(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  return encodeURI(`file://${filePath}`);
}

function basenameFromPath(filePath?: string): string {
  if (!filePath) return '';
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });
}

async function seekElementTo(element: HTMLVideoElement, seconds: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while seeking video for frame capture.'));
    }, 4000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener('seeked', onSeeked);
      element.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video seek failed during frame capture.'));
    };
    element.addEventListener('seeked', onSeeked, { once: true });
    element.addEventListener('error', onError, { once: true });
    element.currentTime = Math.max(0, Math.min(seconds, Number.isFinite(element.duration) ? element.duration : seconds));
  });
}

function buildTranscript(text: string, source?: VideoSource): Transcript | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const segments = trimmed
    .split('\n')
    .map((line, index) => {
      const match = line.match(/^\s*\[?([0-9:.]+)\s*(?:-|–|to)\s*([0-9:.]+)\]?\s*(.*)$/i);
      if (!match) {
        return {
          id: `manual-${index}`,
          startSeconds: 0,
          endSeconds: source?.durationSeconds ?? 0,
          text: line.trim(),
        };
      }
      return {
        id: `manual-${index}`,
        startSeconds: parseTimestamp(match[1]),
        endSeconds: parseTimestamp(match[2]),
        text: match[3]?.trim() || line.trim(),
      };
    })
    .filter((segment) => segment.text && Number.isFinite(segment.startSeconds) && Number.isFinite(segment.endSeconds));
  return segments.length > 0 ? { segments } : undefined;
}

function parseTimestampNotes(text: string): UserTimestampInput[] {
  return text
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^(.*?)(?:@|\s)([0-9]+(?::[0-9]{1,2}){0,2}(?:\.[0-9]+)?)$/);
      const seconds = parseTimestamp(match?.[2] ?? trimmed);
      if (!Number.isFinite(seconds)) return null;
      return {
        id: `timestamp-${index}`,
        label: match?.[1]?.trim() || `Timestamp ${index + 1}`,
        seconds,
      };
    })
    .filter((entry): entry is UserTimestampInput => Boolean(entry));
}

function withoutOverlapWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !/^Overlaps with\b/i.test(warning) && !/^Removed overlapping variants\b/i.test(warning) && !/^Excluded from export because it overlaps\b/i.test(warning));
}

function StatPill({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warn' }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2',
        tone === 'success'
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
          : tone === 'warn'
            ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
            : 'border-white/10 bg-white/[0.04] text-zinc-200',
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ReadinessRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-200">{label}</p>
        <p className="truncate text-[11px] text-zinc-500">{value}</p>
      </div>
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', ready ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.75)]' : 'bg-amber-300/80')} />
    </div>
  );
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => setWidth(Math.max(0, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function clipSourceLabel(source: ClipCandidate['source']): string {
  switch (source) {
    case 'gmi':
      return 'AI';
    case 'timestamp':
      return 'Timestamp';
    case 'auto':
      return 'Auto';
    case 'manual':
      return 'Manual';
    default:
      return source;
  }
}

function clipSourceClass(source: ClipCandidate['source']): string {
  switch (source) {
    case 'gmi':
      return 'border-orange-300/35 bg-orange-400/20 text-orange-50';
    case 'timestamp':
      return 'border-emerald-300/35 bg-emerald-400/16 text-emerald-50';
    case 'auto':
      return 'border-cyan-300/35 bg-cyan-400/16 text-cyan-50';
    case 'manual':
      return 'border-zinc-300/25 bg-white/[0.06] text-zinc-200';
    default:
      return 'border-white/10 bg-white/[0.05] text-zinc-300';
  }
}

function signalStatusClass(status: AnalysisSignalStatus['status']): string {
  switch (status) {
    case 'ready':
      return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-50';
    case 'fallback':
      return 'border-cyan-300/20 bg-cyan-400/10 text-cyan-50';
    case 'warning':
      return 'border-amber-300/25 bg-amber-400/10 text-amber-50';
    case 'missing':
    default:
      return 'border-white/10 bg-white/[0.035] text-zinc-300';
  }
}

function signalStatusDot(status: AnalysisSignalStatus['status']): string {
  switch (status) {
    case 'ready':
      return 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.75)]';
    case 'fallback':
      return 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.6)]';
    case 'warning':
      return 'bg-amber-300';
    case 'missing':
    default:
      return 'bg-zinc-600';
  }
}

function viewmapStatusText(source: VideoSource | null, viewmapPeaks: YouTubeViewmapPeak[]): string {
  if (!source) return 'Transcript/frame-only';
  if ((source.viewmap?.length ?? 0) > 0) {
    return `Viewmap found: ${viewmapPeaks.length} replay peak${viewmapPeaks.length === 1 ? '' : 's'}`;
  }
  if (source.type === 'youtube') return 'Viewmap unavailable from YouTube';
  return 'Transcript/frame-only';
}

function evidenceLabelText(label: string): string {
  switch (label) {
    case 'viewmap_peak':
      return 'Viewmap peak';
    case 'manual_timestamp':
      return 'Manual';
    case 'transcript_hook':
      return 'Transcript hook';
    case 'visual_frame':
      return 'Frame';
    case 'screenshot_heatmap':
      return 'Screenshot fallback';
    default:
      return label.replace(/[_-]+/g, ' ');
  }
}

function evidenceBadgeClass(label: string): string {
  switch (label) {
    case 'viewmap_peak':
      return 'border-orange-300/25 bg-orange-400/12 text-orange-100';
    case 'manual_timestamp':
      return 'border-emerald-300/25 bg-emerald-400/12 text-emerald-100';
    case 'transcript_hook':
      return 'border-cyan-300/25 bg-cyan-400/12 text-cyan-100';
    case 'visual_frame':
      return 'border-violet-300/25 bg-violet-400/12 text-violet-100';
    case 'screenshot_heatmap':
      return 'border-amber-300/25 bg-amber-400/12 text-amber-100';
    default:
      return 'border-white/10 bg-white/[0.05] text-zinc-300';
  }
}

function PreviewScrubber({
  candidates,
  viewmapPeaks,
  durationSeconds,
  fps,
  playheadSeconds,
  selectedCandidate,
  isPlaying,
  canPlay,
  onSeek,
  onSelect,
  onTogglePlay,
}: {
  candidates: ClipCandidate[];
  viewmapPeaks: YouTubeViewmapPeak[];
  durationSeconds: number;
  fps?: number;
  playheadSeconds: number;
  selectedCandidate: ClipCandidate | null;
  isPlaying: boolean;
  canPlay: boolean;
  onSeek: (seconds: number) => void;
  onSelect: (id: string) => void;
  onTogglePlay: () => void;
}) {
  const [trackRef, trackWidth] = useElementWidth<HTMLDivElement>();
  const safeDuration = Math.max(1, durationSeconds || selectedCandidate?.endSeconds || 1);
  const viewportWidth = Math.max(1, trackWidth);
  const pixelsPerSecond = getClipperZoomPreset('fit', { durationSeconds: safeDuration, viewportWidth, fps });
  const layout = useMemo(() => createClipperTimelineLayout({
    candidates,
    durationSeconds: safeDuration,
    fps,
    pixelsPerSecond,
    scrollLeft: 0,
    viewportWidth,
    playheadSeconds,
  }), [candidates, fps, pixelsPerSecond, playheadSeconds, safeDuration, viewportWidth]);

  const secondsFromPointer = useCallback((clientX: number, disableSnapping = false) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return resolveClipperPointerTime({
      localX: clientX - rect.left,
      scrollLeft: 0,
      pixelsPerSecond,
      durationSeconds: safeDuration,
      fps,
      candidates,
      disableSnapping,
    });
  }, [candidates, fps, pixelsPerSecond, safeDuration, trackRef]);

  const seekFromPointer = (event: ReactPointerEvent) => {
    onSeek(secondsFromPointer(event.clientX, event.shiftKey || event.altKey || event.metaKey));
  };

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 border-white/10 bg-white/[0.04] text-zinc-100"
          disabled={!canPlay}
          onClick={onTogglePlay}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">
              {selectedCandidate?.title ?? 'Source preview'}
            </p>
            {selectedCandidate && (
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]', clipSourceClass(selectedCandidate.source))}>
                {clipSourceLabel(selectedCandidate.source)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {secondsToClock(playheadSeconds)} / {secondsToClock(safeDuration)}
            {selectedCandidate ? ` · ${secondsToClock(selectedCandidate.startSeconds)}-${secondsToClock(selectedCandidate.endSeconds)}` : ''}
          </p>
        </div>
      </div>
      <div
        ref={trackRef}
        className="relative mt-3 h-9 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(90deg,rgba(39,39,42,.75),rgba(10,10,12,.95))]"
        onPointerDown={seekFromPointer}
      >
        <div
          className="absolute bottom-0 top-0 z-30 w-px bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.9)]"
          style={{ left: `${Math.min(layout.contentWidth, layout.playheadX)}px` }}
        />
        {viewmapPeaks.map((peak) => (
          <span
            key={peak.id}
            className="absolute top-0 h-full w-0.5 bg-orange-300/80 shadow-[0_0_10px_rgba(251,146,60,.8)]"
            style={{ left: `${Math.min(layout.contentWidth, (peak.peakSeconds / safeDuration) * layout.contentWidth)}px` }}
            title={`YouTube viewmap peak #${peak.rank}: ${secondsToClock(peak.peakSeconds)} (${peak.score}/100)`}
          />
        ))}
        {candidates.map((candidate) => {
          const clip = layout.clips.find((entry) => entry.id === candidate.id);
          if (!clip) return null;
          return (
            <button
              key={candidate.id}
              type="button"
              className={cn(
                'absolute top-1 h-7 rounded-md border shadow-sm transition hover:brightness-125',
                clipSourceClass(candidate.source),
                candidate.id === selectedCandidate?.id && 'ring-2 ring-cyan-300/70',
              )}
              style={{ left: `${clip.left}px`, width: `${clip.width}px` }}
              title={`${candidate.title}: ${secondsToClock(candidate.startSeconds)}-${secondsToClock(candidate.endSeconds)}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(candidate.id);
                onSeek(candidate.startSeconds);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ClipTimeline({
  candidates,
  viewmapPeaks,
  durationSeconds,
  fps,
  playheadSeconds,
  selectedId,
  onSeek,
  onSelect,
  onChangeRange,
  onToggleInclude,
  onDelete,
}: {
  candidates: ClipCandidate[];
  viewmapPeaks: YouTubeViewmapPeak[];
  durationSeconds: number;
  fps?: number;
  playheadSeconds: number;
  selectedId: string | null;
  onSeek: (seconds: number) => void;
  onSelect: (id: string) => void;
  onChangeRange: (id: string, edge: 'start' | 'end', seconds: number) => void;
  onToggleInclude: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [trackRef, viewportWidth] = useElementWidth<HTMLDivElement>();
  const dragRef = useRef<{ id: string; edge: 'start' | 'end' } | null>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const previousDurationRef = useRef<number>(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(CLIPPER_MIN_PIXELS_PER_SECOND);
  const safeDuration = Math.max(1, durationSeconds || 1);
  const safeFps = Math.max(1, fps || 30);
  const layout = useMemo(() => createClipperTimelineLayout({
    candidates,
    durationSeconds: safeDuration,
    fps: safeFps,
    pixelsPerSecond,
    scrollLeft,
    viewportWidth: Math.max(1, viewportWidth),
    playheadSeconds,
  }), [candidates, pixelsPerSecond, playheadSeconds, safeDuration, safeFps, scrollLeft, viewportWidth]);

  useEffect(() => {
    if (viewportWidth <= 0) return;
    if (Math.abs(previousDurationRef.current - safeDuration) < 0.001) return;
    previousDurationRef.current = safeDuration;
    const nextZoom = getClipperZoomPreset('fit', { durationSeconds: safeDuration, viewportWidth, fps: safeFps });
    pendingScrollRef.current = 0;
    setScrollLeft(0);
    setPixelsPerSecond(nextZoom);
  }, [safeDuration, safeFps, viewportWidth]);

  useEffect(() => {
    if (pendingScrollRef.current === null || !trackRef.current) return;
    const nextScroll = Math.max(0, pendingScrollRef.current);
    trackRef.current.scrollLeft = nextScroll;
    setScrollLeft(nextScroll);
    pendingScrollRef.current = null;
  }, [pixelsPerSecond, trackRef]);

  const secondsFromPointer = useCallback((clientX: number, disableSnapping = false) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return resolveClipperPointerTime({
      localX: clientX - rect.left,
      scrollLeft,
      pixelsPerSecond,
      durationSeconds: safeDuration,
      fps: safeFps,
      candidates,
      disableSnapping,
    });
  }, [candidates, pixelsPerSecond, safeDuration, safeFps, scrollLeft, trackRef]);

  const setZoom = useCallback((nextPixelsPerSecond: number, anchorSeconds = playheadSeconds) => {
    const viewport = Math.max(1, trackRef.current?.clientWidth ?? viewportWidth);
    const next = clampClipperPixelsPerSecond(nextPixelsPerSecond);
    const result = zoomAroundTime({
      currentPixelsPerSecond: pixelsPerSecond,
      nextPixelsPerSecond: next,
      anchorTimeMs: Math.max(0, anchorSeconds) * 1000,
      viewportAnchorX: viewport / 2,
    });
    pendingScrollRef.current = result.scrollLeft;
    setPixelsPerSecond(result.pixelsPerSecond);
  }, [pixelsPerSecond, playheadSeconds, trackRef, viewportWidth]);

  const setPreset = useCallback((preset: ClipperZoomPreset) => {
    const viewport = Math.max(1, trackRef.current?.clientWidth ?? viewportWidth);
    if (preset === 'fit') {
      pendingScrollRef.current = 0;
      setPixelsPerSecond(getClipperZoomPreset('fit', { durationSeconds: safeDuration, viewportWidth: viewport, fps: safeFps }));
      return;
    }
    setZoom(getClipperZoomPreset(preset, { durationSeconds: safeDuration, viewportWidth: viewport, fps: safeFps }));
  }, [safeDuration, safeFps, setZoom, trackRef, viewportWidth]);

  const fitSelected = useCallback(() => {
    const selected = candidates.find((candidate) => candidate.id === selectedId);
    if (!selected) {
      setPreset('fit');
      return;
    }
    const viewport = Math.max(1, trackRef.current?.clientWidth ?? viewportWidth);
    const next = clampClipperPixelsPerSecond(fitSelection(selected.startSeconds * 1000, selected.endSeconds * 1000, viewport));
    setZoom(next, (selected.startSeconds + selected.endSeconds) / 2);
  }, [candidates, selectedId, setPreset, setZoom, trackRef, viewportWidth]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom(pixelsPerSecond * 1.5);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      setZoom(pixelsPerSecond / 1.5);
      return;
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      if (event.shiftKey) {
        setPreset('fit');
      } else {
        fitSelected();
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      onSeek(Math.max(0, Math.min(safeDuration, playheadSeconds + direction / safeFps)));
    }
  }, [fitSelected, onSeek, pixelsPerSecond, playheadSeconds, safeDuration, safeFps, setPreset, setZoom]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      onChangeRange(dragRef.current.id, dragRef.current.edge, secondsFromPointer(event.clientX, event.shiftKey || event.altKey || event.metaKey));
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [onChangeRange, secondsFromPointer]);

  return (
    <div className="space-y-4" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Timeline precision</p>
          <p className="text-xs text-zinc-300">
            {layout.mode === 'frames' ? 'Frame-level cuts' : layout.mode === 'seconds' ? 'Second-level cuts' : 'Minute overview'}
            <span className="text-zinc-600"> · Shift-drag disables snapping</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['fit', 'min', 'sec', 'frame'] as const).map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                'h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-zinc-200 hover:bg-white/[0.07]',
                ((preset === 'min' && pixelsPerSecond <= CLIPPER_MIN_PIXELS_PER_SECOND + 0.001)
                  || (preset === 'sec' && Math.abs(pixelsPerSecond - CLIPPER_SECOND_PIXELS_PER_SECOND) < 0.001)
                  || (preset === 'frame' && pixelsPerSecond >= CLIPPER_FRAME_PIXELS_PER_SECOND)
                  || (preset === 'fit' && layout.contentWidth <= Math.max(1, viewportWidth) + 1))
                  && 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100',
              )}
              onClick={() => setPreset(preset)}
            >
              {preset === 'fit' ? 'Fit' : preset === 'min' ? 'Min' : preset === 'sec' ? 'Sec' : 'Frame'}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-zinc-200 hover:bg-white/[0.07]"
            onClick={() => setZoom(pixelsPerSecond / 1.5)}
          >
            -
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-zinc-200 hover:bg-white/[0.07]"
            onClick={() => setZoom(pixelsPerSecond * 1.5)}
          >
            +
          </Button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-28 overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 bg-[linear-gradient(90deg,rgba(39,39,42,.85),rgba(12,12,14,.9))] outline-none"
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        onPointerDown={(event) => onSeek(secondsFromPointer(event.clientX, event.shiftKey || event.altKey || event.metaKey))}
      >
        <div className="relative h-full" style={{ width: `${layout.contentWidth}px` }}>
          <div className="absolute inset-x-0 top-0 h-7 border-b border-white/5">
            {layout.ticks.map((tick) => (
              <div
                key={`${tick.timeMs}-${tick.kind}`}
                className={cn(
                  'absolute top-0 h-full border-l',
                  tick.kind === 'major' ? 'border-white/18' : tick.kind === 'frame' ? 'border-cyan-200/12' : 'border-white/8',
                )}
                style={{ left: `${tick.x + scrollLeft}px` }}
              >
                {tick.label && (
                  <span className="ml-2 whitespace-nowrap text-[10px] text-zinc-500">{tick.label}</span>
                )}
              </div>
            ))}
          </div>
          <div
            className="absolute bottom-0 top-0 z-20 w-px bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.8)]"
            style={{ left: `${layout.playheadX}px` }}
          />
          {viewmapPeaks.map((peak) => (
            <div
              key={peak.id}
              className="absolute bottom-1 top-7 z-10 w-0.5 bg-orange-300/75 shadow-[0_0_12px_rgba(251,146,60,.75)]"
              style={{ left: `${(peak.peakSeconds / safeDuration) * layout.contentWidth}px` }}
              title={`YouTube viewmap peak #${peak.rank}: ${secondsToClock(peak.peakSeconds)} (${peak.score}/100)`}
            >
              <span className="absolute -top-5 -translate-x-1/2 rounded-full border border-orange-300/25 bg-orange-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-100">
                P{peak.rank}
              </span>
            </div>
          ))}
          {candidates.map((candidate) => {
            const clip = layout.clips.find((entry) => entry.id === candidate.id);
            if (!clip) return null;
            const selected = candidate.id === selectedId;
            return (
              <button
                key={candidate.id}
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelect(candidate.id);
                  onSeek(candidate.startSeconds);
                }}
                className={cn(
                  'absolute top-10 h-12 min-w-8 rounded-lg border text-left shadow-lg transition',
                  candidate.include
                    ? clipSourceClass(candidate.source)
                    : 'border-zinc-500/30 bg-zinc-800/55 text-zinc-500',
                  selected && 'ring-2 ring-cyan-300/70',
                )}
                style={{ left: `${clip.left}px`, width: `${clip.width}px` }}
                title={`${candidate.title}: ${secondsToClock(candidate.startSeconds)}-${secondsToClock(candidate.endSeconds)}`}
              >
                <span className="block truncate px-3 py-2 text-xs font-semibold">{candidate.title}</span>
                <span className="block truncate px-3 text-[10px] uppercase tracking-[0.12em] opacity-75">
                  {clipSourceLabel(candidate.source)}
                </span>
                <span
                  className="absolute bottom-0 left-0 top-0 w-3 cursor-ew-resize rounded-l-lg bg-white/35"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragRef.current = { id: candidate.id, edge: 'start' };
                    onSelect(candidate.id);
                  }}
                />
                <span
                  className="absolute bottom-0 right-0 top-0 w-3 cursor-ew-resize rounded-r-lg bg-white/35"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragRef.current = { id: candidate.id, edge: 'end' };
                    onSelect(candidate.id);
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        {candidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] p-5 text-sm text-zinc-500">
            Generate viral candidates or Auto Clip segments to populate the timeline.
          </div>
        ) : (
          candidates.map((candidate) => (
            <div
              key={candidate.id}
              className={cn(
                'grid gap-3 rounded-xl border p-3 transition md:grid-cols-[1fr_auto]',
                candidate.id === selectedId ? 'border-cyan-300/45 bg-cyan-300/8' : 'border-white/10 bg-white/[0.035]',
              )}
            >
              <button type="button" onClick={() => onSelect(candidate.id)} className="min-w-0 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white">{candidate.title}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]', clipSourceClass(candidate.source))}>
                    {clipSourceLabel(candidate.source)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {secondsToClock(candidate.startSeconds)}-{secondsToClock(candidate.endSeconds)} · {candidate.durationSeconds.toFixed(1)}s
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-400">{candidate.hook}</p>
                {candidate.signalBadges && candidate.signalBadges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {candidate.signalBadges.slice(0, 4).map((badge) => (
                      <span key={badge} className={cn('rounded-full border px-2 py-0.5 text-[10px]', evidenceBadgeClass(badge))}>
                        {evidenceLabelText(badge)}
                      </span>
                    ))}
                  </div>
                )}
                {candidate.warnings.length > 0 && (
                  <p className="mt-1 text-xs text-amber-200">{candidate.warnings[0]}</p>
                )}
              </button>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-200" onClick={() => onToggleInclude(candidate.id)}>
                  {candidate.include ? 'Include' : 'Excluded'}
                </Button>
                <Button size="icon" variant="ghost" className="text-zinc-500 hover:text-rose-300" onClick={() => onDelete(candidate.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface ClipStudioProps {
  showAppHeader?: boolean;
}

export default function ClipStudio({ showAppHeader = true }: ClipStudioProps = {}) {
  const desktop = getDesktopBridge();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const browserFileInputRef = useRef<HTMLInputElement | null>(null);
  const heatmapInputRef = useRef<HTMLInputElement | null>(null);

  const [settings, setSettings] = useState<AiAnalysisSettings>(() => {
    try {
      return loadClipStudioSettings();
    } catch {
      return DEFAULT_AI_ANALYSIS_SETTINGS;
    }
  });
  const [mode, setMode] = useState<ClipStudioMode>(settings.defaultMode);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [timestampText, setTimestampText] = useState('');
  const [heatmaps, setHeatmaps] = useState<HeatmapImageInput[]>([]);
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [analysisSignals, setAnalysisSignals] = useState<AnalysisSignalStatus[]>([]);
  const [viewmapPeaks, setViewmapPeaks] = useState<YouTubeViewmapPeak[]>([]);
  const [capturedFrameCount, setCapturedFrameCount] = useState(0);
  const [status, setStatus] = useState<string>('Ready for a local video or YouTube context package.');
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDownloadingYoutube, setIsDownloadingYoutube] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<DesktopFfmpegProgress | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<DesktopFfmpegStatus | null>(null);
  const [isCheckingFfmpeg, setIsCheckingFfmpeg] = useState(false);
  const [exportQueue, setExportQueue] = useState<{ current: number; total: number; clipTitle?: string; detail?: string } | null>(null);
  const [youtubeProgress, setYoutubeProgress] = useState<DesktopYoutubeDownloadProgress | null>(null);
  const [library, setLibrary] = useState<ExportedClip[]>(() => listExportedClips());
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [verticalExport, setVerticalExport] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [videoPreviewError, setVideoPreviewError] = useState<string | null>(null);
  const [logoPreviewError, setLogoPreviewError] = useState<string | null>(null);
  const [isResolvingLogoUrl, setIsResolvingLogoUrl] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );
  const sourceDuration = source?.durationSeconds ?? selectedCandidate?.endSeconds ?? 0;
  const includedCount = candidates.filter((candidate) => candidate.include).length;
  const timestampInputs = useMemo(() => parseTimestampNotes(timestampText), [timestampText]);
  const timestampRangeText = useMemo(
    () => [timestampText, transcriptText].filter((value) => value.trim()).join('\n'),
    [timestampText, transcriptText],
  );
  const timestampRangeResult = useMemo(
    () => parseTimestampRanges(timestampRangeText, source ?? undefined),
    [timestampRangeText, source],
  );
  const transcriptForSignals = useMemo(
    () => (source ? buildTranscript(transcriptText, source) : undefined),
    [source, transcriptText],
  );
  const previewViewmapPeaks = useMemo(
    () => (source ? detectYouTubeViewmapPeaks(source.viewmap ?? [], source) : []),
    [source],
  );
  const previewAnalysisSignals = useMemo<AnalysisSignalStatus[]>(() => {
    if (!source) {
      return [
        { id: 'viewmap', label: 'YouTube viewmap', status: 'missing', detail: 'Import a YouTube source to read structured viewmap data.', count: 0 },
        { id: 'screenshots', label: 'Most replayed screenshot fallback', status: 'missing', detail: 'No screenshot fallback attached.', count: 0 },
        { id: 'transcript', label: 'Transcript windows', status: 'missing', detail: 'Paste captions or download YouTube subtitles.', count: 0 },
        { id: 'frames', label: 'Representative frames', status: 'missing', detail: 'Frames are captured when Analyze runs.', count: 0 },
      ];
    }
    return buildAnalysisContextPackage({
      source,
      transcript: transcriptForSignals,
      heatmapImages: heatmaps,
      frameImages: [],
      userTimestamps: timestampInputs,
      notes,
    }).signals;
  }, [heatmaps, notes, source, timestampInputs, transcriptForSignals]);
  const visibleAnalysisSignals = analysisSignals.length > 0 ? analysisSignals : previewAnalysisSignals;
  const visibleViewmapPeaks = viewmapPeaks.length > 0 ? viewmapPeaks : previewViewmapPeaks;
  const visibleViewmapStatus = viewmapStatusText(source, visibleViewmapPeaks);
  const sourceReady = Boolean(source?.localPath);
  const exportFolderReady = Boolean(settings.exportFolder.trim());
  const ffmpegReady = Boolean(ffmpegStatus?.available && ffmpegStatus.ffprobeAvailable);
  const exportReadiness = useMemo(
    () => buildClipperExportReadiness({
      sourceReady,
      exportFolderReady,
      ffmpegReady,
      includedCount,
      brandLogoPath: settings.brandLogoPath,
      brandLogoUrl: logoUrl,
      isBrandLogoResolving: isResolvingLogoUrl,
    }),
    [sourceReady, exportFolderReady, ffmpegReady, includedCount, settings.brandLogoPath, logoUrl, isResolvingLogoUrl],
  );
  const exportReady = exportReadiness.exportReady;
  const usableBrandLogoPath = useMemo(
    () => getUsableBrandLogoPath({
      verticalExport,
      brandLogoPath: settings.brandLogoPath,
      brandLogoUrl: logoUrl,
    }),
    [verticalExport, settings.brandLogoPath, logoUrl],
  );
  const exportQueuePercent = exportQueue?.total
    ? Math.round(((Math.max(0, exportQueue.current - 1) + (progress?.percent ?? 0) / 100) / exportQueue.total) * 100)
    : progress?.percent ?? 0;

  useEffect(() => {
    return desktop?.onFfmpegProgress?.((next) => {
      setProgress(next);
      setExportQueue((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          clipTitle: next.clipTitle ?? prev.clipTitle,
          detail: next.stage === 'failed' ? next.detail ?? next.stderrTail ?? next.message : prev.detail,
        };
      });
    });
  }, [desktop]);

  useEffect(() => {
    return desktop?.onYoutubeDownloadProgress?.((next) => setYoutubeProgress(next));
  }, [desktop]);

  useEffect(() => {
    let cancelled = false;
    if (!desktop?.validateFfmpegAvailable) {
      setFfmpegStatus(null);
      return;
    }

    setIsCheckingFfmpeg(true);
    void desktop.validateFfmpegAvailable({ ffmpegPath: settings.ffmpegPathOverride || undefined })
      .then((next) => {
        if (!cancelled) setFfmpegStatus(next);
      })
      .catch((ffmpegError) => {
        if (!cancelled) {
          setFfmpegStatus({
            available: false,
            ffprobeAvailable: false,
            error: ffmpegError instanceof Error ? ffmpegError.message : 'ffmpeg validation failed.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsCheckingFfmpeg(false);
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, settings.ffmpegPathOverride]);

  useEffect(() => {
    let cancelled = false;

    const resolvePreviewUrl = async () => {
      setVideoPreviewError(null);
      if (source?.objectUrl) {
        setVideoUrl(source.objectUrl);
        return;
      }
      if (!source?.localPath) {
        setVideoUrl(undefined);
        return;
      }

      try {
        if (desktop?.resolveMediaFileUrl) {
          const resolvedUrl = await desktop.resolveMediaFileUrl({ filePath: source.localPath });
          if (!cancelled) {
            setVideoUrl(resolvedUrl);
          }
          return;
        }

        if (!cancelled) {
          setVideoUrl(filePathToUrl(source.localPath));
        }
      } catch (previewError) {
        if (!cancelled) {
          setVideoUrl(undefined);
          setVideoPreviewError(previewError instanceof Error ? previewError.message : 'Video preview is unavailable for this local file.');
        }
      }
    };

    void resolvePreviewUrl();

    return () => {
      cancelled = true;
    };
  }, [desktop, source?.localPath, source?.objectUrl]);

  useEffect(() => {
    let cancelled = false;

    const resolveLogoUrl = async () => {
      if (!settings.brandLogoPath) {
        setLogoUrl(undefined);
        setLogoPreviewError(null);
        setIsResolvingLogoUrl(false);
        return;
      }

      setIsResolvingLogoUrl(true);
      setLogoPreviewError(null);
      try {
        if (desktop?.resolveMediaFileUrl) {
          const resolvedUrl = await desktop.resolveMediaFileUrl({ filePath: settings.brandLogoPath });
          if (!cancelled) setLogoUrl(resolvedUrl);
          return;
        }
        if (!cancelled) setLogoUrl(filePathToUrl(settings.brandLogoPath));
      } catch (logoError) {
        if (!cancelled) {
          setLogoUrl(undefined);
          setLogoPreviewError(logoError instanceof Error ? logoError.message : 'Logo preview is unavailable.');
        }
      } finally {
        if (!cancelled) setIsResolvingLogoUrl(false);
      }
    };

    void resolveLogoUrl();

    return () => {
      cancelled = true;
    };
  }, [desktop, settings.brandLogoPath]);

  useEffect(() => {
    setIsPlaying(false);
    setPlayhead(0);
  }, [videoUrl]);

  useEffect(() => {
    if (!selectedId && candidates.length > 0) {
      setSelectedId(candidates[0].id);
    }
  }, [candidates, selectedId]);

  const persistSettings = useCallback((next: AiAnalysisSettings) => {
    const saved = saveClipStudioSettings(next);
    setSettings(saved);
    setMode(saved.defaultMode);
    toast.success('Clipper settings saved');
  }, []);

  const updateSetting = <K extends keyof AiAnalysisSettings>(key: K, value: AiAnalysisSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectDesktopVideo = async () => {
    if (!desktop?.selectVideoFile) {
      browserFileInputRef.current?.click();
      return;
    }
    setError(null);
    const selection = await desktop.selectVideoFile();
    if (!selection) return;

    const nextSource: VideoSource = {
      id: createClipStudioId('source'),
      type: 'local',
      name: selection.name,
      localPath: selection.path,
      importedAt: new Date().toISOString(),
      status: 'ready',
    };
    setSource(nextSource);
    setCandidates([]);
    setSelectedId(null);
    setAnalysisSignals([]);
    setViewmapPeaks([]);
    setStatus(`Imported ${selection.name}. Reading metadata...`);

    try {
      const metadata = await desktop.getVideoMetadata?.({
        filePath: selection.path,
        ffmpegPath: settings.ffmpegPathOverride || undefined,
      });
      if (metadata) {
        setSource({ ...nextSource, ...metadata });
        setStatus(`Metadata ready: ${secondsToClock(metadata.durationSeconds)}, ${metadata.width ?? '?'}x${metadata.height ?? '?'}.`);
      }
    } catch (metadataError) {
      setError(metadataError instanceof Error ? metadataError.message : 'Metadata read failed.');
      setStatus('Video imported, but local metadata could not be read.');
    }
  };

  const handleSelectLogoFile = async () => {
    if (!desktop?.selectLogoFile) {
      setError('Logo upload is available in the Electron desktop app.');
      return;
    }

    const selection = await desktop.selectLogoFile();
    if (!selection) return;

    const next = saveClipStudioSettings({
      ...settings,
      brandLogoPath: selection.path,
    });
    setSettings(next);
    toast.success('Clipper logo uploaded');
  };

  const handleBrowserVideoSelected = async (file?: File) => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setSource({
      id: createClipStudioId('source'),
      type: 'local',
      name: file.name,
      objectUrl,
      importedAt: new Date().toISOString(),
      status: 'ready',
      warning: 'Browser-selected files can preview here, but desktop ffmpeg export requires a local file path from the desktop picker.',
    });
    setCandidates([]);
    setSelectedId(null);
    setAnalysisSignals([]);
    setViewmapPeaks([]);
    setStatus('Browser video loaded for preview. Use the desktop picker for export-ready local paths.');
  };

  const handleVideoMetadataLoaded = () => {
    const element = videoRef.current;
    if (!element || !source) return;
    if (!source.durationSeconds || !source.width || !source.height) {
      setSource({
        ...source,
        durationSeconds: Number.isFinite(element.duration) && element.duration > 0 ? element.duration : source.durationSeconds,
        width: element.videoWidth,
        height: element.videoHeight,
      });
    }
  };

  const handleDownloadAndAnalyzeYoutube = async () => {
    setError(null);
    if (!isLikelyYoutubeUrl(youtubeUrl)) {
      setError('Enter a valid youtube.com or youtu.be URL.');
      return;
    }
    if (!desktop?.downloadYoutubeVideo || !desktop.validateYoutubeDownloaderAvailable || !desktop.validateFfmpegAvailable) {
      setError('YouTube download requires the WZRD Studio Electron desktop app with the local downloader bridge enabled.');
      return;
    }

    setIsDownloadingYoutube(true);
    setYoutubeProgress(null);
    setCandidates([]);
    setSelectedId(null);
    setAnalysisSummary('');
    setAnalysisWarnings([]);
    setAnalysisSignals([]);
    setViewmapPeaks([]);
    setStatus('Preparing local downloader...');

    try {
      const ffmpeg = await desktop.validateFfmpegAvailable({
        ffmpegPath: settings.ffmpegPathOverride || undefined,
      });
      if (!ffmpeg.available) {
        throw new Error(ffmpeg.error ?? 'ffmpeg is required before downloading and exporting YouTube clips.');
      }

      const downloader = await desktop.validateYoutubeDownloaderAvailable({
        downloaderPath: settings.youtubeDownloaderPathOverride || undefined,
      });
      if (!downloader.available) {
        throw new Error(downloader.error ?? 'yt-dlp is required before downloading YouTube videos.');
      }

      const operationId = createClipStudioId('youtube-download');
      setStatus('Downloading 1080p YouTube video locally...');
      const download = await desktop.downloadYoutubeVideo({
        operationId,
        url: youtubeUrl,
        downloaderPath: settings.youtubeDownloaderPathOverride || undefined,
        ffmpegPath: settings.ffmpegPathOverride || undefined,
      });

      let nextSource = createDownloadedYoutubeSource(download);
      let transcriptOverride = transcriptText;
      const preAnalysisWarnings: string[] = [];
      if (download.viewmapStatus === 'found') {
        setStatus(`Downloaded YouTube video with ${download.viewmap?.length ?? 0} structured viewmap point${download.viewmap?.length === 1 ? '' : 's'}.`);
      } else if (download.viewmapWarning) {
        preAnalysisWarnings.push(download.viewmapWarning);
      }
      if (download.subtitleText) {
        const transcript = parseVttTranscript(download.subtitleText);
        if (transcript.segments.length > 0) {
          transcriptOverride = formatTranscriptForEditor(transcript);
          setTranscriptText(transcriptOverride);
        } else {
          preAnalysisWarnings.push('Downloaded subtitles were present, but no transcript segments could be parsed.');
        }
      } else {
        preAnalysisWarnings.push('YouTube captions were unavailable; analysis used viewmap data when present, frames, screenshots, timestamps, and notes.');
      }

      setSource(nextSource);
      setStatus(`Downloaded ${nextSource.name}. Reading local metadata...`);

      try {
        const metadata = await desktop.getVideoMetadata?.({
          filePath: download.localPath,
          ffmpegPath: settings.ffmpegPathOverride || undefined,
        });
        if (metadata) {
          nextSource = { ...nextSource, ...metadata };
          setSource(nextSource);
        }
      } catch (metadataError) {
        preAnalysisWarnings.push(metadataError instanceof Error ? metadataError.message : 'Metadata read failed after download.');
      }

      await runAiAnalysis(nextSource, transcriptOverride, preAnalysisWarnings);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'YouTube download failed.');
      setStatus('YouTube download failed.');
    } finally {
      setIsDownloadingYoutube(false);
    }
  };

  const handleHeatmapsSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    const images = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: createClipStudioId('heatmap'),
        name: file.name,
        dataUrl: await fileToDataUrl(file),
      })),
    );
    setHeatmaps((prev) => [...prev, ...images].slice(0, 8));
    setAnalysisSignals([]);
  };

  const handleAutoClip = () => {
    if (!source) {
      setError('Import a source before running Auto Clip.');
      return;
    }
    try {
      const segments = createAutoSegments(source);
      setMode('auto');
      setCandidates(segments);
      setAnalysisSummary(`Auto Clip created ${segments.length} continuous 60-second max segment${segments.length === 1 ? '' : 's'}.`);
      setAnalysisWarnings([]);
      setStatus(`Auto Clip ready: ${segments.length} segment${segments.length === 1 ? '' : 's'}.`);
      setError(null);
    } catch (autoError) {
      setError(autoError instanceof Error ? autoError.message : 'Auto Clip failed.');
    }
  };

  const handleClipFromTimestamps = () => {
    if (!source) {
      setError('Import a source before clipping timestamp ranges.');
      return;
    }
    const parsed = parseTimestampRanges(timestampRangeText, source);
    if (parsed.ranges.length === 0) {
      setError(parsed.warnings[0] ?? 'Paste at least one timestamp range before clipping locally.');
      setAnalysisWarnings(parsed.warnings);
      setStatus('Timestamp clipping needs at least one valid start-end range.');
      return;
    }

    const timestampCandidates = createTimestampClipCandidates(parsed.ranges, source, {
      platformPreset: settings.defaultPlatformPreset,
    });
    setCandidates(timestampCandidates);
    setSelectedId(timestampCandidates[0]?.id ?? null);
    setAnalysisSummary(`Created ${timestampCandidates.length} timestamp clip${timestampCandidates.length === 1 ? '' : 's'} locally without cloud analysis.`);
    setAnalysisWarnings(parsed.warnings);
    setStatus(`Timestamp clips ready: ${timestampCandidates.length} range${timestampCandidates.length === 1 ? '' : 's'} mapped to the timeline.`);
    setError(null);
  };

  const handleAnalyze = async () => {
    await runAiAnalysis(source);
  };

  const captureRepresentativeFrames = useCallback(async (
    targetSource: VideoSource | null = source,
    preferredTimestamps?: number[],
  ): Promise<RepresentativeFrameInput[]> => {
    if (
      desktop?.extractRepresentativeFrames
      && targetSource?.localPath
      && targetSource.durationSeconds
    ) {
      try {
        const frames = await desktop.extractRepresentativeFrames({
          operationId: createClipStudioId('frames'),
          sourcePath: targetSource.localPath,
          durationSeconds: targetSource.durationSeconds,
          ffmpegPath: settings.ffmpegPathOverride || undefined,
          timestamps: preferredTimestamps,
        });
        setCapturedFrameCount(frames.length);
        return frames;
      } catch {
        // Fall through to browser canvas capture when desktop frame extraction fails.
      }
    }

    const element = videoRef.current;
    if (!element || !targetSource?.durationSeconds || element.readyState < 1 || !element.videoWidth || !element.videoHeight) {
      setCapturedFrameCount(0);
      return [];
    }

    const previousTime = element.currentTime;
    const wasPaused = element.paused;
    element.pause();

    const canvas = document.createElement('canvas');
    const width = 640;
    const height = Math.max(1, Math.round((element.videoHeight / element.videoWidth) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setCapturedFrameCount(0);
      return [];
    }

    const duration = targetSource.durationSeconds;
    const timestamps = (preferredTimestamps?.length ? preferredTimestamps : [0.15, 0.35, 0.55, 0.75].map((ratio) => duration * ratio))
      .map((timestamp) => Math.max(0.5, Math.min(duration - 0.5, timestamp)))
      .filter((value, index, values) => values.findIndex((candidate) => Math.abs(candidate - value) < 0.5) === index);

    const frames: RepresentativeFrameInput[] = [];
    for (const timestamp of timestamps) {
      try {
        await seekElementTo(element, timestamp);
        context.drawImage(element, 0, 0, width, height);
        frames.push({
          id: createClipStudioId('frame'),
          name: `${targetSource.name} @ ${secondsToClock(timestamp)}`,
          timestampSeconds: timestamp,
          dataUrl: canvas.toDataURL('image/jpeg', 0.82),
        });
      } catch {
        break;
      }
    }

    try {
      await seekElementTo(element, previousTime);
      if (!wasPaused) {
        await element.play();
      }
    } catch {
      element.currentTime = previousTime;
    }

    setCapturedFrameCount(frames.length);
    return frames;
  }, [desktop, settings.ffmpegPathOverride, source]);

  const runAiAnalysis = async (
    targetSource: VideoSource | null = source,
    transcriptOverride = transcriptText,
    preAnalysisWarnings: string[] = [],
  ) => {
    if (!targetSource) {
      setError('Import a source before viral analysis.');
      return;
    }
    if (!hasRequiredAnalysisSourceInfo(targetSource)) {
      setError(MISSING_ANALYSIS_SOURCE_INFO_MESSAGE);
      setStatus('Viral analysis is waiting on video metadata.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setStatus('Gathering analysis signals...');
    try {
      const transcript = buildTranscript(transcriptOverride, targetSource);
      const initialPeaks = detectYouTubeViewmapPeaks(targetSource.viewmap ?? [], targetSource);
      const frameTimestamps = selectFrameTimestampsForAnalysis({
        source: targetSource,
        viewmapPeaks: initialPeaks,
        userTimestamps: timestampInputs,
      });
      setStatus(frameTimestamps.length > 0 ? 'Extracting representative frames around replay peaks...' : 'Extracting representative frames...');
      const frameImages = await captureRepresentativeFrames(targetSource, frameTimestamps);
      setStatus('Building viral candidate seeds from viewmap, transcript, frames, and notes...');
      const analysisContext = buildAnalysisContextPackage({
        source: targetSource,
        transcript,
        heatmapImages: heatmaps,
        frameImages,
        userTimestamps: timestampInputs,
        notes,
      });
      setAnalysisSignals(analysisContext.signals);
      setViewmapPeaks(analysisContext.viewmapPeaks);
      setStatus('Ranking candidate seeds with AI...');
      const result = await analyzeVideoWithAiProvider({
        source: targetSource,
        settings,
        transcript,
        analysisContext,
        viewmapPeaks: analysisContext.viewmapPeaks,
        candidateSeeds: analysisContext.candidateSeeds,
        heatmapImages: heatmaps,
        frameImages,
        userTimestamps: timestampInputs,
        notes,
      });
      setStatus('Normalizing viral candidates...');
      const uniqueResult = enforceUniqueClipCandidates(result.clipCandidates);
      setMode('viral');
      setCandidates(uniqueResult.candidates);
      setSelectedId(uniqueResult.candidates[0]?.id ?? null);
      setAnalysisSummary(result.sourceSummary);
      setAnalysisWarnings([...new Set([...preAnalysisWarnings, ...result.warnings, ...uniqueResult.warnings])]);
      setStatus(`AI ranked ${uniqueResult.candidates.length} unique viral candidate${uniqueResult.candidates.length === 1 ? '' : 's'} from ${analysisContext.candidateSeeds.length} deterministic seed${analysisContext.candidateSeeds.length === 1 ? '' : 's'}.`);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'AI viral analysis failed.');
      setStatus('Viral analysis failed.');
      if (preAnalysisWarnings.length > 0) {
        setAnalysisWarnings(preAnalysisWarnings);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateCandidateRange = useCallback((id: string, edge: 'start' | 'end', seconds: number) => {
    setCandidates((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== id) return candidate;
        const max = sourceDuration || candidate.endSeconds;
        let start = candidate.startSeconds;
        let end = candidate.endSeconds;
        if (edge === 'start') {
          start = Math.max(0, Math.min(seconds, end - 1));
        } else {
          end = Math.min(max, Math.max(seconds, start + 1));
        }
        const existingWarnings = candidate.warnings.filter((warning) => !/shorter than|exceeded \d+ seconds|maximum TikTok/i.test(warning));
        const normalized = normalizeClipLengthRange(start, end, { warnings: existingWarnings });
        return {
          ...candidate,
          startSeconds: normalized.startSeconds,
          endSeconds: normalized.endSeconds,
          durationSeconds: normalized.durationSeconds,
          warnings: normalized.warnings,
        };
      }),
    );
  }, [sourceDuration]);

  const addManualClip = () => {
    if (!source) {
      setError('Import a source before adding a manual clip.');
      return;
    }
    const start = Math.max(0, playhead);
    const rawEnd = Math.min(source.durationSeconds ?? start + 30, start + 30);
    const normalized = normalizeClipLengthRange(start, rawEnd);
    const next: ClipCandidate = {
      id: createClipStudioId('manual'),
      sourceId: source.id,
      title: `This moment needs to be a TikTok`,
      hook: 'Manual selected range',
      startSeconds: normalized.startSeconds,
      endSeconds: normalized.endSeconds,
      durationSeconds: normalized.durationSeconds,
      score: 60,
      reason: 'User-created timeline range.',
      archetype: 'manual-cut',
      platformFit: [settings.defaultPlatformPreset],
      include: true,
      source: 'manual',
      order: candidates.length + 1,
      warnings: normalized.warnings,
    };
    setCandidates((prev) => [...prev, next]);
    setSelectedId(next.id);
  };

  const seekVideo = (seconds: number) => {
    setPlayhead(seconds);
    if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
      videoRef.current.currentTime = Math.min(videoRef.current.duration, Math.max(0, seconds));
    }
  };

  const toggleVideoPlayback = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) {
      void element.play().catch((playError) => {
        setVideoPreviewError(playError instanceof Error ? playError.message : 'Video playback could not start.');
      });
    } else {
      element.pause();
    }
  };

  const copyCandidateMetadata = async (candidate: ClipCandidate) => {
    const metadata = [
      candidate.title,
      `${secondsToClock(candidate.startSeconds)}-${secondsToClock(candidate.endSeconds)} (${candidate.durationSeconds.toFixed(1)}s)`,
      candidate.hook,
      candidate.transcriptExcerpt,
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(metadata);
    toast.success('Clip metadata copied');
  };

  const ensureExportFolder = async (): Promise<string> => {
    if (settings.exportFolder) return settings.exportFolder;
    const selected = await desktop?.selectExportFolder?.();
    if (!selected) {
      throw new Error('Choose an export folder before exporting clips.');
    }
    const next = { ...settings, exportFolder: selected };
    saveClipStudioSettings(next);
    setSettings(next);
    return selected;
  };

  const exportCandidate = async (
    candidate: ClipCandidate,
    exportFolder: string,
    captionTitle: UniqueClipCaptionTitle,
  ): Promise<ExportedClip> => {
    if (!desktop?.exportVerticalClip || !desktop.cutClip || !desktop.generateThumbnail) {
      throw new Error('Desktop ffmpeg bridge is unavailable. Open the Electron desktop app to export local clips.');
    }
    if (!source?.localPath) {
      throw new Error('Export requires a local file path. Re-import the video with the desktop picker.');
    }
    const outputPath = `${exportFolder}/${captionTitle.filenameBase}.mp4`;
    const thumbnailPath = `${exportFolder}/${captionTitle.filenameBase}.jpg`;
    const operationId = createClipStudioId('export');
    const params = {
      operationId,
      sourcePath: source.localPath,
      outputPath,
      startSeconds: candidate.startSeconds,
      durationSeconds: candidate.durationSeconds,
      clipTitle: captionTitle.title,
      logoPath: usableBrandLogoPath,
      logoOpacity: settings.brandLogoOpacity,
      logoIntroSeconds: settings.brandLogoIntroSeconds,
      ffmpegPath: settings.ffmpegPathOverride || undefined,
    };
    if (verticalExport) {
      await desktop.exportVerticalClip(params);
    } else {
      await desktop.cutClip(params);
    }
    await desktop.generateThumbnail({
      operationId: `${operationId}-thumb`,
      sourcePath: source.localPath,
      outputPath: thumbnailPath,
      atSeconds: Math.min(candidate.endSeconds, candidate.startSeconds + 1),
      ffmpegPath: settings.ffmpegPathOverride || undefined,
    });

    return {
      id: createClipStudioId('library'),
      sourceId: source.id,
      candidateId: candidate.id,
      sourceName: source.name,
      sourceUrl: source.url,
      creator: source.creator,
      title: captionTitle.title,
      hook: candidate.hook,
      archetype: candidate.archetype,
      platformFit: candidate.platformFit,
      startSeconds: candidate.startSeconds,
      endSeconds: candidate.endSeconds,
      durationSeconds: candidate.durationSeconds,
      score: candidate.score,
      exportPath: outputPath,
      thumbnailPath,
      captions: settings.captionsDefault ? candidate.transcriptExcerpt : undefined,
      transcriptExcerpt: candidate.transcriptExcerpt,
      createdAt: new Date().toISOString(),
    };
  };

  const handleExportIncluded = async () => {
    const selected = candidates.filter((candidate) => candidate.include);
    if (selected.length === 0) {
      setError('Select at least one included clip before exporting.');
      return;
    }
    setIsExporting(true);
    setError(null);
    setProgress(null);
    try {
      const exportFolder = await ensureExportFolder();
      const uniqueExport = enforceUniqueClipCandidates(selected);
      const exportCandidates = uniqueExport.candidates;
      if (exportCandidates.length === 0) {
        throw new Error('No unique clips remain after overlap checks.');
      }
      const removedBeforeExport = new Map(uniqueExport.removed.map((entry) => [entry.removedId, entry]));
      const uniqueById = new Map(exportCandidates.map((candidate) => [candidate.id, candidate]));
      const captionTitles = buildUniqueClipCaptionTitles({
        clips: buildCaptionTitleTargets(exportCandidates),
        source: captionTitleSourceFromVideo(source),
        ...buildExistingCaptionCollisionInputs(library),
      });
      const captionTitleById = new Map(captionTitles.map((entry) => [entry.id, entry]));
      setCandidates((prev) =>
        prev.map((candidate) => {
          const removed = removedBeforeExport.get(candidate.id);
          if (removed) {
            return {
              ...candidate,
              include: false,
              warnings: [
                ...withoutOverlapWarnings(candidate.warnings),
                `Excluded from export because it overlaps with "${removed.keptTitle}" by ${removed.overlapSeconds} seconds.`,
              ],
            };
          }
          const uniqueCandidate = uniqueById.get(candidate.id);
          const captionTitle = captionTitleById.get(candidate.id);
          if (!uniqueCandidate && !captionTitle) return candidate;
          return {
            ...candidate,
            ...(uniqueCandidate ?? {}),
            title: captionTitle?.title ?? uniqueCandidate?.title ?? candidate.title,
          };
        }),
      );
      if (uniqueExport.removed.length > 0) {
        toast.warning(`Skipped ${uniqueExport.removed.length} overlapping clip variant${uniqueExport.removed.length === 1 ? '' : 's'}`);
      }
      setExportQueue({ current: 0, total: exportCandidates.length, clipTitle: captionTitles[0]?.title });
      let nextLibrary = library;
      for (let index = 0; index < exportCandidates.length; index += 1) {
        const candidate = exportCandidates[index];
        if (!candidate) continue;
        const captionTitle = captionTitleById.get(candidate.id);
        if (!captionTitle) continue;
        const titledCandidate = { ...candidate, title: captionTitle.title };
        setExportQueue((prev) => ({ ...(prev ?? { total: exportCandidates.length }), current: index + 1, total: exportCandidates.length, clipTitle: captionTitle.title, detail: undefined }));
        setStatus(`Exporting ${captionTitle.title}...`);
        const exported = await exportCandidate(titledCandidate, exportFolder, captionTitle);
        nextLibrary = saveExportedClip(exported);
      }
      setLibrary(nextLibrary);
      setStatus(`Exported ${exportCandidates.length} unique clip${exportCandidates.length === 1 ? '' : 's'} to ${exportFolder}${uniqueExport.removed.length > 0 ? `; skipped ${uniqueExport.removed.length} overlapping variant${uniqueExport.removed.length === 1 ? '' : 's'}` : ''}.`);
      setExportQueue((prev) => prev ? { ...prev, current: exportCandidates.length, clipTitle: 'Export complete', detail: undefined } : prev);
      toast.success('Clip export complete');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed.');
      setStatus('Export failed.');
      setExportQueue((prev) => prev ? { ...prev, detail: prev.detail ?? (exportError instanceof Error ? exportError.message : 'Export failed.') } : prev);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteLibraryEntry = (id: string) => {
    setLibrary(deleteExportedClip(id));
  };

  return (
    <div className="flex h-screen flex-col bg-[#08090d] text-zinc-100">
      {showAppHeader && (
        <div className="hidden md:block">
          <AppHeader showShareButton={false} />
        </div>
      )}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-300/25 bg-orange-400/10 text-orange-200">
            <Scissors className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Clipper</p>
            <p className="text-[11px] text-zinc-500">Local video clipping</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-5 py-5 lg:px-7">
          <section className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
            <div className={cn(PANEL_CLASS, 'overflow-hidden p-5')}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-300/25 bg-orange-400/10 text-orange-200">
                      <Scissors className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight text-white">Clipper</h1>
                      <p className="text-sm text-zinc-500">Long-form video clipping for viral cuts and continuous auto segments.</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatPill label="Mode" value={mode === 'viral' ? 'Viral' : 'Auto'} />
                  <StatPill label="Candidates" value={String(candidates.length)} tone={candidates.length ? 'success' : 'neutral'} />
                  <StatPill label="Included" value={String(includedCount)} tone={includedCount ? 'success' : 'warn'} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setMode('viral')}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition',
                      mode === 'viral' ? 'border-orange-300/40 bg-orange-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.055]',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Wand2 className="h-4 w-4 text-orange-200" />
                      Viral Clip Version
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">Signal-fusion analysis from YouTube viewmap peaks, transcript, frames, timestamps, screenshots, and notes.</p>
                  </button>
                  <button
                    type="button"
                    onClick={handleClipFromTimestamps}
                    className="rounded-2xl border border-emerald-300/25 bg-emerald-400/8 p-4 text-left transition hover:bg-emerald-400/12"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Scissors className="h-4 w-4 text-emerald-200" />
                      Timestamp Clips
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">Turns pasted start-end ranges into editable timeline clips without cloud analysis.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('auto')}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition',
                      mode === 'auto' ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.055]',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <RefreshCw className="h-4 w-4 text-cyan-200" />
                      Auto Clip
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">No AI. Splits the imported source into continuous 60-second max segments.</p>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleSelectDesktopVideo} className="bg-orange-500 text-white hover:bg-orange-400">
                    <Upload className="h-4 w-4" />
                    Import video
                  </Button>
                  <input
                    ref={browserFileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => void handleBrowserVideoSelected(event.target.files?.[0])}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  placeholder="Paste YouTube URL to download 1080p MP4 video"
                  className={FIELD_CLASS}
                />
                <Button
                  className="bg-orange-500 text-white hover:bg-orange-400"
                  disabled={isDownloadingYoutube || isAnalyzing}
                  onClick={() => void handleDownloadAndAnalyzeYoutube()}
                >
                  {isDownloadingYoutube || isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download & Analyze
                </Button>
              </div>
            </div>

            <div className={cn(PANEL_CLASS, 'p-5')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Source</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{source?.name ?? 'No source loaded'}</h2>
                </div>
                {source?.status === 'unsupported' ? (
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">Metadata only</span>
                ) : source ? (
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">Ready</span>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <StatPill label="Duration" value={source?.durationSeconds ? secondsToClock(source.durationSeconds) : 'Unknown'} />
                <StatPill label="Frame" value={source?.width && source?.height ? `${source.width}x${source.height}` : 'Unknown'} />
                <StatPill label="FPS" value={source?.fps ? source.fps.toFixed(2) : 'Unknown'} />
                <StatPill label="Runtime" value={desktop ? 'Desktop' : 'Browser'} tone={desktop ? 'success' : 'warn'} />
              </div>
              {source?.warning && (
                <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100/85">
                  {source.warning}
                </div>
              )}
              {youtubeProgress && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="mb-2 flex justify-between text-xs text-zinc-400">
                    <span>{youtubeProgress.message ?? youtubeProgress.stage}</span>
                    <span>{youtubeProgress.percent}%</span>
                  </div>
                  <Progress value={youtubeProgress.percent} className="h-2 bg-zinc-800" />
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <div className={cn(PANEL_CLASS, 'p-4')}>
                <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
                  {videoUrl ? (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="h-full w-full bg-black object-contain"
                      playsInline
                      onLoadedMetadata={handleVideoMetadataLoaded}
                      onCanPlay={() => setVideoPreviewError(null)}
                      onError={() => setVideoPreviewError('Video preview failed to load. Re-import the source or check that the local file still exists.')}
                      onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                  ) : videoPreviewError ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-rose-100">
                      <AlertTriangle className="h-10 w-10 text-rose-300" />
                      <p className="text-sm">{videoPreviewError}</p>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-600">
                      <FileVideo className="h-10 w-10" />
                      <p className="text-sm">Import a local video to preview and scrub frames.</p>
                    </div>
                  )}
                </div>
                <PreviewScrubber
                  candidates={candidates}
                  viewmapPeaks={visibleViewmapPeaks}
                  durationSeconds={sourceDuration}
                  fps={source?.fps}
                  playheadSeconds={playhead}
                  selectedCandidate={selectedCandidate}
                  isPlaying={isPlaying}
                  canPlay={Boolean(videoUrl)}
                  onSeek={seekVideo}
                  onSelect={setSelectedId}
                  onTogglePlay={toggleVideoPlayback}
                />
                {videoUrl && source?.localPath && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Preview is served through the desktop media bridge so local files can play safely in Electron.
                  </p>
                )}
              </div>

              <div className={cn(PANEL_CLASS, 'p-5')}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Editable Timeline</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Candidates and cut ranges</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={addManualClip}>
                      <Plus className="h-4 w-4" />
                      Add range
                    </Button>
                    <Button variant="outline" className="border-emerald-300/20 bg-emerald-400/8 text-emerald-50 hover:bg-emerald-400/12" onClick={handleClipFromTimestamps}>
                      <Scissors className="h-4 w-4" />
                      Clip From Timestamps
                    </Button>
                    <Button variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={handleAutoClip}>
                      <RefreshCw className="h-4 w-4" />
                      Auto Clip
                    </Button>
                    <Button className="bg-orange-500 text-white hover:bg-orange-400" disabled={isAnalyzing} onClick={handleAnalyze}>
                      {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Analyze
                    </Button>
                  </div>
                </div>
                <ClipTimeline
                  candidates={candidates}
                  viewmapPeaks={visibleViewmapPeaks}
                  durationSeconds={sourceDuration}
                  fps={source?.fps}
                  playheadSeconds={playhead}
                  selectedId={selectedCandidate?.id ?? null}
                  onSeek={seekVideo}
                  onSelect={setSelectedId}
                  onChangeRange={updateCandidateRange}
                  onToggleInclude={(id) => setCandidates((prev) => prev.map((candidate) => candidate.id === id ? { ...candidate, include: !candidate.include } : candidate))}
                  onDelete={(id) => setCandidates((prev) => prev.filter((candidate) => candidate.id !== id))}
                />
              </div>
            </div>

            <aside className="space-y-5">
              <div className={cn(PANEL_CLASS, 'p-5')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Selected Clip</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">{selectedCandidate?.title ?? 'No candidate selected'}</h2>
                  </div>
                  {selectedCandidate && (
                    <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => void copyCandidateMetadata(selectedCandidate)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {selectedCandidate ? (
                  <div className="mt-4 space-y-3">
                    <label className="text-xs text-zinc-500">
                      TikTok caption title
                      <Input
                        value={selectedCandidate.title}
                        className={cn(FIELD_CLASS, 'mt-1')}
                        onChange={(event) => {
                          const title = event.target.value;
                          setCandidates((prev) => prev.map((candidate) => candidate.id === selectedCandidate.id ? { ...candidate, title } : candidate));
                        }}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-zinc-500">
                        Start
                        <Input
                          value={selectedCandidate.startSeconds.toFixed(2)}
                          className={cn(FIELD_CLASS, 'mt-1')}
                          onChange={(event) => updateCandidateRange(selectedCandidate.id, 'start', Number(event.target.value))}
                        />
                      </label>
                      <label className="text-xs text-zinc-500">
                        End
                        <Input
                          value={selectedCandidate.endSeconds.toFixed(2)}
                          className={cn(FIELD_CLASS, 'mt-1')}
                          onChange={(event) => updateCandidateRange(selectedCandidate.id, 'end', Number(event.target.value))}
                        />
                      </label>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-sm font-medium text-white">{selectedCandidate.hook}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">{selectedCandidate.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-orange-400/10 px-2 py-1 text-xs text-orange-100">Score {Math.round(selectedCandidate.score)}</span>
                      <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">{selectedCandidate.archetype}</span>
                      <span className="rounded-full bg-white/[0.05] px-2 py-1 text-xs text-zinc-300">{selectedCandidate.durationSeconds.toFixed(1)}s</span>
                      {selectedCandidate.viewmapScore !== undefined && (
                        <span className="rounded-full bg-orange-400/10 px-2 py-1 text-xs text-orange-100">Viewmap {Math.round(selectedCandidate.viewmapScore)}</span>
                      )}
                      {selectedCandidate.confidence !== undefined && (
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">Confidence {Math.round(selectedCandidate.confidence)}</span>
                      )}
                    </div>
                    {selectedCandidate.signalBadges && selectedCandidate.signalBadges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedCandidate.signalBadges.map((badge) => (
                          <span key={badge} className={cn('rounded-full border px-2 py-1 text-xs', evidenceBadgeClass(badge))}>
                            {evidenceLabelText(badge)}
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedCandidate.evidenceSummary && (
                      <div className="rounded-xl border border-orange-300/15 bg-orange-400/8 p-3 text-xs leading-5 text-orange-50">
                        {selectedCandidate.evidenceSummary}
                      </div>
                    )}
                    {selectedCandidate.warnings.length > 0 && (
                      <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                        {selectedCandidate.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    )}
                    <Button variant="outline" className="w-full border-white/10 bg-white/[0.03] text-zinc-100" onClick={() => seekVideo(selectedCandidate.startSeconds)}>
                      <Play className="h-4 w-4" />
                      Preview from start
                    </Button>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500">Run analysis, Auto Clip, or add a range to edit candidate details.</p>
                )}
              </div>

              <div className={cn(PANEL_CLASS, 'p-5')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Export</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Render included clips</h2>
                  </div>
                  <span className={cn('rounded-full border px-3 py-1 text-xs', exportReady ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-100')}>
                    {exportReady ? 'Ready' : 'Needs setup'}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2">
                    <ReadinessRow
                      label="Source"
                      value={source?.localPath ? basenameFromPath(source.localPath) : 'Import or download a local video'}
                      ready={sourceReady}
                    />
                    <ReadinessRow
                      label="ffmpeg"
                      value={
                        isCheckingFfmpeg
                          ? 'Detecting local toolchain...'
                          : ffmpegStatus?.available
                            ? basenameFromPath(ffmpegStatus.ffmpegPath) || 'ffmpeg'
                            : ffmpegStatus?.error ?? 'Open the desktop app to validate ffmpeg'
                      }
                      ready={ffmpegReady}
                    />
                    <ReadinessRow
                      label="Export folder"
                      value={settings.exportFolder || 'Choose a destination before export'}
                      ready={exportFolderReady}
                    />
                    <ReadinessRow
                      label="Included clips"
                      value={includedCount > 0 ? `${includedCount} ready to render` : 'Include at least one clip'}
                      ready={includedCount > 0}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div>
                      <p className="text-sm font-medium text-white">Vertical 9:16</p>
                      <p className="text-xs text-zinc-500">Uses no-black-bars scale/crop and preserves audio.</p>
                    </div>
                    <Switch checked={verticalExport} onCheckedChange={setVerticalExport} />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">Brand logo</p>
                        <p className="text-xs text-zinc-500">
                          {settings.brandLogoPath
                            ? exportReadiness.logoUsable
                              ? 'Intro fade and 50% bottom watermark enabled.'
                              : 'Optional branding selected.'
                            : 'Unbranded export.'}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={() => void handleSelectLogoFile()}>
                        <ImagePlus className="h-4 w-4" />
                        Upload
                      </Button>
                    </div>
                    {settings.brandLogoPath ? (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/50">
                          {logoUrl ? <img src={logoUrl} alt="Clipper logo preview" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-zinc-500" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-zinc-300">{basenameFromPath(settings.brandLogoPath)}</p>
                          <p className="mt-1 text-xs text-zinc-500">{settings.brandLogoIntroSeconds}s intro overlay · {Math.round(settings.brandLogoOpacity * 100)}% watermark opacity</p>
                          <p className={cn('mt-1 text-xs', exportReadiness.logoWarning ? 'text-amber-200' : exportReadiness.logoUsable ? 'text-emerald-200' : 'text-zinc-500')}>
                            {isResolvingLogoUrl
                              ? 'Checking logo preview...'
                              : exportReadiness.logoWarning ?? (exportReadiness.logoUsable ? 'Logo ready for branded export.' : logoPreviewError ?? 'Logo preview unavailable.')}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-zinc-500 hover:text-white"
                          onClick={() => {
                            const next = saveClipStudioSettings({ ...settings, brandLogoPath: '' });
                            setSettings(next);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500">No logo uploaded. Exports stay unbranded.</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Input
                      value={settings.exportFolder}
                      onChange={(event) => updateSetting('exportFolder', event.target.value)}
                      placeholder="Export folder"
                      className={FIELD_CLASS}
                    />
                    <Button variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={async () => {
                      const selected = await desktop?.selectExportFolder?.();
                      if (selected) {
                        const next = saveClipStudioSettings({ ...settings, exportFolder: selected });
                        setSettings(next);
                      }
                    }}>
                      <FolderOpen className="h-4 w-4" />
                      Choose folder
                    </Button>
                  </div>
                  {(exportQueue || progress) && (
                    <div className={cn('rounded-xl border p-3', progress?.stage === 'failed' ? 'border-rose-300/25 bg-rose-950/25' : 'border-white/10 bg-black/25')}>
                      <div className="mb-2 flex justify-between gap-3 text-xs text-zinc-400">
                        <span className="min-w-0 truncate">
                          {exportQueue?.clipTitle ?? progress?.clipTitle ?? progress?.message ?? 'Preparing export'}
                        </span>
                        <span className="shrink-0">
                          {exportQueue ? `${Math.max(1, exportQueue.current)}/${exportQueue.total}` : `${progress?.percent ?? 0}%`}
                        </span>
                      </div>
                      <Progress value={Math.max(0, Math.min(100, exportQueuePercent))} className="h-2 bg-zinc-800" />
                      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{progress?.message ?? (isExporting ? 'Exporting included clips' : 'Export queue idle')}</span>
                        <span>{Math.max(0, Math.min(100, exportQueuePercent))}%</span>
                      </div>
                      {(exportQueue?.detail || progress?.detail || progress?.stderrTail) && (
                        <details className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-zinc-300">
                          <summary className="cursor-pointer text-rose-100">Technical details</summary>
                          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-zinc-400">
                            {exportQueue?.detail ?? progress?.detail ?? progress?.stderrTail}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                  <Button className="w-full bg-orange-500 text-white hover:bg-orange-400" disabled={isExporting || !exportReadiness.canClickExport} onClick={handleExportIncluded}>
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                    Export included
                  </Button>
                </div>
              </div>

              <details className={cn(PANEL_CLASS, 'group p-5')}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Settings</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Prompt and advanced tools</h2>
                  </div>
                  <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={(event) => {
                    event.preventDefault();
                    persistSettings(settings);
                  }}>
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                </summary>
                <div className="mt-4 grid gap-3">
                  <label className="text-xs text-zinc-500">
                    Viral Finder Prompt
                    <Textarea
                      value={settings.analysisPrompt}
                      onChange={(event) => updateSetting('analysisPrompt', event.target.value)}
                      className={cn(FIELD_CLASS, 'mt-1 min-h-40 leading-5')}
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">AI analysis runs through the Supabase Edge Function secret.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-white/[0.03] text-zinc-100"
                      onClick={() => updateSetting('analysisPrompt', DEFAULT_CLIPPER_ANALYSIS_PROMPT)}
                    >
                      Reset prompt
                    </Button>
                  </div>
                  <label className="text-xs text-zinc-500">
                    Timeout
                    <Input type="number" min={5} max={300} value={Math.round(settings.timeoutMs / 1000)} onChange={(event) => updateSetting('timeoutMs', Number(event.target.value) * 1000)} className={cn(FIELD_CLASS, 'mt-1')} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-zinc-500">
                      Default mode
                      <select
                        value={settings.defaultMode}
                        onChange={(event) => updateSetting('defaultMode', event.target.value as ClipStudioMode)}
                        className={cn(FIELD_CLASS, 'mt-1 h-10 w-full rounded-md px-3')}
                      >
                        <option value="viral">Viral Clip Version</option>
                        <option value="auto">Auto Clip</option>
                      </select>
                    </label>
                    <label className="text-xs text-zinc-500">
                      Platform preset
                      <select
                        value={settings.defaultPlatformPreset}
                        onChange={(event) => updateSetting('defaultPlatformPreset', event.target.value as ClipStudioPlatformPreset)}
                        className={cn(FIELD_CLASS, 'mt-1 h-10 w-full rounded-md px-3')}
                      >
                        <option value="shorts">YouTube Shorts</option>
                        <option value="tiktok">TikTok</option>
                        <option value="reels">Instagram Reels</option>
                        <option value="multi">Multi-platform</option>
                      </select>
                    </label>
                  </div>
                  <label className="text-xs text-zinc-500">
                    ffmpeg path override
                    <Input value={settings.ffmpegPathOverride} onChange={(event) => updateSetting('ffmpegPathOverride', event.target.value)} placeholder="/opt/homebrew/bin/ffmpeg" className={cn(FIELD_CLASS, 'mt-1')} />
                  </label>
                  <label className="text-xs text-zinc-500">
                    yt-dlp path override
                    <Input value={settings.youtubeDownloaderPathOverride} onChange={(event) => updateSetting('youtubeDownloaderPathOverride', event.target.value)} placeholder="/opt/homebrew/bin/yt-dlp" className={cn(FIELD_CLASS, 'mt-1')} />
                  </label>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <span className="text-sm text-zinc-300">Captions on by default</span>
                    <Switch checked={settings.captionsDefault} onCheckedChange={(checked) => updateSetting('captionsDefault', checked)} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <span className="text-sm text-zinc-300">Redacted debug logging</span>
                    <Switch checked={settings.redactedDebugLogging} onCheckedChange={(checked) => updateSetting('redactedDebugLogging', checked)} />
                  </div>
                </div>
              </details>
            </aside>
          </section>

          <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className={cn(PANEL_CLASS, 'p-5')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Context</p>
                  <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                    <Activity className="h-4 w-4 text-orange-200" />
                    Analysis Signals
                  </h2>
                </div>
                <Button size="icon" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={() => heatmapInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" />
                </Button>
              </div>
              <input
                ref={heatmapInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void handleHeatmapsSelected(event.target.files)}
              />
              <div className="mt-4 rounded-xl border border-orange-300/15 bg-orange-400/8 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-orange-50">
                  <BarChart3 className="h-4 w-4" />
                  {visibleViewmapStatus}
                </div>
                <p className="mt-1 text-xs leading-5 text-orange-100/75">
                  Structured YouTube viewmap peaks drive candidate seeds when yt-dlp provides them. Uploaded graph screenshots stay as fallback model context.
                </p>
              </div>
              <div className="mt-3 grid gap-2">
                {visibleAnalysisSignals.map((signal) => (
                  <div key={signal.id} className={cn('rounded-xl border p-3', signalStatusClass(signal.status))}>
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', signalStatusDot(signal.status))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">{signal.label}</p>
                          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-current">
                            {signal.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">{signal.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {heatmaps.length === 0 ? (
                  <p className="text-sm text-zinc-500">Add YouTube Most replayed screenshots only when structured viewmap data is unavailable.</p>
                ) : (
                  heatmaps.map((image) => (
                    <div key={image.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                      <img src={image.dataUrl} alt={image.name} className="h-20 w-28 object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-zinc-300 opacity-0 transition group-hover:opacity-100"
                        onClick={() => {
                          setHeatmaps((prev) => prev.filter((entry) => entry.id !== image.id));
                          setAnalysisSignals([]);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Representative frames captured for the last analysis: {capturedFrameCount}. Desktop builds extract frames locally with ffmpeg when possible.
              </p>
              {timestampRangeText.trim() && (
                <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-400/8 p-3 text-xs leading-5 text-emerald-50">
                  <p>{timestampRangeResult.ranges.length} timestamp range{timestampRangeResult.ranges.length === 1 ? '' : 's'} detected for local clipping.</p>
                  {timestampRangeResult.warnings.slice(0, 2).map((warning) => (
                    <p key={warning} className="text-amber-100">{warning}</p>
                  ))}
                </div>
              )}
              <Textarea value={transcriptText} onChange={(event) => setTranscriptText(event.target.value)} placeholder="[0:12-0:35] Paste transcript/caption lines or timestamp ranges here..." className={cn(FIELD_CLASS, 'mt-4 min-h-32')} />
              <Textarea value={timestampText} onChange={(event) => setTimestampText(event.target.value)} placeholder="4:05 - 4:20&#10;Hook 4:40 - 6:10&#10;payoff @ 3:02" className={cn(FIELD_CLASS, 'mt-3 min-h-24')} />
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Audience, creator style, sections to avoid, or editorial notes..." className={cn(FIELD_CLASS, 'mt-3 min-h-24')} />
            </div>

            <div className={cn(PANEL_CLASS, 'p-5')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Status</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{status}</h2>
                </div>
                {error ? <AlertTriangle className="h-5 w-5 text-rose-300" /> : <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
              </div>
              {error && (
                <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">
                  {error}
                </div>
              )}
              {analysisSummary && (
                <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/8 p-4">
                  <p className="text-sm leading-6 text-cyan-50">{analysisSummary}</p>
                </div>
              )}
              {analysisWarnings.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                  {analysisWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Local Clip Library</h2>
                  <span className="text-xs text-zinc-500">{library.length} exports</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {library.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] p-5 text-sm text-zinc-500 md:col-span-2">
                      Exported clip metadata appears here with Finder reveal, copy, and delete controls.
                    </div>
                  ) : (
                    library.map((clip) => (
                      <div key={clip.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex gap-3">
                          <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/60">
                            {clip.thumbnailPath ? (
                              <img src={filePathToUrl(clip.thumbnailPath)} alt={clip.title} className="h-full w-full object-cover" />
                            ) : (
                              <FileVideo className="h-5 w-5 text-zinc-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{clip.title}</p>
                            <p className="mt-1 text-xs text-zinc-500">{secondsToClock(clip.startSeconds)}-{secondsToClock(clip.endSeconds)} · {clip.durationSeconds.toFixed(1)}s</p>
                            <p className="mt-1 truncate text-xs text-zinc-400">{clip.hook}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={() => void desktop?.revealInFinder?.(clip.exportPath)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                            Finder
                          </Button>
                          <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-100" onClick={() => void navigator.clipboard.writeText(`${clip.title}\n${clip.hook}\n${clip.exportPath}`)}>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                          <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-rose-300" onClick={() => handleDeleteLibraryEntry(clip.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
