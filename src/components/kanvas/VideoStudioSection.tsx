import { useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  Film,
  History,
  Image,
  ImagePlus,
  Info,
  Lightbulb,
  Play,
  Plus,
  SlidersHorizontal,
  Upload,
  Users,
  Video,
  Zap,
} from "lucide-react";
import {
  KanvasButton,
  KanvasChip,
  KanvasProgress,
  KanvasSpinner,
} from "@/components/kanvas/primitives";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { KanvasAsset, KanvasAssetType, KanvasJob, KanvasModel } from "@/features/kanvas/types";
import { getJobPrimaryUrl, isJobActive } from "@/features/kanvas/helpers";
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { MentionDropdown } from "@/components/character-creation/MentionDropdown";
import type { CharacterMention } from "@/types/character-creation";
import { musicPolishAssets } from "@/lib/musicPolishAssets";
import { accentEdge, accentSoft, accentText } from "@/lib/kanvasTheme";
import type { MusicPolishAsset } from "@/lib/musicPolishAssets";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VideoStudioSectionProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  referenceId: string | null;
  onReferenceChange: (id: string | null) => void;
  currentModel: KanvasModel | null;
  models: KanvasModel[];
  onModelChange: (id: string) => void;
  settings: Record<string, unknown>;
  onSettingsChange: (key: string, value: string | number | boolean) => void;
  submitting: boolean;
  onGenerate: () => void;
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  assets: KanvasAsset[];
  uploading: boolean;
  onUpload: (file: File, type: KanvasAssetType) => Promise<void>;
  pageLoading: boolean;
  mentionSuggestions?: CharacterMention[];
  showMentionDropdown?: boolean;
  onMentionSelect?: (mention: CharacterMention) => void;
  onMentionTogglePin?: (mention: CharacterMention) => void;
  onMentionChange?: (text: string, cursorPos?: number) => void;
  onCloseMentions?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function Dropzone({
  label, hint, icon: Icon, uploading, onUpload, previewUrl, previewType = "image", accept, aspectClass,
}: {
  label: string; hint: string; icon: typeof ImagePlus; uploading: boolean;
  onUpload: (file: File) => void; previewUrl?: string | null; previewType?: "image" | "video"; accept?: string; aspectClass?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">{label}</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={cn(
          "group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-kanvas-md border-2 border-dashed transition-colors",
          aspectClass ?? "aspect-square",
          previewUrl ? "border-kanvas-accent-edge bg-black/40" : "border-kanvas-border-default bg-black/30 hover:border-kanvas-accent-edge"
        )}
      >
        {previewUrl && previewType === "video" ? (
          <video
            src={previewUrl}
            className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
            muted
            playsInline
            preload="metadata"
          />
        ) : previewUrl ? (
          <img src={previewUrl} alt={label} className="absolute inset-0 h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
        ) : uploading ? (
          <KanvasSpinner className="h-6 w-6 text-kanvas-accent" />
        ) : (
          <>
            <Icon className="mb-2 h-6 w-6 text-kanvas-text-faint group-hover:text-kanvas-accent transition-colors" />
            <span className="text-[10px] uppercase tracking-widest text-kanvas-text-faint group-hover:text-kanvas-text-secondary transition-colors">{hint}</span>
          </>
        )}
      </button>
      <input ref={ref} type="file" accept={accept ?? "image/*"} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) onUpload(f); }} />
    </div>
  );
}

