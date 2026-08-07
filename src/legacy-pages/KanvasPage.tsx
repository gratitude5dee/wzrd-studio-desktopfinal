import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";

function safeTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unknown';
  return formatDistanceToNow(d, { addSuffix: true });
}
import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  Clapperboard,
  Film,
  Globe2,
  Home,
  Image as ImageIcon,
  Info,
  Keyboard,
  Loader2,
  LogOut,
  Mic2,
  Pencil,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CreditsDisplay from "@/components/CreditsDisplay";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCinemaRequest,
  buildImageRequest,
  buildLipSyncRequest,
  buildVideoRequest,
  createDefaultCinemaSettings,
  getJobPrimaryUrl,
  isJobActive,
  KANVAS_APERTURES,
  KANVAS_CAMERAS,
  KANVAS_FOCAL_LENGTHS,
  KANVAS_LENSES,
  KANVAS_STUDIO_META,
  KANVAS_STUDIO_ORDER,
  normalizeStudioParam,
  pickLatestStudioJob,
} from "@/features/kanvas/helpers";
import {
  KANVAS_NAV_ITEMS,
  kanvasStudioFromNavItem,
} from "@/components/home/navigation";
import {
  fetchKanvasModels,
  InsufficientCreditsError,
  listKanvasAssets,
  listKanvasJobs,
  refreshKanvasJobStatus,
  submitKanvasJob,
  uploadKanvasAsset,
} from "@/features/kanvas/service";
import type {
  KanvasAsset,
  KanvasAssetType,
  KanvasControlDefinition,
  KanvasGenerationRequest,
  KanvasJob,
  KanvasModel,
  KanvasMode,
  KanvasStudio,
} from "@/features/kanvas/types";
import { KanvasSidebar } from "@/components/kanvas/KanvasSidebar";
import {
  isFalKanvasModel,
  isGmiKanvasModel,
  sortKanvasModelsFalFirst,
} from "@/features/kanvas/modelProvider";
import { useCharacterMention } from "@/hooks/useCharacterMention";
import { useUserTier, type UserTier } from "@/hooks/useUserTier";
import { useCharacterCreationStore } from "@/lib/stores/character-creation-store";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useRegisterVoiceActions } from "@/voice/VoiceAgentProvider";
import type { VoiceActionRegistration } from "@/voice/actions/registry";

const ACCEPTED_TYPES: Record<KanvasAssetType, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
};

const ImageStudioSection = lazy(() => import("@/components/kanvas/ImageStudioSection"));
const EditStudioSection = lazy(() => import("@/components/kanvas/EditStudioSection"));
const LipsyncStudioSection = lazy(() => import("@/components/kanvas/LipsyncStudioSection"));
const CinemaStudioSection = lazy(() => import("@/components/kanvas/CinemaStudioSection"));
const VideoStudioSection = lazy(() =>
  import("@/components/kanvas/VideoStudioSection").then((module) => ({
    default: module.VideoStudioSection,
  }))
);
const WorldviewSection = lazy(() =>
  import("@/components/worldview").then((module) => ({ default: module.WorldviewSection }))
);
const CharacterCreationSection = lazy(() =>
  import("@/components/character-creation").then((module) => ({
    default: module.CharacterCreationSection,
  }))
);

const STUDIO_ICONS: Record<KanvasStudio, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  edit: Pencil,
  cinema: Clapperboard,
  lipsync: Mic2,
  worldview: Globe2,
  "character-creation": Sparkles,
};

function mergeAssets(current: KanvasAsset[], incoming: KanvasAsset[]): KanvasAsset[] {
  const map = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of incoming) {
    map.set(asset.id, asset);
  }
  return Array.from(map.values()).sort((left, right) =>
    (right.created_at ?? '').localeCompare(left.created_at ?? '')
  );
}

function mergeJobs(current: KanvasJob[], incoming: KanvasJob[]): KanvasJob[] {
  const map = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) {
    map.set(job.id, job);
  }
  return Array.from(map.values()).sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
  );
}

function resolveAssetPreview(asset: KanvasAsset): string | null {
  return asset.thumbnail_url ?? asset.preview_url ?? asset.cdn_url;
}

function getAssetTitle(asset: KanvasAsset): string {
  return asset.original_file_name || asset.file_name;
}

function getPromptPlaceholder(studio: KanvasStudio, usesReferenceAsset: boolean): string {
  if (studio === "image") {
    return usesReferenceAsset
      ? "Describe the transformation you want to apply"
      : "Describe the image you want to create";
  }
  if (studio === "video") {
    return usesReferenceAsset
      ? "Describe the motion or camera move"
      : "Describe the video you want to create";
  }
  if (studio === "cinema") {
    return "Describe your scene with a director’s eye";
  }
  return "Optional: describe tone, performance, or motion";
}

function getAssetRequirementLabel(
  studio: KanvasStudio,
  assetType: KanvasAssetType,
  modeLabel: string
): string {
  if (studio === "lipsync" && assetType === "image" && modeLabel === "talking-head") {
    return "Portrait";
  }
  if (studio === "lipsync" && assetType === "video") {
    return "Source Video";
  }
  if (assetType === "audio") {
    return "Audio";
  }
  if (assetType === "image") {
    return studio === "video" ? "Reference Frame" : "Reference Images";
  }
  return "Video";
}

function coerceControlValue(
  definition: KanvasControlDefinition,
  rawValue: string
): string | number | boolean {
  if (definition.type === "boolean") {
    return rawValue === "true";
  }
  if (definition.type === "number") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : definition.defaultValue ?? 0;
  }
  return rawValue;
}

function hasSettings(values: Record<string, unknown>): boolean {
  return Object.keys(values).length > 0;
}

function pickPreferredKanvasModel(
  models: KanvasModel[],
  selectedModelId: string,
  _preferredProvider: "gmi-cloud" | "fal-ai",
): KanvasModel | null {
  const sortedModels = sortKanvasModelsFalFirst(models);
  if (selectedModelId) {
    const explicit = sortedModels.find((model) => model.id === selectedModelId);
    if (explicit) {
      return explicit;
    }
  }

  const falDefault = sortedModels.find(isFalKanvasModel);
  const catalogDefault = sortedModels.find((model) => model.isDefault);
  const gmiDefault = sortedModels.find(isGmiKanvasModel);

  return falDefault ?? catalogDefault ?? gmiDefault ?? sortedModels[0] ?? null;
}

