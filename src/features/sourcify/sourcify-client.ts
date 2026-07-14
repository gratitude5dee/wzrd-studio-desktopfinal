import { supabase } from "@/integrations/supabase/client";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import {
  buildLocalSourcifyPlan,
  normalizeSourcifyResult,
  type SourcifyActorKey,
  type SourcifyPlan,
  type SourcifyResult,
  type SourcifyRunResponse,
  type SourcifySettings,
} from "./sourcify-model";

type SourcifyInvokeBody =
  | {
      action: "plan";
      topic: string;
      settings: Partial<SourcifySettings>;
    }
  | {
      action: "run";
      topic: string;
      actorKey: SourcifyActorKey;
      input: Record<string, unknown>;
      settings: Partial<SourcifySettings>;
    }
  | {
      action: "results";
      runId?: string;
      datasetId: string;
      actorKey?: SourcifyActorKey;
    }
  | {
      action: "finalize";
      projectId?: string;
      assetCategory: "upload" | "finalized";
      results: Array<{
        id: string;
        runId: string;
        datasetId: string;
        actorKey?: SourcifyActorKey;
        actorId?: string;
        topic?: string;
      }>;
    };

async function invokeSourcify<T>(body: SourcifyInvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("sourcify-apify", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    // Supabase Functions errors can include the underlying Response; surface it to make
    // debugging (auth, secrets, upstream APIs) much easier than the default generic message.
    //
    // NOTE: In Vite/Electron bundling, `instanceof FunctionsHttpError` can fail if multiple
    // copies of the class exist in the bundle graph, so we also fall back to `error.name`.
    const errAny = error as any;
    const errName: string | undefined = errAny?.name ?? errAny?.constructor?.name;
    const context = errAny?.context as any;

    const looksLikeResponse =
      context &&
      typeof context.status === "number" &&
      typeof context.statusText === "string" &&
      typeof context.headers?.get === "function" &&
      typeof context.clone === "function";

    const response: Response | undefined = looksLikeResponse ? (context as Response) : undefined;
    const statusLine = response ? `${response.status} ${response.statusText}`.trim() : "unknown";

    const payload = await (async () => {
      if (!response) return "";
      try {
        const contentType = response.headers.get("content-type") ?? "";
        const safeResponse = response.clone();
        if (contentType.includes("application/json")) {
          return JSON.stringify(await safeResponse.json());
        }
        return await safeResponse.text();
      } catch {
        return "";
      }
    })();

    if (error instanceof FunctionsHttpError || errName === "FunctionsHttpError") {
      throw new Error(
        payload
          ? `Sourcify Edge Function error (${statusLine}): ${payload}`
          : `Sourcify Edge Function error (${statusLine}).`,
      );
    }

    if (error instanceof FunctionsRelayError || errName === "FunctionsRelayError") {
      throw new Error(
        payload
          ? `Sourcify relay error (${statusLine}): ${payload}`
          : `Sourcify relay error (${statusLine}).`,
      );
    }

    if (error instanceof FunctionsFetchError || errName === "FunctionsFetchError") {
      throw new Error(`Sourcify network error: ${errAny?.message ?? String(error)}`);
    }

    // Last resort: always wrap into a normal Error so the UI shows something useful.
    throw new Error(errAny?.message ?? String(error));
  }

  if (!data) {
    throw new Error("Sourcify returned an empty response.");
  }

  return data as T;
}

type YoutubeDuration = "all" | "s" | "l";

function normalizeYoutubeDuration(value: unknown): YoutubeDuration | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "all") return "all";
  if (normalized === "s" || normalized === "short" || normalized === "shorts" || normalized === "small") return "s";
  if (normalized === "l" || normalized === "long") return "l";
  return undefined;
}

function normalizeSourcifyActorInput(
  actorKey: SourcifyActorKey,
  actorInput: Record<string, unknown>,
): Record<string, unknown> {
  if (actorKey !== "youtube-fast" && actorKey !== "youtube-shorts") return actorInput;
  if (!("duration" in actorInput)) return actorInput;
  const duration = normalizeYoutubeDuration((actorInput as any).duration);
  if (!duration) {
    throw new Error(`Invalid YouTube duration: ${JSON.stringify((actorInput as any).duration)}. Allowed values: "all", "s", "l".`);
  }
  return { ...actorInput, duration };
}


export async function planSourcifyTopic(
  topic: string,
  settings: Partial<SourcifySettings>,
): Promise<SourcifyPlan> {
  try {
    return await invokeSourcify<SourcifyPlan>({ action: "plan", topic, settings });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Falling back to local Sourcify plan:", error);
    }
    return buildLocalSourcifyPlan(topic, settings);
  }
}

