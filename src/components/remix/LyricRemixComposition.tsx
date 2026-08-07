import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { captionsToLines, type LyricCaption } from '@/lib/remix-utils';
import { getLyricStyle, type LyricStyleId } from '@/lib/lyric-styles';
import type { FootageAsset } from '@/features/remix/types';

export interface LyricRemixCompositionProps {
  audioUrl: string | null;
  captions: LyricCaption[];
  lyricStyleId: LyricStyleId;
  scale: number;
  backgroundClips: FootageAsset[];
  cutMarkers: Array<{ timestampMs: number }>;
  noCuts: boolean;
  aspectRatio: '9:16' | '16:9';
  durationMs: number;
}

const DEFAULT_PROPS: LyricRemixCompositionProps = {
  audioUrl: null,
  captions: [],
  lyricStyleId: 'default',
  scale: 0.65,
  backgroundClips: [],
  cutMarkers: [],
  noCuts: false,
  aspectRatio: '9:16',
  durationMs: 15000,
};

/**
 * Build clip sequence from cut markers. Each segment between consecutive
 * marker boundaries gets one clip from the backgroundClips array (cycling).
 */
function getClipSequence(
  clips: FootageAsset[],
  durationMs: number,
  cutMarkers: Array<{ timestampMs: number }> = [],
  noCuts = false
) {
  if (clips.length === 0 || durationMs <= 0) return [];

  // Build boundaries from cut markers (same logic as buildRemixTimelineSlots).
  // With noCuts the whole duration is a single uncut segment.
  const boundaries = new Set<number>([0, durationMs]);
  if (!noCuts) {
    for (const m of cutMarkers) {
      const t = Math.max(0, Math.min(durationMs, m.timestampMs));
      if (t > 0 && t < durationMs) boundaries.add(t);
    }
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  const sequence: Array<{ clip: FootageAsset; fromMs: number; durationMs: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const clip = clips[i % clips.length];
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd > segStart) {
      sequence.push({ clip, fromMs: segStart, durationMs: segEnd - segStart });
    }
  }
  return sequence;
}

export const LyricRemixComposition: React.FC<Partial<LyricRemixCompositionProps>> = (rawProps) => {
  const props = { ...DEFAULT_PROPS, ...rawProps };
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const style = getLyricStyle(props.lyricStyleId);

  const lines = useMemo(() => captionsToLines(props.captions), [props.captions]);
  const activeLine = lines.find((line) => nowMs >= line.startMs && nowMs < line.endMs) ?? null;
  const clipSequence = useMemo(
    () => getClipSequence(props.backgroundClips, props.durationMs, props.cutMarkers, props.noCuts),
    [props.backgroundClips, props.durationMs, props.cutMarkers, props.noCuts]
  );

  const enter = activeLine
    ? interpolate(nowMs - activeLine.startMs, [0, 180], [0.86, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const fontSize = Math.max(26, Math.min(width * 0.18, 112) * props.scale);

  return (
    <AbsoluteFill style={{ backgroundColor: '#050505', overflow: 'hidden' }}>
      {clipSequence.length > 0 ? (
        clipSequence.map(({ clip, fromMs, durationMs }, index) => {
          const from = Math.round((fromMs / 1000) * fps);
          const durationInFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
          return (
            <Sequence key={`${clip.id}-${index}`} from={from} durationInFrames={durationInFrames}>
              {clip.url.match(/\.(png|jpe?g|webp|svg)$/i) ? (
                <Img src={clip.url} style={mediaStyle} />
              ) : (
                <Video src={clip.url} muted style={mediaStyle} />
              )}
            </Sequence>
          );
        })
      ) : (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(circle at 50% 30%, rgba(84,217,255,0.16), transparent 34%), linear-gradient(160deg, #111827, #050505 62%)',
          }}
        />
      )}

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.58))',
        }}
      />

      {props.audioUrl && <Audio src={props.audioUrl} />}

      {!props.noCuts &&
        props.cutMarkers.map((marker) => {
          const markerFrame = Math.round((marker.timestampMs / 1000) * fps);
          return (
            <Sequence key={marker.timestampMs} from={markerFrame} durationInFrames={Math.max(2, Math.round(fps * 0.08))}>
              <AbsoluteFill style={{ backgroundColor: 'rgba(255,255,255,0.16)' }} />
            </Sequence>
          );
        })}

      {style.id !== 'none' && activeLine && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 8%',
            transform: `scale(${enter}) ${style.transform ?? ''}`,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              maxWidth: '94%',
              padding: style.background ? '0.04em 0.18em' : undefined,
              background: style.background,
              borderRadius: style.background ? 4 : undefined,
              color: style.fill,
              fontFamily: style.font,
              fontSize,
              fontWeight: 950,
              letterSpacing: style.tracking ?? '0',
              lineHeight: 0.92,
              textAlign: 'center',
              textTransform: style.id === 'brat' ? 'lowercase' : 'uppercase',
              WebkitTextStroke: style.stroke ? `${Math.max(1, (style.strokeWidth ?? 6) * props.scale)}px ${style.stroke}` : undefined,
              paintOrder: 'stroke',
              textShadow: style.shadow,
            }}
          >
            {activeLine.words.map((word, index) => {
              const isAccent = style.accentTarget === 'first-word' && index === 0;
              return (
                <span
                  key={`${word.startMs}-${word.text}-${index}`}
                  style={{
                    color: isAccent ? style.accentFill : style.fill,
                    marginRight: index === activeLine.words.length - 1 ? 0 : '0.18em',
                    whiteSpace: 'pre',
                  }}
                >
                  {word.text}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const mediaStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

export default LyricRemixComposition;
