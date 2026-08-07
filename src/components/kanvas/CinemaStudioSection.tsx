import { useState, useCallback } from 'react';
import {
  Sparkles, Search, Plus, ChevronLeft, ChevronRight,
  ImageIcon, Video, Users, Shuffle, Loader2, Clapperboard,
  Camera, Film, Music, X,
  Upload, Heart, Volume2, VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';
import type {
  KanvasAsset, KanvasJob, KanvasAssetType, KanvasModel,
} from '@/features/kanvas/types';
import type { KanvasCinemaSettings } from '@/features/kanvas/types';
import type { CharacterBlueprint, CharacterMention } from '@/types/character-creation';
import { createBlueprint } from '@/services/characterBlueprintService';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { MentionDropdown } from '@/components/character-creation/MentionDropdown';
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { musicPolishAssets } from '@/lib/musicPolishAssets';
type CinemaTab = 'image' | 'video' | 'cast';
type FilterItem = 'genre' | 'budget' | 'era' | 'archetype' | 'identity' | 'appearance' | 'details' | 'outfit';

interface CinemaStudioProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  cinemaSettings: Record<string, unknown>;
  onCinemaSettingsChange: (s: Record<string, unknown>) => void;
  cinemaCameraSettings: KanvasCinemaSettings;
  onCinemaCameraSettingsChange: (s: KanvasCinemaSettings) => void;
  currentModel: KanvasModel | null;
  models: KanvasModel[];
  onModelChange: (id: string) => void;
  submitting: boolean;
  onGenerate: () => void;
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  assets: KanvasAsset[];
  onUpload: (file: File, type: KanvasAssetType) => void;
  uploading: boolean;
  /* @mention integration */
  mentionSuggestions?: CharacterMention[];
  showMentionDropdown?: boolean;
  onMentionSelect?: (mention: CharacterMention) => void;
  onMentionTogglePin?: (mention: CharacterMention) => void;
  onCloseMentions?: () => void;
  onMentionChange?: (text: string, cursorPos?: number) => void;
  characterMentions?: CharacterMention[];
}

/* ── Data ── */
const FILTER_PILLS: { id: FilterItem; label: string }[] = [
  { id: 'genre', label: 'Genre' },
  { id: 'budget', label: 'Budget in millions' },
  { id: 'era', label: 'Era' },
  { id: 'archetype', label: 'Archetype' },
  { id: 'identity', label: 'Identity' },
  { id: 'appearance', label: 'Physical Appearance' },
  { id: 'details', label: 'Details' },
  { id: 'outfit', label: 'Outfit' },
];

const GENRE_CARDS = [
  { title: 'Gothic Storm', color: '#e5e7eb', image: musicPolishAssets.landing.heroGothicStorm.src, alt: musicPolishAssets.landing.heroGothicStorm.alt, style: 'Monochrome key art' },
  { title: 'Rooftop Motion', color: '#67e8f9', image: musicPolishAssets.landing.rooftopChoreography.src, alt: musicPolishAssets.landing.rooftopChoreography.alt, style: 'Aerial choreography' },
  { title: 'Rain Anime', color: '#fbbf24', image: musicPolishAssets.landing.animatedRainStreet.src, alt: musicPolishAssets.landing.animatedRainStreet.alt, style: 'Illustrated street' },
  { title: 'Soundstage', color: '#fb923c', image: musicPolishAssets.cinema.soundstage.src, alt: musicPolishAssets.cinema.soundstage.alt, style: 'Hyperreal production' },
  { title: 'Neon Street', color: '#22d3ee', image: musicPolishAssets.cinema.neonStreet.src, alt: musicPolishAssets.cinema.neonStreet.alt, style: 'Night performance' },
  { title: 'Close-up', color: '#f97316', image: musicPolishAssets.cinema.performanceCloseup.src, alt: musicPolishAssets.cinema.performanceCloseup.alt, style: 'Artist frame' },
  { title: 'Cast Board', color: '#a3e635', image: musicPolishAssets.cinema.castBoard.src, alt: musicPolishAssets.cinema.castBoard.alt, style: 'Treatment board' },
  { title: 'Chrome Prop', color: '#cbd5e1', image: musicPolishAssets.blueprints.microphone.src, alt: musicPolishAssets.blueprints.microphone.alt, style: 'Object anchor' },
];

const CAMERA_PRESETS = [
  { label: 'Static', desc: 'No movement' },
  { label: 'Handheld', desc: 'Natural shake' },
  { label: 'Zoom Out', desc: 'Reveal shot' },
  { label: 'Zoom In', desc: 'Focus pull' },
  { label: 'Camera Follows', desc: 'Tracking shot' },
  { label: 'Pan Left', desc: 'Horizontal pan' },
];

