import type { CutMarker, LyricBlock } from '@/features/kanvas-lyrics/types';
import type { FootageAsset, RemixTimelineSlot } from '@/features/remix/types';

export interface LyricCaption {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface CaptionLine {
  text: string;
  startMs: number;
  endMs: number;
  words: LyricCaption[];
}

const SNAP_MS = 50;
const MARKER_DEDUPE_MS = 250;

export function lyricBlocksToCaptions(blocks: LyricBlock[]): LyricCaption[] {
  return blocks
    .flatMap((block) =>
      block.words.map((word) => ({
        text: word.text,
        startMs: word.startTimeMs,
        endMs: Math.max(word.startTimeMs + 1, word.endTimeMs),
        confidence: typeof word.confidence === 'number' ? word.confidence : 0.86,
      }))
    )
    .filter((word) => word.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs);
}

export function captionsToLines(captions: LyricCaption[], combineWithinMs = 1200): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: LyricCaption[] = [];

  for (const caption of captions) {
    const previous = current[current.length - 1];
    const shouldStartNew =
      current.length > 0 &&
      (caption.startMs - (previous?.endMs ?? caption.startMs) > 360 ||
        caption.endMs - current[0].startMs > combineWithinMs ||
        current.length >= 5);

    if (shouldStartNew) {
      lines.push(captionGroupToLine(current));
      current = [];
    }
    current.push(caption);
  }

  if (current.length > 0) lines.push(captionGroupToLine(current));
  return lines;
}

function captionGroupToLine(words: LyricCaption[]): CaptionLine {
  return {
    text: words.map((word) => word.text).join(' '),
    startMs: words[0]?.startMs ?? 0,
    endMs: words[words.length - 1]?.endMs ?? 0,
    words,
  };
}

/**
 * Re-base captions onto the render timeline. Template lyric words are stored
 * relative to the source audio, so words are shifted by the selection start
 * and clamped to the [0, durationMs] window; words fully outside are dropped.
 */
export function offsetCaptionsToSelection(
  captions: LyricCaption[],
  selectionStartMs: number,
  durationMs: number
): LyricCaption[] {
  if (durationMs <= 0) return [];
  return captions
    .map((caption) => ({
      ...caption,
      startMs: caption.startMs - selectionStartMs,
      endMs: caption.endMs - selectionStartMs,
    }))
    .filter((caption) => caption.endMs > 0 && caption.startMs < durationMs)
    .map((caption) => ({
      ...caption,
      startMs: Math.max(0, caption.startMs),
      endMs: Math.min(durationMs, caption.endMs),
    }));
}

/**
 * Re-base cut markers onto the render timeline: shift by the selection start
 * and drop markers that fall outside the (0, durationMs) window.
 */
export function offsetCutMarkersToSelection(
  markers: CutMarker[],
  selectionStartMs: number,
  durationMs: number
): CutMarker[] {
  if (durationMs <= 0) return [];
  return markers
    .map((marker) => ({ ...marker, timestampMs: marker.timestampMs - selectionStartMs }))
    .filter((marker) => marker.timestampMs > 0 && marker.timestampMs < durationMs);
}

export function snapMarkerMs(valueMs: number): number {
  return Math.max(0, Math.round(valueMs / SNAP_MS) * SNAP_MS);
}

export function normalizeCutMarkers(markers: CutMarker[], durationMs: number): CutMarker[] {
  const sorted = markers
    .map((marker) => ({
      id: marker.id,
      timestampMs: Math.min(durationMs, snapMarkerMs(marker.timestampMs)),
    }))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const out: CutMarker[] = [];
  for (const marker of sorted) {
    const last = out[out.length - 1];
    if (!last || marker.timestampMs - last.timestampMs >= MARKER_DEDUPE_MS) out.push(marker);
  }
  return out;
}

export function quoteRemixCredits(durationMs: number, quantity: number): number {
  const safeQuantity = Math.max(1, Math.min(10, Math.round(quantity)));
  return Math.ceil(Math.max(1, durationMs / 1000)) * safeQuantity;
}

export function estimateRequiredClipSlots(durationMs: number, assets: Pick<FootageAsset, 'durationMs'>[]): number {
  if (durationMs <= 0) return 0;
  const average = assets.length
    ? assets.reduce((sum, asset) => sum + Math.max(1000, asset.durationMs), 0) / assets.length
    : 6000;
  return Math.max(1, Math.ceil(durationMs / average));
}

