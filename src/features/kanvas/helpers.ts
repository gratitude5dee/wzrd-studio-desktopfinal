import type { Database, Json } from "@/integrations/supabase/types";
import type {
  KanvasCinemaRequest,
  KanvasCinemaSettings,
  KanvasGenerationRequest,
  KanvasImageToImageRequest,
  KanvasImageToVideoRequest,
  KanvasAsset,
  KanvasJob,
  KanvasLipSyncRequest,
  KanvasMediaType,
  KanvasMode,
  KanvasStudioMeta,
  KanvasReferenceToVideoRequest,
  NormalizedKanvasMedia,
  KanvasResultPayload,
  KanvasStudio,
  KanvasTalkingHeadRequest,
  KanvasTextToImageRequest,
  KanvasTextToVideoRequest,
} from "@/features/kanvas/types";
import type { RegistryReferenceAsset } from "@/lib/referenceRegistry";

type GenerationJobRow = any;

export const KANVAS_STUDIO_ORDER: KanvasStudio[] = ["image", "video", "edit", "lipsync", "cinema", "worldview", "character-creation"];

export const KANVAS_STUDIO_META: Record<
  KanvasStudio,
  KanvasStudioMeta
> = {
  image: {
    key: "image",
    label: "Image",
    headline: "Image Studio",
    description: "Transform prompts and references into styled stills.",
    icon: "image",
    mediaKinds: ["image"],
    queryValue: "image",
    supportsGeneration: true,
  },
  video: {
    key: "video",
    label: "Video",
    headline: "Video Studio",
    description: "Turn prompts and frames into motion-first clips.",
    icon: "video",
    mediaKinds: ["image", "video"],
    queryValue: "video",
    supportsGeneration: true,
  },
  edit: {
    key: "edit",
    label: "Edit",
    headline: "Edit Studio",
    description: "Inpaint, relight, upscale, and refine your assets.",
    icon: "pencil",
    mediaKinds: ["image"],
    queryValue: "edit",
    supportsGeneration: false,
  },
  cinema: {
    key: "cinema",
    label: "Cinema Studio",
    headline: "Cinema Studio 2.0",
    description: "Compose a cinematic still with camera and lens language.",
    icon: "clapperboard",
    mediaKinds: ["image"],
    queryValue: "cinema",
    supportsGeneration: true,
  },
  lipsync: {
    key: "lipsync",
    label: "Lip Sync",
    headline: "Lip Sync",
    description: "Animate portraits or existing footage with synced speech.",
    icon: "mic",
    mediaKinds: ["image", "video", "audio"],
    queryValue: "lipsync",
    supportsGeneration: true,
  },
  worldview: {
    key: "worldview",
    label: "Worldview",
    headline: "Worldview Studio",
    description: "Generate 3D worlds, capture takes, and compose AI shots.",
    icon: "globe",
    mediaKinds: ["image", "video"],
    queryValue: "worldview",
    supportsGeneration: false,
  },
  "character-creation": {
    key: "character-creation",
    label: "Characters",
    headline: "Character Creation",
    description: "Design characters & objects, store them, and reference with @mentions.",
    icon: "sparkles",
    mediaKinds: ["image"],
    queryValue: "character-creation",
    supportsGeneration: false,
  },
};

export const KANVAS_STUDIO_NAV_ITEMS = KANVAS_STUDIO_ORDER.map((studio) => KANVAS_STUDIO_META[studio]);

export const KANVAS_CAMERAS: Record<string, string> = {
  "Modular 8K Digital": "modular 8K digital cinema camera",
  "Full-Frame Cine Digital": "full-frame digital cinema camera",
  "Grand Format 70mm Film": "grand format 70mm film camera",
  "Studio Digital S35": "Super 35 studio digital camera",
  "Classic 16mm Film": "classic 16mm film camera",
  "Premium Large Format Digital": "premium large-format digital cinema camera",
};

