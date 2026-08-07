import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  FileText,
  HelpCircle,
  Archive,
  Mic2,
  Play,
  Smile,
  Sparkles,
  Upload,
  Wand2,
  Zap,
  Eye,
  Music,
  User,
  Globe,
  Film,
} from "lucide-react";
import type { KanvasAsset, KanvasAssetType, KanvasJob, KanvasModel } from "@/features/kanvas/types";
import { getJobPrimaryUrl, isJobActive } from "@/features/kanvas/helpers";
import { cn } from "@/lib/utils";
import { KanvasSpinner } from "@/components/kanvas/primitives";
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { musicPolishAssets } from "@/lib/musicPolishAssets";
import type { MusicPolishAsset } from "@/lib/musicPolishAssets";

/* ─── Types ──────────────────────────────────────────── */

type WizardStep = "script" | "voice" | "avatar" | "environment" | "render";
type ActiveView = "dashboard" | "templates" | "audio" | "environment" | "render";

interface LipsyncStudioProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  lipsyncMode: "talking-head" | "lip-sync";
  onLipsyncModeChange: (mode: "talking-head" | "lip-sync") => void;
  imageId: string | null;
  videoId: string | null;
  audioId: string | null;
  onImageChange: (id: string | null) => void;
  onVideoChange: (id: string | null) => void;
  onAudioChange: (id: string | null) => void;
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
  uploadingImage: boolean;
  uploadingVideo: boolean;
  uploadingAudio: boolean;
  onUpload: (file: File, type: KanvasAssetType) => Promise<void>;
}

/* ─── Film Grain SVG ─────────────────────────────────── */

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

/* ─── Wizard Steps ───────────────────────────────────── */

const WIZARD_STEPS: { key: WizardStep; label: string; icon: typeof FileText }[] = [
  { key: "script", label: "Script", icon: FileText },
  { key: "voice", label: "Voice", icon: Mic2 },
  { key: "avatar", label: "Avatar", icon: User },
  { key: "environment", label: "Environment", icon: Globe },
  { key: "render", label: "Render", icon: Film },
];

/* ─── Templates Data ─────────────────────────────────── */

const TEMPLATES = [
  {
    id: "general",
    label: "PRODUCTION TYPE",
    title: "General",
    asset: musicPolishAssets.talent.voiceBooth,
    script: "Hey everyone — quick update from the studio. Here's what we've been working on this week.",
  },
  {
    id: "selfie",
    label: "CAMERA STYLE",
    title: "Selfie",
    asset: musicPolishAssets.talent.leadVocalist,
    script: "Okay so I have to tell you about this — I wasn't expecting it, but it completely changed my routine.",
  },
  {
    id: "selling",
    label: "CONTENT TYPE",
    title: "Selling",
    asset: musicPolishAssets.toolSurfaces.lipsyncProductRead,
    script: "This is the one product I keep coming back to. Three reasons why — and the last one surprised me.",
  },
  {
    id: "testimonial",
    label: "CONTENT TYPE",
    title: "Testimonial",
    asset: musicPolishAssets.talent.faceWardrobe,
    script: "I was skeptical at first, honestly. But after two weeks I noticed the difference — here's my experience.",
  },
  {
    id: "performance",
    label: "CAMERA STYLE",
    title: "Performance",
    asset: musicPolishAssets.cinema.performanceCloseup,
    script: "Tonight's set means everything. This next track goes out to everyone who stayed with us from day one.",
  },
  {
    id: "street",
    label: "PRODUCTION TYPE",
    title: "Street Interview",
    asset: musicPolishAssets.cinema.neonStreet,
    script: "We're out here asking people one question — what's the one song you can't stop playing right now?",
  },
] satisfies Array<{ id: string; label: string; title: string; asset: MusicPolishAsset; script: string }>;

/* ─── Voice Types ────────────────────────────────────── */

const VOICE_TYPES = ["Whispers", "Rough", "Deep", "Youthful"];