function Pill({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) {
  return (
    <KanvasChip
      active={active}
      onClick={onClick}
      className={cn(active && "shadow-[0_0_20px_rgba(249,115,22,0.2)]")}
    >
      {value}
    </KanvasChip>
  );
}

function FeatureCard({
  title,
  description,
  icon: Icon,
  asset,
  accent = "accent",
}: {
  title: string;
  description: string;
  icon: typeof ImagePlus;
  asset: MusicPolishAsset;
  accent?: "accent" | "neutral";
}) {
  const color = accent === "accent" ? accentText : "text-kanvas-text-primary";
  const bg = accent === "accent" ? cn(accentSoft, accentEdge) : "bg-white/10 border-kanvas-border-strong";
  return (
    <div className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-kanvas-lg bg-kanvas-surface-2 p-6 transition-all hover:bg-kanvas-surface-3">
      <img
        src={asset.src}
        alt={asset.alt}
        className="absolute inset-0 h-full w-full object-cover opacity-65 transition duration-700 group-hover:scale-105 group-hover:opacity-85"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
      <div className="relative space-y-4">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-full border", bg)}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
        <div>
          <p className={cn("text-sm font-bold uppercase tracking-widest", color)}>{title}</p>
          <p className="mt-1 text-xs text-kanvas-text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Model tabs for preset gallery                                      */
/* ------------------------------------------------------------------ */

const MODEL_TABS = [
  "Higgsfield DoP", "Kling 3.0", "Kling 3.0 Omni", "Kling 2.5", "Kling O1",
  "Veo 3.1", "Veo 3.1 Fast", "Sora 2 Pro", "Seedance 2.0", "Hailuo 2.3",
  "Wan 2.5", "PixVerse V6", "LTX 2.0",
];

const FILTER_PILLS = ["All", "New", "Trending", "Effects", "Camera Control", "Epic Shots"];

const MOTION_LIBRARY = [
  { id: "1", title: "Dynamic Walk", category: "MOVEMENT", asset: musicPolishAssets.talent.motionStage },
  { id: "2", title: "Camera Pan L→R", category: "CAMERA", asset: musicPolishAssets.landing.rooftopChoreography },
  { id: "3", title: "Hair Flip", category: "GESTURE", asset: musicPolishAssets.talent.faceWardrobe },
  { id: "4", title: "Slow Zoom In", category: "CAMERA", asset: musicPolishAssets.cinema.performanceCloseup },
  { id: "5", title: "Dance Routine", category: "MOVEMENT", asset: musicPolishAssets.cinema.soundstage },
];

const PRESET_GALLERY = [
  { title: "Dance Routine", category: "Top Choice", asset: musicPolishAssets.talent.motionStage },
  { title: "Camera Pan", category: "Camera", asset: musicPolishAssets.landing.rooftopChoreography },
  { title: "Slow Zoom", category: "Camera", asset: musicPolishAssets.cinema.performanceCloseup },
  { title: "Stage Walk", category: "Movement", asset: musicPolishAssets.cinema.soundstage },
  { title: "Neon Street", category: "Epic Shot", asset: musicPolishAssets.cinema.neonStreet },
  { title: "Lyric Pulse", category: "Effects", asset: musicPolishAssets.lyrics.rooftopMotion },
  { title: "Product Read", category: "UGC", asset: musicPolishAssets.toolSurfaces.lipsyncProductRead },
  { title: "Gothic Push", category: "Film", asset: musicPolishAssets.landing.heroGothicStorm },
] as const;

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function VideoStudioSection({
  prompt, onPromptChange, referenceId, currentModel, models, onModelChange,
  settings, onSettingsChange, submitting, onGenerate, jobs, selectedJob,
  assets, uploading, onUpload,
  mentionSuggestions = [], showMentionDropdown = false,
  onMentionSelect, onMentionTogglePin, onMentionChange, onCloseMentions,
}: VideoStudioSectionProps) {
  const { tier, isFree } = useUserTier();
  const [activeTab, setActiveTab] = useState<"create" | "edit" | "motion">("create");
  const [activeModelTab, setActiveModelTab] = useState(MODEL_TABS[0]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [multiShot, setMultiShot] = useState(false);
  const [enhanceOn, setEnhanceOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [editAutoSettings, setEditAutoSettings] = useState(true);
  const [motionSceneControl, setMotionSceneControl] = useState(false);
  const [motionInputType, setMotionInputType] = useState<"video" | "image">("video");
  const [motionQuality, setMotionQuality] = useState<"720p" | "1080p">("720p");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const selectedDuration = String(settings.duration ?? "5");
  const selectedAspect = String(settings.aspect_ratio ?? "16:9");
  const selectedQuality = String(settings.quality ?? "720p");

  const referenceAsset = referenceId ? assets.find((a) => a.id === referenceId) : null;
  const referencePreview = referenceAsset ? referenceAsset.thumbnail_url ?? referenceAsset.preview_url ?? referenceAsset.cdn_url : null;
  const referencePreviewType = referenceAsset?.asset_type === "video" ? "video" as const : "image" as const;

  const completedJobs = jobs.filter((j) => j.status === "completed");
  const recentResults = completedJobs.slice(0, 4);
  const previewUrl = selectedJob ? getJobPrimaryUrl(selectedJob) : null;

  const handlePromptInput = (value: string) => {
    onPromptChange(value);
    onMentionChange?.(value);
  };

  const handleMentionSelect = (mention: CharacterMention) => {
    onMentionSelect?.(mention);
  };

  /* ── Sub-nav ── */
  const SUB_TABS = [
    { key: "create", label: "Create Video", shortLabel: "Create", icon: Film },
    { key: "edit", label: "Edit Video", shortLabel: "Edit", icon: SlidersHorizontal },
    { key: "motion", label: "Motion Control", shortLabel: "Motion", icon: Users },
  ] as const;

  const subNav = (
    <div className="space-y-3">
      <div className="flex justify-center">
        <div role="tablist" aria-label="Video studio mode" className="inline-flex items-center bg-kanvas-surface-2 rounded-full p-1 border border-kanvas-border-subtle">
          {SUB_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 md:px-5 py-2 rounded-full text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-kanvas-surface-3 text-kanvas-accent shadow-[inset_0_0_12px_rgba(249,115,22,0.06)]"
                    : "text-kanvas-text-muted hover:text-kanvas-text-secondary"
                )}
              >
                <TabIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-kanvas-text-faint">
        <button className="flex items-center gap-1.5 hover:text-kanvas-text-secondary transition-colors">
          <History className="h-3 w-3" /> History
        </button>
        <button className="flex items-center gap-1.5 hover:text-kanvas-text-secondary transition-colors">
          <Info className="h-3 w-3" /> How it works
        </button>
      </div>
    </div>
  );

  const wzrdTip = (tip: string) => (
    <div className="rounded-kanvas-md border-l-2 border-l-kanvas-accent bg-kanvas-surface-2 p-5">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-kanvas-accent" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-kanvas-accent">WZRD Tip</p>
          <p className="mt-1 text-xs leading-relaxed text-kanvas-text-muted">{tip}</p>
        </div>
      </div>
    </div>
  );

  /* ================================================================ */
  /*  CREATE TAB                                                       */
  /* ================================================================ */
  const renderCreateTab = () => (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
      {/* Left Sidebar ~280px */}
      <div className="w-full md:w-[280px] md:shrink-0 space-y-5">
        {/* Preset thumbnail */}
        <div className="relative rounded-kanvas-lg overflow-hidden bg-kanvas-surface-2 aspect-video">
          <img
            src={musicPolishAssets.cinema.neonStreet.src}
            alt={musicPolishAssets.cinema.neonStreet.alt}
            className="absolute inset-0 h-full w-full object-cover opacity-80"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-kanvas-text-secondary">Active Preset</span>
            <button className="px-2 py-1 rounded-full bg-kanvas-surface-3 text-[9px] font-bold text-kanvas-text-primary hover:bg-kanvas-surface-3/80 transition-colors">Change</button>
          </div>
        </div>

        {/* Frame inputs */}
        <div className="grid grid-cols-2 gap-3">
          <Dropzone
            label="Reference Asset"
            hint="Image or video"
            icon={ImagePlus}
            uploading={uploading}
            onUpload={(file) =>
              void onUpload(
                file,
                file.type.startsWith("video/") ? "video" : "image"
              )
            }
            previewUrl={referencePreview}
            previewType={referencePreviewType}
            accept="image/*,video/*"
          />
          <Dropzone label="End Frame" hint="Optional" icon={ImagePlus} uploading={false} onUpload={(f) => void onUpload(f, "image")} />
        </div>

        {/* Multi-shot */}
        <div className="flex items-center justify-between rounded-kanvas-md bg-kanvas-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-kanvas-text-secondary">Multi-shot</span>
            <Info className="h-3 w-3 text-kanvas-text-faint" />
          </div>
          <Switch checked={multiShot} onCheckedChange={setMultiShot} className="data-[state=checked]:bg-kanvas-accent" />
        </div>

        {/* Prompt */}
        <div className="relative">
          <MentionDropdown
            suggestions={mentionSuggestions}
            onSelect={handleMentionSelect}
            onTogglePin={onMentionTogglePin}
            visible={showMentionDropdown}
          />
          <Textarea
            value={prompt}
            onChange={(e) => handlePromptInput(e.currentTarget.value)}
            onBlur={() => window.setTimeout(() => onCloseMentions?.(), 150)}
            placeholder="Describe the motion, camera movement, or scene... Use @ to add saved blueprints."
            className="min-h-[100px] resize-none rounded-kanvas-md border-kanvas-border-default bg-kanvas-surface-2 px-4 py-3 text-sm text-kanvas-text-primary placeholder:text-kanvas-text-faint focus-visible:ring-kanvas-accent-edge"
          />
        </div>

        {/* Enhancement row */}
        <div className="flex gap-2">
          <Pill value={`Enhance ${enhanceOn ? "on" : "off"}`} active={enhanceOn} onClick={() => setEnhanceOn(!enhanceOn)} />
          <Pill value={`Sound ${soundOn ? "on" : "off"}`} active={soundOn} onClick={() => { setSoundOn(!soundOn); onSettingsChange("generate_audio", !soundOn); }} />
          <button className="rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-kanvas-surface-3 text-kanvas-text-muted hover:text-kanvas-text-secondary transition-colors">
            Elements
          </button>
        </div>

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="w-full flex items-center justify-between rounded-kanvas-md bg-kanvas-surface-2 px-4 py-3 transition-colors hover:bg-kanvas-surface-3"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Model</span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-bold text-kanvas-accent">{currentModel?.name ?? "Loading…"}</span>
              <ChevronDown className="h-3 w-3 text-kanvas-text-muted" />
            </span>
          </button>
          {modelDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-[300px] overflow-y-auto rounded-kanvas-md bg-kanvas-surface-1 border border-kanvas-border-default shadow-2xl z-50" style={{ scrollbarWidth: "none" }}>
              {sortModelsForTier(models, tier).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onModelChange(m.id); setModelDropdownOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors",
                    m.id === currentModel?.id ? "bg-kanvas-accent-soft text-kanvas-text-primary" : "text-kanvas-text-secondary hover:bg-white/5 hover:text-kanvas-text-primary"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    {m.id.startsWith("gmi/") && isFree && (
                      <span className="px-2 py-0.5 rounded-full bg-kanvas-accent-soft text-[9px] font-bold text-kanvas-accent uppercase">GMI</span>
                    )}
                  </div>
                  <span className="text-[10px] text-kanvas-text-faint">✦ {m.credits}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings row */}
        <div className="flex gap-2">
          {["5", "10"].map((d) => (
            <Pill key={d} value={`${d}s`} active={selectedDuration === d} onClick={() => onSettingsChange("duration", Number(d))} />
          ))}
          {["16:9", "9:16", "1:1"].map((ar) => (
            <Pill key={ar} value={ar} active={selectedAspect === ar} onClick={() => onSettingsChange("aspect_ratio", ar)} />
          ))}
          <Pill value={selectedQuality} active onClick={() => {}} />
        </div>

        {/* Generate */}
        <KanvasButton
          onClick={onGenerate}
          busy={submitting}
          fullWidth
          icon={<Zap className="h-4 w-4" />}
          className="py-5 text-sm font-extrabold shadow-[0_0_30px_rgba(249,115,22,0.3)] hover:shadow-[0_0_40px_rgba(249,115,22,0.4)]"
        >
          {submitting ? "Generating…" : `Generate ✦ ${currentModel?.credits ?? 20}`}
        </KanvasButton>
      </div>

      {/* Main Content */}
      <div className="min-w-0 flex-1 space-y-10">
        <div>
          <h1 className="font-kanvas-display text-3xl md:text-5xl font-bold tracking-tighter text-kanvas-text-primary lg:text-6xl">
            MAKE VIDEOS IN <em className="not-italic text-kanvas-accent">ONE CLICK</em>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-kanvas-text-secondary">
            250+ presets for camera control, framing, and high-quality VFX
          </p>
        </div>

        {/* 3-step flow */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard title="Add Image" description="Upload a start frame or reference" icon={ImagePlus} asset={musicPolishAssets.kanvas.aiVisualWall} accent="accent" />
          <FeatureCard title="Choose Preset" description="Pick from 250+ motion presets and styles" icon={SlidersHorizontal} asset={musicPolishAssets.cinema.soundstage} accent="neutral" />
          <FeatureCard title="Get Video" description="AI generates cinematic video in seconds" icon={Film} asset={musicPolishAssets.cinema.performanceCloseup} accent="accent" />
        </div>

        {/* Active job */}
        {selectedJob && (
          <div className="overflow-hidden rounded-kanvas-lg border border-kanvas-border-default bg-black/40">
            {previewUrl && selectedJob.resultPayload?.mediaType === "video" ? (
              <video src={previewUrl} controls autoPlay loop muted playsInline preload="metadata" poster={selectedJob.resultPayload?.thumbnailUrl ?? undefined} className="aspect-video w-full bg-black object-cover" />
            ) : previewUrl ? (
              <img src={previewUrl} alt="Output" className="aspect-video w-full object-cover" decoding="async" />
            ) : isJobActive(selectedJob) ? (
              <div className="flex aspect-video flex-col items-center justify-center gap-4">
                <KanvasSpinner className="h-10 w-10 text-kanvas-accent" />
                <p className="text-sm font-semibold text-kanvas-text-primary">Generating…</p>
                <p className="text-xs text-kanvas-text-muted">{selectedJob.progress ?? 0}% complete</p>
              </div>
            ) : selectedJob.status === "failed" ? (
              <div className="flex aspect-video flex-col items-center justify-center gap-3">
                <p className="text-lg font-semibold text-rose-300">Generation Failed</p>
                <p className="max-w-md text-center text-sm text-kanvas-text-muted">{selectedJob.errorMessage}</p>
              </div>
            ) : null}
          </div>
        )}

        {/* Preset Gallery */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-kanvas-text-muted">Preset Gallery</p>
          {/* Model tabs scrollbar */}
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {MODEL_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveModelTab(tab)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                  activeModelTab === tab
                    ? "bg-kanvas-accent text-kanvas-accent-contrast"
                    : "bg-kanvas-surface-2 text-kanvas-text-muted hover:text-kanvas-text-secondary"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          {/* Filter pills */}
          <div className="flex gap-2">
            {FILTER_PILLS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all",
                  activeFilter === f
                    ? "border border-kanvas-border-strong bg-kanvas-surface-3 text-kanvas-text-primary"
                    : "text-kanvas-text-faint hover:text-kanvas-text-secondary"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {PRESET_GALLERY.map((preset, i) => (
              <div key={preset.title} className="group relative aspect-video rounded-kanvas-md bg-kanvas-surface-2 overflow-hidden cursor-pointer border border-kanvas-border-subtle hover:border-kanvas-accent-edge transition-colors">
                <img
                  src={preset.asset.src}
                  alt={preset.asset.alt}
                  className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {i === 0 && (
                  <div className="absolute top-2 left-2">
                    <span className="px-2 py-0.5 rounded-full bg-kanvas-accent text-[8px] font-bold text-kanvas-accent-contrast uppercase">Top Choice</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-2">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-kanvas-accent">{preset.category}</p>
                  <p className="text-[9px] font-bold text-kanvas-text-secondary uppercase">{preset.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent results */}
        {recentResults.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <p className="text-sm font-semibold text-kanvas-text-primary">Recent Creations</p>
              <button className="text-[10px] font-bold uppercase tracking-widest text-kanvas-text-muted hover:text-kanvas-accent transition-colors">View All →</button>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {recentResults.map((job) => {
                const url = getJobPrimaryUrl(job);
                if (!url) return null;
                return (
                  <div key={job.id} className="group relative aspect-[9/16] overflow-hidden rounded-kanvas-md bg-kanvas-surface-2">
                    {job.resultPayload?.mediaType === "video" ? (
                      <video src={url} muted playsInline preload="metadata" poster={job.resultPayload?.thumbnailUrl ?? undefined} className="h-full w-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                    ) : (
                      <img src={url} alt="Creation" className="h-full w-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" loading="lazy" decoding="async" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute right-2 top-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                        <Play className="h-3 w-3 text-kanvas-accent" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {wzrdTip("For best results, use a high-quality start frame with clear subject details. The AI works best with well-lit, sharp reference images.")}
      </div>
    </div>
  );

  /* ================================================================ */
  /*  EDIT TAB                                                         */
  /* ================================================================ */
  const renderEditTab = () => (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
      <div className="w-full md:w-[300px] md:shrink-0 space-y-5">
        <div>
          <h2 className="font-kanvas-display text-2xl font-bold tracking-tight text-kanvas-text-primary">
            Edit Video
          </h2>
          <p className="mt-1 text-xs text-kanvas-text-muted">Refine and manipulate cinematic shots with AI.</p>
        </div>

        <Dropzone label="Primary Video Source" hint="Upload MP4, MOV (3-10s)" icon={Upload} uploading={uploading} onUpload={(f) => void onUpload(f, "image")} accept="video/*,image/*" aspectClass="aspect-video" />

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Images & Elements (up to 4)</p>
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <button key={i} className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-kanvas-border-default bg-black/30 hover:border-kanvas-accent-edge transition-colors">
                <Plus className="h-4 w-4 text-kanvas-text-faint" />
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <MentionDropdown
            suggestions={mentionSuggestions}
            onSelect={handleMentionSelect}
            onTogglePin={onMentionTogglePin}
            visible={showMentionDropdown}
          />
          <Textarea
            value={prompt}
            onChange={(e) => handlePromptInput(e.currentTarget.value)}
            onBlur={() => window.setTimeout(() => onCloseMentions?.(), 150)}
            placeholder="Describe the change you want... Use @ to add saved blueprints."
            className="min-h-[100px] resize-none rounded-kanvas-md border-kanvas-border-default bg-kanvas-surface-2 px-4 py-3 text-sm text-kanvas-text-primary placeholder:text-kanvas-text-faint focus-visible:ring-kanvas-accent-edge"
          />
        </div>

        <div className="flex items-center justify-between rounded-kanvas-md bg-kanvas-surface-2 px-4 py-2.5">
          <span className="text-xs font-semibold text-kanvas-text-secondary">Auto Settings</span>
          <Switch checked={editAutoSettings} onCheckedChange={setEditAutoSettings} className="data-[state=checked]:bg-kanvas-accent" />
        </div>

        <div className="space-y-2 rounded-kanvas-md bg-kanvas-surface-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Model</span>
            <span className="text-xs font-bold text-kanvas-accent">Kling O1 Edit</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Quality</span>
            <span className="text-xs font-bold text-kanvas-text-secondary">720p</span>
          </div>
        </div>

        <KanvasButton
          onClick={onGenerate}
          busy={submitting}
          fullWidth
          icon={<Zap className="h-4 w-4" />}
          className="py-5 text-sm font-extrabold shadow-[0_0_30px_rgba(249,115,22,0.3)]"
        >
          {submitting ? "Processing…" : "Generate ✦ 28"}
        </KanvasButton>
      </div>

      <div className="min-w-0 flex-1 space-y-8">
        <div className="overflow-hidden rounded-kanvas-lg border border-kanvas-border-subtle bg-black/40">
          {previewUrl ? (
            <video src={previewUrl} controls autoPlay loop muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-4">
              <Eye className="h-12 w-12 text-kanvas-text-faint" />
              <p className="font-kanvas-display text-4xl font-bold tracking-tighter text-kanvas-text-faint/50">PREVIEW MODE</p>
              <p className="text-xs text-kanvas-text-faint">Upload a video source and describe your edit</p>
            </div>
          )}
        </div>
        {selectedJob && isJobActive(selectedJob) && (
          <div className="rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-1 p-6">
            <div className="flex items-center gap-4">
              <KanvasSpinner className="h-6 w-6 text-kanvas-accent" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-kanvas-text-primary">Processing edit…</p>
                <KanvasProgress
                  className="mt-2 h-1.5"
                  label="Job progress"
                  value={selectedJob.progress ?? 0}
                />
              </div>
              <span className="text-xs font-bold text-kanvas-text-muted">{selectedJob.progress ?? 0}%</span>
            </div>
          </div>
        )}
        {wzrdTip("For video editing, upload your source clip first. The AI analyzes motion, lighting, and subjects — then applies changes while preserving temporal consistency.")}
      </div>
    </div>
  );

  /* ================================================================ */
  /*  MOTION CONTROL TAB                                               */
  /* ================================================================ */
  const renderMotionTab = () => (
    <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
      <div className="min-w-0 flex-1 space-y-10">
        <div>
          <h1 className="font-kanvas-display text-3xl md:text-5xl font-bold tracking-tighter text-kanvas-text-primary lg:text-6xl">
            RECREATE ANY <em className="not-italic text-kanvas-accent">MOTION</em><br />WITH YOUR IMAGE
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-kanvas-text-muted">Our neural animation engine analyzes reference motion and re-creates it with your character or scene.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-kanvas-text-muted">Motion Library</p>
              <div className="mt-2 h-1 w-24 bg-kanvas-accent" />
            </div>
            <button className="text-[10px] font-bold uppercase tracking-widest text-kanvas-accent hover:opacity-80 transition-opacity">View All →</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {MOTION_LIBRARY.map((item) => (
              <div key={item.id} className="group relative aspect-[9/16] w-40 shrink-0 cursor-pointer overflow-hidden rounded-kanvas-md bg-kanvas-surface-2 hover:ring-2 hover:ring-kanvas-accent-edge transition-all">
                <img
                  src={item.asset.src}
                  alt={item.asset.alt}
                  className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-kanvas-text-faint">{item.category}</p>
                  <p className="text-xs font-bold text-kanvas-accent">{item.title}</p>
                </div>
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex h-7 w-14 items-center justify-center gap-1 rounded-full bg-kanvas-accent text-kanvas-accent-contrast">
                    <Play className="h-3 w-3" />
                    <span className="text-[8px] font-extrabold uppercase">Play</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedJob && isJobActive(selectedJob) && (
          <div className="rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-1 p-6">
            <div className="flex items-center gap-4">
              <KanvasSpinner className="h-6 w-6 text-kanvas-accent" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-kanvas-text-primary">Generating motion…</p>
                <KanvasProgress
                  className="mt-2 h-1.5"
                  label="Job progress"
                  value={selectedJob.progress ?? 0}
                />
              </div>
            </div>
          </div>
        )}
        {wzrdTip("Select a motion reference from the library, then add your character image. The AI transfers motion while maintaining identity and proportions.")}
      </div>

      <div className="w-full md:w-[280px] md:shrink-0 space-y-5">
        <Dropzone label="Add Motion to Copy" hint="Drop reference video (3-30s)" icon={Video} uploading={uploading} onUpload={(f) => void onUpload(f, "image")} accept="video/*,image/*" aspectClass="aspect-video" />
        <Dropzone label="Add Your Character" hint="Drop character image" icon={ImagePlus} uploading={false} onUpload={(f) => void onUpload(f, "image")} aspectClass="aspect-square" />

        <div className="space-y-3 rounded-kanvas-md bg-kanvas-surface-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Model</span>
            <span className="text-xs font-bold text-kanvas-accent">Kling 3.0 Motion</span>
          </div>
          <div className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Quality</span>
            <div className="flex gap-2">
              {(["720p", "1080p"] as const).map((q) => (
                <Pill key={q} value={q} active={motionQuality === q} onClick={() => setMotionQuality(q)} />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Scene Control</span>
            <Switch checked={motionSceneControl} onCheckedChange={setMotionSceneControl} className="data-[state=checked]:bg-kanvas-accent" />
          </div>
          <div className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted">Input Type</span>
            <div className="flex gap-2">
              {(["video", "image"] as const).map((t) => (
                <Pill key={t} value={t.toUpperCase()} active={motionInputType === t} onClick={() => setMotionInputType(t)} />
              ))}
            </div>
          </div>
        </div>

        <KanvasButton
          onClick={onGenerate}
          busy={submitting}
          fullWidth
          icon={<Zap className="h-4 w-4" />}
          className="py-5 text-sm font-extrabold shadow-[0_0_30px_rgba(249,115,22,0.3)]"
        >
          {submitting ? "Generating…" : `Generate ✦ ${currentModel?.credits ?? 30}`}
        </KanvasButton>
      </div>
    </div>
  );

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="fixed inset-0 top-[68px] bg-kanvas-bg z-20 overflow-y-auto px-4 py-4 md:p-8 pb-20 md:pb-8" style={{ scrollbarWidth: "none" }}>
      <div className="mx-auto max-w-[1600px]">
        {subNav}
        <div className="mt-4 md:mt-6">
          {activeTab === "edit" ? renderEditTab() : activeTab === "motion" ? renderMotionTab() : renderCreateTab()}
        </div>
      </div>
    </div>
  );
}