export function pickClipsForDuration(
  assets: FootageAsset[],
  durationMs: number,
  seed = 1
): FootageAsset[] {
  if (assets.length === 0 || durationMs <= 0) return [];

  const shuffled = seededShuffle(assets, seed);
  const picked: FootageAsset[] = [];
  let total = 0;
  let index = 0;

  while (total < durationMs && index < shuffled.length * 3) {
    const asset = shuffled[index % shuffled.length];
    picked.push(asset);
    total += Math.max(1000, asset.durationMs);
    index += 1;
  }

  return picked;
}

export function seededShuffle<T>(items: T[], seed = 1): T[] {
  const out = [...items];
  let state = seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Timeline slot utilities ──────────────────────────────────────

/**
 * Build timeline slots from duration and cut markers.
 * Each cut marker defines a segment boundary — the slots are the gaps between
 * consecutive boundaries (including 0 and durationMs as implicit edges).
 * If no markers exist, a single slot spanning the full duration is returned.
 */
export function buildRemixTimelineSlots(
  durationMs: number,
  cutMarkers: Array<{ timestampMs: number }> = []
): RemixTimelineSlot[] {
  if (durationMs <= 0) return [{ slotIndex: 0, startMs: 0, endMs: 0, clipId: null }];

  // Collect unique, sorted boundary points
  const boundaries = new Set<number>([0, durationMs]);
  for (const m of cutMarkers) {
    const t = Math.max(0, Math.min(durationMs, m.timestampMs));
    boundaries.add(t);
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  const slots: RemixTimelineSlot[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    slots.push({
      slotIndex: i,
      startMs: sorted[i],
      endMs: sorted[i + 1],
      clipId: null,
    });
  }
  return slots;
}

/** Assign a clip to a specific slot (immutable). */
export function assignClipToSlot(
  slots: RemixTimelineSlot[],
  slotIndex: number,
  clipId: string | null
): RemixTimelineSlot[] {
  return slots.map((s) =>
    s.slotIndex === slotIndex ? { ...s, clipId } : s
  );
}

/** Swap clips between two slots (immutable). */
export function moveTimelineClip(
  slots: RemixTimelineSlot[],
  fromIndex: number,
  toIndex: number
): RemixTimelineSlot[] {
  const fromClip = slots.find((s) => s.slotIndex === fromIndex)?.clipId ?? null;
  const toClip = slots.find((s) => s.slotIndex === toIndex)?.clipId ?? null;
  return slots.map((s) => {
    if (s.slotIndex === fromIndex) return { ...s, clipId: toClip };
    if (s.slotIndex === toIndex) return { ...s, clipId: fromClip };
    return s;
  });
}

/** One auto-generated remix variant: a seed plus a fully-populated slot layout. */
export interface RemixVersion {
  seed: number;
  slots: RemixTimelineSlot[];
}

/**
 * Deterministically generate `count` remix variants. Each variant shuffles
 * the footage library with a distinct seed and fills every timeline slot.
 */
export function generateRemixVersions(
  assets: FootageAsset[],
  durationMs: number,
  cutMarkers: Array<{ timestampMs: number }> = [],
  count = 10,
  baseSeed = 1
): RemixVersion[] {
  if (assets.length === 0 || durationMs <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const seed = baseSeed + i * 7919;
    const shuffled = seededShuffle(assets, seed);
    const slots = buildRemixTimelineSlots(durationMs, cutMarkers).map((slot, idx) => ({
      ...slot,
      clipId: shuffled[idx % shuffled.length]?.id ?? null,
    }));
    return { seed, slots };
  });
}

/** Find the nearest marker within a threshold. Returns the marker or null. */
export function getNearestMarker<T extends { timestampMs: number }>(
  markers: T[],
  timestampMs: number,
  thresholdMs = 500
): T | null {
  let nearest: T | null = null;
  let minDist = Infinity;
  for (const m of markers) {
    const d = Math.abs(m.timestampMs - timestampMs);
    if (d < minDist) {
      nearest = m;
      minDist = d;
    }
  }
  return nearest && minDist <= thresholdMs ? nearest : null;
}