export async function runSourcifyActor(input: {
  topic: string;
  actorKey: SourcifyActorKey;
  actorInput: Record<string, unknown>;
  settings: Partial<SourcifySettings>;
}): Promise<SourcifyRunResponse> {
  const normalizedActorInput = normalizeSourcifyActorInput(input.actorKey, input.actorInput);

  const response = await invokeSourcify<Partial<SourcifyRunResponse> & { items?: unknown[] }>({
    action: "run",
    topic: input.topic,
    actorKey: input.actorKey,
    input: normalizedActorInput,
    settings: input.settings,
  });

  const results = (
    response.results ??
    (response.items ?? []).map((item, index) => normalizeSourcifyResult(item, input.actorKey, index))
  ).map((result) => ({
    ...result,
    actorKey: result.actorKey ?? input.actorKey,
    runId: result.runId ?? response.runId,
    datasetId: result.datasetId ?? response.datasetId,
  }));

  return {
    runId: response.runId,
    datasetId: response.datasetId,
    status: response.status,
    usageTotalUsd: response.usageTotalUsd,
    results,
  };
}

export async function fetchSourcifyResults(input: {
  runId?: string;
  datasetId: string;
  actorKey?: SourcifyActorKey;
}): Promise<SourcifyResult[]> {
  const response = await invokeSourcify<{ results?: SourcifyResult[]; items?: unknown[] }>({
    action: "results",
    runId: input.runId,
    datasetId: input.datasetId,
    actorKey: input.actorKey,
  });
  return (
    response.results ??
    (response.items ?? []).map((item, index) => normalizeSourcifyResult(item, input.actorKey, index))
  ).map((result) => ({
    ...result,
    actorKey: result.actorKey ?? input.actorKey,
    runId: result.runId ?? input.runId,
    datasetId: result.datasetId ?? input.datasetId,
  }));
}

export async function finalizeSourcifyResults(input: {
  projectId?: string;
  assetCategory: "upload" | "finalized";
  results: SourcifyResult[];
}) {
  const missingProvenance = input.results.find((result) => !result.id || !result.runId || !result.datasetId);
  if (missingProvenance) {
    throw new Error(
      "A selected result is missing run/dataset provenance. Re-run Sourcify and select a fresh result.",
    );
  }

  return invokeSourcify<{
    success: boolean;
    assets: Array<{ resultId: string; assetId: string; url: string }>;
    skipped: Array<{ resultId: string; reason: string }>;
  }>({
    action: "finalize",
    projectId: input.projectId,
    assetCategory: input.assetCategory,
    results: input.results.map((result) => ({
      id: result.id,
      runId: result.runId!,
      datasetId: result.datasetId!,
      actorKey: result.actorKey,
      actorId: result.actorId,
      topic: result.topic,
    })),
  });
}

export const MAX_SOURCIFY_DOWNLOADS = 12;

export type SourcifyDownloadIssue = {
  resultId: string;
  code: "missing_url" | "invalid_url" | "expired_url" | "download_limit";
  message: string;
};

export type SourcifyDownloadOutcome = {
  opened: number;
  issues: SourcifyDownloadIssue[];
};

export function validateSourcifyDownloadUrl(
  value: unknown,
  nowMs = Date.now(),
): { ok: true; url: string } | { ok: false; code: "missing_url" | "invalid_url" | "expired_url"; message: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, code: "missing_url", message: "This result has no downloadable URL." };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: "invalid_url", message: "This result has an invalid download URL." };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    return { ok: false, code: "invalid_url", message: "Only public HTTP(S) download URLs are supported." };
  }

  const hostname = url.hostname.toLowerCase();
  const isGoogleVideo = hostname === "googlevideo.com" || hostname.endsWith(".googlevideo.com");
  if (isGoogleVideo && url.pathname.toLowerCase().includes("videoplayback")) {
    const expiresAtSeconds = Number(url.searchParams.get("expire"));
    if (Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0 && expiresAtSeconds * 1000 <= nowMs) {
      return {
        ok: false,
        code: "expired_url",
        message: "This Google Video download link has expired. Re-run the Sourcify downloader to refresh it.",
      };
    }
  }

  return { ok: true, url: url.toString() };
}

export function downloadSourcifyResults(results: SourcifyResult[]): SourcifyDownloadOutcome {
  const issues: SourcifyDownloadIssue[] = [];
  let opened = 0;

  for (const result of results.slice(0, MAX_SOURCIFY_DOWNLOADS)) {
    const url = result.mediaUrl ?? result.sourceUrl;
    const validation = validateSourcifyDownloadUrl(url);
    if ("code" in validation) {
      issues.push({ resultId: result.id, code: validation.code, message: validation.message });
      continue;
    }

    const anchor = document.createElement("a");
    anchor.href = validation.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.download = `${result.platform}-${result.title}`.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80) || "sourcify-media";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    opened += 1;
  }

  for (const result of results.slice(MAX_SOURCIFY_DOWNLOADS)) {
    issues.push({
      resultId: result.id,
      code: "download_limit",
      message: `Only the first ${MAX_SOURCIFY_DOWNLOADS} results can be downloaded at once.`,
    });
  }

  return { opened, issues };
}
