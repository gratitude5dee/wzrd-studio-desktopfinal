import type { CatalogMediaType, CatalogModel } from "./ai-model-catalog.ts";

type ComputeLikeEdge = {
  source_node_id: string;
  target_node_id: string;
};

const CAMEL_TO_SNAKE_KEYS: Record<string, string> = {
  aspectRatio: "aspect_ratio",
  durationSeconds: "duration_seconds",
  generateAudio: "generate_audio",
  imageSize: "image_size",
  maskImageUrl: "mask_url",
  numImages: "num_images",
  outputFormat: "output_format",
  referenceImageUrls: "image_urls",
  sourceImageUrl: "image_url",
  firstFrameImageUrl: "image_url",
  startImageUrl: "start_image_url",
  endFrameImageUrl: "end_image_url",
  voiceId: "voice_id",
};

export type BatchPolicy = "single" | "map" | "zip" | "cartesian" | "fanOut";

export interface FalPayloadBuildInput {
  model: Pick<CatalogModel, "defaults" | "payloadKeys" | "workflowType" | "mediaType">;
  params?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  mediaType: CatalogMediaType;
  prompt?: string;
  referenceUrls?: string[];
  camera?: Record<string, unknown> | undefined;
}

export function buildExecutionSelection(
  targetNodeIds: string[],
  edges: ComputeLikeEdge[],
  excludedNodeIds: Iterable<string> = [],
): Set<string> {
  const excluded = new Set(excludedNodeIds);
  const selected = new Set(targetNodeIds.filter((nodeId) => !excluded.has(nodeId)));
  const reverse = new Map<string, string[]>();

  for (const edge of edges) {
    const upstream = reverse.get(edge.target_node_id) ?? [];
    upstream.push(edge.source_node_id);
    reverse.set(edge.target_node_id, upstream);
  }

  const stack = [...targetNodeIds];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    const upstream = reverse.get(nodeId) ?? [];
    for (const dependencyId of upstream) {
      if (excluded.has(dependencyId) || selected.has(dependencyId)) {
        continue;
      }
      selected.add(dependencyId);
      stack.push(dependencyId);
    }
  }

  return selected;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function maybeParseSettings(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeAliases(record: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...record };
  for (const [camel, snake] of Object.entries(CAMEL_TO_SNAKE_KEYS)) {
    if (normalized[camel] !== undefined && normalized[snake] === undefined) {
      normalized[snake] = normalized[camel];
    }
  }
  return normalized;
}

function setIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}

function filterPayloadKeys(payload: Record<string, unknown>, payloadKeys: string[]): Record<string, unknown> {
  if (payloadKeys.length === 0) {
    return payload;
  }

  const allowed = new Set(payloadKeys);
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

function hasValue(payload: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = payload[key];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
  });
}

export function buildFalCatalogPayload({
  model,
  params = {},
  inputs = {},
  mediaType,
  prompt,
  referenceUrls = [],
  camera,
}: FalPayloadBuildInput): Record<string, unknown> {
  const settings = maybeParseSettings(params.settings);
  const settingsOverride = maybeParseSettings(params.settings_override);
  const normalizedParams = normalizeAliases(params);
  const normalizedInputs = normalizeAliases(inputs);
  const payload: Record<string, unknown> = {
    ...model.defaults,
    ...normalizedInputs,
    ...normalizedParams,
    ...settings,
    ...settingsOverride,
  };

  delete payload.settings;
  delete payload.settings_override;
  delete payload.selectedModels;
  delete payload.modelAuto;
  delete payload.useMultipleModels;
  delete payload.actionId;
  delete payload.workflowType;
  delete payload.batchPolicy;

  const finalPrompt = prompt ?? normalizedParams.prompt ?? normalizedInputs.prompt ?? normalizedInputs.text;
  if (typeof finalPrompt === "string" && finalPrompt.trim().length > 0) {
    if (model.payloadKeys.includes("prompt") || !model.payloadKeys.includes("text")) {
      payload.prompt = finalPrompt;
    }
    if (model.payloadKeys.includes("text")) {
      payload.text = finalPrompt;
    }
  }

  if (referenceUrls.length > 0) {
    setIfPresent(payload, "image_url", referenceUrls[0]);
    setIfPresent(payload, "start_image_url", referenceUrls[0]);
    setIfPresent(payload, "image_urls", referenceUrls);
  }

  const videoUrl = normalizedInputs.video_url ?? normalizedInputs.video ?? normalizedParams.video_url;
  setIfPresent(payload, "video_url", typeof videoUrl === "object" ? asRecord(videoUrl).url : videoUrl);

  const audioUrl = normalizedInputs.audio_url ?? normalizedInputs.audio ?? normalizedParams.audio_url;
  setIfPresent(payload, "audio_url", typeof audioUrl === "object" ? asRecord(audioUrl).url : audioUrl);

  if (mediaType === "3d") {
    setIfPresent(payload, "image_url", referenceUrls[0] ?? normalizedInputs.image_url ?? normalizedInputs.image);
  }

  if (camera) {
    payload.camera = camera;
  }

  const filtered = filterPayloadKeys(payload, model.payloadKeys);
  validateFalCatalogPayload(model, filtered);
  return filtered;
}