type BuilderKind = 'anchor' | 'location';

const BUILDER_CONFIG: Record<BuilderKind, {
  title: string;
  blueprintKind: CharacterBlueprint['kind'];
  namePlaceholder: string;
  descPlaceholder: string;
  presets: { src: string; alt: string }[];
}> = {
  anchor: {
    title: 'Create Artist Anchor',
    blueprintKind: 'character',
    namePlaceholder: 'Name your anchor (e.g. Lead Vocalist)...',
    descPlaceholder: 'Describe the performer — look, wardrobe, energy...',
    presets: [
      { src: musicPolishAssets.blueprints.vocalist.src, alt: musicPolishAssets.blueprints.vocalist.alt },
      { src: musicPolishAssets.talent.leadVocalist.src, alt: musicPolishAssets.talent.leadVocalist.alt },
      { src: musicPolishAssets.talent.motionStage.src, alt: musicPolishAssets.talent.motionStage.alt },
      { src: musicPolishAssets.talent.faceWardrobe.src, alt: musicPolishAssets.talent.faceWardrobe.alt },
    ],
  },
  location: {
    title: 'Create Location',
    blueprintKind: 'environment',
    namePlaceholder: 'Name your location (e.g. Neon Street)...',
    descPlaceholder: 'Describe the set — lighting, mood, architecture...',
    presets: [
      { src: musicPolishAssets.blueprints.soundstage.src, alt: musicPolishAssets.blueprints.soundstage.alt },
      { src: musicPolishAssets.cinema.neonStreet.src, alt: musicPolishAssets.cinema.neonStreet.alt },
      { src: musicPolishAssets.cinema.soundstage.src, alt: musicPolishAssets.cinema.soundstage.alt },
      { src: musicPolishAssets.landing.rooftopChoreography.src, alt: musicPolishAssets.landing.rooftopChoreography.alt },
    ],
  },
};

const FALLBACK_AVATARS = [
  musicPolishAssets.blueprints.vocalist.src,
  musicPolishAssets.cinema.performanceCloseup.src,
  musicPolishAssets.landing.animatedRainStreet.src,
  musicPolishAssets.landing.heroGothicStorm.src,
];

const TAB_LIST: { id: CinemaTab; label: string; Icon: LucideIcon }[] = [
  { id: 'image', label: 'Image', Icon: ImageIcon },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'cast', label: 'Cast', Icon: Users },
];

function getModelProvider(model: KanvasModel | undefined | null): string {
  if (!model) return "other";
  const id = model.id.toLowerCase();
  if (id.startsWith("gmi/")) return "gmi-cloud";
  if (id.includes("nano-banana") || id.includes("gpt-image")) return id.includes("gpt") ? "openai" : "google";
  if (id.includes("flux")) return "black_forest_labs";
  if (id.includes("qwen")) return "alibaba";
  if (id.includes("ideogram")) return "ideogram";
  if (id.includes("recraft")) return "recraft";
  if (id.includes("seedream") || id.includes("seedance")) return "bytedance";
  if (id.includes("grok")) return "xai";
  return "other";
}

