import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Loader2,
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
import { normalizeKanvasJobMedia } from "@/features/kanvas/helpers";
import { cn } from "@/lib/utils";
import { useUserTier, sortModelsForTier } from "@/hooks/useUserTier";
import { musicPolishAssets } from "@/lib/musicPolishAssets";
import type { MusicPolishAsset } from "@/lib/musicPolishAssets";
import { KanvasMediaPreview } from "@/components/kanvas/KanvasMediaPreview";
import { useRegisterVoiceActions } from "@/voice/VoiceAgentProvider";
import type { VoiceActionRegistration } from "@/voice/actions/registry";

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

const WIZARD_STEPS: { key: WizardStep; label: string; description: string; icon: typeof FileText }[] = [
  { key: "script", label: "Script", description: "Write the line", icon: FileText },
  { key: "voice", label: "Voice", description: "Tune delivery", icon: Mic2 },
  { key: "avatar", label: "Avatar", description: "Pick talent", icon: User },
  { key: "environment", label: "Environment", description: "Set render", icon: Globe },
  { key: "render", label: "Render", description: "Review launch", icon: Film },
];

/* ─── Templates Data ─────────────────────────────────── */

const TEMPLATES = [
  {
    id: "general",
    label: "PRODUCTION TYPE",
    title: "General",
    asset: musicPolishAssets.talent.voiceBooth,
  },
  {
    id: "selfie",
    label: "CAMERA STYLE",
    title: "Selfie",
    asset: musicPolishAssets.talent.leadVocalist,
  },
  {
    id: "selling",
    label: "CONTENT TYPE",
    title: "Selling",
    asset: musicPolishAssets.toolSurfaces.lipsyncProductRead,
  },
] satisfies Array<{ id: string; label: string; title: string; asset: MusicPolishAsset }>;

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

/* ─── Workflow Stepper ───────────────────────────────── */

function normalizeWizardStep(value: unknown): WizardStep | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/\s+/g, "-");
  const aliases: Record<string, WizardStep> = {
    script: "script",
    copy: "script",
    voice: "voice",
    audio: "voice",
    avatar: "avatar",
    character: "avatar",
    talent: "avatar",
    environment: "environment",
    render: "render",
    review: "render",
  };
  return aliases[normalized] ?? null;
}

function normalizeLipsyncMode(value: unknown): "talking-head" | "lip-sync" | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (["talking-head", "talkinghead", "avatar", "portrait"].includes(normalized)) return "talking-head";
  if (["lip-sync", "lipsync", "video-sync", "video"].includes(normalized)) return "lip-sync";
  return null;
}

