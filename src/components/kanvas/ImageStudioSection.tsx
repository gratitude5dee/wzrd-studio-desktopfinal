import { useRef, useState } from "react";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { accentSoft, accentText, kanvasDisplay, panelSurface } from "@/lib/kanvasTheme";
import {
  KanvasBadge,
  KanvasButton,
  KanvasEmptyState,
  KanvasIconButton,
  KanvasSectionHeader,
  KanvasStepper,
  KanvasTabs,
} from "@/components/kanvas/primitives";
import type { KanvasAsset, KanvasAssetType, KanvasJob, KanvasModel } from "@/features/kanvas/types";
import { getJobPrimaryUrl } from "@/features/kanvas/helpers";
import { getKanvasModelProvider } from "@/features/kanvas/modelProvider";
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { MentionDropdown } from "@/components/character-creation/MentionDropdown";
import { musicPolishAssets } from "@/lib/musicPolishAssets";
import type { CharacterMention } from "@/types/character-creation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ImageStudioSectionProps {
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
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const USE_CASE_CARDS = [
  {
    label: musicPolishAssets.kanvas.stageProductVisual.title,
    subtitle: "Build high-end hero props and cover-art objects with practical stage light.",
    style: musicPolishAssets.kanvas.stageProductVisual.style,
    image: musicPolishAssets.kanvas.stageProductVisual.src,
    alt: musicPolishAssets.kanvas.stageProductVisual.alt,
  },
  {
    label: musicPolishAssets.kanvas.aiVisualWall.title,
    subtitle: "Move from treatment notes to photoreal scene walls and campaign frames.",
    style: musicPolishAssets.kanvas.aiVisualWall.style,
    image: musicPolishAssets.kanvas.aiVisualWall.src,
    alt: musicPolishAssets.kanvas.aiVisualWall.alt,
  },
  {
    label: musicPolishAssets.kanvas.backgroundReframe.title,
    subtitle: "Reframe a performer across stages, streets, and editorial plates.",
    style: musicPolishAssets.kanvas.backgroundReframe.style,
    image: musicPolishAssets.kanvas.backgroundReframe.src,
    alt: musicPolishAssets.kanvas.backgroundReframe.alt,
  },
];

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"] as const;

const PROVIDER_GROUPS: { provider: string; icon: string; label: string }[] = [
  { provider: "fal-ai", icon: "F", label: "Fal" },
  { provider: "gmi-cloud", icon: "✦", label: "GMI Cloud" },
  { provider: "google", icon: "G", label: "Google" },
  { provider: "black_forest_labs", icon: "B", label: "Black Forest Labs" },
  { provider: "openai", icon: "O", label: "OpenAI" },
  { provider: "bytedance", icon: "S", label: "ByteDance" },
  { provider: "ideogram", icon: "I", label: "Ideogram" },
  { provider: "recraft", icon: "R", label: "Recraft" },
  { provider: "xai", icon: "X", label: "xAI" },
];

