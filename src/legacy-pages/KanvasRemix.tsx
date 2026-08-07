import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  Download,
  Film,
  Filter,
  Grid2X2,
  GripVertical,
  HelpCircle,
  Import,
  Info,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { getTemplate, listTemplates } from '@/features/kanvas-lyrics/service';
import type { KanvasLyricTemplate } from '@/features/kanvas-lyrics/types';
import {
  listFootageAssets,
  listFootageCategories,
  listLyricStyles,
  resolveTemplateAudioUrl,
} from '@/features/remix/service';
import type { AspectRatio, FootageAsset, FootageCategory, RemixTimelineSlot } from '@/features/remix/types';
import type { LyricStyle, LyricStyleId } from '@/lib/lyric-styles';
import { LYRIC_STYLES } from '@/lib/lyric-styles';
import {
  buildRemixTimelineSlots,
  assignClipToSlot,
  generateRemixVersions,
  lyricBlocksToCaptions,
  offsetCaptionsToSelection,
  offsetCutMarkersToSelection,
  quoteRemixCredits,
  seededShuffle,
  type RemixVersion,
} from '@/lib/remix-utils';
import { LyricRemixComposition } from '@/components/remix/LyricRemixComposition';
import { KanvasLyricsHeader } from '@/components/kanvas-lyrics/KanvasLyricsHeader';
import { ExportModal } from '@/features/remix/ExportModal';

type RatioFilter = 'all' | AspectRatio;
type SortKey = 'newest' | 'oldest' | 'shortest' | 'longest';

const DEFAULT_SCALE = 0.65;

function fmtTime(ms: number) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