export const KANVAS_LENSES: Record<string, string> = {
  "Creative Tilt Lens": "creative tilt lens effect",
  "Compact Anamorphic": "compact anamorphic lens",
  "Extreme Macro": "extreme macro lens",
  "70s Cinema Prime": "1970s cinema prime lens",
  "Classic Anamorphic": "classic anamorphic lens",
  "Premium Modern Prime": "premium modern prime lens",
  "Warm Cinema Prime": "warm-toned cinema prime lens",
  "Swirl Bokeh Portrait": "swirl bokeh portrait lens",
  "Vintage Prime": "vintage prime lens",
  "Halation Diffusion": "halation diffusion filter",
  "Clinical Sharp Prime": "ultra-sharp clinical prime lens",
};

const FOCAL_PERSPECTIVES: Record<number, string> = {
  8: "ultra-wide perspective",
  14: "wide-angle perspective",
  24: "wide-angle dynamic perspective",
  35: "natural cinematic perspective",
  50: "standard portrait perspective",
  85: "classic portrait perspective",
};

const APERTURE_EFFECTS: Record<string, string> = {
  "f/1.4": "shallow depth of field, creamy bokeh",
  "f/4": "balanced depth of field",
  "f/11": "deep focus clarity, sharp foreground to background",
};

export const KANVAS_FOCAL_LENGTHS = [8, 14, 24, 35, 50, 85] as const;
export const KANVAS_APERTURES = ["f/1.4", "f/4", "f/11"] as const;