/* ─── Emotions ───────────────────────────────────────── */

const EMOTIONS = [
  { id: "happy", label: "Happy", icon: Smile },
  { id: "serious", label: "Serious", icon: User },
  { id: "excited", label: "Excited", icon: Zap },
  { id: "calm", label: "Calm", icon: Music },
  { id: "sad", label: "Sad", icon: Globe },
  { id: "angry", label: "Angry", icon: Film },
];

/* ─── Wizard Sidebar ─────────────────────────────────── */

function WizardSidebar({
  activeStep,
  onStepChange,
}: {
  activeStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
}) {
  return (
    <div className="hidden md:fixed md:left-0 md:top-[68px] md:bottom-0 md:w-[260px] md:bg-kanvas-bg md:z-40 md:flex md:flex-col md:overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-8 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-kanvas-accent font-kanvas-display">
          UGC FACTORY
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-kanvas-text-faint">
          Production Wizard
        </p>
      </div>

      {/* Steps */}
      <nav className="flex-1 px-4 space-y-2">
        {WIZARD_STEPS.map((step, i) => {
          const active = activeStep === step.key;
          const StepIcon = step.icon;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange(step.key)}
              className={cn(
                "w-full flex items-center gap-4 rounded-full px-4 py-3 text-xs uppercase tracking-[0.15em] font-kanvas-display font-bold transition-all",
                active
                  ? "bg-kanvas-accent text-kanvas-accent-contrast"
                  : "text-kanvas-text-muted hover:text-kanvas-text-primary hover:bg-white/5"
              )}
            >
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black",
                active ? "bg-black/20" : "bg-white/5"
              )}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <StepIcon className="h-4 w-4" />
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 pb-8 space-y-3">
        <button className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-kanvas-text-faint hover:text-kanvas-text-primary transition-colors w-full">
          <HelpCircle className="h-3.5 w-3.5" />
          Support
        </button>
        <button className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-kanvas-text-faint hover:text-kanvas-text-primary transition-colors w-full">
          <Archive className="h-3.5 w-3.5" />
          Archive
        </button>
        <button className="w-full flex items-center justify-center gap-2 rounded-full border border-kanvas-border-default bg-transparent px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-kanvas-text-secondary hover:bg-white/5 hover:text-kanvas-text-primary transition-all font-kanvas-display font-bold">
          <Download className="h-3.5 w-3.5" />
          Export Project
        </button>
      </div>
    </div>
  );
}

/* ─── Lipsync Dashboard ──────────────────────────────── */