export function validateFalCatalogPayload(
  model: Pick<CatalogModel, "payloadKeys" | "workflowType" | "mediaType">,
  payload: Record<string, unknown>
): void {
  const workflowType = model.workflowType.toLowerCase();
  if ((workflowType.startsWith("text-to") || model.payloadKeys.includes("prompt")) && model.payloadKeys.includes("prompt") && !hasValue(payload, ["prompt"])) {
    throw new Error("Selected Fal model requires a prompt input.");
  }
  if (model.payloadKeys.includes("text") && !hasValue(payload, ["text", "prompt"])) {
    throw new Error("Selected Fal model requires text input.");
  }
  if (workflowType.includes("image-to") && !hasValue(payload, ["image_url", "image_urls", "start_image_url"])) {
    throw new Error("Selected Fal model requires an image input.");
  }
  if (workflowType.includes("video-to") && !hasValue(payload, ["video_url"])) {
    throw new Error("Selected Fal model requires a video input.");
  }
  if (workflowType.includes("audio-to") && !hasValue(payload, ["audio_url"])) {
    throw new Error("Selected Fal model requires an audio input.");
  }
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).items)) {
    return (value as Record<string, unknown>).items as unknown[];
  }
  return [value];
}

export function expandBatchInputs(inputs: Record<string, unknown>, policy: BatchPolicy): Record<string, unknown>[] {
  const entries = Object.entries(inputs).filter(([key]) => !key.endsWith("_asset") && !key.endsWith("_source_handles"));
  if (entries.length === 0 || policy === "single") {
    return [inputs];
  }

  if (policy === "fanOut") {
    return entries.flatMap(([key, value]) => toArray(value).map((item) => ({ [key]: item })));
  }

  if (policy === "map") {
    const firstArray = entries.find(([, value]) => Array.isArray(value));
    if (!firstArray) {
      return [inputs];
    }
    const [arrayKey, arrayValue] = firstArray;
    return toArray(arrayValue).map((item) => ({ ...inputs, [arrayKey]: item }));
  }

  if (policy === "zip") {
    const arrays = entries.map(([key, value]) => [key, toArray(value)] as const);
    const maxLength = Math.max(...arrays.map(([, values]) => values.length), 1);
    return Array.from({ length: maxLength }, (_, index) => {
      const item: Record<string, unknown> = {};
      for (const [key, values] of arrays) {
        item[key] = values[index] ?? values[values.length - 1] ?? null;
      }
      return item;
    });
  }

  const arrays = entries.map(([key, value]) => [key, toArray(value)] as const);
  const combinations: Record<string, unknown>[] = [];
  const walk = (index: number, current: Record<string, unknown>) => {
    if (index >= arrays.length) {
      combinations.push({ ...current });
      return;
    }
    const [key, values] = arrays[index];
    for (const value of values) {
      current[key] = value;
      walk(index + 1, current);
    }
  };
  walk(0, {});
  return combinations;
}

function collectFileUrls(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectFileUrls);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = typeof record.url === "string" ? [record.url] : [];
    const nested = ["images", "videos", "audios", "files", "models"].flatMap((key) => collectFileUrls(record[key]));
    return [...direct, ...nested];
  }
  return [];
}

export function normalizeFalCatalogOutput(args: {
  result: unknown;
  mediaType: CatalogMediaType;
  requestedModel: string;
  endpointModel: string;
  prompt?: string;
}): Record<string, unknown> {
  const resultData = asRecord(asRecord(args.result).data ?? args.result);
  const urls = Array.from(new Set(collectFileUrls(resultData)));
  const primaryUrl =
    urls[0] ??
    (typeof resultData.output === "string" ? resultData.output : undefined) ??
    (typeof resultData.audio_url === "string" ? resultData.audio_url : undefined);

  const variants = urls.map((url, index) => ({
    id: `${args.endpointModel}:${index}`,
    type: args.mediaType,
    url,
    data: { url },
  }));

  return {
    type: args.mediaType,
    url: primaryUrl,
    urls,
    data: resultData,
    variants,
    model: args.requestedModel,
    endpoint_model: args.endpointModel,
    prompt: args.prompt,
  };
}

export function createNotImplementedArtifact(args: {
  actionId: string;
  mediaType?: string;
  reason: string;
  inputs?: Record<string, unknown>;
  params?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    type: args.mediaType === "image" || args.mediaType === "video" || args.mediaType === "audio" || args.mediaType === "text" || args.mediaType === "3d"
      ? args.mediaType
      : "json",
    data: {
      notImplemented: true,
      action_id: args.actionId,
      reason: args.reason,
      inputs: args.inputs ?? {},
      params: args.params ?? {},
    },
    action_id: args.actionId,
  };
}

export function isNotImplementedResult(result: unknown): boolean {
  const record = asRecord(result);
  const data = asRecord(record.data);
  return data.notImplemented === true || record.notImplemented === true;
}