function asRecord(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asOutputArray(value: unknown): KanvasResultPayload["outputs"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      if (typeof entry.url !== "string") {
        return null;
      }
      return {
        url: entry.url,
        contentType: typeof entry.contentType === "string" ? entry.contentType : undefined,
        fileName: typeof entry.fileName === "string" ? entry.fileName : undefined,
        width: typeof entry.width === "number" ? entry.width : undefined,
        height: typeof entry.height === "number" ? entry.height : undefined,
        duration: typeof entry.duration === "number" ? entry.duration : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export function createDefaultCinemaSettings(): KanvasCinemaSettings {
  return {
    camera: Object.keys(KANVAS_CAMERAS)[0],
    lens: Object.keys(KANVAS_LENSES)[0],
    focalLength: 35,
    aperture: "f/1.4",
  };
}

export function normalizeStudioParam(value: string | null | undefined): KanvasStudio {
  if (value === "image" || value === "video" || value === "edit" || value === "cinema" || value === "lipsync" || value === "worldview" || value === "character-creation") {
    return value;
  }
  return "image";
}

export function buildCinemaPrompt(prompt: string, cinema: KanvasCinemaSettings): string {
  const camera = KANVAS_CAMERAS[cinema.camera] ?? cinema.camera;
  const lens = KANVAS_LENSES[cinema.lens] ?? cinema.lens;
  const perspective = FOCAL_PERSPECTIVES[cinema.focalLength] ?? "";
  const aperture = APERTURE_EFFECTS[cinema.aperture] ?? "";

  return [
    prompt,
    `shot on a ${camera}`,
    `using a ${lens} at ${cinema.focalLength}mm${perspective ? ` (${perspective})` : ""}`,
    `aperture ${cinema.aperture}`,
    aperture,
    "cinematic lighting",
    "natural color science",
    "high dynamic range",
    "professional photography, ultra-detailed, 8K resolution",
  ]
    .filter((part) => part.trim().length > 0)
    .join(", ");
}

export function buildImageRequest(input: {
  projectId?: string | null;
  modelId: string;
  prompt: string;
  settings?: Record<string, unknown>;
  imageIds: string[];
  referenceAssets?: RegistryReferenceAsset[];
  referenceBlueprintIds?: string[];
  generationRole?: string;
}): KanvasTextToImageRequest | KanvasImageToImageRequest {
  if (input.imageIds.length > 0) {
    return {
      studio: "image",
      mode: "image-to-image",
      projectId: input.projectId,
      modelId: input.modelId,
      prompt: input.prompt.trim() || undefined,
      settings: input.settings,
      referenceAssets: input.referenceAssets,
      referenceBlueprintIds: input.referenceBlueprintIds,
      generationRole: input.generationRole,
      assetSelections: {
        imageIds: input.imageIds,
      },
    };
  }

  return {
    studio: "image",
    mode: "text-to-image",
    projectId: input.projectId,
    modelId: input.modelId,
    prompt: input.prompt,
    settings: input.settings,
    referenceAssets: input.referenceAssets,
    referenceBlueprintIds: input.referenceBlueprintIds,
    generationRole: input.generationRole,
  };
}

export function buildVideoRequest(input: {
  projectId?: string | null;
  modelId: string;
  prompt: string;
  settings?: Record<string, unknown>;
  mode?: Extract<KanvasMode, "text-to-video" | "image-to-video" | "reference-to-video">;
  imageId?: string | null;
  referenceAssetId?: string | null;
  elementIds?: string[];
  referenceAssets?: RegistryReferenceAsset[];
  referenceBlueprintIds?: string[];
  generationRole?: string;
}): KanvasTextToVideoRequest | KanvasImageToVideoRequest | KanvasReferenceToVideoRequest {
  if (input.mode === "reference-to-video" || input.referenceAssetId) {
    const assetId = input.referenceAssetId ?? input.imageId;
    if (!assetId) {
      throw new Error("Reference-to-video mode requires a reference asset.");
    }

    return {
      studio: "video",
      mode: "reference-to-video",
      projectId: input.projectId,
      modelId: input.modelId,
      prompt: input.prompt.trim() || undefined,
      settings: input.settings,
      elementIds: input.elementIds,
      referenceAssets: input.referenceAssets,
      referenceBlueprintIds: input.referenceBlueprintIds,
      generationRole: input.generationRole,
      assetSelections: {
        assetId,
      },
    };
  }

  if (input.imageId) {
    return {
      studio: "video",
      mode: "image-to-video",
      projectId: input.projectId,
      modelId: input.modelId,
      prompt: input.prompt.trim() || undefined,
      settings: input.settings,
      elementIds: input.elementIds,
      referenceAssets: input.referenceAssets,
      referenceBlueprintIds: input.referenceBlueprintIds,
      generationRole: input.generationRole,
      assetSelections: {
        imageId: input.imageId,
      },
    };
  }

  return {
    studio: "video",
    mode: "text-to-video",
    projectId: input.projectId,
    modelId: input.modelId,
    prompt: input.prompt,
    settings: input.settings,
    elementIds: input.elementIds,
    referenceAssets: input.referenceAssets,
    referenceBlueprintIds: input.referenceBlueprintIds,
    generationRole: input.generationRole,
  };
}

export function buildCinemaRequest(input: {
  projectId?: string | null;
  modelId: string;
  prompt: string;
  settings?: Record<string, unknown>;
  cinema: KanvasCinemaSettings;
  elementIds?: string[];
  imageIds?: string[];
  referenceAssets?: RegistryReferenceAsset[];
  referenceBlueprintIds?: string[];
  generationRole?: string;
}): KanvasCinemaRequest {
  return {
    studio: "cinema",
    mode: "cinematic-image",
    projectId: input.projectId,
    modelId: input.modelId,
    prompt: input.prompt,
    settings: input.settings,
    elementIds: input.elementIds,
    referenceAssets: input.referenceAssets,
    referenceBlueprintIds: input.referenceBlueprintIds,
    generationRole: input.generationRole,
    cinema: input.cinema,
    assetSelections: input.imageIds?.length ? { imageIds: input.imageIds } : undefined,
  };
}

export function buildLipSyncRequest(input: {
  projectId?: string | null;
  mode: Extract<KanvasMode, "talking-head" | "lip-sync">;
  modelId: string;
  prompt: string;
  settings?: Record<string, unknown>;
  imageId?: string | null;
  videoId?: string | null;
  audioId: string;
}): KanvasTalkingHeadRequest | KanvasLipSyncRequest {
  if (input.mode === "lip-sync") {
    if (!input.videoId) {
      throw new Error("Lip-sync mode requires a source video.");
    }
    return {
      studio: "lipsync",
      mode: "lip-sync",
      projectId: input.projectId,
      modelId: input.modelId,
      prompt: input.prompt.trim() || undefined,
      settings: input.settings,
      assetSelections: {
        videoId: input.videoId,
        audioId: input.audioId,
      },
    };
  }

  return {
    studio: "lipsync",
    mode: "talking-head",
    projectId: input.projectId,
    modelId: input.modelId,
    prompt: input.prompt.trim() || undefined,
    settings: input.settings,
    assetSelections: {
      imageId: input.imageId ?? undefined,
      audioId: input.audioId,
    },
  };
}

function normalizeMediaUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getAssetTitle(asset: KanvasAsset): string {
  return asset.original_file_name || asset.file_name || "Kanvas asset";
}

export function normalizeKanvasAssetMedia(asset: KanvasAsset): NormalizedKanvasMedia {
  const primaryUrl = normalizeMediaUrl(asset.cdn_url) ?? normalizeMediaUrl(asset.preview_url) ?? normalizeMediaUrl(asset.thumbnail_url);
  const previewUrl = normalizeMediaUrl(asset.preview_url) ?? normalizeMediaUrl(asset.thumbnail_url) ?? primaryUrl;
  const thumbnailUrl = normalizeMediaUrl(asset.thumbnail_url) ?? previewUrl;
  const kind = asset.asset_type === "image" || asset.asset_type === "video" ? asset.asset_type : "unknown";

  return {
    kind,
    primaryUrl,
    previewUrl,
    thumbnailUrl,
    posterUrl: kind === "video" ? thumbnailUrl : null,
    alt: getAssetTitle(asset),
    sourceType: "asset",
    status: primaryUrl || previewUrl || thumbnailUrl ? "ready" : "missing",
  };
}

export function normalizeKanvasJobMedia(job: KanvasJob | null): NormalizedKanvasMedia {
  if (!job) {
    return {
      kind: "unknown",
      primaryUrl: null,
      previewUrl: null,
      thumbnailUrl: null,
      posterUrl: null,
      alt: "Kanvas output",
      sourceType: "unknown",
      status: "missing",
    };
  }

  const primaryUrl = normalizeMediaUrl(job.resultPayload?.primaryUrl) ?? normalizeMediaUrl(job.resultUrl);
  const previewUrl = normalizeMediaUrl(job.resultPayload?.previewUrl) ?? primaryUrl;
  const thumbnailUrl = normalizeMediaUrl(job.resultPayload?.thumbnailUrl) ?? previewUrl;
  const kind =
    job.resultPayload?.mediaType === "image" || job.resultPayload?.mediaType === "video"
      ? job.resultPayload.mediaType
      : job.jobType === "image" || job.jobType === "video"
        ? job.jobType
        : "unknown";
  const isLoading = job.status === "queued" || job.status === "processing";

  return {
    kind,
    primaryUrl,
    previewUrl,
    thumbnailUrl,
    posterUrl: kind === "video" ? thumbnailUrl : null,
    alt: `${KANVAS_STUDIO_META[job.studio]?.label ?? "Kanvas"} output`,
    sourceType: "job",
    status: primaryUrl || previewUrl || thumbnailUrl ? "ready" : isLoading ? "loading" : "missing",
  };
}

export function normalizeKanvasJobRow(row: GenerationJobRow): KanvasJob {
  // Support both snake_case (DB rows) and camelCase (edge function responses)
  const rawResultPayload = row.result_payload ?? (row as any).resultPayload;
  const rawResultUrl = row.result_url ?? (row as any).resultUrl;
  const rawJobType = row.job_type ?? (row as any).jobType;
  const rawUserId = row.user_id ?? (row as any).userId;
  const rawProjectId = row.project_id ?? (row as any).projectId;
  const rawModelId = row.model_id ?? (row as any).modelId;
  const rawExternalRequestId = row.external_request_id ?? (row as any).externalRequestId;
  const rawErrorMessage = row.error_message ?? (row as any).errorMessage;
  const rawInputAssets = row.input_assets ?? (row as any).inputAssets;
  const rawCreatedAt = row.created_at ?? (row as any).createdAt;
  const rawUpdatedAt = row.updated_at ?? (row as any).updatedAt;
  const rawStartedAt = row.started_at ?? (row as any).startedAt;
  const rawCompletedAt = row.completed_at ?? (row as any).completedAt;

  const resultPayloadRecord = asRecord(rawResultPayload);
  const mediaType =
    resultPayloadRecord.mediaType === "video" ? "video" : (rawJobType as KanvasMediaType);
  const outputs = asOutputArray(resultPayloadRecord.outputs);
  const primaryUrl =
    typeof resultPayloadRecord.primaryUrl === "string"
      ? resultPayloadRecord.primaryUrl
      : rawResultUrl;
  const previewUrl =
    typeof resultPayloadRecord.previewUrl === "string"
      ? resultPayloadRecord.previewUrl
      : primaryUrl;

  const resultPayload: KanvasResultPayload | null =
    primaryUrl && previewUrl
      ? {
          mediaType,
          primaryUrl,
          previewUrl,
          outputs,
          thumbnailUrl:
            typeof resultPayloadRecord.thumbnailUrl === "string"
              ? resultPayloadRecord.thumbnailUrl
              : undefined,
          elementId:
            typeof resultPayloadRecord.elementId === "string"
              ? resultPayloadRecord.elementId
              : undefined,
          raw: "raw" in resultPayloadRecord ? resultPayloadRecord.raw : rawResultPayload,
        }
      : null;

  return {
    id: row.id,
    userId: rawUserId,
    projectId: rawProjectId,
    studio: (row.studio ?? "image") as KanvasStudio,
    modelId: rawModelId,
    externalRequestId: rawExternalRequestId,
    jobType: rawJobType as KanvasMediaType,
    status: row.status as KanvasJob["status"],
    progress: row.progress,
    resultUrl: rawResultUrl,
    errorMessage: rawErrorMessage,
    config: asRecord(row.config),
    inputAssets: asStringArray(rawInputAssets),
    resultPayload,
    createdAt: rawCreatedAt ?? new Date().toISOString(),
    startedAt: rawStartedAt,
    completedAt: rawCompletedAt,
    updatedAt: rawUpdatedAt ?? new Date().toISOString(),
  };
}

export function getJobPrimaryUrl(job: KanvasJob | null): string | null {
  const media = normalizeKanvasJobMedia(job);
  return media.primaryUrl || media.previewUrl || null;
}

export function isJobActive(job: KanvasJob): boolean {
  return job.status === "queued" || job.status === "processing";
}

export function matchModelForMode<T extends { mode: KanvasMode }>(
  models: T[],
  mode: KanvasMode
): T[] {
  return models.filter((model) => model.mode === mode);
}

export function pickLatestStudioJob(jobs: KanvasJob[], studio: KanvasStudio): KanvasJob | null {
  return jobs.find((job) => job.studio === studio) ?? null;
}

export function buildRequestForStudio(
  studio: KanvasStudio,
  input:
    | Parameters<typeof buildImageRequest>[0]
    | Parameters<typeof buildVideoRequest>[0]
    | Parameters<typeof buildCinemaRequest>[0]
    | Parameters<typeof buildLipSyncRequest>[0]
): KanvasGenerationRequest | undefined {
  switch (studio) {
    case "image":
      return buildImageRequest(input as Parameters<typeof buildImageRequest>[0]);
    case "video":
      return buildVideoRequest(input as Parameters<typeof buildVideoRequest>[0]);
    case "cinema":
      return buildCinemaRequest(input as Parameters<typeof buildCinemaRequest>[0]);
    case "lipsync":
      return buildLipSyncRequest(input as Parameters<typeof buildLipSyncRequest>[0]);
    case "edit":
      // Edit mode is client-only, no generation requests
      return undefined;
    case "worldview":
      // Worldview uses its own service layer, not the kanvas generation pipeline
      return undefined;
    case "character-creation":
      // Character creation uses its own store/service layer
      return undefined;
  }
}
