/**
 * GMI Cloud API client for model execution.
 *
 * GMI Cloud serves as an alternate provider for supported models. Credits are
 * still reserved before provider calls.
 *
 * API endpoints:
 *   - LLM chat completions: https://api.gmi-serving.com/v1/chat/completions
 *   - Image / Video queue:  https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests
 *   - Queue status polling:  GET  ...requests/{request_id}
 */

import type { GmiChatMessage } from './gmi-types.ts';
import { translateGmiQueuePayload } from './gmi-types.ts';

// ── Response types ──────────────────────────────────────────────────────────

export interface GmiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
  statusUrl?: string;
}

export interface GmiQueueStatus {
  request_id: string;
  model: string;
  status: 'created' | 'queued' | 'dispatched' | 'processing' | 'success' | 'failed' | 'cancelled';
  outcome?: {
    media_urls?: Array<{ id: string; url: string }>;
    thumbnail_image_url?: string;
    video_url?: string;
    [key: string]: unknown;
  };
  created_at?: number;
  updated_at?: number;
}

export interface GmiChatCompletionChoice {
  message: { role: string; content: string };
  finish_reason?: string;
}

export interface GmiChatCompletion {
  id: string;
  object: string;
  model: string;
  choices: GmiChatCompletionChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGmiApiKey(): string {
  const key = Deno.env.get('GMI_CLOUD_API_KEY');
  if (!key) {
    throw new Error('GMI_CLOUD_API_KEY environment variable is not set');
  }
  return key;
}

const GMI_QUEUE_BASE = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey';
const GMI_LLM_BASE = 'https://api.gmi-serving.com/v1';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripUndefined<T extends Record<string, unknown>>(payload: T): T {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

function isLtxFastQueueModel(model: string): boolean {
  return model === 'ltx-2-fast-image-to-video' || model === 'gmi/ltx-fast-i2v';
}

function isPayloadValidationError(errorMessage: string): boolean {
  return /invalid payload parameters/i.test(errorMessage);
}

/**
 * Detects GMI provider errors indicating the requested model is inactive,
 * disabled, or otherwise not accepting requests, e.g.
 * "model ltx-2-fast-image-to-video is currently inactive and not accepting requests".
 */
export function isInactiveModelError(errorMessage: string | undefined | null): boolean {
  if (!errorMessage) return false;
  return (
    /\binactive\b/i.test(errorMessage) ||
    /not accepting requests/i.test(errorMessage) ||
    /model\b.*\b(unavailable|deprecated|disabled)\b/i.test(errorMessage)
  );
}

function getParameterOptionValues(parameter: Record<string, unknown>): unknown[] {
  const directOptions = asArray(parameter.options)
    .map((entry) => {
      const option = asRecord(entry);
      return option.value ?? option.name ?? option.label;
    })
    .filter((value) => value !== undefined);

  const enumValues = asArray(parameter.enum);
  const allowedValues = asArray(parameter.allowed_values);
  const values = asArray(parameter.values);

  return directOptions.length > 0
    ? directOptions
    : enumValues.length > 0
      ? enumValues
      : allowedValues.length > 0
        ? allowedValues
        : values;
}

function normalizeNumericEnumCandidate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function coerceToAllowedOption(currentValue: unknown, allowedValues: unknown[]): unknown {
  if (allowedValues.length === 0 || currentValue === undefined) {
    return currentValue;
  }

  if (allowedValues.includes(currentValue)) {
    return currentValue;
  }

  const currentNumber = normalizeNumericEnumCandidate(currentValue);
  const numericOptions = allowedValues
    .map((value) => ({ raw: value, numeric: normalizeNumericEnumCandidate(value) }))
    .filter((entry): entry is { raw: unknown; numeric: number } => entry.numeric !== undefined);

  if (currentNumber !== undefined && numericOptions.length > 0) {
    const exactMatch = numericOptions.find((entry) => entry.numeric === currentNumber);
    if (exactMatch) return exactMatch.raw;

    const lowerOrEqual = numericOptions.filter((entry) => entry.numeric <= currentNumber);
    if (lowerOrEqual.length > 0) return lowerOrEqual[lowerOrEqual.length - 1]?.raw;

    return numericOptions[0]?.raw;
  }

  return allowedValues[0];
}

function extractModelParameters(modelDetails: unknown): Array<Record<string, unknown>> {
  const details = asRecord(modelDetails);
  const directParameters = asArray(details.parameters)
    .map((entry) => asRecord(entry))
    .filter((entry) => Object.keys(entry).length > 0);

  if (directParameters.length > 0) {
    return directParameters;
  }

  const modalities = asRecord(details.modalities);
  for (const modalityValue of Object.values(modalities)) {
    const modality = asRecord(modalityValue);
    const parameters = asArray(modality.parameters)
      .map((entry) => asRecord(entry))
      .filter((entry) => Object.keys(entry).length > 0);
    if (parameters.length > 0) {
      return parameters;
    }
  }

  return [];
}

export function adaptLtxPayloadForGmiModelSchema(
  payload: Record<string, unknown>,
  modelDetails: unknown,
): Record<string, unknown> {
  const parameters = extractModelParameters(modelDetails);
  if (parameters.length === 0) {
    return payload;
  }

  const nextPayload: Record<string, unknown> = { ...payload };
  const parameterNames = new Set(
    parameters
      .map((parameter) => asString(parameter.name))
      .filter((name): name is string => Boolean(name)),
  );

  if (parameterNames.has('image') && !parameterNames.has('image_uri') && typeof nextPayload.image_uri === 'string') {
    nextPayload.image = nextPayload.image_uri;
    delete nextPayload.image_uri;
  }

  if (parameterNames.has('image_uri') && !parameterNames.has('image') && typeof nextPayload.image === 'string') {
    nextPayload.image_uri = nextPayload.image;
    delete nextPayload.image;
  }

  if (parameterNames.has('generateAudio') && !parameterNames.has('generate_audio') && nextPayload.generate_audio !== undefined) {
    nextPayload.generateAudio = nextPayload.generate_audio;
    delete nextPayload.generate_audio;
  }

  if (parameterNames.has('generate_audio') && !parameterNames.has('generateAudio') && nextPayload.generateAudio !== undefined) {
    nextPayload.generate_audio = nextPayload.generateAudio;
    delete nextPayload.generateAudio;
  }

  const durationParameter = parameters.find((parameter) => {
    const name = asString(parameter.name);
    return name === 'duration' || name === 'durationSeconds';
  });

  if (durationParameter) {
    const durationName = asString(durationParameter.name) ?? 'duration';
    const currentDuration = nextPayload[durationName] ?? nextPayload.duration ?? nextPayload.durationSeconds;
    const allowedValues = getParameterOptionValues(durationParameter);
    const adaptedDuration = coerceToAllowedOption(currentDuration, allowedValues);

    if (durationName === 'durationSeconds') {
      nextPayload.durationSeconds = adaptedDuration;
      delete nextPayload.duration;
    } else {
      nextPayload.duration = adaptedDuration;
      delete nextPayload.durationSeconds;
    }
  }

  const fpsParameter = parameters.find((parameter) => asString(parameter.name) === 'fps');
  if (fpsParameter && nextPayload.fps !== undefined) {
    nextPayload.fps = coerceToAllowedOption(nextPayload.fps, getParameterOptionValues(fpsParameter));
  }

  const resolutionParameter = parameters.find((parameter) => asString(parameter.name) === 'resolution');
  if (resolutionParameter && nextPayload.resolution !== undefined) {
    nextPayload.resolution = coerceToAllowedOption(nextPayload.resolution, getParameterOptionValues(resolutionParameter));
  }

  return stripUndefined(nextPayload);
}

export function buildLtxRetryPayloads(
  payload: Record<string, unknown>,
  errorMessage: string,
  modelDetails?: unknown,
): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const originalKey = JSON.stringify(payload);
  const seen = new Set<string>([originalKey]);

  const pushCandidate = (candidate: Record<string, unknown>) => {
    const normalizedCandidate = stripUndefined(candidate);
    const key = JSON.stringify(normalizedCandidate);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(normalizedCandidate);
    }
  };