export default function CinemaStudioSection({
  prompt, onPromptChange, cinemaSettings, onCinemaSettingsChange,
  cinemaCameraSettings, onCinemaCameraSettingsChange,
  currentModel, models, onModelChange,
  submitting, onGenerate, jobs, selectedJob, assets, onUpload, uploading,
  mentionSuggestions = [], showMentionDropdown = false,
  onMentionSelect, onMentionTogglePin, onCloseMentions, onMentionChange,
  characterMentions = [],
}: CinemaStudioProps) {
  const { tier } = useUserTier();
  const [activeTab, setActiveTab] = useState<CinemaTab>('image');
  const [activeFilter, setActiveFilter] = useState<FilterItem>('genre');
  const [genMode, setGenMode] = useState<'image' | 'video'>('image');
  const [scenes, setScenes] = useState(1);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [quality, setQuality] = useState('2K');
  const [resolution, setResolution] = useState('1080p');
  const [soundOn, setSoundOn] = useState(true);
  const [cameraPreset, setCameraPreset] = useState('Static');
  const [duration, setDuration] = useState(12);
  const [genreScroll, setGenreScroll] = useState(0);

  /* ── Anchor / Location builder state ── */
  const [builderKind, setBuilderKind] = useState<BuilderKind | null>(null);
  const [builderName, setBuilderName] = useState('');
  const [builderDesc, setBuilderDesc] = useState('');
  const [builderImage, setBuilderImage] = useState<string | null>(null);
  const [builderSaving, setBuilderSaving] = useState(false);
  const [createdBlueprints, setCreatedBlueprints] = useState<CharacterBlueprint[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);

  const creditCost = genMode === 'video' ? 24 : (currentModel?.credits ?? 2);

  // Resolve character avatars — created blueprints first, then real
  // blueprints from mentions, falling back to stock imagery.
  const createdAvatars = createdBlueprints.map((bp) => ({
    src: bp.imageUrl ?? '',
    name: bp.name,
    slug: bp.slug,
  }));
  const createdSlugs = new Set(createdAvatars.map((a) => a.slug));
  const baseAvatars = characterMentions.length > 0
    ? characterMentions
        .filter((m) => !createdSlugs.has(m.slug))
        .map(m => ({ src: m.imageUrl ?? '', name: m.name, slug: m.slug }))
    : FALLBACK_AVATARS.map((src, i) => ({ src, name: `Character ${i + 1}`, slug: '' }));
  const avatars = [...createdAvatars, ...baseAvatars];

  const openBuilder = useCallback((kind: BuilderKind) => {
    setBuilderKind(kind);
    setBuilderName('');
    setBuilderDesc('');
    setBuilderImage(null);
  }, []);

  const closeBuilder = useCallback(() => {
    if (builderSaving) return;
    setBuilderKind(null);
  }, [builderSaving]);

  const handleBuilderSave = useCallback(async () => {
    if (!builderKind) return;
    const name = builderName.trim();
    if (!name) {
      toast.error(builderKind === 'anchor' ? 'Give your anchor a name.' : 'Give your location a name.');
      return;
    }

    const config = BUILDER_CONFIG[builderKind];
    const description = builderDesc.trim();
    setBuilderSaving(true);
    try {
      const blueprint = await createBlueprint({
        name,
        kind: config.blueprintKind,
        traits: {},
        faceDetails: {},
        bodyDetails: {},
        styleDetails: description ? { customPrompt: description } : {},
        promptFragment: description || name,
        tags: [builderKind === 'anchor' ? 'anchor' : 'location', 'cinema-studio'],
        imageUrl: builderImage,
        thumbnailUrl: builderImage,
        referenceImages: builderImage
          ? [{
              imageUrl: builderImage,
              label: 'Cinema Studio preset reference',
              generationRole: 'primary',
              isPrimary: true,
            }]
          : [],
      });
      setCreatedBlueprints((prev) => [blueprint, ...prev]);
      useCharacterCreationStore.getState().addBlueprint(blueprint);
      toast.success(`"${blueprint.name}" saved! Use @${blueprint.slug} to reference.`);
      setBuilderKind(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBuilderSaving(false);
    }
  }, [builderKind, builderName, builderDesc, builderImage]);

  const handleAvatarSelect = useCallback((slug: string) => {
    if (!slug) return;
    const deselecting = selectedSlugs.includes(slug);
    setSelectedSlugs((prev) =>
      deselecting ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokenPattern = new RegExp(`(^|\\s)@${escaped}(?=\\s|$)`, 'g');
    if (deselecting) {
      onPromptChange(prompt.replace(tokenPattern, '$1').replace(/\s{2,}/g, ' ').trim());
    } else if (!tokenPattern.test(prompt)) {
      const mentionToken = `@${slug}`;
      onPromptChange(prompt.trim() ? `${prompt.trimEnd()} ${mentionToken}` : mentionToken);
    }
  }, [prompt, onPromptChange, selectedSlugs]);

  // Handle prompt change + mention detection
  const handlePromptInput = useCallback((value: string) => {
    onPromptChange(value);
    onMentionChange?.(value);
  }, [onPromptChange, onMentionChange]);

  // Handle mention selection
  const handleMentionSelect = useCallback((mention: CharacterMention) => {
    onMentionSelect?.(mention);
  }, [onMentionSelect]);

  /* ── Prompt Input with @mention ── */
  function renderPromptInput(placeholder: string) {
    return (
      <div className="relative flex-1 min-w-0">
        <MentionDropdown
          suggestions={mentionSuggestions}
          onSelect={handleMentionSelect}
          onTogglePin={onMentionTogglePin}
          visible={showMentionDropdown}
        />
        <div className="bg-kanvas-surface-2 rounded-full px-4 py-2.5 flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(e) => handlePromptInput(e.target.value)}
            onBlur={() => onCloseMentions?.()}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none text-white placeholder-kanvas-text-faint text-sm focus:outline-none min-w-0"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            onKeyDown={(e) => e.key === 'Enter' && !submitting && onGenerate()}
          />
        </div>
      </div>
    );
  }

  /* ── IMAGE BOTTOM BAR ── */
  function renderImageBar() {
    return (
      <div className="absolute bottom-8 left-0 right-0 z-30">
        <div className="bg-kanvas-surface-1/95 backdrop-blur-2xl border-t border-white/[0.06] px-6 py-3">
          <div className="max-w-[1400px] mx-auto flex items-center gap-2.5">
            {/* Mode toggle */}
            <div className="flex bg-kanvas-surface-2 rounded-full p-0.5 flex-shrink-0">
              <button
                onClick={() => setGenMode('image')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all ${
                  genMode === 'image' ? 'bg-kanvas-accent text-kanvas-accent-contrast' : 'text-kanvas-text-muted hover:text-white'
                }`}
              >
                <ImageIcon className="h-3 w-3" /> Image
              </button>
              <button
                onClick={() => setGenMode('video')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all ${
                  genMode === 'video' ? 'bg-kanvas-accent text-kanvas-accent-contrast' : 'text-kanvas-text-muted hover:text-white'
                }`}
              >
                <Video className="h-3 w-3" /> Video
              </button>
            </div>

            {/* + button */}
            <button className="w-9 h-9 rounded-full bg-kanvas-surface-2 border border-white/[0.06] flex items-center justify-center text-kanvas-text-muted hover:text-kanvas-accent transition-colors flex-shrink-0">
              <Plus className="h-4 w-4" />
            </button>

            {/* Prompt with @mention */}
            {renderPromptInput('Describe your scene — use @ to add characters & locations')}

            {/* Scenes */}
            <button className="text-[10px] uppercase tracking-widest text-kanvas-text-muted hover:text-white border border-white/[0.06] rounded-full px-3 py-2 transition-colors flex-shrink-0">
              Scenes
            </button>

            {/* Counter */}
            <div className="flex items-center gap-1 text-kanvas-text-muted flex-shrink-0 bg-kanvas-surface-2 rounded-full px-2 py-1.5">
              <button onClick={() => setScenes(Math.max(1, scenes - 1))} className="hover:text-white p-0.5"><ChevronLeft className="h-3 w-3" /></button>
              <span className="text-[10px] font-bold text-white min-w-[24px] text-center">{scenes}/4</span>
              <button onClick={() => setScenes(Math.min(4, scenes + 1))} className="hover:text-white p-0.5"><ChevronRight className="h-3 w-3" /></button>
            </div>

            {/* Aspect */}
            <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-white/[0.06] rounded-full px-3 py-2 flex-shrink-0 hover:text-white transition-colors">{aspectRatio}</button>

            {/* Quality */}
            <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-white/[0.06] rounded-full px-3 py-2 flex-shrink-0 flex items-center gap-1 hover:text-white transition-colors">
              <Heart className="h-3 w-3" /> {quality}
            </button>

            {/* Characters & Locations card */}
            <button className="bg-kanvas-surface-2 border border-white/[0.06] rounded-xl px-4 py-2 flex items-center gap-3 hover:border-white/10 transition-colors flex-shrink-0">
              <div className="flex -space-x-2">
                {avatars.slice(0, 3).map((a, i) => (
                  <div key={i} className="w-6 h-6 rounded-full overflow-hidden border border-kanvas-surface-2">
                    {a.src ? (
                      <img src={a.src} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-kanvas-surface-3 flex items-center justify-center">
                        <Users className="h-3 w-3 text-kanvas-text-faint" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-kanvas-text-secondary whitespace-nowrap">Characters and Locations</span>
            </button>

            {/* Generate */}
            <button
              onClick={onGenerate}
              disabled={submitting || !prompt.trim()}
              className="bg-kanvas-accent text-kanvas-accent-contrast font-bold uppercase tracking-widest text-[11px] px-6 py-2.5 rounded-full flex items-center gap-2 hover:shadow-[0_0_25px_hsl(var(--kanvas-accent)/0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              GENERATE ✦ {creditCost}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── VIDEO BOTTOM BAR ── */
  function renderVideoBar() {
    return (
      <div className="absolute bottom-8 left-0 right-0 z-30">
        <div className="bg-kanvas-surface-1/95 backdrop-blur-2xl border-t border-white/[0.06] px-6 py-3">
          <div className="max-w-[1400px] mx-auto space-y-2.5">
            {/* Row 1: Prompt with @mention */}
            <div className="flex items-center gap-2.5">
              {renderPromptInput('Describe your scene — use @ to add characters & locations')}
            </div>

            {/* Row 2: Controls */}
            <div className="flex items-center gap-2">
              <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-white/[0.06] rounded-full px-3 py-1.5 flex-shrink-0 hover:text-white transition-colors">
                Single shot
              </button>
              <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-white/[0.06] rounded-full px-3 py-1.5 flex-shrink-0 hover:text-white transition-colors">{aspectRatio}</button>
              <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-white/[0.06] rounded-full px-3 py-1.5 flex-shrink-0 hover:text-white transition-colors">{resolution}</button>
              <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-white/[0.06] rounded-full px-3 py-1.5 flex-shrink-0 flex items-center gap-1.5 hover:text-white transition-colors">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                General
              </button>
              <button
                onClick={() => setSoundOn(!soundOn)}
                className={`text-[10px] uppercase tracking-widest border border-white/[0.06] rounded-full px-3 py-1.5 flex-shrink-0 flex items-center gap-1.5 transition-colors ${
                  soundOn ? 'text-kanvas-accent' : 'text-kanvas-text-muted'
                }`}
              >
                {soundOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                Sound {soundOn ? 'On' : 'Off'}
              </button>
              <div className="flex items-center gap-1 text-kanvas-text-muted flex-shrink-0 bg-kanvas-surface-2 rounded-full px-2 py-1">
                <button onClick={() => setScenes(Math.max(1, scenes - 1))} className="hover:text-white p-0.5"><ChevronLeft className="h-3 w-3" /></button>
                <span className="text-[10px] font-bold text-white min-w-[24px] text-center">{scenes}/4</span>
                <button onClick={() => setScenes(Math.min(4, scenes + 1))} className="hover:text-white p-0.5"><ChevronRight className="h-3 w-3" /></button>
              </div>

              <div className="flex-1" />

              <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-dashed border-white/10 rounded-full px-4 py-1.5 flex items-center gap-1.5 hover:text-white hover:border-white/20 transition-colors flex-shrink-0">
                <Plus className="h-3 w-3" /> Start Frame
              </button>
              <button className="text-[10px] uppercase tracking-widest text-kanvas-text-secondary border border-dashed border-white/10 rounded-full px-4 py-1.5 flex items-center gap-1.5 hover:text-white hover:border-white/20 transition-colors flex-shrink-0">
                <Plus className="h-3 w-3" /> End Frame
              </button>

              <button
                onClick={onGenerate}
                disabled={submitting || !prompt.trim()}
                className="bg-kanvas-accent text-kanvas-accent-contrast font-bold uppercase tracking-widest text-[11px] px-6 py-2 rounded-full flex items-center gap-2 hover:shadow-[0_0_25px_hsl(var(--kanvas-accent)/0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                GENERATE ✦ {creditCost}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── IMAGE TAB ── */
  function renderImageTab() {
    return (
      <div className="flex-1 flex flex-col items-center justify-center relative pb-40">
        <img
          src={musicPolishAssets.cinema.soundstage.src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-kanvas-bg/90 to-kanvas-bg pointer-events-none" />
        <div className="relative z-10 text-center max-w-3xl px-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/70 font-bold mb-4">PREMIUM MUSIC VIDEO STUDIO</p>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.1] mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <span className="bg-gradient-to-r from-cyan-200 via-white to-orange-200 bg-clip-text text-transparent">
              Build the treatment
            </span>
            <br />
            <span className="text-white">before the camera rolls.</span>
          </h1>
          <p className="text-kanvas-text-muted text-sm mb-10 max-w-lg mx-auto">
            Define fictional artists, sets, camera language, and visual motifs with production-grade stills.
          </p>

          {/* Character Avatars — real blueprints or fallback */}
          <div className="flex justify-center gap-3 mb-8">
            {avatars.slice(0, 4).map((a, i) => (
              <button
                key={`${a.slug || a.name}-${i}`}
                onClick={() => handleAvatarSelect(a.slug)}
                className={`w-14 h-14 rounded-full border-2 overflow-hidden transition-colors ${
                  a.slug && selectedSlugs.includes(a.slug)
                    ? 'border-kanvas-accent shadow-[0_0_16px_hsl(var(--kanvas-accent)/0.35)]'
                    : 'border-white/10 hover:border-kanvas-accent/40'
                }`}
                title={a.name}
                aria-label={a.slug ? `Select ${a.name}` : a.name}
                aria-pressed={Boolean(a.slug) && selectedSlugs.includes(a.slug)}
              >
                {a.src ? (
                  <img src={a.src} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-kanvas-surface-3 flex items-center justify-center">
                    <Users className="h-5 w-5 text-kanvas-text-faint" />
                  </div>
                )}
              </button>
            ))}
            <button
              onClick={() => openBuilder('anchor')}
              aria-label="Create Anchor"
              className="w-14 h-14 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center text-kanvas-text-muted hover:border-kanvas-accent/30 hover:text-kanvas-accent transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* Quick action cards */}
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <div className="bg-kanvas-surface-2/90 border border-white/[0.06] rounded-lg p-5 text-left hover:border-white/10 transition-colors cursor-pointer backdrop-blur">
              <Users className="h-5 w-5 text-kanvas-accent mb-3" />
              <p className="text-xs font-bold text-white mb-1">Artist Anchors</p>
              <p className="text-[10px] text-kanvas-text-muted leading-relaxed">Keep performers consistent across scenes</p>
              <button onClick={() => openBuilder('anchor')} className="mt-3 text-[9px] uppercase tracking-widest text-kanvas-accent font-bold hover:text-orange-300 transition-colors">+ Create Anchor</button>
            </div>
            <div className="bg-kanvas-surface-2/90 border border-white/[0.06] rounded-lg p-5 text-left hover:border-white/10 transition-colors cursor-pointer backdrop-blur">
              <Film className="h-5 w-5 text-kanvas-accent mb-3" />
              <p className="text-xs font-bold text-white mb-1">Stage Worlds</p>
              <p className="text-[10px] text-kanvas-text-muted leading-relaxed">Lock soundstages, streets, and lyric plates</p>
              <button onClick={() => openBuilder('location')} className="mt-3 text-[9px] uppercase tracking-widest text-kanvas-accent font-bold hover:text-orange-300 transition-colors">+ Create Location</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── VIDEO TAB ── */
  function renderVideoTab() {
    return (
      <div className="flex-1 overflow-y-auto pb-40 px-8 pt-8" style={{ scrollbarWidth: 'none' }}>
        <div className="max-w-[1200px] mx-auto">
          {/* Camera Presets */}
          <p className="text-[9px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-4">Camera Movement</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-10">
            {CAMERA_PRESETS.map((preset) => {
              const isActive = cameraPreset === preset.label;
              return (
                <button
                  key={preset.label}
                  onClick={() => setCameraPreset(preset.label)}
                  className={`rounded-lg overflow-hidden border transition-all ${
                    isActive ? 'border-kanvas-accent/40 shadow-[0_0_20px_hsl(var(--kanvas-accent)/0.1)]' : 'border-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <div className="aspect-video bg-gradient-to-br from-kanvas-surface-3 to-kanvas-surface-1 flex items-center justify-center">
                    <Camera className={`h-6 w-6 ${isActive ? 'text-kanvas-accent' : 'text-kanvas-text-faint'}`} />
                  </div>
                  <div className="bg-kanvas-surface-1 px-3 py-2">
                    <p className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-kanvas-text-secondary'}`}>{preset.label}</p>
                    <p className="text-[9px] text-kanvas-text-faint">{preset.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Director Panel */}
          <p className="text-[9px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-4">Director Panel</p>
          <div className="bg-kanvas-surface-1 border border-white/[0.06] rounded-lg p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-kanvas-text-muted mb-3">Characters</p>
                <div className="flex gap-2">
                  {avatars.slice(0, 2).map((a, i) => (
                    <div key={i} className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                      {a.src ? (
                        <img src={a.src} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-kanvas-surface-3 flex items-center justify-center">
                          <Users className="h-4 w-4 text-kanvas-text-faint" />
                        </div>
                      )}
                    </div>
                  ))}
                  <button className="w-10 h-10 rounded-full border border-dashed border-white/10 flex items-center justify-center text-kanvas-text-faint">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-kanvas-text-muted mb-3">Movement</p>
                <div className="bg-kanvas-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white">Auto</div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-kanvas-text-muted mb-3">Speed Ramp</p>
                <div className="bg-kanvas-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white">Auto</div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-kanvas-text-muted mb-3">Duration</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDuration(Math.max(5, duration - 1))} className="text-kanvas-text-muted hover:text-white"><ChevronLeft className="h-3 w-3" /></button>
                  <span className="text-sm font-bold text-white">{duration}s</span>
                  <button onClick={() => setDuration(Math.min(30, duration + 1))} className="text-kanvas-text-muted hover:text-white"><ChevronRight className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── CAST TAB ── */
  function renderCastTab() {
    const scrollCarousel = (dir: 'left' | 'right') => {
      setGenreScroll((prev) => {
        const step = 220;
        return dir === 'left' ? Math.max(0, prev - step) : prev + step;
      });
    };

    return (
      <div className="flex-1 overflow-y-auto pb-40" style={{ scrollbarWidth: 'none' }}>
        <div className="pt-16 pb-12 flex flex-col items-center relative z-10 px-8">
          {/* Floating avatars — real character blueprints */}
          <div className="flex justify-center gap-4 mb-8">
            {avatars.slice(0, 4).map((a, i) => (
              <div
                key={i}
                className="w-20 h-20 rounded-full border-2 border-white/10 overflow-hidden shadow-[0_0_30px_hsl(var(--kanvas-accent)/0.1)]"
                style={{ transform: `translateY(${i % 2 === 0 ? -10 : 10}px)` }}
                title={a.name}
              >
                {a.src ? (
                  <img src={a.src} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-kanvas-surface-3 flex items-center justify-center">
                    <Users className="h-6 w-6 text-kanvas-text-faint" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-center mb-3 text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Craft Your Dream Movie Cast
          </h1>

          <p className="text-kanvas-text-muted text-sm max-w-lg text-center mb-10">
            Select options of your cast to generate
          </p>

          {/* Filter Pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-10 max-w-4xl">
            {FILTER_PILLS.map((pill) => {
              const isActive = activeFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => setActiveFilter(pill.id)}
                  className={`px-6 py-2.5 rounded-full text-[10px] uppercase tracking-[0.15em] font-bold transition-all ${
                    isActive
                      ? 'bg-kanvas-accent text-kanvas-accent-contrast'
                      : 'border border-white/10 text-kanvas-text-secondary hover:bg-white/[0.03] hover:text-white'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Genre Carousel */}
          <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-4 self-start max-w-[1400px] w-full mx-auto">
            Select the genre of your movie
          </p>
          <div className="w-full max-w-[1400px] relative">
            <button
              onClick={() => scrollCarousel('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 rounded-full bg-kanvas-surface-2 border border-white/[0.06] flex items-center justify-center text-kanvas-text-secondary hover:text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="overflow-hidden">
              <div
                className="flex gap-4 transition-transform duration-300"
                style={{ transform: `translateX(-${genreScroll}px)` }}
              >
                {GENRE_CARDS.map((card) => (
                  <div
                    key={card.title}
                    className="flex-none w-[200px] h-[280px] rounded-lg bg-kanvas-surface-1 relative overflow-hidden group cursor-pointer border border-white/[0.06]"
                  >
                    <img
                      src={card.image}
                      alt={card.alt}
                      className="w-full h-full object-cover opacity-70 group-hover:scale-105 group-hover:opacity-100 transition-all duration-700"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-2xl text-white font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {card.title}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-kanvas-text-secondary">
                        {card.style}
                      </p>
                    </div>
                    <div className="absolute top-3 left-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: card.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => scrollCarousel('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-10 h-10 rounded-full bg-kanvas-surface-2 border border-white/[0.06] flex items-center justify-center text-kanvas-text-secondary hover:text-white transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Bottom controls */}
          <div className="flex items-center gap-4 mt-10">
            <button className="w-12 h-12 rounded-full bg-kanvas-surface-2 border border-white/[0.06] flex items-center justify-center text-kanvas-text-secondary hover:text-white transition-colors">
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              onClick={onGenerate}
              disabled={submitting}
              className="bg-kanvas-accent text-kanvas-accent-contrast font-bold uppercase tracking-widest text-[11px] px-10 py-3.5 rounded-full flex items-center gap-2 hover:shadow-[0_0_25px_hsl(var(--kanvas-accent)/0.3)] transition-all disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate ✦
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── ANCHOR / LOCATION BUILDER MODAL ── */
  function renderBuilderModal() {
    if (!builderKind) return null;
    const config = BUILDER_CONFIG[builderKind];

    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" role="dialog" aria-label={config.title}>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-kanvas-surface-1 p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {config.title}
            </h2>
            <button
              onClick={closeBuilder}
              aria-label="Close builder"
              className="rounded-full p-1.5 text-kanvas-text-muted hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Name</label>
              <input
                type="text"
                value={builderName}
                onChange={(e) => setBuilderName(e.target.value)}
                placeholder={config.namePlaceholder}
                className="w-full rounded-xl border border-white/10 bg-kanvas-surface-2 px-4 py-2.5 text-sm text-white placeholder-kanvas-text-faint focus:border-kanvas-accent/40 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Description</label>
              <textarea
                rows={3}
                value={builderDesc}
                onChange={(e) => setBuilderDesc(e.target.value)}
                placeholder={config.descPlaceholder}
                className="w-full rounded-xl border border-white/10 bg-kanvas-surface-2 px-4 py-2.5 text-sm text-white placeholder-kanvas-text-faint focus:border-kanvas-accent/40 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Reference Image</label>
              <div className="grid grid-cols-4 gap-2">
                {config.presets.map((preset) => (
                  <button
                    key={preset.src}
                    onClick={() => setBuilderImage(builderImage === preset.src ? null : preset.src)}
                    aria-label={preset.alt}
                    aria-pressed={builderImage === preset.src}
                    className={`aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      builderImage === preset.src
                        ? 'border-kanvas-accent shadow-[0_0_16px_hsl(var(--kanvas-accent)/0.3)]'
                        : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    <img src={preset.src} alt={preset.alt} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={closeBuilder}
              disabled={builderSaving}
              className="rounded-full border border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-kanvas-text-secondary hover:text-white transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleBuilderSave}
              disabled={builderSaving || !builderName.trim()}
              className="flex items-center gap-2 rounded-full bg-kanvas-accent px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-black transition-all hover:shadow-[0_0_25px_hsl(var(--kanvas-accent)/0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {builderSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {builderKind === 'anchor' ? 'Save Anchor' : 'Save Location'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-[68px] bg-kanvas-bg z-20 overflow-hidden flex flex-row pb-16 md:pb-0" style={{ scrollbarWidth: 'none' }}>
      <style>{`::-webkit-scrollbar { display: none; }`}</style>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col h-full relative">
        {/* Tab Nav — Centered Pill Slider */}
        <div className="flex items-center justify-center px-4 md:px-6 pt-3 md:pt-4 pb-2 flex-shrink-0">
          <div className="inline-flex bg-kanvas-surface-2 rounded-full p-1 border border-white/[0.06] overflow-x-auto scrollbar-hide">
            {TAB_LIST.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 md:px-5 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-white/10 text-kanvas-accent shadow-[inset_0_0_12px_hsl(var(--kanvas-accent)/0.06)]'
                      : 'text-kanvas-text-muted hover:text-kanvas-text-secondary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Model selector */}
          {models.length > 0 && (
            <div className="absolute right-6 flex items-center gap-2">
              <select
                value={currentModel?.id ?? ''}
                onChange={(e) => onModelChange(e.target.value)}
                className="bg-kanvas-surface-2 border border-white/[0.06] rounded-full px-3 py-1.5 text-[10px] text-white focus:outline-none appearance-none cursor-pointer"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {sortModelsForTier(models, tier).map((m) => {
                  const isGMI = m.id.toLowerCase().startsWith("gmi/");
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name} {isGMI ? "(GMI)" : ""} — {m.credits}cr
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'image' && renderImageTab()}
        {activeTab === 'video' && renderVideoTab()}
        {activeTab === 'cast' && renderCastTab()}

        {/* Tab-specific bottom bars */}
        {activeTab === 'image' && renderImageBar()}
        {activeTab === 'video' && renderVideoBar()}
      </div>

      {renderBuilderModal()}

      {/* Right Icon Rail */}
      <div className="hidden md:flex w-[56px] flex-shrink-0 h-full bg-kanvas-bg border-l border-white/[0.06] flex-col items-center py-4 gap-3">
        <button className="w-10 h-10 rounded-xl bg-kanvas-surface-2 flex items-center justify-center text-kanvas-text-muted hover:text-white transition-colors">
          <Search className="h-4 w-4" />
        </button>
        <div className="h-px w-6 bg-white/[0.06]" />
        {avatars.slice(0, 3).map((a, i) => (
          <div key={i} className="w-9 h-9 rounded-full overflow-hidden border border-white/10 hover:border-kanvas-accent/40 transition-colors cursor-pointer" title={a.name}>
            {a.src ? (
              <img src={a.src} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-kanvas-surface-3 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-kanvas-text-faint" />
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => openBuilder('anchor')}
          aria-label="Create Anchor"
          className="w-9 h-9 rounded-full border border-dashed border-white/10 flex items-center justify-center text-kanvas-text-faint hover:border-kanvas-accent/30 transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>

        <div className="flex-1" />

        {/* Image/Video mode toggle */}
        <div className="flex flex-col items-center gap-1.5 mb-2">
          <button
            onClick={() => setGenMode('image')}
            className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
              genMode === 'image' ? 'bg-kanvas-accent text-kanvas-accent-contrast' : 'bg-kanvas-surface-2 text-kanvas-text-muted hover:text-white'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="text-[7px] uppercase tracking-wider font-bold">Img</span>
          </button>
          <button
            onClick={() => setGenMode('video')}
            className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
              genMode === 'video' ? 'bg-kanvas-accent text-kanvas-accent-contrast' : 'bg-kanvas-surface-2 text-kanvas-text-muted hover:text-white'
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            <span className="text-[7px] uppercase tracking-wider font-bold">Vid</span>
          </button>
        </div>
      </div>
    </div>
  );
}
