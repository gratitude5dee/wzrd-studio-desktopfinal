/**
 * Canvas-based video exporter for Remix compositions.
 *
 * Records background clips + lyric overlays + audio in real time using
 * requestAnimationFrame, MediaRecorder, and Web Audio API.
 * Produces a downloadable WebM file entirely client-side.
 */

import { captionsToLines, type LyricCaption } from '@/lib/remix-utils';
import { getLyricStyle, type LyricStyleId } from '@/lib/lyric-styles';
import type { FootageAsset } from './types';

export interface CanvasExportOptions {
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  audioUrl: string | null;
  captions: LyricCaption[];
  lyricStyleId: LyricStyleId;
  scale: number;
  backgroundClips: FootageAsset[];
  cutMarkers: Array<{ timestampMs: number }>;
  noCuts: boolean;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

interface ClipSegment {
  clip: FootageAsset;
  fromMs: number;
  toMs: number;
  videoEl: HTMLVideoElement;
}

// ── helpers ────────────────────────────────────────────────────────

function buildSegments(
  clips: FootageAsset[],
  cutMarkers: Array<{ timestampMs: number }>,
  durationMs: number
): Array<{ clip: FootageAsset; fromMs: number; toMs: number }> {
  if (clips.length === 0) return [];
  const boundaries = new Set<number>([0, durationMs]);
  for (const m of cutMarkers) boundaries.add(Math.max(0, Math.min(durationMs, m.timestampMs)));
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segs: Array<{ clip: FootageAsset; fromMs: number; toMs: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    segs.push({ clip: clips[i % clips.length], fromMs: sorted[i], toMs: sorted[i + 1] });
  }
  return segs;
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    v.addEventListener('loadeddata', () => resolve(v), { once: true });
    v.addEventListener('error', () => reject(new Error(`Failed to load video: ${url}`)), { once: true });
  });
}

function loadAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const a = document.createElement('audio');
    a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    a.src = url;
    a.addEventListener('canplaythrough', () => resolve(a), { once: true });
    a.addEventListener('error', () => reject(new Error(`Failed to load audio: ${url}`)), { once: true });
  });
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

// ── main export function ───────────────────────────────────────────