  if (modelDetails) {
    pushCandidate(adaptLtxPayloadForGmiModelSchema(payload, modelDetails));
  }

  if (/duration .*allowed options/i.test(errorMessage) && payload.duration !== undefined) {
    if (typeof payload.duration === 'number') {
      pushCandidate({ ...payload, duration: String(payload.duration) });
    } else if (typeof payload.duration === 'string') {
      const parsedDuration = Number(payload.duration);
      if (Number.isFinite(parsedDuration)) {
        pushCandidate({ ...payload, duration: parsedDuration });
      }
    }
  }

  if (/image_uri .*missing/i.test(errorMessage) && typeof payload.image_uri === 'string') {
    const { image_uri, ...rest } = payload;
    pushCandidate({ ...rest, image: image_uri });
  }

  return candidates;
}

async function fetchGmiQueueModelDetails(apiKey: string, model: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(`${GMI_QUEUE_BASE}/models/${encodeURIComponent(model)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.warn(`[GMI] Failed to fetch model details for ${model}: ${response.status} ${responseText}`);
      return undefined;
    }

    return JSON.parse(responseText);
  } catch (error) {
    console.warn(`[GMI] Failed to inspect model details for ${model}:`, error);
    return undefined;
  }
}

async function submitGmiQueueRequest(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
): Promise<{ success: true; data: any; requestId?: string; statusUrl?: string } | { success: false; error: string }> {
  const response = await fetch(`${GMI_QUEUE_BASE}/requests`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, payload }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    let errorMessage: string;
    try {
      const error = JSON.parse(responseText);
      errorMessage = error.message || error.error || `GMI queue request failed (${response.status})`;
    } catch {
      errorMessage = `GMI queue request failed (${response.status}): ${responseText}`;
    }

    return { success: false, error: errorMessage };
  }

  const result = JSON.parse(responseText);
  return {
    success: true,
    data: result,
    requestId: result.request_id,
    statusUrl: `${GMI_QUEUE_BASE}/requests/${result.request_id}`,
  };
}

// ── LLM Chat Completions ────────────────────────────────────────────────────

export async function executeGmiChatCompletion(
  model: string,
  messages: GmiChatMessage[],
  options: {
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
  } = {}
): Promise<GmiResponse<GmiChatCompletion>> {
  try {
    const apiKey = getGmiApiKey();

    console.log(`[GMI] Executing LLM model: ${model}`);

    const response = await fetch(`${GMI_LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 1,
        stream: options.stream ?? false,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage: string;
      try {
        const error = JSON.parse(responseText);
        errorMessage = error.message || error.error || `GMI LLM request failed (${response.status})`;
      } catch {
        errorMessage = `GMI LLM request failed (${response.status}): ${responseText}`;
      }
      throw new Error(errorMessage);
    }

    const result = JSON.parse(responseText);
    return { success: true, data: result };
  } catch (error) {
    console.error('[GMI] LLM execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown GMI LLM error',
    };
  }
}