const KanvasRemix = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId?: string }>();
  const playerRef = useRef<PlayerRef>(null);
  const [templates, setTemplates] = useState<KanvasLyricTemplate[]>([]);
  const [template, setTemplate] = useState<KanvasLyricTemplate | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<FootageCategory[]>([]);
  const [assets, setAssets] = useState<FootageAsset[]>([]);
  const [styles, setStyles] = useState<LyricStyle[]>(LYRIC_STYLES);
  const [selectedStyleId, setSelectedStyleId] = useState<LyricStyleId>('default');
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [clipRatio, setClipRatio] = useState<RatioFilter>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [categoryId, setCategoryId] = useState<string | null>('bay-area-8mm');
  const [noCuts, setNoCuts] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [shuffleEach, setShuffleEach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const exporting = exportModalOpen;
  const [controlsOpen, setControlsOpen] = useState(true);
  const [timelineSlots, setTimelineSlots] = useState<RemixTimelineSlot[]>([]);
  const [versions, setVersions] = useState<RemixVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameMs, setCurrentFrameMs] = useState(0);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  // Data loading
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listTemplates({ status: 'saved', limit: 100 }).catch(() => []),
      listFootageCategories(),
      listLyricStyles(),
    ])
      .then(async ([templateRows, categoryRows, styleRows]) => {
        if (cancelled) return;
        setTemplates(templateRows);
        setCategories(categoryRows);
        setStyles(styleRows);
        const activeTemplate =
          templateId
            ? await getTemplate(templateId).catch(() => null)
            : templateRows[0] ?? null;
        if (cancelled) return;
        setTemplate(activeTemplate);
        if (!templateId && activeTemplate) {
          navigate(`/kanvas/remix/${activeTemplate.id}`, { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [navigate, templateId]);

  // Resolve audio URL
  useEffect(() => {
    let cancelled = false;
    if (!template) { setAudioUrl(null); return; }
    resolveTemplateAudioUrl(template.sourceAudioAssetId).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => { cancelled = true; };
  }, [template]);

  // Load assets
  useEffect(() => {
    let cancelled = false;
    listFootageAssets({ categoryId, ratio: clipRatio, filter: tagFilter, sort }).then((rows) => {
      if (!cancelled) setAssets(rows);
    });
    return () => { cancelled = true; };
  }, [categoryId, clipRatio, tagFilter, sort]);

  // Build timeline slots when template changes
  const durationMs = template?.selectionDurationMs ?? 15000;
  const hasAutoPopulated = useRef(false);

  // Re-base template lyric/marker timestamps onto the render timeline
  const renderCutMarkers = useMemo(
    () => offsetCutMarkersToSelection(template?.cutMarkers ?? [], template?.selectionStartMs ?? 0, durationMs),
    [template, durationMs]
  );

  useEffect(() => {
    hasAutoPopulated.current = false;
    const slots = buildRemixTimelineSlots(durationMs, renderCutMarkers);
    setTimelineSlots(slots);
    setVersions([]);
    setActiveVersion(null);
  }, [renderCutMarkers, durationMs]);

  // Auto-populate empty timeline slots with shuffled clips when assets load
  useEffect(() => {
    if (hasAutoPopulated.current) return;
    if (assets.length === 0 || timelineSlots.length === 0) return;
    const allEmpty = timelineSlots.every((s) => s.clipId === null);
    if (!allEmpty) return;
    hasAutoPopulated.current = true;
    const shuffled = seededShuffle(assets, Date.now());
    setTimelineSlots((prev) =>
      prev.map((slot, i) => ({
        ...slot,
        clipId: shuffled[i % shuffled.length]?.id ?? null,
      }))
    );
  }, [assets, timelineSlots]);

  const captions = useMemo(
    () =>
      template
        ? offsetCaptionsToSelection(
            lyricBlocksToCaptions(template.lyricBlocks),
            template.selectionStartMs,
            durationMs
          )
        : [],
    [template, durationMs]
  );
  const creditCost = quoteRemixCredits(durationMs, quantity);
  const selectedStyle = styles.find((style) => style.id === selectedStyleId) ?? LYRIC_STYLES[0];
  const rootCategory = categories.find((category) => category.id === 'bay-area');
  const activeCategory = categories.find((category) => category.id === categoryId);

  const filledSlotCount = timelineSlots.filter((s) => s.clipId !== null).length;
  const totalSlots = timelineSlots.length;

  // Build background clips array aligned 1:1 with timeline slots.
  // Empty slots get a fallback clip so the composition always has one clip per segment.
  const backgroundClips = useMemo(() => {
    const fallback = assets[0] ?? null;
    return timelineSlots.map((slot) => {
      if (slot.clipId) {
        const found = assets.find((a) => a.id === slot.clipId);
        if (found) return found;
      }
      return fallback;
    }).filter(Boolean) as FootageAsset[];
  }, [timelineSlots, assets]);

  // Add clip to next empty slot
  const addClipToTimeline = useCallback((clip: FootageAsset) => {
    setTimelineSlots((prev) => {
      const emptyIdx = prev.findIndex((s) => s.clipId === null);
      if (emptyIdx === -1) return prev;
      return assignClipToSlot(prev, emptyIdx, clip.id);
    });
  }, []);

  const removeClipFromSlot = useCallback((slotIndex: number) => {
    setTimelineSlots((prev) => assignClipToSlot(prev, slotIndex, null));
  }, []);

  const shuffleClips = useCallback(() => {
    const base = assets.length > 0 ? assets : [];
    const shuffled = seededShuffle(base, Date.now());
    setTimelineSlots((prev) =>
      prev.map((slot, i) => ({
        ...slot,
        clipId: shuffled[i % shuffled.length]?.id ?? null,
      }))
    );
    setShuffleEach(quantity > 1);
    setActiveVersion(null);
  }, [assets, quantity]);

  // Auto-generate 10 remix versions with varied footage and lyric styles
  const autoGenerateVersions = useCallback(() => {
    if (assets.length === 0) {
      toast.error('No clips available to generate versions');
      return;
    }
    const generated = generateRemixVersions(assets, durationMs, renderCutMarkers, 10, Date.now() % 100000);
    setVersions(generated);
    setActiveVersion(0);
    setTimelineSlots(generated[0].slots);
    const styleIds = styles.filter((s) => s.id !== 'none').map((s) => s.id as LyricStyleId);
    if (styleIds.length > 0) setSelectedStyleId(styleIds[0]);
    setQuantity(10);
    setShuffleEach(true);
    toast.success('Generated 10 remix versions — pick one to preview');
  }, [assets, durationMs, renderCutMarkers, styles]);

  const applyVersion = useCallback((index: number) => {
    const version = versions[index];
    if (!version) return;
    setActiveVersion(index);
    setTimelineSlots(version.slots);
    const styleIds = styles.filter((s) => s.id !== 'none').map((s) => s.id as LyricStyleId);
    if (styleIds.length > 0) setSelectedStyleId(styleIds[index % styleIds.length]);
  }, [versions, styles]);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, clipId: string) => {
    e.dataTransfer.setData('text/plain', clipId);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleSlotDragOver = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverSlot(slotIndex);
  }, []);

  const handleSlotDragLeave = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  const handleSlotDrop = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    const clipId = e.dataTransfer.getData('text/plain');
    if (clipId) {
      setTimelineSlots((prev) => assignClipToSlot(prev, slotIndex, clipId));
    }
  }, []);

  // Player transport controls
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) {
      p.pause();
      setIsPlaying(false);
    } else {
      p.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const replay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(0);
    p.play();
    setIsPlaying(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay]);

  // Frame tracking
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const interval = setInterval(() => {
      const frame = p.getCurrentFrame();
      setCurrentFrameMs(Math.round((frame / 30) * 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [template]);

  const startExport = () => {
    if (!template) return;
    // Pause the preview player before starting export
    playerRef.current?.pause();
    setIsPlaying(false);
    setConfirmOpen(false);
    setExportModalOpen(true);
  };

  const exportOptions = useMemo(() => ({
    width: aspectRatio === '9:16' ? 1080 : 1920,
    height: aspectRatio === '9:16' ? 1920 : 1080,
    durationMs,
    fps: 30,
    audioUrl,
    captions,
    lyricStyleId: selectedStyleId,
    scale,
    backgroundClips,
    cutMarkers: renderCutMarkers,
    noCuts,
  }), [aspectRatio, durationMs, audioUrl, captions, selectedStyleId, scale, backgroundClips, renderCutMarkers, noCuts]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-black text-white">
        <KanvasLyricsHeader />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" />
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex flex-col bg-black text-white">
        <KanvasLyricsHeader />
        <div className="px-6 py-10">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => navigate(appRoutes.kanvasLyrics)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Back to templates"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h1 className="text-5xl font-black tracking-tight text-[#f97316]">Remix</h1>
            </div>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Pick a saved lyric template to start building beat-synced short-form videos.
            </p>
            <div className="mt-8 rounded-2xl border border-dashed border-[#f97316]/20 bg-[#0A0A0A] p-10 text-center">
              <Music2 className="mx-auto h-8 w-8 text-[#f97316]" />
              <p className="mt-4 text-sm font-bold text-white">No saved lyric templates</p>
              <button
                type="button"
                onClick={() => navigate('/kanvas/lyrics/new')}
                className="mt-5 rounded-full bg-[#f97316] px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black"
              >
                Create template
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const scrubPercent = durationMs > 0 ? (currentFrameMs / durationMs) * 100 : 0;
  const cutMarkerPcts = renderCutMarkers.map((m) =>
    durationMs > 0 ? (m.timestampMs / durationMs) * 100 : 0
  );

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <KanvasLyricsHeader />
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* ── Left rail ── */}
        <aside className="flex flex-col border-r border-white/[0.06] bg-[#0A0A0A] lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden">
          <div className="px-6 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(appRoutes.kanvasLyrics)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Back to templates"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h1 className="text-3xl font-black tracking-tight text-[#f97316]">
                Remix
              </h1>
              <HelpCircle className="h-4 w-4 text-zinc-600" />
            </div>
            <p className="mt-1.5 max-w-md text-xs leading-5 text-zinc-400">
              Build beat-synced videos from your clip library. Pick a template, shuffle your clips, and export.
            </p>
          </div>

          {/* Clip library */}
          <section className="flex-1 overflow-y-auto px-6 pt-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-200">
                <Film className="h-4 w-4 text-[#f97316]" />
                Clip Library
                <span className="text-zinc-500">{assets.length}</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#f97316]">
                <Import className="h-3.5 w-3.5" />
                Import
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={() => toast.info('Imported footage will be persisted in the next storage pass')}
                />
              </label>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500">
                <button type="button" onClick={() => setCategoryId(null)} className="hover:text-zinc-200">All Categories</button>
                <span>/</span>
                <button type="button" onClick={() => setCategoryId(rootCategory?.id ?? null)} className="truncate hover:text-zinc-200">
                  {rootCategory?.name ?? 'Bay Area'}
                </button>
                <span>/</span>
                <span className="font-bold text-zinc-200">{activeCategory?.name ?? 'All'}</span>
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-white/10 bg-[#111] px-2 py-1 text-[11px] text-white outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="shortest">Shortest</option>
                <option value="longest">Longest</option>
              </select>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  draggable
                  onDragStart={(e) => handleDragStart(e, asset.id)}
                  onClick={() => addClipToTimeline(asset)}
                  className="group min-w-0 text-left cursor-grab active:cursor-grabbing"
                >
                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-white/[0.06] bg-[#111]">
                    {asset.posterUrl ? (
                      <img src={asset.posterUrl} alt="" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    ) : (
                      <video src={`${asset.url}#t=0.5`} muted preload="metadata" playsInline className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    )}
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      ⏱{(asset.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-zinc-400 group-hover:text-white">{asset.title}</p>
                </button>
              ))}
            </div>

            {/* Controls */}
            <section className="mt-4 border-t border-white/[0.06] pt-3">
              <button
                type="button"
                onClick={() => setControlsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-zinc-200"
              >
                <span className="inline-flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-[#f97316]" />
                  Controls
                </span>
                <ChevronDown className={cn('h-4 w-4 text-zinc-500 transition-transform', !controlsOpen && '-rotate-90')} />
              </button>

              {controlsOpen && (
                <div className="mt-3 space-y-3 pb-6">
                  <ControlLabel label="Template" />
                  <select
                    value={template.id}
                    onChange={(e) => navigate(`/kanvas/remix/${e.target.value}`)}
                    className="w-full rounded-lg border border-[#f97316]/40 bg-[#111] px-3 py-2 text-sm text-white outline-none"
                  >
                    {templates.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title} ⏱ {Math.round(row.selectionDurationMs / 1000)}s ▦ {row.cutMarkers.length}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <X className="h-3 w-3" />
                      No cuts
                      <HelpCircle className="h-3 w-3 text-zinc-600" />
                    </span>
                    <Switch checked={noCuts} onCheckedChange={setNoCuts} />
                  </div>

                  <ControlLabel label="Lyric Style" />
                  <div className="grid grid-cols-8 gap-1.5">
                    {styles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setSelectedStyleId(style.id as LyricStyleId)}
                        className={cn(
                          'flex h-14 flex-col items-center justify-center rounded-lg border bg-black text-[8px] transition-colors',
                          selectedStyleId === style.id
                            ? 'border-[#f97316] text-orange-200 shadow-[0_0_18px_rgba(249,115,22,0.25)]'
                            : 'border-white/10 text-zinc-500 hover:border-[#f97316]/40'
                        )}
                      >
                        <span
                          className="text-[12px] font-black leading-tight"
                          style={{
                            color: style.accentFill ?? style.fill,
                            fontFamily: style.font,
                            WebkitTextStroke: style.stroke ? `1px ${style.stroke}` : undefined,
                            textShadow: style.shadow?.replace(/\d+px/g, (m) => `${Math.max(1, parseInt(m) / 4)}px`),
                            background: style.background,
                            padding: style.background ? '1px 3px' : undefined,
                            borderRadius: style.background ? '2px' : undefined,
                            textTransform: style.id === 'brat' ? 'lowercase' : 'uppercase',
                          }}
                        >
                          {style.id === 'none' ? '—' : style.id === 'default' ? '+' : 'THE'}
                        </span>
                        <span className="mt-0.5">{style.name}</span>
                      </button>
                    ))}
                  </div>

                  <ControlLabel label={`Scale: ${scale.toFixed(2)}x`} />
                  <Slider min={0.4} max={1.4} step={0.05} value={[scale]} onValueChange={(v) => setScale(v[0] ?? DEFAULT_SCALE)} />

                  <ControlLabel label="Clip Ratio" />
                  <SelectLike value={clipRatio} onChange={(v) => setClipRatio(v as RatioFilter)} options={['all', '9:16', '1:1', '16:9']} labels={{ all: 'All Ratios' }} icon={<Grid2X2 className="h-4 w-4" />} />

                  <ControlLabel label="Filter" />
                  <SelectLike value={tagFilter} onChange={setTagFilter} options={['all', '8mm', 'Modern', 'Aerial', 'Abstract', 'Nature']} labels={{ all: 'All' }} icon={<Filter className="h-4 w-4" />} />

                  {/* Progress bar */}
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-[#f97316] to-amber-400"
                        style={{ width: `${Math.min(100, (filledSlotCount / Math.max(1, totalSlots)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-[#f97316]">
                      {filledSlotCount}/{totalSlots}
                    </p>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={shuffleClips}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-4 py-2 text-sm font-bold text-orange-200 hover:bg-[#f97316]/15"
                    >
                      <Shuffle className="h-4 w-4" />
                      Shuffle
                    </button>
                    <div className="flex items-center rounded-lg border border-white/10 bg-[#111]">
                      <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-zinc-300">-</button>
                      <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                      <button type="button" onClick={() => setQuantity((q) => Math.min(10, q + 1))} className="px-3 py-2 text-zinc-300">+</button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={autoGenerateVersions}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-400/15"
                  >
                    <Sparkles className="h-4 w-4" />
                    Auto-generate 10 versions
                  </button>

                  {versions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {versions.map((version, i) => (
                        <button
                          key={version.seed}
                          type="button"
                          onClick={() => applyVersion(i)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors',
                            activeVersion === i
                              ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                              : 'border-white/10 bg-white/5 text-zinc-400 hover:border-cyan-400/40 hover:text-zinc-200'
                          )}
                        >
                          V{i + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={shuffleClips}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      disabled={exporting}
                      className="col-span-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] px-4 py-3 text-sm font-black text-black shadow-[0_0_22px_rgba(249,115,22,0.24)] disabled:opacity-60"
                    >
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Export
                      <span className="rounded-full bg-black/20 px-2 py-0.5">◈ {creditCost}</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          </section>
        </aside>

        {/* ── Right canvas ── */}
        <main className="relative flex flex-col bg-black">
          {/* Aspect ratio toggle */}
          <div className="absolute right-4 top-2 z-10 inline-flex overflow-hidden rounded-lg border border-white/10 bg-[#111] text-xs font-bold">
            {(['16:9', '9:16'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={cn('px-3 py-1.5', aspectRatio === ratio ? 'bg-[#f97316]/20 text-[#f97316]' : 'text-zinc-400')}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* Preview player */}
          <div className="flex items-center justify-center px-4 py-3" style={{ height: 'calc(100vh - 240px)', minHeight: '300px' }}>
            <div
              className="relative overflow-hidden rounded-xl border border-white/10 bg-[#050505]"
              style={{
                aspectRatio: aspectRatio === '9:16' ? '9/16' : '16/9',
                maxHeight: '100%',
                maxWidth: '100%',
                width: aspectRatio === '9:16' ? 'auto' : '100%',
                height: aspectRatio === '9:16' ? '100%' : 'auto',
              }}
            >
              <Player
                ref={playerRef}
                component={LyricRemixComposition}
                durationInFrames={Math.max(1, Math.round((durationMs / 1000) * 30))}
                fps={30}
                compositionWidth={aspectRatio === '9:16' ? 1080 : 1920}
                compositionHeight={aspectRatio === '9:16' ? 1920 : 1080}
                inputProps={{
                  audioUrl,
                  captions,
                  lyricStyleId: selectedStyleId,
                  scale,
                  backgroundClips,
                  cutMarkers: renderCutMarkers,
                  noCuts,
                  aspectRatio,
                  durationMs,
                }}
                style={{ width: '100%', height: '100%' }}
                loop
              />
            </div>
          </div>

          {/* Custom transport controls */}
          <div className="mx-auto flex w-full items-center gap-3 px-4 py-1.5">
            <button type="button" onClick={replay} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" aria-label="Replay">
              <Repeat2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <span className="font-mono text-xs tabular-nums text-zinc-400">
              {fmtTime(currentFrameMs)} / {fmtTime(durationMs)}
            </span>

            {/* Scrub bar with marker ticks */}
            <div className="relative flex-1 h-6 flex items-center">
              <div className="relative w-full h-2 rounded-full bg-white/10 overflow-hidden">
                {/* Segmented colored bar */}
                <div className="absolute inset-0">
                  {timelineSlots.map((slot, i) => {
                    const left = durationMs > 0 ? (slot.startMs / durationMs) * 100 : 0;
                    const width = durationMs > 0 ? ((slot.endMs - slot.startMs) / durationMs) * 100 : 0;
                    const colors = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-[#f97316]', 'bg-pink-500', 'bg-yellow-500'];
                    const filled = slot.clipId !== null;
                    return (
                      <div
                        key={slot.slotIndex}
                        className={cn(
                          'absolute top-0 bottom-0',
                          filled ? colors[i % colors.length] : 'bg-white/5'
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    );
                  })}
                </div>
                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10"
                  style={{ left: `${scrubPercent}%` }}
                />
              </div>

              {/* Cut marker ticks */}
              {cutMarkerPcts.map((pct, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full w-[2px] bg-rose-500"
                  style={{ left: `${pct}%` }}
                />
              ))}
            </div>
          </div>

          {/* Lag disclaimer */}
          <div className="mx-auto mb-1 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-300">
            <Info className="h-3.5 w-3.5" />
            The preview may lag during playback — don't worry, your export will be a perfectly smooth HD video!
          </div>

          {/* Progress bar for timeline */}
          <div className="mx-4 mb-1">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-[#f97316] to-amber-400"
                style={{ width: `${Math.min(100, (filledSlotCount / Math.max(1, totalSlots)) * 100)}%` }}
              />
            </div>
            <p className="mt-0.5 text-right text-[10px] text-[#f97316]">
              {filledSlotCount}/{totalSlots}
            </p>
          </div>

          {/* ── Timeline strip ── */}
          <div className="border-t border-white/[0.06] bg-[#0A0A0A] px-4 py-1.5">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {timelineSlots.map((slot) => {
                const clip = slot.clipId ? assets.find((a) => a.id === slot.clipId) : null;
                const slotDurationSec = ((slot.endMs - slot.startMs) / 1000).toFixed(1);
                const isDragOver = dragOverSlot === slot.slotIndex;
                // Proportional width based on slot duration relative to total
                const widthPct = durationMs > 0 ? ((slot.endMs - slot.startMs) / durationMs) * 100 : 100 / Math.max(1, timelineSlots.length);
                const minW = 72;
                return (
                  <div
                    key={slot.slotIndex}
                    onDragOver={(e) => handleSlotDragOver(e, slot.slotIndex)}
                    onDragLeave={handleSlotDragLeave}
                    onDrop={(e) => handleSlotDrop(e, slot.slotIndex)}
                    className={cn(
                      'group relative shrink-0 overflow-hidden rounded-lg border bg-[#111] transition-colors h-24',
                      clip ? 'border-[#f97316]/20' : 'border-dashed border-white/10',
                      isDragOver && 'border-[#f97316] border-solid bg-[#f97316]/10 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
                    )}
                    style={{ width: `max(${minW}px, ${widthPct}%)` }}
                  >
                    {clip ? (
                      <>
                        {clip.posterUrl ? (
                          <img src={clip.posterUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <video src={`${clip.url}#t=0.5`} muted preload="metadata" playsInline className="h-full w-full object-cover" />
                        )}
                        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-[10px] font-bold text-[#f97316]">
                          {slot.slotIndex + 1}
                        </span>
                        <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-[9px] text-white">
                          {slotDurationSec}s
                        </span>
                        <button
                          type="button"
                          onClick={() => removeClipFromSlot(slot.slotIndex)}
                          className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1 text-white group-hover:block"
                          aria-label="Remove clip"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center">
                        <span className="text-[10px] font-bold text-zinc-600">{slot.slotIndex + 1}</span>
                        <span className="text-[9px] text-zinc-600">{slotDurationSec}s</span>
                        <span className="text-[8px] text-zinc-700">Drop video here</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#f97316]/20 bg-[#0A0A0A] p-6 shadow-[0_0_40px_rgba(249,115,22,0.16)]">
            <h2 className="text-lg font-black text-white">Confirm export</h2>
            <p className="mt-2 text-sm text-zinc-400">
              This will spend {quantity} × {Math.ceil(durationMs / 1000)} = {creditCost} credits.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300">Cancel</button>
              <button type="button" onClick={startExport} className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-bold text-black">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas export modal */}
      {template && (
        <ExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          exportOptions={exportOptions}
          templateTitle={template.title}
        />
      )}

      <button
        type="button"
        aria-label="Help"
        className="fixed bottom-8 right-8 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f97316] text-black shadow-[0_0_28px_rgba(249,115,22,0.45)]"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </div>
  );
};

function ControlLabel({ label }: { label: string }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>;
}

function SelectLike({
  value,
  onChange,
  options,
  labels = {},
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">{icon}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#f97316]/25 bg-[#111] py-2 pl-10 pr-3 text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

export default KanvasRemix;