export async function exportRemixVideo(opts: CanvasExportOptions): Promise<Blob> {
  const {
    width,
    height,
    durationMs,
    audioUrl,
    captions,
    lyricStyleId,
    scale,
    backgroundClips,
    cutMarkers,
    noCuts,
    onProgress,
    signal,
  } = opts;

  const style = getLyricStyle(lyricStyleId);
  const lines = captionsToLines(captions);
  const segments = buildSegments(backgroundClips, noCuts ? [] : cutMarkers, durationMs);

  // ── Preload all video clips ──
  const clipSegments: ClipSegment[] = [];
  const videoCache = new Map<string, HTMLVideoElement>();
  for (const seg of segments) {
    if (!videoCache.has(seg.clip.url)) {
      try {
        const v = await loadVideo(seg.clip.url);
        videoCache.set(seg.clip.url, v);
      } catch (e) {
        console.warn('[remix-export] Skipping clip that failed to load:', seg.clip.url, e);
        continue;
      }
    }
    clipSegments.push({
      ...seg,
      videoEl: videoCache.get(seg.clip.url)!,
    });
  }

  // ── Preload audio ──
  let audioEl: HTMLAudioElement | null = null;
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (audioUrl) {
    try {
      audioEl = await loadAudio(audioUrl);
      audioCtx = new AudioContext();
      const audioSource = audioCtx.createMediaElementSource(audioEl);
      audioDest = audioCtx.createMediaStreamDestination();
      audioSource.connect(audioDest);
      audioSource.connect(audioCtx.destination);
    } catch (e) {
      console.warn('[remix-export] Audio load failed, exporting without audio', e);
      audioEl = null;
    }
  }

  // ── Set up canvas ──
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // ── Set up MediaRecorder ──
  const canvasStream = canvas.captureStream(0); // manual frame push
  if (audioDest) {
    for (const track of audioDest.stream.getAudioTracks()) {
      canvasStream.addTrack(track);
    }
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  // ── Pre-seek first clip and prepare all clips for playback ──
  // Start each clip playing when its segment begins (real-time approach)
  let currentSegIndex = -1;

  function startSegment(segIndex: number, offsetMs: number) {
    if (segIndex < 0 || segIndex >= clipSegments.length) return;
    const seg = clipSegments[segIndex];
    const segOffsetSec = Math.max(0, (offsetMs - seg.fromMs) / 1000);
    seg.videoEl.currentTime = segOffsetSec;
    seg.videoEl.play().catch(() => {});
    currentSegIndex = segIndex;
  }

  function findSegmentIndex(nowMs: number): number {
    return clipSegments.findIndex((s) => nowMs >= s.fromMs && nowMs < s.toMs);
  }

  // ── Drawing functions ──

  function drawVideoFrame(nowMs: number) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    const segIdx = findSegmentIndex(nowMs);
    if (segIdx === -1) return;

    // Switch to new segment if needed
    if (segIdx !== currentSegIndex) {
      // Pause old segment
      if (currentSegIndex >= 0 && currentSegIndex < clipSegments.length) {
        clipSegments[currentSegIndex].videoEl.pause();
      }
      startSegment(segIdx, nowMs);
    }

    const seg = clipSegments[segIdx];
    const vw = seg.videoEl.videoWidth || width;
    const vh = seg.videoEl.videoHeight || height;
    const videoAR = vw / vh;
    const canvasAR = width / height;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAR > canvasAR) {
      sw = vh * canvasAR;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / canvasAR;
      sy = (vh - sh) / 2;
    }

    try {
      ctx.drawImage(seg.videoEl, sx, sy, sw, sh, 0, 0, width, height);
    } catch {
      // Video may not be ready yet, draw black
    }
  }

  function drawOverlays(nowMs: number) {
    // Dark overlay gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(0,0,0,0.10)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Cut flash
    if (!noCuts) {
      for (const marker of cutMarkers) {
        const flashDuration = 80;
        if (nowMs >= marker.timestampMs && nowMs < marker.timestampMs + flashDuration) {
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(0, 0, width, height);
        }
      }
    }

    // Lyrics overlay
    if (style.id !== 'none') {
      const activeLine = lines.find((l) => nowMs >= l.startMs && nowMs < l.endMs) ?? null;
      if (activeLine) {
        const enterT = Math.min(1, (nowMs - activeLine.startMs) / 180);
        const enterScale = lerp(0.86, 1, enterT);
        const fontSize = Math.max(26, Math.min(width * 0.18, 112) * scale);
        const text = activeLine.words
          .map((w) => (style.id === 'brat' ? w.text.toLowerCase() : w.text.toUpperCase()))
          .join(' ');

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(enterScale, enterScale);

        if (style.transform?.includes('skewX')) {
          const match = style.transform.match(/skewX\((-?\d+)deg\)/);
          if (match) {
            const skewRad = (parseFloat(match[1]) * Math.PI) / 180;
            ctx.transform(1, 0, Math.tan(skewRad), 1, 0, 0);
          }
        }
        if (style.transform?.includes('rotate')) {
          const match = style.transform.match(/rotate\((-?\d+)deg\)/);
          if (match) {
            ctx.rotate((parseFloat(match[1]) * Math.PI) / 180);
          }
        }

        const fontFamily = style.font.split(',')[0].trim();
        ctx.font = `900 ${fontSize}px ${fontFamily}, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';

        const maxWidth = width * 0.84;

        // Background pill (e.g. brat style)
        if (style.background) {
          const metrics = ctx.measureText(text);
          const bgW = Math.min(metrics.width + fontSize * 0.36, maxWidth + fontSize * 0.36);
          const bgH = fontSize * 1.2;
          ctx.fillStyle = style.background;
          ctx.beginPath();
          ctx.roundRect(-bgW / 2, -bgH / 2, bgW, bgH, 4);
          ctx.fill();
        }

        // Stroke
        if (style.stroke) {
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = Math.max(1, (style.strokeWidth ?? 6) * scale);
          ctx.strokeText(text, 0, 0, maxWidth);
        }

        // Fill with accent on first word
        if (style.accentTarget === 'first-word' && style.accentFill && activeLine.words.length > 1) {
          const firstWord = style.id === 'brat'
            ? activeLine.words[0].text.toLowerCase()
            : activeLine.words[0].text.toUpperCase();
          const rest = activeLine.words
            .slice(1)
            .map((w) => (style.id === 'brat' ? w.text.toLowerCase() : w.text.toUpperCase()))
            .join(' ');

          const firstMetrics = ctx.measureText(firstWord + ' ');
          const fullMetrics = ctx.measureText(text);
          const startX = -Math.min(fullMetrics.width, maxWidth) / 2;

          ctx.textAlign = 'left';
          ctx.fillStyle = style.accentFill;
          ctx.fillText(firstWord, startX, 0, maxWidth);
          ctx.fillStyle = style.fill;
          ctx.fillText(rest, startX + firstMetrics.width, 0, maxWidth - firstMetrics.width);
        } else {
          ctx.fillStyle = style.fill;
          ctx.fillText(text, 0, 0, maxWidth);
        }

        ctx.restore();
      }
    }
  }

  // ── Real-time recording loop using requestAnimationFrame ──

  recorder.start(100);

  // Start audio playback
  if (audioEl) {
    audioEl.currentTime = 0;
    await audioEl.play().catch(() => {});
  }

  // Start first segment
  if (clipSegments.length > 0) {
    startSegment(0, 0);
  }

  const startTime = performance.now();

  await new Promise<void>((resolve, reject) => {
    let rafId: number;

    function tick() {
      if (signal?.aborted) {
        cancelAnimationFrame(rafId);
        recorder.stop();
        audioEl?.pause();
        // Pause all clips
        for (const seg of clipSegments) seg.videoEl.pause();
        reject(new Error('Export cancelled'));
        return;
      }

      const elapsed = performance.now() - startTime;
      const nowMs = Math.min(elapsed, durationMs);

      // Draw frame
      drawVideoFrame(nowMs);
      drawOverlays(nowMs);

      // Push frame to recorder
      const canvasTrack = canvasStream.getVideoTracks()[0];
      if (canvasTrack && 'requestFrame' in canvasTrack) {
        (canvasTrack as CanvasCaptureMediaStreamTrack).requestFrame();
      }

      // Report progress
      onProgress?.(nowMs / durationMs);

      // Check if done
      if (elapsed >= durationMs) {
        // Pause all clips
        for (const seg of clipSegments) seg.videoEl.pause();
        resolve();
        return;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  });

  // ── Finalize ──
  recorder.stop();
  audioEl?.pause();

  if (audioCtx) {
    await audioCtx.close().catch(() => {});
  }

  // Clean up video elements
  for (const v of videoCache.values()) {
    v.pause();
    v.src = '';
    v.load();
  }

  return recordingDone;
}