function StudioNavButton({
  studio,
  active,
  onClick,
  compact = false,
}: {
  studio: KanvasStudio;
  active: boolean;
  onClick: (studio: KanvasStudio) => void;
  compact?: boolean;
}) {
  const Icon = STUDIO_ICONS[studio];
  const label = KANVAS_STUDIO_META[studio].label;

  return (
    <button
      type="button"
      onClick={() => onClick(studio)}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all",
        active
          ? "border-kanvas-accent-edge bg-kanvas-accent-soft text-white shadow-[0_0_40px_hsl(var(--kanvas-accent)/0.08)]"
          : "border-white/10 bg-white/[0.03] text-kanvas-text-secondary hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
        compact && "justify-center px-0"
      )}
      aria-pressed={active}
    >
      <Icon className={cn("h-4 w-4", active ? "text-kanvas-accent" : "text-kanvas-text-muted")} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

function ModelControls({
  model,
  settings,
  onChange,
}: {
  model: KanvasModel | null;
  settings: Record<string, unknown>;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  if (!model || model.controls.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {model.controls.map((control) => {
        const currentValue = settings[control.key] ?? control.defaultValue;
        if (control.type === "boolean") {
          const enabled = currentValue === true;
          return (
            <div
              key={control.key}
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{control.label}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/10 bg-white/[0.03] text-xs",
                    enabled ? "text-kanvas-accent" : "text-kanvas-text-secondary"
                  )}
                >
                  {enabled ? "On" : "Off"}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "w-full justify-between border-white/10 bg-white/[0.03]",
                  enabled && "border-kanvas-accent-edge bg-kanvas-accent-soft text-white"
                )}
                onClick={() => onChange(control.key, !enabled)}
              >
                Toggle
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          );
        }

        if (control.type === "select" && control.options?.length) {
          return (
            <div
              key={control.key}
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
            >
              <p className="mb-3 text-sm font-semibold text-white">{control.label}</p>
              <Select
                value={String(currentValue ?? control.options[0].value)}
                onValueChange={(value) => onChange(control.key, coerceControlValue(control, value))}
              >
                <SelectTrigger className="border-white/10 bg-black/50 text-white">
                  <SelectValue placeholder={control.label} />
                </SelectTrigger>
                <SelectContent>
                  {control.options.map((option) => (
                    <SelectItem key={`${control.key}-${option.value}`} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return (
          <div
            key={control.key}
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <p className="mb-3 text-sm font-semibold text-white">{control.label}</p>
            <Input
              type="number"
              min={control.min}
              max={control.max}
              step={control.step}
              value={typeof currentValue === "number" ? currentValue : Number(control.defaultValue ?? 0)}
              onChange={(event) =>
                onChange(control.key, Number(event.currentTarget.value || control.defaultValue || 0))
              }
              className="border-white/10 bg-black/50 text-white"
            />
          </div>
        );
      })}
    </div>
  );
}

function AssetSelector({
  title,
  assetType,
  assets,
  selectedIds,
  multi = false,
  uploading,
  optional = false,
  onToggle,
  onUpload,
}: {
  title: string;
  assetType: KanvasAssetType;
  assets: KanvasAsset[];
  selectedIds: string[];
  multi?: boolean;
  uploading: boolean;
  optional?: boolean;
  onToggle: (assetId: string) => void;
  onUpload: (file: File, assetType: KanvasAssetType) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recentAssets = assets.filter((asset) => asset.asset_type === assetType).slice(0, 6);

  return (
    <Card className="rounded-kanvas-xl border-white/10 bg-kanvas-surface-1/80 p-4 text-white shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-kanvas-text-muted">
            {optional ? "Optional for some models" : multi ? "Choose one or more references" : "Choose one asset"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Badge variant="outline" className="border-kanvas-accent-edge bg-kanvas-accent-soft text-kanvas-accent">
              {selectedIds.length} selected
            </Badge>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES[assetType]}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                void onUpload(file, assetType);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/10 bg-black/40 text-white"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload
          </Button>
        </div>
      </div>

      {recentAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-5 text-sm text-kanvas-text-muted">
          No {assetType} assets yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {recentAssets.map((asset) => {
            const selected = selectedIds.includes(asset.id);
            const previewUrl = resolveAssetPreview(asset);
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onToggle(asset.id)}
                className={cn(
                  "overflow-hidden rounded-2xl border text-left transition-all",
                  selected
                    ? "border-kanvas-accent-edge bg-kanvas-accent-soft shadow-[0_0_30px_hsl(var(--kanvas-accent)/0.08)]"
                    : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex gap-3 p-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.04]">
                    {asset.asset_type === "image" && previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={getAssetTitle(asset)}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : asset.asset_type === "video" && previewUrl ? (
                      <video
                        src={previewUrl}
                        muted
                        className="h-full w-full object-cover"
                      />
                    ) : asset.asset_type === "audio" ? (
                      <AudioLines className="h-6 w-6 text-kanvas-accent" />
                    ) : (
                      <Film className="h-6 w-6 text-kanvas-text-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {getAssetTitle(asset)}
                      </p>
                      {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-kanvas-accent" />}
                    </div>
                    <p className="truncate text-xs text-kanvas-text-muted">{asset.asset_type.toUpperCase()}</p>
                    <p className="mt-2 truncate text-xs text-kanvas-text-faint">
                      {safeTimeAgo(asset.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function HistoryRail({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: KanvasJob[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}) {
  return (
    <Card className="rounded-kanvas-xl border-white/10 bg-kanvas-bg/90 p-0 text-white shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Recent Jobs</p>
          <p className="text-xs text-kanvas-text-muted">Server-backed generation history</p>
        </div>
        <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-kanvas-text-secondary">
          {jobs.length}
        </Badge>
      </div>
      <Separator className="bg-white/10" />
      <ScrollArea className="h-[420px]">
        <div className="space-y-3 p-4">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-5 text-sm text-kanvas-text-muted">
              No generations yet.
            </div>
          ) : (
            jobs.map((job) => {
              const previewUrl = getJobPrimaryUrl(job);
              const selected = selectedJobId === job.id;
              const Icon = STUDIO_ICONS[job.studio];
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onSelect(job.id)}
                  className={cn(
                    "w-full overflow-hidden rounded-2xl border text-left transition-all",
                    selected
                      ? "border-kanvas-accent-edge bg-kanvas-accent-soft"
                      : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex gap-3 p-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.04]">
                      {job.resultPayload?.mediaType === "image" && previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={`${job.studio} result`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : job.resultPayload?.mediaType === "video" && previewUrl ? (
                        <video src={previewUrl} muted className="h-full w-full object-cover" />
                      ) : isJobActive(job) ? (
                        <Loader2 className="h-5 w-5 animate-spin text-kanvas-accent" />
                      ) : (
                        <Icon className="h-5 w-5 text-kanvas-text-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {KANVAS_STUDIO_META[job.studio].label}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-white/10 text-[10px] uppercase tracking-[0.18em]",
                            job.status === "completed" && "text-kanvas-accent",
                            job.status === "failed" && "text-rose-300",
                            isJobActive(job) && "text-amber-200"
                          )}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-kanvas-text-muted">{job.modelId ?? "Unknown model"}</p>
                      <p className="mt-2 text-xs text-kanvas-text-faint">
                        {safeTimeAgo(job.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

function getJobProgressLabel(job: KanvasJob): string {
  if (job.status === 'queued') return 'Queued — waiting for a slot…';
  if (job.status === 'processing') {
    const pct = job.progress ?? 0;
    if (pct < 30) return 'Processing — warming up model…';
    if (pct < 70) return 'Processing — generating output…';
    return 'Processing — finalizing…';
  }
  return job.status;
}

function PreviewStage({
  studio,
  selectedJob,
  currentModel,
  onRetry,
}: {
  studio: KanvasStudio;
  selectedJob: KanvasJob | null;
  currentModel: KanvasModel | null;
  onRetry?: () => void;
}) {
  const previewUrl = getJobPrimaryUrl(selectedJob);
  const meta = KANVAS_STUDIO_META[studio];
  const Icon = STUDIO_ICONS[studio];

  return (
    <Card className="relative overflow-hidden rounded-kanvas-xl border-kanvas-border-default bg-[radial-gradient(circle_at_top,hsl(var(--kanvas-surface-2)),transparent_35%),linear-gradient(180deg,hsl(var(--kanvas-surface-1)),hsl(var(--kanvas-bg)))] p-6 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--kanvas-accent)/0.15),transparent_35%)]" />
      <div className="relative space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-kanvas-text-muted">
              {meta.label}
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              {meta.headline}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-kanvas-text-secondary">{meta.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {currentModel && (
              <Badge className="bg-kanvas-accent text-kanvas-accent-contrast hover:bg-kanvas-accent-hover">
                {currentModel.credits} credits
              </Badge>
            )}
            {selectedJob && (
              <Badge
                variant="outline"
                className={cn(
                  "border-white/10 bg-white/[0.03]",
                  selectedJob.status === "completed" && "text-kanvas-accent",
                  selectedJob.status === "failed" && "text-rose-300",
                  isJobActive(selectedJob) && "text-amber-200"
                )}
              >
                {selectedJob.status}
              </Badge>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-kanvas-lg border border-white/10 bg-black/40">
          {previewUrl && selectedJob?.resultPayload?.mediaType === "image" ? (
            <img
              src={previewUrl}
              alt={`${studio} output`}
              className="aspect-[16/9] w-full object-cover"
              decoding="async"
            />
          ) : previewUrl && selectedJob?.resultPayload?.mediaType === "video" ? (
            <video
              src={previewUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="aspect-[16/9] w-full bg-black object-cover"
            />
          ) : selectedJob?.status === "failed" ? (
            <div className="flex aspect-[16/9] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-kanvas-xl border border-rose-500/30 bg-rose-500/10">
                <Icon className="h-10 w-10 text-rose-400" />
              </div>
              <div>
                <p className="text-xl font-semibold text-rose-300">Generation Failed</p>
                <p className="mt-2 max-w-md text-sm text-kanvas-text-muted">
                  {selectedJob.errorMessage ?? 'An unexpected error occurred.'}
                </p>
              </div>
              {onRetry && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                  onClick={onRetry}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Retry Generation
                </Button>
              )}
            </div>
          ) : (
            <div className="flex aspect-[16/9] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-kanvas-xl border border-kanvas-accent-edge bg-kanvas-accent-soft">
                {selectedJob && isJobActive(selectedJob) ? (
                  <Loader2 className="h-10 w-10 animate-spin text-kanvas-accent" />
                ) : (
                  <Icon className="h-10 w-10 text-kanvas-accent" />
                )}
              </div>
              <div>
                <p className="text-xl font-semibold text-white">
                  {selectedJob && isJobActive(selectedJob)
                    ? "Generation in progress"
                    : "Ready to generate"}
                </p>
                <p className="mt-2 text-sm text-kanvas-text-muted">
                  {selectedJob && isJobActive(selectedJob)
                    ? getJobProgressLabel(selectedJob)
                    : currentModel
                      ? `${currentModel.name} is selected for this studio.`
                      : "Load a model and start generating."}
                </p>
              </div>
              {selectedJob && isJobActive(selectedJob) && (
                <div className="w-full max-w-md space-y-2">
                  <Progress value={selectedJob.progress ?? 12} className="bg-white/10" />
                  <p className="text-xs uppercase tracking-[0.2em] text-kanvas-text-muted">
                    {selectedJob.progress ?? 12}% complete
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedJob && (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-kanvas-text-muted">Model</p>
              <p className="mt-2 truncate text-sm font-semibold text-white">
                {selectedJob.modelId ?? "Unknown model"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-kanvas-text-muted">Queued</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {safeTimeAgo(selectedJob.createdAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-kanvas-text-muted">Output</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {selectedJob.resultPayload?.mediaType === "video" ? "Video" : "Image"}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function KanvasPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const studio = normalizeStudioParam(searchParams.get("studio"));

  const [modelsByStudio, setModelsByStudio] = useState<Partial<Record<KanvasStudio, KanvasModel[]>>>({});
  const [assets, setAssets] = useState<KanvasAsset[]>([]);
  const [jobs, setJobs] = useState<KanvasJob[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [creditsInfo, setCreditsInfo] = useState<{ required: number; available: number } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [kanvasSetupError, setKanvasSetupError] = useState<string | null>(null);
  const [uploadingByType, setUploadingByType] = useState<Record<KanvasAssetType, boolean>>({
    image: false,
    video: false,
    audio: false,
  });
  const { tier, defaultProvider } = useUserTier();

  // @mention character references
  const {
    suggestions: mentionSuggestions,
    showSuggestions: showMentionDropdown,
    onPromptChange: onMentionChange,
    onSelectSuggestion,
    resolvePrompt: resolveMentions,
    closeSuggestions: closeMentionDropdown,
    toggleMentionPinned,
  } = useCharacterMention();

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageReferenceIds, setImageReferenceIds] = useState<string[]>([]);
  const [imageModelId, setImageModelId] = useState("");
  const [imageSettings, setImageSettings] = useState<Record<string, unknown>>({});

  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoReferenceId, setVideoReferenceId] = useState<string | null>(null);
  const [videoModelId, setVideoModelId] = useState("");
  const [videoSettings, setVideoSettings] = useState<Record<string, unknown>>({});

  const [cinemaPrompt, setCinemaPrompt] = useState("");
  const [cinemaModelId, setCinemaModelId] = useState("");
  const [cinemaSettings, setCinemaSettings] = useState<Record<string, unknown>>({});
  const [cinemaCameraSettings, setCinemaCameraSettings] = useState(createDefaultCinemaSettings());

  const [lipsyncMode, setLipsyncMode] = useState<"talking-head" | "lip-sync">("talking-head");
  const [lipsyncPrompt, setLipsyncPrompt] = useState("");
  const [lipsyncImageId, setLipsyncImageId] = useState<string | null>(null);
  const [lipsyncVideoId, setLipsyncVideoId] = useState<string | null>(null);
  const [lipsyncAudioId, setLipsyncAudioId] = useState<string | null>(null);
  const [lipsyncModelId, setLipsyncModelId] = useState("");
  const [lipsyncSettings, setLipsyncSettings] = useState<Record<string, unknown>>({});
  const appliedPromptPrefillRef = useRef<string | null>(null);

  const imageMode = imageReferenceIds.length > 0 ? "image-to-image" : "text-to-image";
  const videoReferenceAsset = useMemo(
    () =>
      videoReferenceId
        ? assets.find(
            (asset) =>
              asset.id === videoReferenceId &&
              (asset.asset_type === "image" || asset.asset_type === "video")
          ) ?? null
        : null,
    [assets, videoReferenceId]
  );

  const currentImageModels = useMemo(
    () => (modelsByStudio.image ?? []).filter((model) => model.mode === imageMode),
    [imageMode, modelsByStudio.image]
  );
  const currentVideoModels = useMemo(
    () => {
      const models = modelsByStudio.video ?? [];
      if (!videoReferenceAsset) {
        return models.filter((model) => model.mode === "text-to-video");
      }

      if (videoReferenceAsset.asset_type === "video") {
        return models.filter((model) => model.mode === "reference-to-video");
      }

      return models.filter(
        (model) =>
          model.mode === "image-to-video" || model.mode === "reference-to-video"
      );
    },
    [modelsByStudio.video, videoReferenceAsset]
  );
  const currentCinemaModels = useMemo(
    () => (modelsByStudio.cinema ?? []).filter((model) => model.mode === "cinematic-image"),
    [modelsByStudio.cinema]
  );
  const currentEditModels = useMemo(
    () => sortKanvasModelsFalFirst((modelsByStudio.edit ?? []).filter(isFalKanvasModel)),
    [modelsByStudio.edit]
  );
  const currentLipsyncModels = useMemo(
    () => (modelsByStudio.lipsync ?? []).filter((model) => model.mode === lipsyncMode),
    [lipsyncMode, modelsByStudio.lipsync]
  );

  const currentImageModel = useMemo(
    () => pickPreferredKanvasModel(currentImageModels, imageModelId, defaultProvider),
    [currentImageModels, defaultProvider, imageModelId]
  );
  const currentVideoModel = useMemo(
    () => pickPreferredKanvasModel(currentVideoModels, videoModelId, defaultProvider),
    [currentVideoModels, defaultProvider, videoModelId]
  );
  const currentCinemaModel = useMemo(
    () => pickPreferredKanvasModel(currentCinemaModels, cinemaModelId, defaultProvider),
    [currentCinemaModels, cinemaModelId, defaultProvider]
  );
  const currentLipsyncModel = useMemo(
    () => pickPreferredKanvasModel(currentLipsyncModels, lipsyncModelId, defaultProvider),
    [currentLipsyncModels, defaultProvider, lipsyncModelId]
  );
  const currentEditModel = useMemo(
    () => pickPreferredKanvasModel(currentEditModels, "", "fal-ai"),
    [currentEditModels]
  );

  const currentModel =
    studio === "image"
      ? currentImageModel
      : studio === "video"
        ? currentVideoModel
        : studio === "cinema"
          ? currentCinemaModel
          : studio === "edit"
            ? currentEditModel
          : currentLipsyncModel;

  const currentStudioJobs = useMemo(
    () => jobs.filter((job) => job.studio === studio),
    [jobs, studio]
  );
  const selectedJob =
    currentStudioJobs.find((job) => job.id === selectedJobId) ??
    pickLatestStudioJob(currentStudioJobs, studio);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      setPageLoading(true);
      try {
        const studioKeys = KANVAS_STUDIO_ORDER.filter((s) => s !== "worldview" && s !== "character-creation");
        const [assetsResult, jobsResult, ...modelResults] = await Promise.allSettled([
          listKanvasAssets(),
          listKanvasJobs(),
          ...studioKeys.map((entry) => fetchKanvasModels(entry)),
        ]);

        if (cancelled) {
          return;
        }

        const loadedAssets = assetsResult.status === "fulfilled" ? assetsResult.value : [];
        const loadedJobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];

        if (assetsResult.status === "rejected") console.warn("Failed to load assets:", assetsResult.reason);
        if (jobsResult.status === "rejected") console.warn("Failed to load jobs:", jobsResult.reason);

        const nextModelsByStudio: Partial<Record<KanvasStudio, KanvasModel[]>> = {};
        modelResults.forEach((r, i) => {
          const studioKey = studioKeys[i];
          if (!studioKey) return;
          if (r.status === "fulfilled") {
            nextModelsByStudio[studioKey] = r.value;
          } else {
            console.warn(`Failed to load models for ${studioKey}:`, r.reason);
            nextModelsByStudio[studioKey] = [];
          }
        });

        setAssets(loadedAssets);
        setJobs(loadedJobs);
        setModelsByStudio(nextModelsByStudio);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load the Kanvas shell"
          );
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentImageModel) {
      return;
    }

    if (currentImageModel.id !== imageModelId) {
      setImageModelId(currentImageModel.id);
      setImageSettings({ ...currentImageModel.defaults });
      return;
    }

    if (!hasSettings(imageSettings) && hasSettings(currentImageModel.defaults)) {
      setImageSettings({ ...currentImageModel.defaults });
    }
  }, [currentImageModel, imageModelId, imageSettings]);

  useEffect(() => {
    if (!currentVideoModel) {
      return;
    }

    if (currentVideoModel.id !== videoModelId) {
      setVideoModelId(currentVideoModel.id);
      setVideoSettings({ ...currentVideoModel.defaults });
      return;
    }

    if (!hasSettings(videoSettings) && hasSettings(currentVideoModel.defaults)) {
      setVideoSettings({ ...currentVideoModel.defaults });
    }
  }, [currentVideoModel, videoModelId, videoSettings]);

  useEffect(() => {
    if (!currentCinemaModel) {
      return;
    }

    if (currentCinemaModel.id !== cinemaModelId) {
      setCinemaModelId(currentCinemaModel.id);
      setCinemaSettings({ ...currentCinemaModel.defaults });
      return;
    }

    if (!hasSettings(cinemaSettings) && hasSettings(currentCinemaModel.defaults)) {
      setCinemaSettings({ ...currentCinemaModel.defaults });
    }
  }, [cinemaModelId, cinemaSettings, currentCinemaModel]);

  useEffect(() => {
    if (!currentLipsyncModel) {
      return;
    }

    if (currentLipsyncModel.id !== lipsyncModelId) {
      setLipsyncModelId(currentLipsyncModel.id);
      setLipsyncSettings({ ...currentLipsyncModel.defaults });
      return;
    }

    if (!hasSettings(lipsyncSettings) && hasSettings(currentLipsyncModel.defaults)) {
      setLipsyncSettings({ ...currentLipsyncModel.defaults });
    }
  }, [currentLipsyncModel, lipsyncModelId, lipsyncSettings]);

  useEffect(() => {
    const latestStudioJob = currentStudioJobs[0];
    if (!latestStudioJob) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !currentStudioJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(latestStudioJob.id);
    }
  }, [currentStudioJobs, selectedJobId]);

  const pollFailureCountsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const activeJobs = jobs.filter(isJobActive);
    if (activeJobs.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const pollable = activeJobs
        .slice(0, 5)
        .filter((job) => (pollFailureCountsRef.current[job.id] ?? 0) < 3);

      if (pollable.length === 0) return;

      void Promise.allSettled(pollable.map((job) => refreshKanvasJobStatus(job.id)))
        .then((results) => {
          const updatedJobs: KanvasJob[] = [];
          const locallyFailed: KanvasJob[] = [];

          results.forEach((r, i) => {
            const job = pollable[i];
            if (!job) return;
            if (r.status === "fulfilled") {
              pollFailureCountsRef.current[job.id] = 0;
              updatedJobs.push(r.value);
            } else {
              const next = (pollFailureCountsRef.current[job.id] ?? 0) + 1;
              pollFailureCountsRef.current[job.id] = next;
              console.warn(`Failed to refresh job ${job.id} (attempt ${next}):`, r.reason);
              if (next >= 3) {
                // Stop polling; mark locally failed so UI clears the spinner.
                locallyFailed.push({
                  ...job,
                  status: "failed",
                  errorMessage:
                    job.errorMessage ?? "Lost connection to generation status. Please retry.",
                });
              }
            }
          });

          const merged = [...updatedJobs, ...locallyFailed];
          if (merged.length > 0) {
            setJobs((current) => mergeJobs(current, merged));
          }
        });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [jobs]);

  function setStudio(nextStudio: KanvasStudio) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("studio", nextStudio);
      setSearchParams(nextParams, { replace: true });
    });
  }

  async function handleAssetUpload(file: File, assetType: KanvasAssetType) {
    setUploadingByType((current) => ({ ...current, [assetType]: true }));
    try {
      const asset = await uploadKanvasAsset(file, { assetType });
      setAssets((current) => mergeAssets(current, [asset]));

      if (studio === "image" && assetType === "image") {
        setImageReferenceIds((current) => Array.from(new Set([asset.id, ...current])));
      } else if (studio === "video" && (assetType === "image" || assetType === "video")) {
        setVideoReferenceId(asset.id);
      } else if (studio === "lipsync" && assetType === "image") {
        setLipsyncImageId(asset.id);
      } else if (studio === "lipsync" && assetType === "video") {
        setLipsyncVideoId(asset.id);
      } else if (studio === "lipsync" && assetType === "audio") {
        setLipsyncAudioId(asset.id);
      }

      toast.success(`${file.name} uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingByType((current) => ({ ...current, [assetType]: false }));
    }
  }

  function handleImageReferenceToggle(assetId: string) {
    setImageReferenceIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]
    );
  }

  useEffect(() => {
    const promptPrefill = searchParams.get("prompt");
    if (!promptPrefill) return;
    const key = `${studio}:${promptPrefill}`;
    if (appliedPromptPrefillRef.current === key) return;
    appliedPromptPrefillRef.current = key;

    if (studio === "image") {
      setImagePrompt(promptPrefill);
      onMentionChange(promptPrefill);
    } else if (studio === "video") {
      setVideoPrompt(promptPrefill);
      onMentionChange(promptPrefill);
    } else if (studio === "cinema") {
      setCinemaPrompt(promptPrefill);
      onMentionChange(promptPrefill);
    } else if (studio === "lipsync") {
      setLipsyncPrompt(promptPrefill);
      onMentionChange(promptPrefill);
    }
  }, [onMentionChange, searchParams, studio]);

  /** Expand @mentions in a prompt string before sending to generation. */
  function resolvePromptForGeneration(rawPrompt: string, modelId: string) {
    const resolved = resolveMentions(rawPrompt);
    if (modelId === "gmi/kling-v3-omni" && resolved.elementIds.length > 0) {
      return {
        prompt: resolved.elementPrompt,
        elementIds: resolved.elementIds,
        referenceAssetIds: resolved.referenceAssetIds,
        referenceImageUrls: resolved.referenceImageUrls,
        referenceAssets: resolved.referenceAssets,
        referenceBlueprintIds: resolved.usedCharacters.map((c) => c.slug),
        warnings: resolved.warnings,
      };
    }

    return {
      prompt: resolved.expandedPrompt,
      elementIds: undefined,
      referenceAssetIds: resolved.referenceAssetIds,
      referenceImageUrls: resolved.referenceImageUrls,
      referenceAssets: resolved.referenceAssets,
      referenceBlueprintIds: resolved.usedCharacters.map((c) => c.slug),
      warnings: resolved.warnings,
    };
  }

  function buildCurrentRequest(): KanvasGenerationRequest {
    if (studio === "image") {
      if (imageReferenceIds.length === 0 && imagePrompt.trim().length === 0) {
        throw new Error("Add a prompt or select one or more reference images.");
      }
      if (!currentImageModel) {
        throw new Error("No image model is available.");
      }

      const resolvedPrompt = resolvePromptForGeneration(imagePrompt.trim(), currentImageModel.id);
      const mentionReferenceIds =
        currentImageModel.mode === "image-to-image" ? resolvedPrompt.referenceAssetIds : [];
      const imageIds = Array.from(new Set([...imageReferenceIds, ...mentionReferenceIds]));

      return buildImageRequest({
        modelId: currentImageModel.id,
        prompt: resolvedPrompt.prompt,
        settings: imageSettings,
        imageIds,
        referenceAssets: resolvedPrompt.referenceAssets,
        referenceBlueprintIds: resolvedPrompt.referenceBlueprintIds,
        generationRole: "primary",
      });
    }

    if (studio === "video") {
      if (!videoReferenceId && videoPrompt.trim().length === 0) {
        throw new Error("Add a video prompt or select a reference frame.");
      }
      if (!currentVideoModel) {
        throw new Error("No video model is available.");
      }

      const resolvedPrompt = resolvePromptForGeneration(videoPrompt.trim(), currentVideoModel.id);
      const mentionReferenceId =
        currentVideoModel.mode === "text-to-video" ? null : resolvedPrompt.referenceAssetIds[0] ?? null;
      const effectiveReferenceId = videoReferenceId ?? mentionReferenceId;
      const effectiveReferenceAsset = effectiveReferenceId
        ? assets.find((asset) => asset.id === effectiveReferenceId)
        : null;

      return buildVideoRequest({
        modelId: currentVideoModel.id,
        prompt: resolvedPrompt.prompt,
        settings: videoSettings,
        mode: currentVideoModel.mode as Extract<
          KanvasMode,
          "text-to-video" | "image-to-video" | "reference-to-video"
        >,
        imageId:
          effectiveReferenceId &&
          (effectiveReferenceAsset?.asset_type ?? "image") === "image" &&
          currentVideoModel.mode !== "reference-to-video"
            ? effectiveReferenceId
            : undefined,
        referenceAssetId:
          currentVideoModel.mode === "reference-to-video"
            ? effectiveReferenceId
            : undefined,
        elementIds: resolvedPrompt.elementIds,
        referenceAssets: resolvedPrompt.referenceAssets,
        referenceBlueprintIds: resolvedPrompt.referenceBlueprintIds,
        generationRole: "primary",
      });
    }

    if (studio === "cinema") {
      if (cinemaPrompt.trim().length === 0) {
        throw new Error("Describe the scene you want to shoot.");
      }
      if (!currentCinemaModel) {
        throw new Error("No cinema model is available.");
      }

      const resolvedPrompt = resolvePromptForGeneration(cinemaPrompt.trim(), currentCinemaModel.id);
      const cinemaReferenceIds = currentCinemaModel.requiresAssets.includes("image")
        ? resolvedPrompt.referenceAssetIds
        : [];

      return buildCinemaRequest({
        modelId: currentCinemaModel.id,
        prompt: resolvedPrompt.prompt,
        settings: cinemaSettings,
        cinema: cinemaCameraSettings,
        elementIds: resolvedPrompt.elementIds,
        imageIds: cinemaReferenceIds,
        referenceAssets: resolvedPrompt.referenceAssets,
        referenceBlueprintIds: resolvedPrompt.referenceBlueprintIds,
        generationRole: "world_reference",
      });
    }

    if (!currentLipsyncModel) {
      throw new Error("No lip sync model is available.");
    }
    if (!lipsyncAudioId) {
      throw new Error("Select an audio asset first.");
    }
    if (lipsyncMode === "talking-head") {
      const requiresImage = currentLipsyncModel.requiresAssets.includes("image");
      if (requiresImage && !lipsyncImageId) {
        throw new Error("The selected talking-head model requires a portrait image.");
      }

      return buildLipSyncRequest({
        mode: "talking-head",
        modelId: currentLipsyncModel.id,
        prompt: resolvePromptForGeneration(lipsyncPrompt.trim(), currentLipsyncModel.id).prompt,
        settings: lipsyncSettings,
        imageId: lipsyncImageId,
        audioId: lipsyncAudioId,
      });
    }

    if (!lipsyncVideoId) {
      throw new Error("Select a source video for lip-sync mode.");
    }

    return buildLipSyncRequest({
      mode: "lip-sync",
      modelId: currentLipsyncModel.id,
      prompt: lipsyncPrompt.trim(),
      settings: lipsyncSettings,
      videoId: lipsyncVideoId,
      audioId: lipsyncAudioId,
    });
  }

  async function handleGenerate() {
    try {
      const request = buildCurrentRequest();
      setKanvasSetupError(null);
      setSubmitting(true);
      const job = await submitKanvasJob(request);
      setJobs((current) => mergeJobs(current, [job]));
      setSelectedJobId(job.id);
      toast.info(`Generation started — ${currentModel?.name ?? 'Unknown model'}`, {
        description: `Studio: ${KANVAS_STUDIO_META[studio].label}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        setCreditsInfo({
          required: error.payload.required,
          available: error.payload.available,
        });
        setCreditsDialogOpen(true);
      } else {
        const message = error instanceof Error ? error.message : "Generation failed";
        if (/FAL_KEY/i.test(message) && isFalKanvasModel(currentModel)) {
          setKanvasSetupError(
            "Fal is selected for this Kanvas section, but the Supabase Edge Function is missing FAL_KEY. Add FAL_KEY as a Supabase secret, then retry."
          );
        }
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetryLastFailed() {
    const lastFailed = currentStudioJobs.find((j) => j.status === 'failed');
    if (lastFailed) {
      void handleGenerate();
    }
  }

  function applyVoicePrompt(nextStudio: KanvasStudio, prompt?: string | null) {
    if (!prompt?.trim()) return;
    if (nextStudio === "image") {
      setImagePrompt(prompt);
    } else if (nextStudio === "video") {
      setVideoPrompt(prompt);
    } else if (nextStudio === "cinema") {
      setCinemaPrompt(prompt);
    } else if (nextStudio === "lipsync") {
      setLipsyncPrompt(prompt);
    }
    onMentionChange(prompt);
  }

  const voiceActions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: "kanvas_set_studio",
        scope: "kanvas",
        handler: (input) => {
          const payload = input as { studio?: KanvasStudio; prompt?: string | null };
          const nextStudio = normalizeStudioParam(payload.studio);
          setStudio(nextStudio);
          applyVoicePrompt(nextStudio, payload.prompt);
          return {
            ok: true,
            status: "completed",
            message: `Kanvas ${KANVAS_STUDIO_META[nextStudio].label} is open.`,
            data: { studio: nextStudio },
          };
        },
      },
      {
        name: "kanvas_generate",
        scope: "kanvas",
        confirmation: {
          risk: "generation",
          message: "This will spend credits to start a Kanvas generation. Should I continue?",
        },
        handler: async (input) => {
          const payload = input as { studio?: KanvasStudio; prompt?: string | null };
          const requestedStudio = payload.studio ? normalizeStudioParam(payload.studio) : studio;
          applyVoicePrompt(requestedStudio, payload.prompt);

          if (requestedStudio !== studio) {
            setStudio(requestedStudio);
            return {
              ok: true,
              status: "completed",
              message: `Switched to ${KANVAS_STUDIO_META[requestedStudio].label}. Confirm generation after the studio loads.`,
              data: { studio: requestedStudio },
            };
          }

          await handleGenerate();
          return {
            ok: true,
            status: "completed",
            message: "Kanvas generation started.",
            data: { studio },
          };
        },
      },
    ],
    [studio, searchParams, setSearchParams, onMentionChange, currentStudioJobs, currentModel],
  );

  useRegisterVoiceActions(voiceActions);

  const imageAssets = assets.filter((asset) => asset.asset_type === "image");
  const videoAssets = assets.filter((asset) => asset.asset_type === "video");
  const audioAssets = assets.filter((asset) => asset.asset_type === "audio");

  // Hydrate character store on mount so @mentions work across all studios
  const setBlueprints = useCharacterCreationStore((s) => s.setBlueprints);
  useEffect(() => {
    import('@/services/characterBlueprintService').then(({ listBlueprints }) => {
      listBlueprints().then(setBlueprints).catch(() => {});
    });
  }, [setBlueprints]);

  // Full character mention list for cinema cast (unfiltered)
  const blueprintList = useCharacterCreationStore((s) => s.blueprints);
  const getMentionListFn = useCharacterCreationStore((s) => s.getMentionList);
  const allCharacterMentions = useMemo(() => {
    try { return getMentionListFn(); } catch { return []; }
  }, [blueprintList, getMentionListFn]);

  return (
    <div className="relative h-screen bg-kanvas-bg text-white overflow-hidden">
      {/* Floating sidebar nav (fixed overlay) */}
      <KanvasSidebar activeStudio={studio} onStudioChange={setStudio} />

      {/* Main content area — full width */}
      <div className="relative min-w-0 w-full h-full overflow-auto">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--kanvas-accent)/0.08),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--kanvas-accent)/0.05),transparent_24%)] pointer-events-none" />
        <div className="relative">
          {/* Slim status header */}
           <header className="sticky top-0 z-40 bg-kanvas-bg/80 backdrop-blur-xl border-b border-transparent" style={{ borderImage: 'linear-gradient(to right, hsl(var(--kanvas-accent)/0.15), transparent 60%) 1' }}>
            <div className="flex items-center justify-between px-5 py-1.5">
              {/* Left: WZRD logo + badge */}
              <div className="flex items-center gap-2 md:gap-3 min-w-0 md:min-w-[140px]">
                <img src="/lovable-uploads/wzrdtechlogo.png" alt="WZRD STUDIO Logo" className="h-10 md:h-14 object-contain cursor-pointer" onClick={() => navigate(appRoutes.home)} />
                <span className="hidden sm:inline text-[10px] text-kanvas-accent bg-kanvas-accent-soft px-2 py-0.5 rounded-full border border-kanvas-accent-edge font-medium">ALPHA</span>
              </div>

              {/* Center: Pill-slider studio nav — hidden on mobile (bottom nav replaces it) */}
              <div className="hidden md:inline-flex items-center bg-kanvas-surface-1 rounded-full p-1 border border-white/[0.06] gap-0.5">
                {KANVAS_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const itemStudio = kanvasStudioFromNavItem(item);
                  const isActive = itemStudio === studio;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => (itemStudio ? setStudio(itemStudio as KanvasStudio) : navigate(item.path ?? appRoutes.kanvas))}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-[background-color,color] duration-wzrd-control',
                        isActive
                          ? 'bg-white/10 text-kanvas-accent'
                          : 'text-kanvas-text-muted hover:text-kanvas-text-secondary',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: action buttons */}
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-2 min-w-0 md:min-w-[140px] justify-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => navigate(appRoutes.home)}
                        className="hidden md:flex h-9 w-9 rounded-full bg-white/[0.04] border border-white/[0.06] items-center justify-center text-kanvas-text-secondary hover:text-kanvas-text-primary hover:bg-white/[0.08] transition-all duration-200"
                        aria-label="Home"
                      >
                        <Home className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} className="z-[60]">Home</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="hidden md:block">
                        <ThemeToggle />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8} className="z-[60]">Toggle theme</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-9 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-kanvas-text-secondary hover:text-kanvas-text-primary hover:bg-white/[0.08] transition-all duration-200"
                            aria-label="Settings"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={8} className="z-[60]">Settings</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" sideOffset={8} className="w-52 bg-kanvas-surface-2 border-white/[0.08] text-kanvas-text-secondary">
                      <DropdownMenuItem onClick={() => navigate(appRoutes.home)} className="gap-2 hover:bg-white/[0.06] focus:bg-white/[0.06] cursor-pointer">
                        <Home className="h-4 w-4 text-kanvas-text-muted" />
                        <span>Home</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/[0.06]" />
                      <DropdownMenuItem className="gap-2 hover:bg-white/[0.06] focus:bg-white/[0.06] cursor-pointer">
                        <SlidersHorizontal className="h-4 w-4 text-kanvas-text-muted" />
                        <span>Preferences</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 hover:bg-white/[0.06] focus:bg-white/[0.06] cursor-pointer">
                        <Keyboard className="h-4 w-4 text-kanvas-text-muted" />
                        <span>Keyboard Shortcuts</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/[0.06]" />
                      <DropdownMenuItem className="gap-2 hover:bg-white/[0.06] focus:bg-white/[0.06] cursor-pointer">
                        <Info className="h-4 w-4 text-kanvas-text-muted" />
                        <span>About</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 hover:bg-rose-500/10 focus:bg-rose-500/10 text-rose-400 cursor-pointer">
                        <LogOut className="h-4 w-4" />
                        <span>Logout</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TooltipProvider>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] px-3 py-2 pb-20 md:pb-12 md:px-4">
            {kanvasSetupError && (
              <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {kanvasSetupError}
              </div>
            )}
            {currentModel && (
              <span className="sr-only">Selected Kanvas model: {currentModel.name}</span>
            )}
            <div className="min-w-0">
            <Suspense
              fallback={
                <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-kanvas-accent" />
                    <p className="text-sm font-semibold text-white">Loading {KANVAS_STUDIO_META[studio].label}</p>
                  </div>
                </div>
              }
            >
            {studio === "image" ? (
              <ImageStudioSection
                prompt={imagePrompt}
                onPromptChange={setImagePrompt}
                referenceId={imageReferenceIds[0] ?? null}
                onReferenceChange={(id) => setImageReferenceIds(id ? [id] : [])}
                currentModel={currentImageModel}
                models={currentImageModels}
                onModelChange={(id) => {
                  setImageModelId(id);
                  setImageSettings({});
                }}
                settings={imageSettings}
                onSettingsChange={(k, v) => setImageSettings((c) => ({ ...c, [k]: v }))}
                submitting={submitting}
                onGenerate={handleGenerate}
                jobs={currentStudioJobs}
                selectedJob={selectedJob}
                assets={[...imageAssets, ...videoAssets]}
                uploading={uploadingByType.image || uploadingByType.video}
                onUpload={handleAssetUpload}
                pageLoading={pageLoading}
                mentionSuggestions={mentionSuggestions}
                showMentionDropdown={showMentionDropdown}
                onMentionSelect={(mention) => {
                  const replaced = onSelectSuggestion(mention, imagePrompt);
                  setImagePrompt(replaced);
                }}
                onMentionTogglePin={(mention) => {
                  void toggleMentionPinned(mention).catch((error) => {
                    toast.error(error instanceof Error ? error.message : "Failed to update pin.");
                  });
                }}
                onMentionChange={onMentionChange}
                onCloseMentions={closeMentionDropdown}
              />
            ) : studio === "video" ? (
              <VideoStudioSection
                prompt={videoPrompt}
                onPromptChange={setVideoPrompt}
                referenceId={videoReferenceId}
                onReferenceChange={setVideoReferenceId}
                currentModel={currentVideoModel}
                models={currentVideoModels}
                onModelChange={(id) => {
                  setVideoModelId(id);
                  setVideoSettings({});
                }}
                settings={videoSettings}
                onSettingsChange={(k, v) => setVideoSettings((c) => ({ ...c, [k]: v }))}
                submitting={submitting}
                onGenerate={handleGenerate}
                jobs={currentStudioJobs}
                selectedJob={selectedJob}
                assets={imageAssets}
                uploading={uploadingByType.image}
                onUpload={handleAssetUpload}
                pageLoading={pageLoading}
                mentionSuggestions={mentionSuggestions}
                showMentionDropdown={showMentionDropdown}
                onMentionSelect={(mention) => {
                  const replaced = onSelectSuggestion(mention, videoPrompt);
                  setVideoPrompt(replaced);
                }}
                onMentionTogglePin={(mention) => {
                  void toggleMentionPinned(mention).catch((error) => {
                    toast.error(error instanceof Error ? error.message : "Failed to update pin.");
                  });
                }}
                onMentionChange={onMentionChange}
                onCloseMentions={closeMentionDropdown}
              />
            ) : studio === "edit" ? (
              <EditStudioSection
                assets={imageAssets}
                jobs={currentStudioJobs}
                selectedJob={selectedJob}
                models={currentEditModels}
                uploading={uploadingByType.image}
                onUpload={handleAssetUpload}
              />
            ) : studio === "worldview" ? (
              <WorldviewSection />
            ) : studio === "character-creation" ? (
              <CharacterCreationSection />
            ) : studio === "lipsync" ? (
              <LipsyncStudioSection
                prompt={lipsyncPrompt}
                onPromptChange={setLipsyncPrompt}
                lipsyncMode={lipsyncMode}
                onLipsyncModeChange={setLipsyncMode}
                imageId={lipsyncImageId}
                videoId={lipsyncVideoId}
                audioId={lipsyncAudioId}
                onImageChange={setLipsyncImageId}
                onVideoChange={setLipsyncVideoId}
                onAudioChange={setLipsyncAudioId}
                currentModel={currentLipsyncModel}
                models={currentLipsyncModels}
                onModelChange={(id) => {
                  setLipsyncModelId(id);
                  setLipsyncSettings({});
                }}
                settings={lipsyncSettings}
                onSettingsChange={(key, value) =>
                  setLipsyncSettings((current) => ({ ...current, [key]: value }))
                }
                submitting={submitting}
                onGenerate={() => void handleGenerate()}
                jobs={currentStudioJobs}
                selectedJob={selectedJob ?? null}
                assets={assets}
                uploadingImage={uploadingByType.image}
                uploadingVideo={uploadingByType.video}
                uploadingAudio={uploadingByType.audio}
                onUpload={handleAssetUpload}
              />
            ) : studio === "cinema" ? (
              <CinemaStudioSection
                prompt={cinemaPrompt}
                onPromptChange={setCinemaPrompt}
                cinemaSettings={cinemaSettings}
                onCinemaSettingsChange={setCinemaSettings}
                cinemaCameraSettings={cinemaCameraSettings}
                onCinemaCameraSettingsChange={setCinemaCameraSettings}
                currentModel={currentCinemaModel}
                models={currentCinemaModels}
                onModelChange={(id) => { setCinemaModelId(id); setCinemaSettings({}); }}
                submitting={submitting}
                onGenerate={() => void handleGenerate()}
                jobs={currentStudioJobs}
                selectedJob={selectedJob ?? null}
                assets={assets}
                onUpload={handleAssetUpload}
                uploading={uploadingByType.image}
                mentionSuggestions={mentionSuggestions}
                showMentionDropdown={showMentionDropdown}
                onMentionSelect={(mention) => {
                  const replaced = onSelectSuggestion(mention, cinemaPrompt);
                  setCinemaPrompt(replaced);
                }}
                onMentionTogglePin={(mention) => {
                  void toggleMentionPinned(mention).catch((error) => {
                    toast.error(error instanceof Error ? error.message : "Failed to update pin.");
                  });
                }}
                onCloseMentions={closeMentionDropdown}
                onMentionChange={onMentionChange}
                characterMentions={allCharacterMentions}
              />
            ) : null}
            </Suspense>
            </div>
          </div>

          {pageLoading && (
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
              <div className="rounded-kanvas-xl border border-white/10 bg-kanvas-bg/90 px-8 py-6 text-center text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-kanvas-accent" />
                <p className="text-sm font-semibold text-white">Loading Kanvas shell</p>
                <p className="mt-1 text-xs text-kanvas-text-muted">Fetching models, assets, and history.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Film grain overlay */}
      <svg className="pointer-events-none fixed inset-0 z-[1] w-full h-full mix-blend-overlay opacity-[0.03]" aria-hidden="true">
        <filter id="kanvasNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#kanvasNoise)" />
      </svg>

      {/* Bottom status bar */}
      <div className="hidden md:flex fixed bottom-0 left-0 right-0 h-8 z-[55] bg-kanvas-bg/80 backdrop-blur-xl border-t border-white/[0.04] items-center justify-between px-4">
        <span className="text-[10px] text-kanvas-text-faint uppercase tracking-widest font-medium">WZRD Studio</span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-kanvas-accent shadow-[0_0_6px_hsl(var(--kanvas-accent)/0.5)] animate-pulse" />
          <span className="text-[10px] text-kanvas-text-secondary font-medium capitalize">{KANVAS_STUDIO_META[studio].label}</span>
        </div>
        <div className="flex items-center gap-3">
          <CreditsDisplay showTooltip={false} />
          <kbd className="text-[9px] text-kanvas-text-muted bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[55] bg-kanvas-bg/95 backdrop-blur-xl border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
          {KANVAS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const itemStudio = kanvasStudioFromNavItem(item);
            const isActive = itemStudio === studio;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => (itemStudio ? setStudio(itemStudio as KanvasStudio) : navigate(item.path ?? appRoutes.kanvas))}
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-wzrd-sm transition-colors duration-wzrd-control',
                  isActive
                    ? 'text-kanvas-accent'
                    : 'text-kanvas-text-muted active:text-kanvas-text-secondary',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[9px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <AlertDialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <AlertDialogContent className="border-white/10 bg-kanvas-surface-1 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Insufficient Credits</AlertDialogTitle>
            <AlertDialogDescription className="text-kanvas-text-secondary">
              This generation requires <span className="font-semibold text-white">{creditsInfo?.required ?? 0}</span> credits
              but you only have <span className="font-semibold text-white">{creditsInfo?.available ?? 0}</span> available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-kanvas-accent text-kanvas-accent-contrast hover:bg-kanvas-accent-hover"
              onClick={() => navigate(appRoutes.settings.billing)}
            >
              Get More Credits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