function getModelProvider(model: KanvasModel | undefined | null): string {
  if (!model) return "other";
  const provider = getKanvasModelProvider(model);
  if (provider !== "other") return provider;
  const id = model.id.toLowerCase();
  if (id.includes("nano-banana") || id.includes("gpt-image")) return id.includes("gpt") ? "openai" : "google";
  if (id.includes("flux")) return "black_forest_labs";
  if (id.includes("qwen")) return "alibaba";
  if (id.includes("ideogram")) return "ideogram";
  if (id.includes("recraft")) return "recraft";
  if (id.includes("seedream") || id.includes("seedance")) return "bytedance";
  if (id.includes("grok")) return "xai";
  return "other";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ImageStudioSection({
  prompt,
  onPromptChange,
  currentModel,
  models,
  onModelChange,
  settings,
  onSettingsChange,
  submitting,
  onGenerate,
  jobs,
  uploading,
  onUpload,
  mentionSuggestions = [],
  showMentionDropdown = false,
  onMentionSelect,
  onMentionTogglePin,
  onMentionChange,
  onCloseMentions,
}: ImageStudioSectionProps) {
  const [imageCount, setImageCount] = useState(1);
  const [activeTab, setActiveTab] = useState<"explore" | "history">("explore");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedAspect, setSelectedAspect] = useState(
    String(settings.aspect_ratio ?? currentModel?.defaults?.aspect_ratio ?? "3:4")
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const { tier } = useUserTier();

  const generationModels = sortModelsForTier(models.filter((m) => m.mode === "text-to-image"), tier);
  const editingModels = sortModelsForTier(models.filter((m) => m.mode === "image-to-image"), tier);

  const handlePromptInput = (value: string) => {
    onPromptChange(value);
    onMentionChange?.(value);
  };

  const handleMentionSelect = (mention: CharacterMention) => {
    onMentionSelect?.(mention);
    inputRef.current?.focus();
  };

  const groupedModels = (() => {
    const groups: { label: string; icon: string; models: KanvasModel[] }[] = [];
    const providerMap = new Map<string, KanvasModel[]>();
    for (const m of [...generationModels, ...editingModels]) {
      const p = getModelProvider(m);
      if (!providerMap.has(p)) providerMap.set(p, []);
      providerMap.get(p)!.push(m);
    }
    for (const pg of PROVIDER_GROUPS) {
      const ms = providerMap.get(pg.provider);
      if (ms?.length) groups.push({ label: pg.label, icon: pg.icon, models: ms });
    }
    // catch-all
    for (const [p, ms] of providerMap) {
      if (!PROVIDER_GROUPS.some((pg) => pg.provider === p)) {
        groups.push({ label: p, icon: p[0]?.toUpperCase() ?? "?", models: ms });
      }
    }
    return groups;
  })();

  /* ---- Sub-nav ---- */
  const renderSubNav = () => (
    <KanvasTabs
      label="Image gallery view"
      className="gap-4 px-4 pt-4 md:gap-6 md:px-12 md:pt-6"
      value={activeTab}
      onChange={setActiveTab}
      items={[
        { value: "explore", label: "Explore" },
        { value: "history", label: "History" },
      ]}
    />
  );

  /* ---- Hero Section ---- */
  const renderHero = () => (
    <div className="text-center pt-8 md:pt-16 pb-6 md:pb-8 px-4 md:px-0">
      <h1 className={cn(kanvasDisplay, "text-4xl font-black leading-[0.9] md:text-6xl lg:text-7xl")}>
        <span className="sr-only">TURN IDEAS</span>
        <span>TURN TRACKS</span>
        <br />
        <span>INTO </span>
        <span className={accentText}>VISUALS</span>
      </h1>
    </div>
  );

  /* ---- Use Case Carousel ---- */
  const renderCarousel = () => (
    <>
      <div className="relative max-w-[1280px] mx-auto px-4 md:px-12 hidden md:block">
        <div className="flex items-center gap-4">
          <KanvasIconButton
            onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
            label="Previous visual example"
            disabled={carouselIndex === 0}
            icon={<ChevronLeft className="h-4 w-4" />}
          />
          <div className="flex gap-6 overflow-hidden flex-1">
            {USE_CASE_CARDS.map((card, i) => (
              <div
                key={card.label}
                className={cn(
                  "group relative aspect-[4/5] min-w-[300px] flex-1 cursor-pointer",
                  panelSurface({ surface: "raised", radius: "md", border: "default" }),
                )}
                style={{
                  transform: `perspective(800px) rotateY(${i === 1 ? 0 : i === 0 ? 3 : -3}deg)`,
                }}
              >
                <img
                  src={card.image}
                  alt={card.alt}
                  className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-100"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/5" />
                <KanvasBadge tone="glass" size="md" className="absolute left-4 top-4">
                  {card.style}
                </KanvasBadge>
                <div className="absolute bottom-0 left-0 right-0 p-6 space-y-2">
                  <h3 className="font-kanvas-display text-lg font-bold text-kanvas-text-primary">
                    {card.label}
                  </h3>
                  <p className="text-xs leading-relaxed text-kanvas-text-secondary">{card.subtitle}</p>
                </div>
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-500" />
              </div>
            ))}
          </div>
          <KanvasIconButton
            onClick={() => setCarouselIndex(Math.min(USE_CASE_CARDS.length - 1, carouselIndex + 1))}
            label="Next visual example"
            disabled={carouselIndex === USE_CASE_CARDS.length - 1}
            icon={<ChevronRight className="h-4 w-4" />}
          />
        </div>
        {/* Try this pill */}
        <div className="flex justify-center mt-6">
          <KanvasButton variant="outline">Try this →</KanvasButton>
        </div>
      </div>

      <div className="md:hidden px-4 pb-36">
        <div className="grid gap-3">
          {USE_CASE_CARDS.map((card) => (
            <div
              key={card.label}
              className={cn(
                "relative aspect-[16/9]",
                panelSurface({ surface: "raised", radius: "md", border: "default" }),
              )}
            >
              <img
                src={card.image}
                alt={card.alt}
                className="absolute inset-0 h-full w-full object-cover opacity-85"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
              <KanvasBadge tone="glass" className="absolute left-3 top-3">
                {card.style}
              </KanvasBadge>
              <div className="absolute bottom-3 left-3 right-8">
                <h3 className="text-sm font-bold text-kanvas-text-primary">{card.label}</h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-kanvas-text-secondary">
                  {card.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  /* ---- Community / History Gallery ---- */
  const renderGallery = () => {
    if (activeTab === "explore") return null;
    const displayJobs = completedJobs.slice(0, 20);
    if (displayJobs.length === 0) {
      return (
        <KanvasEmptyState
          bare
          className="py-20"
          title="No generations yet"
          description="Create your first image with the prompt bar below."
        />
      );
    }
    return (
      <div className="px-4 md:px-12 py-8">
        <div className="columns-2 gap-4 space-y-4 md:columns-4 lg:columns-5">
          {displayJobs.map((job) => {
            const url = getJobPrimaryUrl(job);
            if (!url) return null;
            return (
              <div key={job.id} className="break-inside-avoid group cursor-pointer">
                <div className="relative overflow-hidden rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-2">
                  <img
                    src={url}
                    alt="Generated"
                    className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="truncate text-[10px] text-kanvas-text-secondary">{job.modelId}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ---- Model Selector Dropdown ---- */
  const renderModelDropdown = () => {
    if (!modelDropdownOpen) return null;
    return (
      <div
        className={cn(
          "absolute bottom-full left-0 right-0 z-[60] mb-2 max-h-[400px] overflow-y-auto shadow-[0_-20px_60px_rgba(0,0,0,0.8)]",
          panelSurface({ surface: "raised", radius: "xl", border: "default" }),
        )}
        style={{ scrollbarWidth: "none" }}
      >
        {groupedModels.map((group) => (
          <div key={group.label}>
            <div className="flex items-center gap-2 border-b border-kanvas-border-subtle px-4 py-2">
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold",
                  accentSoft,
                  accentText,
                )}
              >
                {group.icon}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-kanvas-text-muted">
                {group.label}
              </span>
            </div>
            {group.models.map((m) => {
              const isActive = currentModel?.id === m.id;
              const isGmi = m.id.startsWith("gmi/");
              const isFeatured = m.credits >= 7;
              const isNew = m.name.includes("Flex") || m.name.includes("NB2") || m.name.includes("Seedream");
              return (
                <button
                  key={m.id}
                  onClick={() => { onModelChange(m.id); setModelDropdownOpen(false); }}
                  className={cn(
                    "flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? cn(accentSoft, "text-kanvas-text-primary")
                      : "text-kanvas-text-secondary hover:bg-kanvas-surface-3 hover:text-kanvas-text-primary",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isActive && <Check className={cn("h-3 w-3", accentText)} />}
                    <span className="font-medium">{m.name}</span>
                    {isGmi && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-400">
                        GMI
                      </span>
                    )}
                    {isFeatured && <KanvasBadge tone="accent">Top Choice</KanvasBadge>}
                    {isNew && (
                      <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue-400">
                        New
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-kanvas-text-faint">
                    <Star className="h-2.5 w-2.5" />
                    {m.credits}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  /* ---- Bottom Prompt Bar ---- */
  const renderPromptBar = () => (
    <div className="fixed bottom-16 left-3 right-3 md:bottom-8 md:left-8 md:right-8 flex justify-center z-50">
      <div
        className={cn(
          "relative w-full max-w-[1100px] p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl",
          panelSurface({ surface: "raised", radius: "xl", border: "default" }),
          "overflow-visible",
        )}
      >
        {renderModelDropdown()}

        {/* Mobile: 2-row layout */}
        <div className="flex flex-col gap-2 md:hidden">
          {/* Row 1: Upload + Input + Generate */}
          <div className="flex items-center gap-2">
            <KanvasIconButton
              size="sm"
              label="Upload reference image"
              busy={uploading}
              onClick={() => uploadRef.current?.click()}
              icon={<Plus className="h-4 w-4" />}
            />
            <input
              type="text"
              aria-label="Prompt"
              value={prompt}
              onChange={(e) => handlePromptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim()) onGenerate(); }}
              onBlur={() => window.setTimeout(() => onCloseMentions?.(), 150)}
              placeholder="Describe the scene..."
              className="min-w-0 flex-1 border-none bg-transparent px-2 text-sm font-medium text-kanvas-text-primary placeholder-kanvas-text-faint focus:outline-none focus:ring-0"
            />
            <KanvasIconButton
              tone="accent"
              label="Generate"
              busy={submitting}
              disabled={!prompt.trim()}
              onClick={onGenerate}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              className="hover:shadow-[0_0_25px_rgba(249,115,22,0.4)]"
            />
          </div>
          {/* Row 2: Model + Aspect + Count (scrollable) */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              aria-expanded={modelDropdownOpen}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-kanvas-border-default bg-white/5 px-3 py-1.5 transition-colors hover:bg-white/10"
            >
              <span className="max-w-[100px] truncate whitespace-nowrap text-[10px] font-bold text-kanvas-text-primary">
                {currentModel?.name ?? "Model"}
              </span>
              <ChevronDown className="h-3 w-3 text-kanvas-text-muted" />
            </button>
            <span className="shrink-0 rounded-full border border-kanvas-border-default bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-kanvas-text-primary">
              {selectedAspect}
            </span>
            <KanvasStepper
              label="Number of images"
              value={imageCount}
              min={1}
              max={4}
              onChange={setImageCount}
              className="shrink-0 rounded-full border border-kanvas-border-default bg-white/5 px-1"
            />
          </div>
        </div>

        {/* Desktop: single-row layout */}
        <div className="hidden md:flex items-center gap-2">
        {/* Plus (upload) */}
        <KanvasIconButton
          label="Upload reference image"
          busy={uploading}
          onClick={() => uploadRef.current?.click()}
          icon={<Plus className="h-4 w-4" />}
        />

        {/* Prompt input */}
        <input
          ref={inputRef}
          type="text"
          aria-label="Prompt"
          value={prompt}
          onChange={(e) => handlePromptInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim()) onGenerate(); }}
          onBlur={() => window.setTimeout(() => onCloseMentions?.(), 150)}
          placeholder="Describe the scene you imagine"
          className="min-w-0 flex-1 border-none bg-transparent px-3 text-sm font-medium text-kanvas-text-primary placeholder-kanvas-text-faint focus:outline-none focus:ring-0"
        />

        {/* Model selector pill */}
        <button
          onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
          aria-expanded={modelDropdownOpen}
          className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-kanvas-border-default bg-white/5 px-3.5 py-2 transition-colors hover:bg-white/10"
        >
          <div
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold",
              accentSoft,
              accentText,
            )}
          >
            {getModelProvider(currentModel ?? models[0])?.charAt(0)?.toUpperCase() ?? "G"}
          </div>
          <span className="max-w-[120px] truncate whitespace-nowrap text-[11px] font-bold text-kanvas-text-primary">
            {currentModel?.name ?? "Select Model"}
          </span>
          <ChevronDown className="h-3 w-3 text-kanvas-text-muted" />
        </button>

        {/* Aspect ratio pill */}
        <div className="group relative shrink-0">
          <button className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-kanvas-border-default bg-white/5 px-3 py-2 transition-colors hover:bg-white/10">
            <span className="text-[11px] font-bold text-kanvas-text-primary">{selectedAspect}</span>
          </button>
          <div
            className={cn(
              "absolute bottom-full right-0 mb-2 hidden flex-col shadow-2xl group-hover:flex group-focus-within:flex",
              panelSurface({ surface: "panel", radius: "lg", border: "default" }),
            )}
          >
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar}
                onClick={() => { setSelectedAspect(ar); onSettingsChange("aspect_ratio", ar); }}
                className={cn(
                  "min-h-[44px] px-4 py-2 text-left text-[11px] font-bold transition-colors",
                  selectedAspect === ar
                    ? cn(accentText, accentSoft)
                    : "text-kanvas-text-secondary hover:bg-kanvas-surface-3 hover:text-kanvas-text-primary",
                )}
              >
                {ar}
              </button>
            ))}
          </div>
        </div>

        {/* Image count */}
        <KanvasStepper
          label="Number of images"
          value={imageCount}
          min={1}
          max={4}
          onChange={setImageCount}
          className="shrink-0 rounded-full border border-kanvas-border-default bg-white/5 px-1"
        />

        {/* @ mention */}
        <KanvasIconButton
          size="sm"
          tone="ghost"
          label="Mention a character"
          onClick={() => {
            inputRef.current?.focus();
            if (!/@[\w-]*$/.test(prompt)) {
              handlePromptInput(`${prompt}${prompt.trim() ? " " : ""}@`);
            }
          }}
          icon={<AtSign className="h-3.5 w-3.5" />}
          className="bg-white/5 hover:bg-white/10"
        />

        {/* Draw */}
        <button className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-kanvas-border-default bg-white/5 px-3 py-2 transition-colors hover:bg-white/10">
          <Pencil className="h-3 w-3 text-kanvas-text-secondary" />
          <span className="text-[10px] font-bold text-kanvas-text-secondary">Draw</span>
        </button>

        {/* Generate button */}
        <KanvasButton
          onClick={onGenerate}
          busy={submitting}
          disabled={!prompt.trim()}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          className="shrink-0 px-6 tracking-normal normal-case hover:shadow-[0_0_25px_rgba(249,115,22,0.4)]"
        >
          {!submitting && (
            <>
              Generate
              <span className="text-[10px] opacity-70">✦ {currentModel?.credits ?? 5}</span>
            </>
          )}
        </KanvasButton>
        </div>
        <MentionDropdown
          suggestions={mentionSuggestions}
          onSelect={handleMentionSelect}
          onTogglePin={onMentionTogglePin}
          visible={showMentionDropdown}
        />

        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file) onUpload(file, "image");
          }}
        />
      </div>
    </div>
  );

  /* ---- Render ---- */
  return (
    <div
      className="fixed inset-0 top-[68px] z-20 overflow-y-auto bg-kanvas-bg"
      style={{ scrollbarWidth: "none" }}
      onClick={() => modelDropdownOpen && setModelDropdownOpen(false)}
    >
      {renderSubNav()}
      {activeTab === "explore" && (
        <>
          {renderHero()}
          {renderCarousel()}
          {/* Recent creations masonry */}
          {completedJobs.length > 0 && (
            <div className="px-4 md:px-12 py-16">
              <KanvasSectionHeader
                className="mb-6"
                eyebrow="Gallery"
                title="Recent Creations"
                level={2}
                action={
                  <KanvasButton variant="ghost" onClick={() => setActiveTab("history")}>
                    View All →
                  </KanvasButton>
                }
              />
              <div className="columns-2 md:columns-4 lg:columns-5 gap-4 space-y-4">
                {completedJobs.slice(0, 10).map((job) => {
                  const url = getJobPrimaryUrl(job);
                  if (!url) return null;
                  return (
                    <div key={job.id} className="break-inside-avoid group cursor-pointer">
                      <div className="relative overflow-hidden rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-2">
                        <img
                          src={url}
                          alt="Generated"
                          className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30">
                          <Eye className={cn("h-5 w-5", accentText)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {renderGallery()}
      {/* Bottom padding for prompt bar */}
      <div className="h-32" />
      {renderPromptBar()}
    </div>
  );
}
