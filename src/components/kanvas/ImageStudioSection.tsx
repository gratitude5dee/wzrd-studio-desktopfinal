import { useRef, useState } from "react";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanvasAsset, KanvasAssetType, KanvasJob, KanvasModel } from "@/features/kanvas/types";
import { normalizeKanvasJobMedia } from "@/features/kanvas/helpers";
import { getKanvasModelProvider } from "@/features/kanvas/modelProvider";
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { MentionDropdown } from "@/components/character-creation/MentionDropdown";
import { musicPolishAssets } from "@/lib/musicPolishAssets";
import type { CharacterMention } from "@/types/character-creation";
import { KanvasMediaPreview } from "@/components/kanvas/KanvasMediaPreview";

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
    <div className="flex items-center gap-4 md:gap-6 px-4 md:px-12 pt-4 md:pt-6">
      {(["explore", "history"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "text-sm font-semibold capitalize transition-colors pb-2 border-b-2",
            activeTab === tab
              ? "text-white border-[#f97316]"
              : "text-zinc-500 border-transparent hover:text-zinc-300"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );

  /* ---- Hero Section ---- */
  const renderHero = () => (
    <div className="text-center pt-8 md:pt-16 pb-6 md:pb-8 px-4 md:px-0">
      <h1
        className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.9] uppercase"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <span className="sr-only">TURN IDEAS</span>
        <span className="text-white">TURN TRACKS</span>
        <br />
        <span className="text-white">INTO </span>
        <span className="text-[#f97316]">VISUALS</span>
      </h1>
    </div>
  );

  /* ---- Use Case Carousel ---- */
  const renderCarousel = () => (
    <>
      <div className="relative max-w-[1280px] mx-auto px-4 md:px-12 hidden md:block">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
            aria-label="Previous visual example"
            disabled={carouselIndex === 0}
            className="shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4 text-zinc-400" />
          </button>
          <div className="flex gap-6 overflow-hidden flex-1">
            {USE_CASE_CARDS.map((card, i) => (
              <div
                key={card.label}
                className="min-w-[300px] flex-1 aspect-[4/5] rounded-lg relative overflow-hidden group cursor-pointer border border-white/10 bg-[#101014]"
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
                <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200 backdrop-blur">
                  {card.style}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 space-y-2">
                  <h3 className="text-lg font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {card.label}
                  </h3>
                  <p className="text-xs leading-relaxed text-zinc-300">{card.subtitle}</p>
                </div>
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-500" />
              </div>
            ))}
          </div>
          <button
            onClick={() => setCarouselIndex(Math.min(USE_CASE_CARDS.length - 1, carouselIndex + 1))}
            aria-label="Next visual example"
            disabled={carouselIndex === USE_CASE_CARDS.length - 1}
            className="shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </button>
        </div>
        {/* Try this pill */}
        <div className="flex justify-center mt-6">
          <button className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            Try this →
          </button>
        </div>
      </div>

      <div className="md:hidden px-4 pb-36">
        <div className="grid gap-3">
          {USE_CASE_CARDS.map((card) => (
            <div key={card.label} className="relative aspect-[16/9] overflow-hidden rounded-lg border border-white/10 bg-[#101014]">
              <img
                src={card.image}
                alt={card.alt}
                className="absolute inset-0 h-full w-full object-cover opacity-85"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
              <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-200 backdrop-blur">
                {card.style}
              </div>
              <div className="absolute bottom-3 left-3 right-8">
                <h3 className="text-sm font-bold text-white">{card.label}</h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-300">{card.subtitle}</p>
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
        <div className="text-center py-20">
          <p className="text-zinc-600 text-sm">
            No generations yet. Create your first image!
          </p>
        </div>
      );
    }
    return (
      <div className="px-12 py-8">
        <div className="columns-2 md:columns-4 lg:columns-5 gap-4 space-y-4">
          {displayJobs.map((job) => {
            const media = normalizeKanvasJobMedia(job);
            return (
              <div key={job.id} className="break-inside-avoid group cursor-pointer">
                <div className="relative rounded-xl overflow-hidden border border-white/5 bg-white/5">
                  <KanvasMediaPreview
                    media={{ ...media, alt: "Generated image" }}
                    aspectClassName="aspect-[4/5]"
                    className="w-full"
                    mediaClassName="transition-transform duration-500 group-hover:scale-[1.02]"
                    showErrorLabel
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-[10px] text-zinc-300 truncate">{job.modelId}</p>
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
      <div className="absolute bottom-full left-0 right-0 mb-2 max-h-[400px] overflow-y-auto rounded-2xl bg-[#131313] border border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] z-[60]"
        style={{ scrollbarWidth: "none" }}
      >
        {groupedModels.map((group) => (
          <div key={group.label}>
            <div className="px-4 py-2 flex items-center gap-2 border-b border-white/5">
              <div className="w-5 h-5 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[9px] font-bold text-[#f97316]">
                {group.icon}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{group.label}</span>
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
                    "w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors text-left",
                    isActive ? "bg-[#f97316]/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isActive && <Check className="h-3 w-3 text-[#f97316]" />}
                    <span className="font-medium">{m.name}</span>
                    {isGmi && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-400">
                        GMI
                      </span>
                    )}
                    {isFeatured && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-[#f97316]/20 text-[#f97316]">
                        Top Choice
                      </span>
                    )}
                    {isNew && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-blue-500/20 text-blue-400">
                        New
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-600">
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
      <div className="relative bg-[#131313]/95 backdrop-blur-2xl border border-white/10 rounded-[28px] p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.9)] w-full max-w-[1100px]">
        {renderModelDropdown()}

        {/* Mobile: 2-row layout */}
        <div className="flex flex-col gap-2 md:hidden">
          {/* Row 1: Upload + Input + Generate */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => uploadRef.current?.click()}
              className="shrink-0 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin text-[#f97316]" /> : <Plus className="h-4 w-4 text-zinc-400" />}
            </button>
            <input
              type="text"
              value={prompt}
              onChange={(e) => handlePromptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim()) onGenerate(); }}
              onBlur={() => window.setTimeout(() => onCloseMentions?.(), 150)}
              placeholder="Describe the scene..."
              className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 focus:outline-none text-white placeholder-zinc-600 font-medium text-sm px-2"
            />
            <button
              onClick={onGenerate}
              disabled={submitting || !prompt.trim()}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-4 h-10 rounded-full font-bold text-sm transition-all",
                "bg-[#f97316] text-black hover:shadow-[0_0_25px_rgba(249,115,22,0.4)]",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </button>
          </div>
          {/* Row 2: Model + Aspect + Count (scrollable) */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="shrink-0 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/10 transition-colors"
            >
              <span className="text-[10px] font-bold text-white whitespace-nowrap max-w-[100px] truncate">
                {currentModel?.name ?? "Model"}
              </span>
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </button>
            <button className="shrink-0 flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2.5 py-1.5">
              <span className="text-[10px] font-bold text-white">{selectedAspect}</span>
            </button>
            <div className="shrink-0 flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-1">
              <button onClick={() => setImageCount(Math.max(1, imageCount - 1))} className="p-0.5 text-zinc-500"><Minus className="h-3 w-3" /></button>
              <span className="text-[10px] font-bold text-white w-5 text-center">{imageCount}</span>
              <button onClick={() => setImageCount(Math.min(4, imageCount + 1))} className="p-0.5 text-zinc-500"><Plus className="h-3 w-3" /></button>
            </div>
          </div>
        </div>

        {/* Desktop: single-row layout */}
        <div className="hidden md:flex items-center gap-2">
        {/* Plus (upload) */}
        <button
          onClick={() => uploadRef.current?.click()}
          className="shrink-0 w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin text-[#f97316]" /> : <Plus className="h-4 w-4 text-zinc-400" />}
        </button>

        {/* Prompt input */}
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => handlePromptInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim()) onGenerate(); }}
          onBlur={() => window.setTimeout(() => onCloseMentions?.(), 150)}
          placeholder="Describe the scene you imagine"
          className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 focus:outline-none text-white placeholder-zinc-600 font-medium text-sm px-3"
        />

        {/* Model selector pill */}
        <button
          onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
          className="shrink-0 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3.5 py-2 hover:bg-white/10 transition-colors"
        >
          <div className="w-4 h-4 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[8px] font-bold text-[#f97316]">
            {getModelProvider(currentModel ?? models[0])?.charAt(0)?.toUpperCase() ?? "G"}
          </div>
          <span className="text-[11px] font-bold text-white whitespace-nowrap max-w-[120px] truncate">
            {currentModel?.name ?? "Select Model"}
          </span>
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </button>

        {/* Aspect ratio pill */}
        <div className="shrink-0 relative group">
          <button className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-2 hover:bg-white/10 transition-colors">
            <span className="text-[11px] font-bold text-white">{selectedAspect}</span>
          </button>
          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:flex flex-col bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar}
                onClick={() => { setSelectedAspect(ar); onSettingsChange("aspect_ratio", ar); }}
                className={cn(
                  "px-4 py-2 text-[11px] font-bold text-left transition-colors",
                  selectedAspect === ar ? "text-[#f97316] bg-[#f97316]/10" : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                {ar}
              </button>
            ))}
          </div>
        </div>

        {/* Image count */}
        <div className="shrink-0 flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-1">
          <button onClick={() => setImageCount(Math.max(1, imageCount - 1))} className="p-1 text-zinc-500 hover:text-white transition-colors">
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-[11px] font-bold text-white w-6 text-center">{imageCount}/4</span>
          <button onClick={() => setImageCount(Math.min(4, imageCount + 1))} className="p-1 text-zinc-500 hover:text-white transition-colors">
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* @ mention */}
        <button
          type="button"
          onClick={() => {
            inputRef.current?.focus();
            if (!/@[\w-]*$/.test(prompt)) {
              handlePromptInput(`${prompt}${prompt.trim() ? " " : ""}@`);
            }
          }}
          className="shrink-0 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
        >
          <AtSign className="h-3.5 w-3.5 text-zinc-500" />
        </button>

        {/* Draw */}
        <button className="shrink-0 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-2 hover:bg-white/10 transition-colors">
          <Pencil className="h-3 w-3 text-zinc-400" />
          <span className="text-[10px] font-bold text-zinc-400">Draw</span>
        </button>

        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={submitting || !prompt.trim()}
          className={cn(
            "shrink-0 flex items-center gap-2 px-6 h-11 rounded-full font-bold text-sm transition-all",
            "bg-[#f97316] text-black hover:shadow-[0_0_25px_rgba(249,115,22,0.4)]",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Generate
              <span className="text-[10px] opacity-70">✦ {currentModel?.credits ?? 5}</span>
            </>
          )}
        </button>
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
      className="fixed inset-0 top-[68px] bg-[#0a0a0a] z-20 overflow-y-auto"
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
            <div className="px-12 py-16">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-1">Gallery</p>
                  <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Recent Creations
                  </h2>
                </div>
                <button
                  onClick={() => setActiveTab("history")}
                  className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500 hover:text-[#f97316] transition-colors"
                >
                  View All →
                </button>
              </div>
              <div className="columns-2 md:columns-4 lg:columns-5 gap-4 space-y-4">
                {completedJobs.slice(0, 10).map((job) => {
                  const media = normalizeKanvasJobMedia(job);
                  return (
                    <div key={job.id} className="break-inside-avoid group cursor-pointer">
                      <div className="relative rounded-xl overflow-hidden border border-white/5 bg-white/5">
                        <KanvasMediaPreview
                          media={{ ...media, alt: "Generated image" }}
                          aspectClassName="aspect-[4/5]"
                          className="w-full"
                          mediaClassName="transition-transform duration-500 group-hover:scale-[1.02]"
                          showErrorLabel
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30">
                          <Eye className="h-5 w-5 text-[#f97316]" />
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