// ── Image / Video Queue Submission ──────────────────────────────────────────

export async function executeGmiQueueModel(
  model: string,
  payload: Record<string, any>,
  payloadKeys: string[] = [],
): Promise<GmiResponse> {
  try {
    const apiKey = getGmiApiKey();

    console.log(`[GMI] Submitting queue request for model: ${model}`);

    const translatedPayload = translateGmiQueuePayload(model, payload, payloadKeys);

    console.log(`[GMI] Final request body for model=${model}:`, JSON.stringify({ model, payload: translatedPayload }));

    const firstAttempt = await submitGmiQueueRequest(apiKey, model, translatedPayload);
    if (firstAttempt.success) {
      return firstAttempt;
    }

    let lastError = firstAttempt.error;

    if (isLtxFastQueueModel(model) && isPayloadValidationError(lastError)) {
      const modelDetails = await fetchGmiQueueModelDetails(apiKey, model);
      if (modelDetails) {
        const parameterNames = extractModelParameters(modelDetails)
          .map((parameter) => asString(parameter.name))
          .filter((name): name is string => Boolean(name));
        console.warn(`[GMI] LTX model schema for ${model}:`, JSON.stringify(parameterNames));
      }

      const retryPayloads = buildLtxRetryPayloads(translatedPayload, lastError, modelDetails);
      for (const retryPayload of retryPayloads) {
        console.warn(`[GMI] Retrying ${model} with fallback payload:`, JSON.stringify(retryPayload));
        const retryAttempt = await submitGmiQueueRequest(apiKey, model, retryPayload);
        if (retryAttempt.success) {
          return retryAttempt;
        }
        lastError = retryAttempt.error;
      }
    }

    throw new Error(lastError);
  } catch (error) {
    console.error('[GMI] Queue submission error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown GMI queue error',
    };
  }
}

// ── Queue Status Polling ────────────────────────────────────────────────────

export async function pollGmiQueueStatus(requestId: string): Promise<GmiResponse<GmiQueueStatus>> {
  try {
    const apiKey = getGmiApiKey();

    const response = await fetch(`${GMI_QUEUE_BASE}/requests/${requestId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage: string;
      try {
        const error = JSON.parse(responseText);
        errorMessage = error.message || error.error || `GMI status poll failed (${response.status})`;
      } catch {
        errorMessage = `GMI status poll failed (${response.status}): ${responseText}`;
      }
      throw new Error(errorMessage);
    }

    const result = JSON.parse(responseText) as GmiQueueStatus;

    return {
      success: true,
      data: result,
      requestId: result.request_id,
    };
  } catch (error) {
    console.error('[GMI] Status poll error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown GMI status error',
    };
  }
}