function LipsyncWorkflowStepper({
  activeStep,
  onStepChange,
}: {
  activeStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
}) {
  return (
    <div
      data-testid="lipsync-workflow-stepper"
      className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0b0b0c]/80 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      style={{ scrollbarWidth: "none" }}
    >
      <nav className="flex min-w-max items-center gap-1" aria-label="Lip Sync workflow">
        {WIZARD_STEPS.map((step, index) => {
          const active = activeStep === step.key;
          const StepIcon = step.icon;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange(step.key)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "group flex min-w-[150px] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/70",
                active
                  ? "bg-[#f97316] text-black shadow-[0_0_28px_rgba(249,115,22,0.18)]"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black",
                active ? "bg-black/15 text-black" : "bg-white/5 text-zinc-500 group-hover:text-white"
              )}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <StepIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] font-['Space_Grotesk']">
                  {step.label}
                </span>
                <span className={cn("mt-0.5 block text-[10px]", active ? "text-black/60" : "text-zinc-600")}>
                  {step.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
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
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  tier: "free" | "pro" | "enterprise";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [audioMode, setAudioMode] = useState<"text" | "generate">("text");
  const latestCompleted = jobs.find((j) => j.status === "completed");
  const latestMedia = latestCompleted ? normalizeKanvasJobMedia(latestCompleted) : null;

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
        <h1 className="text-6xl md:text-8xl font-black font-['Space_Grotesk'] tracking-tighter leading-[0.9]">
          <span className="text-white">LIPSYNC MODELS,</span>
          <br />
          <span className="text-[#f97316]">ONE CLICK AWAY</span>
        </h1>
        <p className="mt-6 max-w-lg text-sm text-zinc-500 leading-relaxed">
          Upload a portrait, paste your script, and let AI bring it to life with natural lip movements and expressions.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column — Input */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/5 bg-[#131313] p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onLipsyncModeChange("talking-head")}
                className={cn(
                  "rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all font-['Space_Grotesk']",
                  lipsyncMode === "talking-head" ? "bg-[#f97316] text-black" : "bg-white/[0.03] text-zinc-500 hover:text-white"
                )}
              >
                Talking Head
              </button>
              <button
                type="button"
                onClick={() => onLipsyncModeChange("lip-sync")}
                className={cn(
                  "rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all font-['Space_Grotesk']",
                  lipsyncMode === "lip-sync" ? "bg-[#f97316] text-black" : "bg-white/[0.03] text-zinc-500 hover:text-white"
                )}
              >
                Lip Sync
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Model</p>
                <p className="text-[10px] text-zinc-600">
                  {`${currentModel?.credits ?? 0} credits`}
                </p>
              </div>
              <select
                value={currentModel?.id ?? ""}
                onChange={(event) => onModelChange(event.target.value)}
                className="w-full appearance-none rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-white focus:border-[#f97316]/30 focus:outline-none"
              >
                {sortedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}{model.id.startsWith("gmi/") ? " (GMI)" : ""} — {model.credits}cr
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.15em]">
              <div className="rounded-xl bg-black/20 px-3 py-2 text-zinc-500">
                Portrait
                <div className="mt-2 text-white">{imageId ? "Ready" : "Missing"}</div>
              </div>
              <div className="rounded-xl bg-black/20 px-3 py-2 text-zinc-500">
                Video
                <div className="mt-2 text-white">{videoId ? "Ready" : "Missing"}</div>
              </div>
              <div className="rounded-xl bg-black/20 px-3 py-2 text-zinc-500">
                Audio
                <div className="mt-2 text-white">{audioId ? "Ready" : "Missing"}</div>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-white/5 bg-[#131313] flex flex-col items-center justify-center gap-3 hover:border-[#f97316]/20 transition-all group cursor-pointer"
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
              <Loader2 className="relative h-8 w-8 animate-spin text-[#f97316]" />
            ) : (
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f97316]/10 group-hover:bg-[#f97316]/20 transition-colors">
                <Upload className="h-6 w-6 text-[#f97316]" />
              </div>
            )}
            <p className="relative text-xs uppercase tracking-[0.2em] text-zinc-300 font-bold">
              Upload Asset
            </p>
            <p className="relative text-[10px] text-zinc-500">PNG, JPG, MP4 — Max 50MB</p>
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
          <div className="flex items-center gap-1 rounded-full bg-[#131313] p-1 w-fit">
            <button
              type="button"
              onClick={() => setAudioMode("text")}
              className={cn(
                "px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-['Space_Grotesk']",
                audioMode === "text"
                  ? "bg-[#f97316] text-black"
                  : "text-zinc-500 hover:text-white"
              )}
            >
              Audio Text
            </button>
            <button
              type="button"
              onClick={() => setAudioMode("generate")}
              className={cn(
                "px-5 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-['Space_Grotesk']",
                audioMode === "generate"
                  ? "bg-[#f97316] text-black"
                  : "text-zinc-500 hover:text-white"
              )}
            >
              Generate Audio
            </button>
          </div>

          {/* Script Input */}
          <div className="relative rounded-2xl bg-[#131313] p-6">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Write your script here... The AI will generate lip-synced video from this text."
              className="w-full min-h-[150px] bg-transparent text-white text-sm placeholder:text-zinc-600 resize-none focus:outline-none font-['Space_Grotesk']"
              maxLength={2000}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-3">
              <span className="text-[10px] text-zinc-600 font-mono">
                {prompt.length} / 2000
              </span>
              <Wand2 className="h-4 w-4 text-zinc-600 hover:text-[#f97316] cursor-pointer transition-colors" />
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-[#f97316] text-black font-bold uppercase tracking-[0.15em] py-4 rounded-full hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all font-['Space_Grotesk'] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
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
                "rounded-2xl bg-[#1a1919]/60 p-6 flex items-center gap-6 transition-all",
                i === activeWorkflowStep && "border-l-4 border-[#f97316]"
              )}
            >
              <span className={cn(
                "text-4xl font-black font-['Space_Grotesk'] tracking-tighter",
                i === activeWorkflowStep ? "text-[#f97316]" : "text-zinc-700"
              )}>
                {step.num}
              </span>
              <div>
                <p className={cn(
                  "text-sm font-bold uppercase tracking-[0.15em] font-['Space_Grotesk']",
                  i === activeWorkflowStep ? "text-white" : "text-zinc-500"
                )}>
                  {step.title}
                </p>
                <p className="text-xs text-zinc-600 mt-1">{step.desc}</p>
              </div>
              {i < activeWorkflowStep && (
                <Check className="ml-auto h-5 w-5 text-[#f97316]" />
              )}
            </div>
          ))}

          {/* Latest Render */}
          {latestCompleted && (
            <div className="rounded-2xl bg-[#131313] p-6 flex gap-6">
              <div className="h-24 w-24 rounded-xl overflow-hidden bg-white/5 shrink-0">
                {latestMedia ? (
                  <KanvasMediaPreview
                    media={{ ...latestMedia, alt: "Latest lipsync render" }}
                    aspectClassName="aspect-square"
                    className="h-full w-full"
                    showErrorLabel={false}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Film className="h-6 w-6 text-zinc-600" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Latest Render</p>
                <p className="text-sm font-semibold text-white mt-1 truncate">
                  {latestCompleted.modelId ?? "Lipsync Output"}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button className="px-4 py-1.5 rounded-full bg-white/10 text-white text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-white/15 transition-colors flex items-center gap-1.5">
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                  <button className="px-4 py-1.5 rounded-full bg-[#ff3399]/10 text-[#ff3399] text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-[#ff3399]/20 transition-colors">
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
        <h1 className="text-6xl md:text-8xl font-black font-['Space_Grotesk'] tracking-tighter leading-[0.9]">
          <span className="text-white">Choose your </span>
          <span className="text-[#f97316]">Template</span>
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
                  ? "border-2 border-[#f97316] shadow-[0_0_30px_rgba(249,115,22,0.15)]"
                  : "border border-white/5 hover:border-white/10"
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
                <div className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-[#f97316] flex items-center justify-center">
                  <Check className="h-4 w-4 text-black" />
                </div>
              )}

              {/* Text */}
              <div className="absolute bottom-6 left-6 z-10">
                <p className={cn(
                  "text-[10px] uppercase tracking-[0.3em] font-bold mb-2",
                  selected ? "text-[#f97316]" : "text-zinc-500"
                )}>
                  {tpl.label}
                </p>
                <p className="text-3xl font-black text-white font-['Space_Grotesk'] tracking-tight">
                  {tpl.title}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f97316] text-black shadow-[0_0_40px_rgba(249,115,22,0.25)] transition-all hover:shadow-[0_0_56px_rgba(249,115,22,0.42)]"
          aria-label="Continue to audio settings"
        >
          <ArrowRight className="h-7 w-7" />
        </button>
      </div>
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
        <h1 className="text-6xl md:text-8xl font-black font-['Space_Grotesk'] tracking-tighter leading-[0.9]">
          <span className="text-white">AUDIO </span>
          <span className="text-[#f97316]">SETTINGS</span>
        </h1>
      </div>

      {/* Dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-3">Select Language</p>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full appearance-none bg-[#131313] border border-white/5 rounded-2xl px-5 py-4 text-white text-sm font-['Space_Grotesk'] focus:outline-none focus:border-[#f97316]/30 transition-colors"
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
              <option value="german">German</option>
              <option value="japanese">Japanese</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>
        </div>
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-3">Select Accent</p>
          <div className="relative">
            <select
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-full appearance-none bg-[#131313] border border-white/5 rounded-2xl px-5 py-4 text-white text-sm font-['Space_Grotesk'] focus:outline-none focus:border-[#f97316]/30 transition-colors"
            >
              <option value="neutral">Neutral</option>
              <option value="british">British</option>
              <option value="australian">Australian</option>
              <option value="southern">Southern</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Voice Type Row */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4">Voice Type</p>
        <div className="flex flex-wrap gap-3">
          {VOICE_TYPES.map((vt) => (
            <button
              key={vt}
              type="button"
              onClick={() => setVoiceType(vt)}
              className={cn(
                "px-6 py-3 rounded-full text-xs uppercase tracking-[0.15em] font-bold transition-all font-['Space_Grotesk']",
                voiceType === vt
                  ? "bg-[#f97316] text-black"
                  : "bg-[#131313] text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              {vt}
            </button>
          ))}
        </div>
      </div>

      {/* Emotional Delivery Grid */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4">Emotional Delivery</p>
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
                  "flex flex-col items-center justify-center gap-3 rounded-2xl p-6 transition-all aspect-square",
                  active
                    ? "border-2 border-[#f97316] bg-[#f97316]/5"
                    : "border border-white/5 bg-[#131313] hover:border-white/10"
                )}
              >
                <EmIcon className={cn(
                  "h-6 w-6",
                  active ? "text-[#f97316]" : "text-zinc-600"
                )} />
                <span className={cn(
                  "text-[10px] uppercase tracking-[0.2em] font-bold",
                  active ? "text-[#f97316]" : "text-zinc-500"
                )}>
                  {em.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Preview Player */}
      <div className="rounded-[2rem] bg-[#131313] p-6 flex items-center gap-6">
        <button
          type="button"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-black hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all"
        >
          <Play className="h-6 w-6 ml-1" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white font-['Space_Grotesk']">
            Voice Preview: Neutral {voiceType}
          </p>
          <p className="text-xs text-zinc-500 italic mt-1 truncate">
            "Hello, this is a sample of the selected voice..."
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-[#f97316]" />
            </div>
            <span className="text-[10px] text-zinc-600 font-mono whitespace-nowrap">0:04 / 0:12</span>
          </div>
        </div>
      </div>

      {/* Next Step */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-[#f97316] text-black font-bold uppercase tracking-[0.15em] px-8 py-3 rounded-full hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all text-xs font-['Space_Grotesk']"
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
        <h2 className="text-4xl font-black font-['Space_Grotesk'] text-white tracking-tight">Dial In The Render Space</h2>
        <p className="mt-3 max-w-2xl text-sm text-zinc-500">
          These values are persisted into the lip-sync request payload so the render step uses the exact same framing and output settings.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <label className="rounded-3xl border border-white/10 bg-[#121212] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Aspect Ratio</p>
          <select
            value={String(settings.aspect_ratio ?? "16:9")}
            onChange={(event) => onSettingsChange("aspect_ratio", event.target.value)}
            className="mt-4 w-full bg-transparent text-white outline-none"
          >
            {["16:9", "9:16", "1:1"].map((value) => (
              <option key={value} value={value} className="bg-black">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-3xl border border-white/10 bg-[#121212] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Resolution</p>
          <select
            value={String(settings.resolution ?? "1080p")}
            onChange={(event) => onSettingsChange("resolution", event.target.value)}
            className="mt-4 w-full bg-transparent text-white outline-none"
          >
            {["720p", "1080p", "1440p"].map((value) => (
              <option key={value} value={value} className="bg-black">
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-3xl border border-white/10 bg-[#121212] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Generate Audio</p>
          <button
            type="button"
            onClick={() => onSettingsChange("generate_audio", !(settings.generate_audio ?? true))}
            className={cn(
              "mt-4 inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.15em]",
              settings.generate_audio ?? true ? "bg-[#f97316] text-black" : "bg-white/5 text-zinc-400"
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
          className="flex items-center gap-2 bg-[#f97316] text-black font-bold uppercase tracking-[0.15em] px-8 py-3 rounded-full hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all text-xs font-['Space_Grotesk']"
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
        <h2 className="text-4xl font-black font-['Space_Grotesk'] text-white tracking-tight">Render Review</h2>
        <p className="mt-3 max-w-2xl text-sm text-zinc-500">
          Review the exact request payload inputs before dispatching the render. The generate button here uses the current model, selected assets, prompt, and environment settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {summary.map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/10 bg-[#121212] p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{item.label}</p>
            <p className="mt-3 text-sm text-white break-all">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#121212] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Latest Status</p>
            <p className="mt-2 text-sm text-white">{selectedJob ? selectedJob.status : "Ready to render"}</p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={submitting || !audioId}
            className="inline-flex items-center gap-2 rounded-full bg-[#f97316] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-black disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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
  const { onLipsyncModeChange, onPromptChange } = props;
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

  const voiceActions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: "kanvas_lipsync_set_step",
        scope: "kanvas:lipsync",
        description: "Move the Lip Sync workflow to Script, Voice, Avatar, Environment, or Render.",
        schema: {
          type: "object",
          properties: { step: { type: "string" } },
          required: ["step"],
          additionalProperties: false,
        },
        handler: (input) => {
          const step = normalizeWizardStep((input as { step?: unknown }).step);
          if (!step) {
            return {
              ok: false,
              status: "invalid_input",
              message: "Choose Script, Voice, Avatar, Environment, or Render.",
              errorCode: "invalid_lipsync_step",
            };
          }
          setActiveStep(step);
          return {
            ok: true,
            status: "completed",
            message: `Lip Sync ${WIZARD_STEPS.find((item) => item.key === step)?.label ?? step} step is open.`,
            data: { step },
            uiFocus: "lipsync-workflow-stepper",
          };
        },
      },
      {
        name: "kanvas_lipsync_set_mode",
        scope: "kanvas:lipsync",
        description: "Switch Lip Sync between talking-head portrait generation and video lip-sync.",
        schema: {
          type: "object",
          properties: { mode: { type: "string" } },
          required: ["mode"],
          additionalProperties: false,
        },
        handler: (input) => {
          const mode = normalizeLipsyncMode((input as { mode?: unknown }).mode);
          if (!mode) {
            return {
              ok: false,
              status: "invalid_input",
              message: "Choose talking-head or lip-sync mode.",
              errorCode: "invalid_lipsync_mode",
            };
          }
          onLipsyncModeChange(mode);
          setActiveStep(mode === "talking-head" ? "avatar" : "script");
          return {
            ok: true,
            status: "completed",
            message: `Lip Sync mode set to ${mode === "talking-head" ? "Talking Head" : "Lip Sync"}.`,
            data: { mode },
          };
        },
      },
      {
        name: "kanvas_set_prompt",
        scope: "kanvas:lipsync",
        description: "Set the Lip Sync script or creative direction.",
        schema: {
          type: "object",
          properties: { prompt: { type: "string" } },
          required: ["prompt"],
          additionalProperties: false,
        },
        handler: (input) => {
          const prompt = typeof (input as { prompt?: unknown }).prompt === "string"
            ? (input as { prompt: string }).prompt.trim()
            : "";
          if (!prompt) {
            return {
              ok: false,
              status: "invalid_input",
              message: "Tell me the script or direction to place in Lip Sync.",
              errorCode: "missing_lipsync_prompt",
            };
          }
          onPromptChange(prompt);
          setActiveStep("script");
          return {
            ok: true,
            status: "completed",
            message: "Lip Sync script updated.",
            data: { prompt },
            uiFocus: "lipsync-script",
          };
        },
      },
    ],
    [onLipsyncModeChange, onPromptChange],
  );

  useRegisterVoiceActions(voiceActions);

  function handleNextStep() {
    const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === activeStep);
    if (currentIdx < WIZARD_STEPS.length - 1) {
      setActiveStep(WIZARD_STEPS[currentIdx + 1].key);
    }
  }

  return (
    <section className="relative min-h-[calc(100vh-7rem)] overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#030304] shadow-[0_24px_120px_rgba(0,0,0,0.45)]">
      <img
        src={musicPolishAssets.cinema.soundstage.src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-20"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(103,232,249,0.16),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.66),rgba(0,0,0,0.96))]" />
      <div
        className="pointer-events-none absolute inset-0 z-[1] mix-blend-overlay opacity-[0.13]"
        style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat", backgroundSize: "128px 128px" }}
      />

      <div className="relative z-[2] px-4 py-4 md:px-8 md:py-7 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-200/80">
                Premium Performance Capture
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white font-['Space_Grotesk'] md:text-5xl">
                Lip Sync Studio
              </h1>
            </div>
            <LipsyncWorkflowStepper activeStep={activeStep} onStepChange={setActiveStep} />
          </div>

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
    </section>
  );
}
