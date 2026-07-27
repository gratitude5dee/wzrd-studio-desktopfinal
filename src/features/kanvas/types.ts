import type { ProjectAsset } from "@/types/assets";
import type { RegistryReferenceAsset } from "@/lib/referenceRegistry";

export type KanvasStudio = "image" | "video" | "edit" | "cinema" | "lipsync" | "worldview" | "character-creation";
export type KanvasMode =
  | "text-to-image"
  | "image-to-image"
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "cinematic-image"
  | "talking-head"
  | "lip-sync";
export type KanvasMediaType = "image" | "video";
export type KanvasJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type KanvasAssetType = "image" | "video" | "audio";
export type KanvasStudioMediaKind = KanvasAssetType;

export interface KanvasStudioMeta {
  key: KanvasStudio;
  label: string;
  headline: string;
  description: string;
  icon: string;
  mediaKinds: KanvasStudioMediaKind[];
  queryValue: KanvasStudio;
  supportsGeneration: boolean;
  routeOverride?: string;
}

export type NormalizedKanvasMediaKind = KanvasMediaType | "unknown";
export type NormalizedKanvasMediaSource = "asset" | "job" | "static" | "unknown";
export type NormalizedKanvasMediaStatus = "ready" | "missing" | "error" | "loading";

export interface NormalizedKanvasMedia {
  kind: NormalizedKanvasMediaKind;
  primaryUrl: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  alt: string;
  sourceType: NormalizedKanvasMediaSource;
  status: NormalizedKanvasMediaStatus;
}

export interface KanvasControlOption {
  label: string;
  value: string | number | boolean;
}

export interface KanvasControlDefinition {
  key: string;
  label: string;
  type: "select" | "number" | "boolean";
  defaultValue?: string | number | boolean;
  options?: KanvasControlOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface KanvasModel {
  id: string;
  name: string;
  description: string;
  provider?: string;
  providerLabel?: string;
  endpointId?: string;
  isDefault?: boolean;
  defaultRank?: number;
  studio: KanvasStudio;
  mode: KanvasMode;
  mediaType: KanvasMediaType;
  workflowType: string;
  uiGroup: "generation" | "advanced";
  credits: number;
  requiresAssets: KanvasAssetType[];
  supportsPrompt: boolean;
  controls: KanvasControlDefinition[];
  defaults: Record<string, unknown>;
  aliases: string[];
}

export interface KanvasOutputFile {
  url: string;
  contentType?: string;
  fileName?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface KanvasResultPayload {
  mediaType: KanvasMediaType;
  primaryUrl: string;
  previewUrl: string;
  outputs: KanvasOutputFile[];
  thumbnailUrl?: string;
  elementId?: string;
  raw: unknown;
}

export interface KanvasJob {
  id: string;
  userId: string;
  projectId: string | null;
  studio: KanvasStudio;
  modelId: string | null;
  externalRequestId: string | null;
  jobType: KanvasMediaType;
  status: KanvasJobStatus;
  progress: number | null;
  resultUrl: string | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  inputAssets: string[];
  resultPayload: KanvasResultPayload | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export type KanvasAsset = ProjectAsset;

export interface KanvasCinemaSettings {
  camera: string;
  lens: string;
  focalLength: number;
  aperture: string;
}

export interface KanvasGenerationBase {
  projectId?: string | null;
  modelId: string;
  settings?: Record<string, unknown>;
  elementIds?: string[];
  referenceAssets?: RegistryReferenceAsset[];
  referenceBlueprintIds?: string[];
  generationRole?: string;
}

export interface KanvasTextToImageRequest extends KanvasGenerationBase {
  studio: "image";
  mode: "text-to-image";
  prompt: string;
}

export interface KanvasImageToImageRequest extends KanvasGenerationBase {
  studio: "image";
  mode: "image-to-image";
  prompt?: string;
  assetSelections: {
    imageIds: string[];
  };
}

export interface KanvasTextToVideoRequest extends KanvasGenerationBase {
  studio: "video";
  mode: "text-to-video";
  prompt: string;
}

export interface KanvasImageToVideoRequest extends KanvasGenerationBase {
  studio: "video";
  mode: "image-to-video";
  prompt?: string;
  assetSelections: {
    imageId: string;
  };
}

export interface KanvasReferenceToVideoRequest extends KanvasGenerationBase {
  studio: "video";
  mode: "reference-to-video";
  prompt?: string;
  assetSelections: {
    assetId: string;
  };
}

export interface KanvasCinemaRequest extends KanvasGenerationBase {
  studio: "cinema";
  mode: "cinematic-image";
  prompt: string;
  cinema: KanvasCinemaSettings;
  assetSelections?: {
    imageIds: string[];
  };
}

export interface KanvasTalkingHeadRequest extends KanvasGenerationBase {
  studio: "lipsync";
  mode: "talking-head";
  prompt?: string;
  assetSelections: {
    imageId?: string;
    audioId: string;
  };
}

export interface KanvasLipSyncRequest extends KanvasGenerationBase {
  studio: "lipsync";
  mode: "lip-sync";
  prompt?: string;
  assetSelections: {
    videoId: string;
    audioId: string;
  };
}

export type KanvasGenerationRequest =
  | KanvasTextToImageRequest
  | KanvasImageToImageRequest
  | KanvasTextToVideoRequest
  | KanvasImageToVideoRequest
  | KanvasReferenceToVideoRequest
  | KanvasCinemaRequest
  | KanvasTalkingHeadRequest
  | KanvasLipSyncRequest;