function LipsyncDashboard({
  prompt,
  onPromptChange,
  lipsyncMode,
  onLipsyncModeChange,
  currentModel,
  models,
  onModelChange,
  imageId,
  videoId,
  audioId,
  submitting,
  onGenerate,
  onUpload,
  uploadingImage,
  uploadingAudio,
  jobs,
  selectedJob,
  tier,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  lipsyncMode: "talking-head" | "lip-sync";
  onLipsyncModeChange: (mode: "talking-head" | "lip-sync") => void;
  currentModel: KanvasModel | null;
  models: KanvasModel[];
  onModelChange: (id: string) => void;
  imageId: string | null;
  videoId: string | null;
  audioId: string | null;
  submitting: boolean;
  onGenerate: () => void;
  onUpload: (file: File, type: KanvasAssetType) => Promise<void>;
  uploadingImage: boolean;
  uploadingAudio: boolean;
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  tier: "free" | "pro" | "enterprise";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [audioMode, setAudioMode] = useState<"text" | "generate">("text");
  const latestCompleted = jobs.find((j) => j.status === "completed");
  const latestUrl = latestCompleted ? getJobPrimaryUrl(latestCompleted) : null;

  const workflowSteps = [
    { num: "01", title: "Upload", desc: "Upload your portrait or video asset" },
    { num: "02", title: "Generate", desc: "AI processes your lipsync request" },
    { num: "03", title: "Select", desc: "Choose the best output render" },
  ];
  const sortedModels = sortModelsForTier(models, tier);

  const activeWorkflowStep = !selectedJob ? 0 : selectedJob.status === "completed" ? 2 : 1;

  return (
    <div className="space-y-12 pb-24">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-6xl md:text-8xl font-black font-kanvas-display tracking-tighter leading-[0.9]">
          <span className="text-kanvas-text-primary">LIPSYNC MODELS,</span>
          <br />
          <span className="text-kanvas-accent">ONE CLICK AWAY</span>
        </h1>
        <p className="mt-6 max-w-lg text-sm text-kanvas-text-muted leading-relaxed">
          Upload a portrait, paste your script, and let AI bring it to life with natural lip movements and expressions.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column — Input */}
        <div className="space-y-6">
          <div className="rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-1 p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onLipsyncModeChange("talking-head")}
                className={cn(
                  "rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all font-kanvas-display",
                  lipsyncMode === "talking-head" ? "bg-kanvas-accent text-kanvas-accent-contrast" : "bg-kanvas-surface-2 text-kanvas-text-muted hover:text-kanvas-text-primary"
                )}
              >
                Talking Head
              </button>
              <button
                type="button"
                onClick={() => onLipsyncModeChange("lip-sync")}
                className={cn(
                  "rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all font-kanvas-display",
                  lipsyncMode === "lip-sync" ? "bg-kanvas-accent text-kanvas-accent-contrast" : "bg-kanvas-surface-2 text-kanvas-text-muted hover:text-kanvas-text-primary"
                )}
              >
                Lip Sync
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold">Model</p>
                <p className="text-[10px] text-kanvas-text-faint">
                  {`${currentModel?.credits ?? 0} credits`}
                </p>
              </div>
              <select
                value={currentModel?.id ?? ""}
                onChange={(event) => onModelChange(event.target.value)}
                className="w-full appearance-none rounded-kanvas-lg border border-kanvas-border-subtle bg-black/20 px-4 py-3 text-sm text-kanvas-text-primary focus:border-kanvas-accent-edge focus:outline-none"
              >
                {sortedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}{model.id.startsWith("gmi/") ? " (GMI)" : ""} — {model.credits}cr
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.15em]">
              <div className="rounded-kanvas-md bg-black/20 px-3 py-2 text-kanvas-text-muted">
                Portrait
                <div className="mt-2 text-kanvas-text-primary">{imageId ? "Ready" : "Missing"}</div>
              </div>
              <div className="rounded-kanvas-md bg-black/20 px-3 py-2 text-kanvas-text-muted">
                Video
                <div className="mt-2 text-kanvas-text-primary">{videoId ? "Ready" : "Missing"}</div>
              </div>
              <div className="rounded-kanvas-md bg-black/20 px-3 py-2 text-kanvas-text-muted">
                Audio
                <div className="mt-2 text-kanvas-text-primary">{audioId ? "Ready" : "Missing"}</div>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-full aspect-[16/9] overflow-hidden rounded-kanvas-lg border border-kanvas-border-subtle bg-kanvas-surface-1 flex flex-col items-center justify-center gap-3 hover:border-kanvas-accent-edge transition-all group cursor-pointer"
          >
            <img
              src={musicPolishAssets.kanvas.aiVisualWall.src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-20 transition duration-700 group-hover:scale-105 group-hover:opacity-30"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/55 to-black/30" />
            {uploadingImage ? (
              <KanvasSpinner className="relative h-8 w-8 text-kanvas-accent" />
            ) : (
              <div className="relative flex h-14 w-14 items-center justify-center rounded-kanvas-lg bg-kanvas-accent-soft group-hover:bg-kanvas-accent-soft transition-colors">
                <Upload className="h-6 w-6 text-kanvas-accent" />
              </div>
            )}
            <p className="relative text-xs uppercase tracking-[0.2em] text-kanvas-text-secondary font-bold">
              Upload Asset
            </p>
            <p className="relative text-[10px] text-kanvas-text-muted">PNG, JPG, MP4 — Max 50MB</p>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) {
                const type: KanvasAssetType = file.type.startsWith("video") ? "video" : "image";
                void onUpload(file, type);
              }
            }}
          />

          {/* Audio Toggle */}
          <div className="flex items-center gap-1 rounded-full bg-kanvas-surface-1 p-1 w-fit">
            <button
              type="button"
              onClick={() => setAudioMode("text")}
              className={cn(
                "px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-kanvas-display",
                audioMode === "text"
                  ? "bg-kanvas-accent text-kanvas-accent-contrast"
                  : "text-kanvas-text-muted hover:text-kanvas-text-primary"
              )}
            >
              Audio Text
            </button>
            <button
              type="button"
              onClick={() => setAudioMode("generate")}
              className={cn(
                "px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-kanvas-display",
                audioMode === "generate"
                  ? "bg-kanvas-accent text-kanvas-accent-contrast"
                  : "text-kanvas-text-muted hover:text-kanvas-text-primary"
              )}
            >
              Generate Audio
            </button>
          </div>

          {/* Script Input */}
          <div className="relative rounded-kanvas-lg bg-kanvas-surface-1 p-6">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Write your script here... The AI will generate lip-synced video from this text."
              className="w-full min-h-[150px] bg-transparent text-kanvas-text-primary text-sm placeholder:text-kanvas-text-faint resize-none focus:outline-none font-kanvas-display"
              maxLength={2000}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-3">
              <span className="text-[10px] text-kanvas-text-faint font-mono">
                {prompt.length} / 2000
              </span>
              <Wand2 className="h-4 w-4 text-kanvas-text-faint hover:text-kanvas-accent cursor-pointer transition-colors" />
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-kanvas-accent text-kanvas-accent-contrast font-bold uppercase tracking-[0.15em] py-4 rounded-full hover:shadow-[0_0_30px_hsl(var(--kanvas-accent)/0.3)] transition-all font-kanvas-display disabled:opacity-50"
          >
            {submitting ? (
              <>
                <KanvasSpinner className="h-5 w-5 text-kanvas-accent-contrast" />
                Processing
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate ✦ {currentModel?.credits ?? 20}
              </>
            )}
          </button>
        </div>

        {/* Right Column — Workflow & Output */}
        <div className="space-y-6">
          {/* Workflow Steps */}
          {workflowSteps.map((step, i) => (
            <div
              key={step.num}
              className={cn(
                "rounded-kanvas-lg bg-kanvas-surface-2/60 p-6 flex items-center gap-6 transition-all",
                i === activeWorkflowStep && "border-l-4 border-kanvas-accent"
              )}
            >
              <span className={cn(
                "text-4xl font-black font-kanvas-display tracking-tighter",
                i === activeWorkflowStep ? "text-kanvas-accent" : "text-kanvas-text-faint"
              )}>
                {step.num}
              </span>
              <div>
                <p className={cn(
                  "text-sm font-bold uppercase tracking-[0.15em] font-kanvas-display",
                  i === activeWorkflowStep ? "text-kanvas-text-primary" : "text-kanvas-text-muted"
                )}>
                  {step.title}
                </p>
                <p className="text-xs text-kanvas-text-faint mt-1">{step.desc}</p>
              </div>
              {i < activeWorkflowStep && (
                <Check className="ml-auto h-5 w-5 text-kanvas-accent" />
              )}
            </div>
          ))}

          {/* Latest Render */}
          {latestCompleted && (
            <div className="rounded-kanvas-lg bg-kanvas-surface-1 p-6 flex gap-6">
              <div className="h-24 w-24 rounded-kanvas-md overflow-hidden bg-white/5 shrink-0">
                {latestUrl ? (
                  latestCompleted.resultPayload?.mediaType === "video" ? (
                    <video src={latestUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <img src={latestUrl} alt="Latest render" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Film className="h-6 w-6 text-kanvas-text-faint" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-kanvas-text-muted font-bold">Latest Render</p>
                <p className="text-sm font-semibold text-kanvas-text-primary mt-1 truncate">
                  {latestCompleted.modelId ?? "Lipsync Output"}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button className="px-4 py-1.5 rounded-full bg-white/10 text-kanvas-text-primary text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-white/15 transition-colors flex items-center gap-1.5">
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                  <button className="px-4 py-1.5 rounded-full bg-kanvas-accent-soft text-kanvas-accent text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-kanvas-accent/20 transition-colors">
                    Upscale
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── UGC Templates ──────────────────────────────────── */

function UGCTemplates({
  selectedTemplate,
  onSelect,
  onNext,
}: {
  selectedTemplate: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-10 pb-24 relative">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-6xl md:text-8xl font-black font-kanvas-display tracking-tighter leading-[0.9]">
          <span className="text-kanvas-text-primary">Choose your </span>
          <span className="text-kanvas-accent">Template</span>
        </h1>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TEMPLATES.map((tpl) => {
          const selected = selectedTemplate === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "relative rounded-[2rem] h-[400px] overflow-hidden group cursor-pointer transition-all",
                selected
                  ? "border-2 border-kanvas-accent shadow-[0_0_30px_hsl(var(--kanvas-accent)/0.15)]"
                  : "border border-kanvas-border-subtle hover:border-kanvas-border-default"
              )}
            >
              <img
                src={tpl.asset.src}
                alt={tpl.asset.alt}
                className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-700 group-hover:scale-105 group-hover:opacity-95"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

              {/* Selected check */}
              {selected && (
                <div className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-kanvas-accent flex items-center justify-center">
                  <Check className="h-4 w-4 text-kanvas-accent-contrast" />
                </div>
              )}

              {/* Text */}
              <div className="absolute bottom-6 left-6 right-6 z-10 text-left">
                <p className={cn(
                  "text-[10px] uppercase tracking-[0.3em] font-bold mb-2",
                  selected ? "text-kanvas-accent" : "text-kanvas-text-muted"
                )}>
                  {tpl.label}
                </p>
                <p className="text-3xl font-black text-kanvas-text-primary font-kanvas-display tracking-tight">
                  {tpl.title}
                </p>
                <p className="mt-2 text-xs italic leading-relaxed text-kanvas-text-secondary line-clamp-2">
                  “{tpl.script}”
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Floating FAB */}
      <button
        type="button"
        onClick={onNext}
        className="fixed bottom-8 right-8 z-50 w-20 h-20 rounded-full bg-kanvas-accent text-kanvas-accent-contrast flex items-center justify-center shadow-[0_0_40px_hsl(var(--kanvas-accent)/0.3)] hover:shadow-[0_0_60px_hsl(var(--kanvas-accent)/0.5)] transition-all"
      >
        <ArrowRight className="h-8 w-8" />
      </button>
    </div>
  );
}

/* ─── UGC Audio Settings ─────────────────────────────── */

function UGCAudioSettings({
  onNext,
}: {
  onNext: () => void;
}) {
  const [voiceType, setVoiceType] = useState("Whispers");
  const [emotion, setEmotion] = useState("happy");
  const [language, setLanguage] = useState("english");
  const [accent, setAccent] = useState("neutral");

  return (
    <div className="space-y-10 pb-24">
      {/* Hero */}
      <div className="pt-4">
        <h1 className="text-6xl md:text-8xl font-black font-kanvas-display tracking-tighter leading-[0.9]">
          <span className="text-kanvas-text-primary">AUDIO </span>
          <span className="text-kanvas-accent">SETTINGS</span>
        </h1>
      </div>

      {/* Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-3">Select Language</p>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full appearance-none bg-kanvas-surface-1 border border-kanvas-border-subtle rounded-kanvas-lg px-5 py-4 text-kanvas-text-primary text-sm font-kanvas-display focus:outline-none focus:border-kanvas-accent-edge transition-colors"
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
              <option value="german">German</option>
              <option value="japanese">Japanese</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-kanvas-text-muted pointer-events-none" />
          </div>
        </div>
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-3">Select Accent</p>
          <div className="relative">
            <select
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-full appearance-none bg-kanvas-surface-1 border border-kanvas-border-subtle rounded-kanvas-lg px-5 py-4 text-kanvas-text-primary text-sm font-kanvas-display focus:outline-none focus:border-kanvas-accent-edge transition-colors"
            >
              <option value="neutral">Neutral</option>
              <option value="british">British</option>
              <option value="australian">Australian</option>
              <option value="southern">Southern</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-kanvas-text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Voice Type Row */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-4">Voice Type</p>
        <div className="flex flex-wrap gap-3">
          {VOICE_TYPES.map((vt) => (
            <button
              key={vt}
              type="button"
              onClick={() => setVoiceType(vt)}
              className={cn(
                "px-6 py-3 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-kanvas-display",
                voiceType === vt
                  ? "bg-kanvas-accent text-kanvas-accent-contrast"
                  : "bg-kanvas-surface-1 text-kanvas-text-muted hover:text-kanvas-text-primary hover:bg-white/5"
              )}
            >
              {vt}
            </button>
          ))}
        </div>
      </div>

      {/* Emotional Delivery Grid */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted font-bold mb-4">Emotional Delivery</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {EMOTIONS.map((em) => {
            const active = emotion === em.id;
            const EmIcon = em.icon;
            return (
              <button
                key={em.id}
                type="button"
                onClick={() => setEmotion(em.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-kanvas-lg p-6 transition-all aspect-square",
                  active
                    ? "border-2 border-kanvas-accent bg-kanvas-accent/5"
                    : "border border-kanvas-border-subtle bg-kanvas-surface-1 hover:border-kanvas-border-default"
                )}
              >
                <EmIcon className={cn(
                  "h-6 w-6",
                  active ? "text-kanvas-accent" : "text-kanvas-text-faint"
                )} />
                <span className={cn(
                  "text-[10px] uppercase tracking-[0.2em] font-bold",
                  active ? "text-kanvas-accent" : "text-kanvas-text-muted"
                )}>
                  {em.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Preview Player */}
      <div className="rounded-[2rem] bg-kanvas-surface-1 p-6 flex items-center gap-6">
        <button
          type="button"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-kanvas-accent text-kanvas-accent-contrast hover:shadow-[0_0_20px_hsl(var(--kanvas-accent)/0.3)] transition-all"
        >
          <Play className="h-6 w-6 ml-1" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-kanvas-text-primary font-kanvas-display">
            Voice Preview: Neutral {voiceType}
          </p>
          <p className="text-xs text-kanvas-text-muted italic mt-1 truncate">
            "Hello, this is a sample of the selected voice..."
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-kanvas-accent" />
            </div>
            <span className="text-[10px] text-kanvas-text-faint font-mono whitespace-nowrap">0:04 / 0:12</span>
          </div>
        </div>
      </div>

      {/* Next Step */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-kanvas-accent text-kanvas-accent-contrast font-bold uppercase tracking-[0.15em] px-8 py-3 rounded-full hover:shadow-[0_0_20px_hsl(var(--kanvas-accent)/0.3)] transition-all text-xs font-kanvas-display"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── Environment Panel ──────────────────────────────── */

function EnvironmentPanel({
  settings,
  onSettingsChange,
  onNext,
}: {
  settings: Record<string, unknown>;
  onSettingsChange: (key: string, value: string | number | boolean) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-10 pb-24">
      <div>
        <h2 className="text-4xl font-black font-kanvas-display text-kanvas-text-primary tracking-tight">Dial In The Render Space</h2>
        <p className="mt-3 max-w-2xl text-sm text-kanvas-text-muted">
          These values are persisted into the lip-sync request payload so the render step uses the exact same framing and output settings.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <label className="rounded-kanvas-xl border border-kanvas-border-default bg-kanvas-surface-1 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted">Aspect Ratio</p>
          <select
            value={String(settings.aspect_ratio ?? "16:9")}
            onChange={(event) => onSettingsChange("aspect_ratio", event.target.value)}
            className="mt-4 w-full bg-transparent text-kanvas-text-primary outline-none"
          >
            {["16:9", "9:16", "1:1"].map((value) => (
              <option key={value} value={value} className="bg-black">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-kanvas-xl border border-kanvas-border-default bg-kanvas-surface-1 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted">Resolution</p>
          <select
            value={String(settings.resolution ?? "1080p")}
            onChange={(event) => onSettingsChange("resolution", event.target.value)}
            className="mt-4 w-full bg-transparent text-kanvas-text-primary outline-none"
          >
            {["720p", "1080p", "1440p"].map((value) => (
              <option key={value} value={value} className="bg-black">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-kanvas-xl border border-kanvas-border-default bg-kanvas-surface-1 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted">Generate Audio</p>
          <button
            type="button"
            onClick={() => onSettingsChange("generate_audio", !(settings.generate_audio ?? true))}
            className={cn(
              "mt-4 inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.15em]",
              settings.generate_audio ?? true ? "bg-kanvas-accent text-kanvas-accent-contrast" : "bg-white/5 text-kanvas-text-secondary"
            )}
          >
            {(settings.generate_audio ?? true) ? "Enabled" : "Disabled"}
          </button>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-kanvas-accent text-kanvas-accent-contrast font-bold uppercase tracking-[0.15em] px-8 py-3 rounded-full hover:shadow-[0_0_20px_hsl(var(--kanvas-accent)/0.3)] transition-all text-xs font-kanvas-display"
        >
          Continue To Render
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─── Render Panel ───────────────────────────────────── */

function RenderPanel({
  currentModel,
  prompt,
  imageId,
  videoId,
  audioId,
  settings,
  submitting,
  onGenerate,
  selectedJob,
}: {
  currentModel: KanvasModel | null;
  prompt: string;
  imageId: string | null;
  videoId: string | null;
  audioId: string | null;
  settings: Record<string, unknown>;
  submitting: boolean;
  onGenerate: () => void;
  selectedJob: KanvasJob | null;
}) {
  const summary = [
    { label: "Model", value: currentModel?.name ?? "Not selected" },
    { label: "Portrait", value: imageId ?? "Optional" },
    { label: "Video", value: videoId ?? "Optional" },
    { label: "Audio", value: audioId ?? "Required" },
    { label: "Prompt", value: prompt.trim() || "No extra direction" },
    { label: "Aspect", value: String(settings.aspect_ratio ?? "16:9") },
    { label: "Resolution", value: String(settings.resolution ?? "1080p") },
  ];

  return (
    <div className="space-y-8 pb-24">
      <div>
        <h2 className="text-4xl font-black font-kanvas-display text-kanvas-text-primary tracking-tight">Render Review</h2>
        <p className="mt-3 max-w-2xl text-sm text-kanvas-text-muted">
          Review the exact request payload inputs before dispatching the render. The generate button here uses the current model, selected assets, prompt, and environment settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {summary.map((item) => (
          <div key={item.label} className="rounded-kanvas-xl border border-kanvas-border-default bg-kanvas-surface-1 p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted">{item.label}</p>
            <p className="mt-3 text-sm text-kanvas-text-primary break-all">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-kanvas-xl border border-kanvas-border-default bg-kanvas-surface-1 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-kanvas-text-muted">Latest Status</p>
            <p className="mt-2 text-sm text-kanvas-text-primary">{selectedJob ? selectedJob.status : "Ready to render"}</p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting || !audioId}
            className="inline-flex items-center gap-2 rounded-full bg-kanvas-accent px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-kanvas-accent-contrast disabled:opacity-50"
          >
            {submitting ? <KanvasSpinner className="h-5 w-5 text-kanvas-accent-contrast" /> : <Sparkles className="h-4 w-4" />}
            Generate Render
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────── */

export default function LipsyncStudioSection(props: LipsyncStudioProps) {
  const { tier } = useUserTier();
  const [activeStep, setActiveStep] = useState<WizardStep>("script");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const viewForStep: Record<WizardStep, ActiveView> = {
    script: "dashboard",
    voice: "audio",
    avatar: "templates",
    environment: "environment",
    render: "render",
  };

  const activeView = viewForStep[activeStep];

  function handleNextStep() {
    const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === activeStep);
    if (currentIdx < WIZARD_STEPS.length - 1) {
      setActiveStep(WIZARD_STEPS[currentIdx + 1].key);
    }
  }

  return (
    <div className="fixed inset-0 top-[68px] z-30 bg-kanvas-bg overflow-hidden">
      {/* Film Grain */}
      <div
        className="pointer-events-none fixed inset-0 z-[1] mix-blend-overlay opacity-[0.15]"
        style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat", backgroundSize: "128px 128px" }}
      />

      {/* Mobile: horizontal step indicator */}
      <div className="md:hidden flex items-center gap-1 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-kanvas-border-subtle bg-kanvas-bg z-40 relative">
        {WIZARD_STEPS.map((step, i) => {
          const active = activeStep === step.key;
          const StepIcon = step.icon;
          return (
            <button
              key={step.key}
              onClick={() => setActiveStep(step.key)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                active
                  ? "bg-kanvas-accent text-kanvas-accent-contrast"
                  : "text-kanvas-text-muted bg-kanvas-surface-2"
              )}
            >
              <StepIcon className="h-3 w-3" />
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Desktop Sidebar */}
      <WizardSidebar activeStep={activeStep} onStepChange={setActiveStep} />

      {/* Main Content */}
      <div className="absolute inset-0 left-0 md:left-[260px] top-[52px] md:top-0 overflow-y-auto z-[2] pb-16 md:pb-0" style={{ scrollbarWidth: "none" }}>
        <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1200px]">
          {activeView === "dashboard" && (
            <LipsyncDashboard
              prompt={props.prompt}
              onPromptChange={props.onPromptChange}
              lipsyncMode={props.lipsyncMode}
              onLipsyncModeChange={props.onLipsyncModeChange}
                currentModel={props.currentModel}
                models={props.models}
                onModelChange={props.onModelChange}
                imageId={props.imageId}
                videoId={props.videoId}
                audioId={props.audioId}
              submitting={props.submitting}
              onGenerate={props.onGenerate}
              onUpload={props.onUpload}
              uploadingImage={props.uploadingImage}
              uploadingAudio={props.uploadingAudio}
              jobs={props.jobs}
              selectedJob={props.selectedJob}
              tier={tier}
            />
          )}
          {activeView === "templates" && (
            <UGCTemplates
              selectedTemplate={selectedTemplate}
              onSelect={setSelectedTemplate}
              onNext={handleNextStep}
            />
          )}
          {activeView === "audio" && (
            <UGCAudioSettings onNext={handleNextStep} />
          )}
          {activeView === "environment" && (
            <EnvironmentPanel
              settings={props.settings}
              onSettingsChange={props.onSettingsChange}
              onNext={handleNextStep}
            />
          )}
          {activeView === "render" && (
            <RenderPanel
              currentModel={props.currentModel}
              prompt={props.prompt}
              imageId={props.imageId}
              videoId={props.videoId}
              audioId={props.audioId}
              settings={props.settings}
              submitting={props.submitting}
              onGenerate={props.onGenerate}
              selectedJob={props.selectedJob}
            />
          )}
        </div>
      </div>
    </div>
  );
}
