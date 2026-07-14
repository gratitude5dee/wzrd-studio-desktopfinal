// ============================================================================
// EDGE FUNCTION: sourcify-apify
// PURPOSE: Plan, run, fetch, and finalize Apify source discovery results
// ROUTE: POST /functions/v1/sourcify-apify
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, successResponse } from "../_shared/response.ts";
import {
  extractWzrdOpenAIText,
  normalizeWzrdProviderConfig,
} from "../_shared/wzrdAgentContract.ts";
import {
  createByteLimitedStream,
  fetchValidatedMedia,
  MAX_SOURCIFY_MEDIA_BYTES,
  resolveTrustedFinalizeResults,
  SourcifyMediaError,
  SourcifyProvenanceError,
  type DnsResolver,
  type SourcifyFinalizeReference,
} from "./finalize-media.ts";

type ActorKey =
  | "youtube-fast"
  | "youtube-shorts"
  | "youtube-downloader"
  | "tiktok-fast"
  | "instagram-fast"
  | "instagram-reels"
  | "twitch-video";

type Platform = "youtube" | "tiktok" | "instagram" | "twitch";
type Planner = "codex" | "deterministic" | "fallback";

type Settings = {
  maxItems?: number;
  maxTotalChargeUsd?: number;
  waitForFinishSecs?: number;
  includeDownloadableOnly?: boolean;
};

type ActorPlan = {
  id: string;
  targetId?: string;
  key: ActorKey;
  label: string;
  platform: Platform;
  actorId?: string;
  confidence: number;
  query: string;
  input: Record<string, unknown>;
  configured: boolean;
  reason: string;
  notes?: string[];
};

type TargetPlan = {
  id: string;
  label: string;
  query: string;
  rationale: string;
  actors: ActorPlan[];
};

type SourcifyPlan = {
  id: string;
  topic: string;
  planner: Planner;
  assistantMessage: string;
  metaprompt: string;
  actors: ActorPlan[];
  targets: TargetPlan[];
  settings: Required<Settings>;
  createdAt: string;
};

type SourcifyResult = {
  id: string;
  platform: Platform | "unknown";
  actorKey?: ActorKey;
  category: "video" | "short" | "reel" | "clip" | "profile" | "metadata";
  title: string;
  creator?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  downloadable: boolean;
  finalized?: boolean;
  // Provenance
  runId?: string;
  datasetId?: string;
  actorId?: string;
  topic?: string;
  scrapedAt?: string;
  raw: Record<string, unknown>;
};

type RequestBody =
  | { action: "plan"; topic?: string; settings?: Settings }
  | { action: "run"; topic?: string; actorKey?: ActorKey; input?: Record<string, unknown>; settings?: Settings }
  | { action: "results"; runId?: string; datasetId?: string; actorKey?: ActorKey; settings?: Settings }
  | {
      action: "finalize";
      projectId?: string;
      assetCategory?: "upload" | "finalized";
      results?: SourcifyFinalizeReference[];
    };

const APIFY_BASE_URL = "https://api.apify.com/v2";

const actorLabels: Record<ActorKey, { label: string; platform: Platform }> = {
  "youtube-fast": { label: "YouTube Fast", platform: "youtube" },
  "youtube-shorts": { label: "YouTube Shorts", platform: "youtube" },
  "youtube-downloader": { label: "YouTube Downloader", platform: "youtube" },
  "tiktok-fast": { label: "TikTok Fast", platform: "tiktok" },
  "instagram-fast": { label: "Instagram / Reels", platform: "instagram" },
  "instagram-reels": { label: "Instagram Reels Downloader", platform: "instagram" },
  "twitch-video": { label: "Twitch Video", platform: "twitch" },
};

const ACTOR_KEYS = Object.keys(actorLabels) as ActorKey[];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function safeSettingNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function topicTag(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80) || "creator";
}

function looksLikeUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function urlHost(value?: string): string {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function isYoutubeUrl(value?: string): boolean {
  const host = urlHost(value);
  return host.includes("youtube") || host.includes("youtu.be");
}

function isInstagramUrl(value?: string): boolean {
  return urlHost(value).includes("instagram");
}

function isTikTokUrl(value?: string): boolean {
  return urlHost(value).includes("tiktok");
}

function isTwitchUrl(value?: string): boolean {
  return urlHost(value).includes("twitch");
}

function handleOrTag(topic: string): string {
  return topicTag(topic.replace(/^@/, "")) || "creator";
}

function buildTikTokInput(topic: string, maxItems: number, includeDownloadableOnly: boolean) {
  const trimmed = topic.trim();
  const base = {
    resultsPerPage: maxItems,
    profileScrapeSections: ["videos"],
    profileSorting: "latest",
    excludePinnedPosts: false,
    maxFollowersPerProfile: 0,
    maxFollowingPerProfile: 0,
    maxProfilesPerQuery: 10,
    videoSearchSorting: "MOST_RELEVANT",
    videoSearchDateFilter: "ALL_TIME",
    scrapeRelatedVideos: false,
    shouldDownloadVideos: includeDownloadableOnly,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    commentsPerPost: 0,
    topLevelCommentsPerPost: 0,
    maxRepliesPerComment: 0,
    proxyCountryCode: "None",
  };

  if (isTikTokUrl(trimmed)) {
    if (/\/@[^/]+\/video\//i.test(trimmed)) {
      return { ...base, postURLs: [trimmed] };
    }
    const profile = trimmed.match(/tiktok\.com\/@([^/?#]+)/i)?.[1];
    return profile ? { ...base, profiles: [profile] } : { ...base, startUrls: [trimmed] };
  }

  if (trimmed.startsWith("#")) {
    return { ...base, hashtags: [handleOrTag(trimmed)] };
  }

  if (trimmed.startsWith("@")) {
    return { ...base, profiles: [handleOrTag(trimmed)] };
  }

  return { ...base, search: [trimmed], searchQueries: [trimmed] };
}

function registryActorId(key: ActorKey): string | undefined {
  const envKey = `SOURCIFY_${key.toUpperCase().replace(/-/g, "_")}_ACTOR_ID`;
  const override = Deno.env.get(envKey)?.trim();
  if (override) return override;
  switch (key) {
    case "youtube-fast":
    case "youtube-shorts":
      return "gXSReGYeawn5nwDhI";
    case "youtube-downloader":
      return "y1IMcEPawMQPafm02";
    case "instagram-fast":
      return "VLKR1emKm1YGLmiuZ";
    case "instagram-reels":
      return "Fj1zYgto86GELL443";
    case "twitch-video":
      return "bqneowjFSQBmAkILW";
    case "tiktok-fast":
      return Deno.env.get("SOURCIFY_TIKTOK_ACTOR_ID")?.trim() || "GdWCkxBtKWOsKjdch";
  }
}

function buildPlan(topic: string, settings: Settings = {}, planner: Planner = "deterministic", assistantMessage?: string): SourcifyPlan {
  const maxItems = safeSettingNumber(settings.maxItems, 50, 1, 1000);
  const trimmedTopic = topic.trim();
  const targetId = `target-${topicTag(trimmedTopic)}`;
  const urlInput = looksLikeUrl(trimmedTopic) ? trimmedTopic : undefined;
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedTopic)}`;
  const shortsSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${trimmedTopic} shorts`)}`;
  const instagramUrl = urlInput?.includes("instagram.com")
    ? urlInput
    : `https://www.instagram.com/explore/tags/${topicTag(trimmedTopic)}/`;
  const youtubeUrl = isYoutubeUrl(urlInput) ? urlInput : undefined;
  const instagramReelUrl = isInstagramUrl(urlInput) && /\/reel\//i.test(urlInput ?? "") ? urlInput : undefined;

  const actors = ([
    {
      key: "youtube-fast",
      label: actorLabels["youtube-fast"].label,
      platform: "youtube",
      actorId: registryActorId("youtube-fast"),
      confidence: 0.92,
      query: trimmedTopic,
      configured: Boolean(registryActorId("youtube-fast")),
      reason: "Best default for YouTube channels, search results, playlists, and long-form video metadata.",
      input: {
        startUrls: [youtubeUrl ?? searchUrl],
        gl: "us",
        hl: "en",
        uploadDate: "all",
        duration: "all",
        features: "all",
        sort: "r",
        maxItems,
      },
    },
    {
      key: "youtube-shorts",
      label: actorLabels["youtube-shorts"].label,
      platform: "youtube",
      actorId: registryActorId("youtube-shorts"),
      confidence: 0.84,
      query: `${trimmedTopic} shorts`,
      configured: Boolean(registryActorId("youtube-shorts")),
      reason: "Uses the YouTube actor with Shorts-oriented query settings for short-form source discovery.",
      input: {
        startUrls: [youtubeUrl?.includes("/shorts/") ? youtubeUrl : shortsSearchUrl],
        includeShorts: true,
        gl: "us",
        hl: "en",
        uploadDate: "all",
        duration: "s",
        features: "all",
        sort: "r",
        maxItems,
      },
    },
    {
      key: "youtube-downloader",
      label: actorLabels["youtube-downloader"].label,
      platform: "youtube",
      actorId: registryActorId("youtube-downloader"),
      confidence: youtubeUrl ? 0.88 : 0.35,
      query: trimmedTopic,
      configured: Boolean(youtubeUrl && registryActorId("youtube-downloader")),
      reason: youtubeUrl
        ? "Direct YouTube video downloader for saving source MP4s when a video or Shorts URL is provided."
        : "Paste a YouTube video or Shorts URL to enable direct YouTube downloading.",
      notes: youtubeUrl ? undefined : ["This actor is not selected for keyword-only searches."],
      input: {
        startUrls: [youtubeUrl ?? searchUrl],
        quality: "720",
        includeFailedVideos: false,
        proxy: {
          useApifyProxy: true,
        },
      },
    },
    {
      key: "instagram-fast",
      label: actorLabels["instagram-fast"].label,
      platform: "instagram",
      actorId: registryActorId("instagram-fast"),
      confidence: 0.78,
      query: trimmedTopic,
      configured: Boolean(registryActorId("instagram-fast")),
      reason: "Good for public Instagram profiles, hashtags, Reels, and engagement metadata.",
      input: {
        startUrls: [instagramUrl],
        getStories: false,
        maxItems,
      },
    },
    {
      key: "instagram-reels",
      label: actorLabels["instagram-reels"].label,
      platform: "instagram",
      actorId: registryActorId("instagram-reels"),
      confidence: instagramReelUrl ? 0.86 : 0.34,
      query: trimmedTopic,
      configured: Boolean(instagramReelUrl && registryActorId("instagram-reels")),
      reason: instagramReelUrl
        ? "Direct Instagram Reels downloader for preserving high-quality Reel media and metadata."
        : "Paste an Instagram Reel URL to enable direct Reel downloading.",
      notes: instagramReelUrl ? undefined : ["The fast Instagram scraper remains selected for profiles, hashtags, and discovery."],
      input: {
        links: [instagramReelUrl ?? instagramUrl],
        proxyConfiguration: {
          useApifyProxy: false,
          apifyProxyGroups: ["RESIDENTIAL"],
        },
      },
    },
    {
      key: "tiktok-fast",
      label: actorLabels["tiktok-fast"].label,
      platform: "tiktok",
      actorId: registryActorId("tiktok-fast"),
      confidence: 0.62,
      query: trimmedTopic,
      configured: Boolean(registryActorId("tiktok-fast")),
      reason: "Runs the configured TikTok actor for short-form source discovery.",
      notes: registryActorId("tiktok-fast")
        ? undefined
        : ["Set SOURCIFY_TIKTOK_ACTOR_ID or SOURCIFY_TIKTOK_FAST_ACTOR_ID before running this actor."],
      input: buildTikTokInput(trimmedTopic, maxItems, settings.includeDownloadableOnly === true),
    },
    {
      key: "twitch-video",
      label: actorLabels["twitch-video"].label,
      platform: "twitch",
      actorId: registryActorId("twitch-video"),
      confidence: isTwitchUrl(urlInput) ? 0.62 : 0.45,
      query: trimmedTopic,
      configured: Boolean(registryActorId("twitch-video")),
      reason: "Included from the pasted Apify context; output may be metadata-only depending on actor support.",
      notes: ["Twitch download availability depends on actor output and creator/content permissions."],
      input: {
        listingNotice: "No runtime input is required yet. See the README and product page for the current extension workflow.",
      },
    },
  ] satisfies Array<Omit<ActorPlan, "id" | "targetId">>).map((actor) => ({
    ...actor,
    id: `${targetId}:${actor.key}`,
    targetId,
  }));

  const resolvedSettings = {
    maxItems,
    maxTotalChargeUsd: Number(settings.maxTotalChargeUsd ?? 5),
    waitForFinishSecs: safeSettingNumber(settings.waitForFinishSecs, 30, 0, 60),
    includeDownloadableOnly: settings.includeDownloadableOnly === true,
  };

  return {
    id: `sourcify-${crypto.randomUUID()}`,
    topic: trimmedTopic,
    planner,
    assistantMessage: assistantMessage ?? "I built a deterministic Sourcify source plan from your prompt.",
    metaprompt: [
      "Given a user topic/person/keyword, select the smallest useful set of Apify actors.",
      "Prefer actors that can return direct downloadable media URLs, then metadata-rich scrapers.",
      `Topic: ${trimmedTopic}`,
    ].join("\n"),
    actors,
    targets: [
      {
        id: targetId,
        label: trimmedTopic,
        query: trimmedTopic,
        rationale: planner === "fallback"
          ? "Fallback target built directly from the Sourcify prompt."
          : "Deterministic target built directly from the Sourcify prompt.",
        actors,
      },
    ],
    settings: resolvedSettings,
    createdAt: new Date().toISOString(),
  };
}

type CodexTarget = {
  label?: unknown;
  query?: unknown;
  rationale?: unknown;
  actorKeys?: unknown;
};

type CodexPlan = {
  assistantMessage?: unknown;
  targets?: unknown;
};

const SOURCIFY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: { type: "string" },
    targets: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          query: { type: "string" },
          rationale: { type: "string" },
          actorKeys: {
            type: "array",
            minItems: 1,
            maxItems: ACTOR_KEYS.length,
            items: {
              type: "string",
              enum: ACTOR_KEYS,
            },
          },
        },
        required: ["label", "query", "rationale", "actorKeys"],
      },
    },
  },
  required: ["assistantMessage", "targets"],
};

function getWzrdProviderConfig() {
  return normalizeWzrdProviderConfig({
    rawProvider: Deno.env.get("WZRD_AGENT_PROVIDER") || "codex",
    model: Deno.env.get("WZRD_AGENT_MODEL") || "",
    fallbackModel: Deno.env.get("WZRD_AGENT_FALLBACK_MODEL") || "llama-3.3-70b-versatile",
    hasOpenAIKey: Boolean(Deno.env.get("OPENAI_API_KEY")),
    hasGroqKey: Boolean(Deno.env.get("GROQ_API_KEY")),
  });
}

function isActorKey(value: unknown): value is ActorKey {
  return typeof value === "string" && ACTOR_KEYS.includes(value as ActorKey);
}

function stableTargetId(query: string, index: number): string {
  return `target-${index + 1}-${topicTag(query)}`;
}

function codexInstructions() {
  return [
    "You are Sourcify Codex, a source-planning agent for WZRD Studio.",
    "Return strict JSON only.",
    "Turn the user's prompt into 1-5 scrape targets.",
    "Each target should be a focused keyword, hashtag, creator/profile handle, or URL.",
    "Pick actorKeys from the provided actor catalog.",
    "Use youtube-fast for broad YouTube discovery and youtube-shorts for short-form YouTube intent.",
    "Use youtube-downloader only for direct YouTube video or Shorts URLs.",
    "Use instagram-fast for Instagram hashtags/profiles/discovery and instagram-reels only for direct Reel URLs.",
    "Use tiktok-fast for TikTok hashtags, creators, keywords, or URLs.",
    "Use twitch-video only when the user asks for Twitch or provides a Twitch URL.",
    "Do not invent actor keys or Apify inputs.",
  ].join("\n");
}

async function postOpenAIResponse(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Responses API error (${response.status}): ${text.slice(0, 2000)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function callCodexPlanner(topic: string, settings: Settings = {}) {
  const config = getWzrdProviderConfig();
  if (config.provider !== "codex") {
    throw new Error(`WZRD_AGENT_PROVIDER is set to ${config.provider}; Sourcify Codex planning requires codex.`);
  }
  if (!config.ready) {
    throw new Error(config.setupErrors.join(" "));
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY")!;
  const response = await postOpenAIResponse(apiKey, {
    model: config.model,
    input: [
      { role: "system", content: codexInstructions() },
      {
        role: "user",
        content: JSON.stringify({
          prompt: topic,
          settings,
          actorCatalog: ACTOR_KEYS.map((key) => ({
            key,
            label: actorLabels[key].label,
            platform: actorLabels[key].platform,
          })),
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "sourcify_codex_plan",
        schema: SOURCIFY_PLAN_SCHEMA,
        strict: false,
      },
    },
  });

  const outputText = extractWzrdOpenAIText(response);
  if (!outputText) throw new Error("Codex returned no structured plan text.");
  const parsed = JSON.parse(outputText) as CodexPlan;
  const rawTargets = Array.isArray(parsed.targets) ? parsed.targets : [];
  const targets = rawTargets
    .map((item): CodexTarget => asRecord(item))
    .map((target) => {
      const query = asString(target.query);
      const label = asString(target.label) ?? query;
      const rationale = asString(target.rationale) ?? "Codex selected this target from your prompt.";
      const actorKeys = Array.isArray(target.actorKeys)
        ? target.actorKeys.filter(isActorKey)
        : [];
      return query ? { label, query, rationale, actorKeys } : null;
    })
    .filter((target): target is { label: string; query: string; rationale: string; actorKeys: ActorKey[] } => Boolean(target))
    .slice(0, 5);

  if (targets.length === 0) throw new Error("Codex returned no usable Sourcify targets.");
  return {
    assistantMessage: asString(parsed.assistantMessage) ?? "I mapped your prompt into Sourcify scrape targets.",
    targets,
  };
}

function buildPlanFromCodexTargets(
  topic: string,
  settings: Settings,
  codexPlan: Awaited<ReturnType<typeof callCodexPlanner>>,
): SourcifyPlan {
  const resolvedTargets = codexPlan.targets.map((target, index) => {
    const targetId = stableTargetId(target.query, index);
    const base = buildPlan(target.query, settings, "codex", codexPlan.assistantMessage);
    const selectedKeys = new Set(target.actorKeys.length > 0 ? target.actorKeys : ACTOR_KEYS);
    const actors = base.actors
      .filter((actor) => selectedKeys.has(actor.key))
      .map((actor) => ({
        ...actor,
        id: `${targetId}:${actor.key}`,
        targetId,
        query: target.query,
      }));

    return {
      id: targetId,
      label: target.label,
      query: target.query,
      rationale: target.rationale,
      actors: actors.length > 0 ? actors : base.actors.map((actor) => ({
        ...actor,
        id: `${targetId}:${actor.key}`,
        targetId,
        query: target.query,
      })),
    };
  });
  const actors = resolvedTargets.flatMap((target) => target.actors);
  const firstPlan = buildPlan(topic, settings, "codex", codexPlan.assistantMessage);

  return {
    ...firstPlan,
    planner: "codex",
    assistantMessage: codexPlan.assistantMessage,
    actors,
    targets: resolvedTargets,
    metaprompt: [
      "Codex decomposed the user prompt into platform-aware scrape targets.",
      "The server rebuilt all Apify actor inputs deterministically from those targets.",
      `Topic: ${topic}`,
    ].join("\n"),
  };
}

async function planSources(topic: string, settings: Settings = {}) {
  try {
    const codexPlan = await callCodexPlanner(topic, settings);
    return buildPlanFromCodexTargets(topic, settings, codexPlan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codex planner unavailable.";
    console.warn("[sourcify-apify] Codex planner fallback:", message);
    return buildPlan(
      topic,
      settings,
      "fallback",
      `Codex planner is unavailable, so I built a deterministic fallback plan. ${message}`,
    );
  }
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value) return value;
  }
  return undefined;
}

function nestedUrl(value: unknown): string | undefined {
  if (typeof value === "string") return asString(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = nestedUrl(item);
      if (url) return url;
    }
    return undefined;
  }
  const row = asRecord(value);
  const direct = firstString(row, ["url", "link", "src", "downloadUrl", "download_url"]);
  if (direct) return direct;
  for (const nestedValue of Object.values(row)) {
    const url = nestedUrl(nestedValue);
    if (url) return url;
  }
  return undefined;
}

function mediaUrl(row: Record<string, unknown>): string | undefined {
  return (
    firstString(row, [
      "mediaUrl",
      "media_url",
      "videoUrl",
      "video_url",
      "downloadUrl",
      "download_url",
      "playUrl",
      "play_url",
      "mp4Url",
      "mp4_url",
      "cached_url",
    ]) ??
    nestedUrl(row["media"]) ??
    nestedUrl(row["video"])
  );
}

function thumbnailUrl(row: Record<string, unknown>): string | undefined {
  return (
    firstString(row, [
      "thumbnailUrl",
      "thumbnail_url",
      "displayUrl",
      "display_url",
      "imageUrl",
      "image_url",
      "coverUrl",
      "cover_url",
    ]) ??
    nestedUrl(row["thumbnail"]) ??
    nestedUrl(row["thumbnails"]) ??
    nestedUrl(row["images"]) ??
    // Some actors (notably YouTube) nest thumbnail URLs under objects like snippet.thumbnails.high.url.
    // As a last resort, scan the entire row for nested url/src/link/downloadUrl fields.
    nestedUrl(row)
  );
}

function hostPlatform(value?: string): Platform | "unknown" {
  if (!value) return "unknown";
  try {
    const host = new URL(value).host.toLowerCase();
    if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("twitch")) return "twitch";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function categoryFor(row: Record<string, unknown>, actorKey?: ActorKey): SourcifyResult["category"] {
  const source = firstString(row, ["url", "sourceUrl", "source_url", "video_url", "videoUrl"]) ?? "";
  const type = String(row.type ?? row.kind ?? row.category ?? "").toLowerCase();
  if (actorKey === "youtube-shorts" || source.includes("/shorts/") || type.includes("short")) return "short";
  if ((actorKey === "instagram-fast" || actorKey === "instagram-reels") && (source.includes("/reel/") || type.includes("reel"))) return "reel";
  if (actorKey === "twitch-video" || type.includes("clip")) return "clip";
  if (type.includes("profile") || row.username || row.userName) return "profile";
  if (mediaUrl(row)) return "video";
  return "metadata";
}

function resultId(row: Record<string, unknown>, actorKey?: ActorKey, index = 0): string {
  const raw =
    firstString(row, ["id", "videoId", "video_id", "shortCode", "shortcode", "url", "sourceUrl"]) ??
    `${actorKey ?? "result"}-${index}`;
  return `${actorKey ?? "source"}-${raw}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function normalizeItem(item: unknown, actorKey?: ActorKey, index = 0): SourcifyResult {
  const row = asRecord(item);
  const sourceUrl = firstString(row, [
    "sourceUrl",
    "source_url",
    "url",
    "link",
    "permalink",
    "video_url",
    "videoUrl",
    "origin_url",
    "pageUrl",
    "page_url",
    "videoPageUrl",
    "video_page_url",
    "inputUrl",
    "input_url",
    "originalUrl",
    "original_url",
  ]);
  const resolvedMediaUrl = mediaUrl(row);
  const inferredPlatform = hostPlatform(sourceUrl ?? resolvedMediaUrl);
  const fallbackPlatform = actorKey ? actorLabels[actorKey].platform : "unknown";

  return {
    id: resultId(row, actorKey, index),
    platform: inferredPlatform === "unknown" ? fallbackPlatform : inferredPlatform,
    actorKey,
    category: categoryFor(row, actorKey),
    title:
      firstString(row, ["title", "caption", "description", "text", "videoTitle", "video_title"]) ??
      `${actorKey ? actorLabels[actorKey].label : "Source"} result ${index + 1}`,
    creator: firstString(row, [
      "creator",
      "author",
      "authorName",
      "author_name",
      "channelName",
      "channel_name",
      "username",
      "ownerUsername",
      "broadcaster_name",
    ]),
    sourceUrl,
    mediaUrl: resolvedMediaUrl,
    thumbnailUrl: thumbnailUrl(row),
    durationSeconds: asNumber(row.durationSeconds ?? row.duration_seconds ?? row.duration),
    publishedAt: firstString(row, ["publishedAt", "published_at", "publishDate", "created_at", "createdAt"]),
    metrics: {
      views: asNumber(row.views ?? row.viewCount ?? row.view_count),
      likes: asNumber(row.likes ?? row.likeCount ?? row.like_count),
      comments: asNumber(row.comments ?? row.commentCount ?? row.comment_count),
      shares: asNumber(row.shares ?? row.shareCount ?? row.share_count),
    },
    downloadable: Boolean(resolvedMediaUrl),
    raw: row,
  };
}

async function apifyFetch(path: string, init: RequestInit = {}) {
  const token = Deno.env.get("APIFY_API_TOKEN")?.trim();
  if (!token) throw new Error("APIFY_API_TOKEN is not configured.");

  const response = await fetch(`${APIFY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Apify request failed: ${response.status} ${response.statusText} ${text}`.trim());
  }
  return data;
}

async function actorRun(runId: string) {
  const response = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`, {
    method: "GET",
    headers: {},
  });
  const run = asRecord(response.data);
  return {
    defaultDatasetId: asString(run.defaultDatasetId),
    actorId: asString(run.actId ?? run.actorId),
  };
}

async function datasetItems(datasetId: string, actorKey?: ActorKey, settings: Settings = {}) {
  const limit = safeSettingNumber(settings.maxItems, 100, 1, 1000);
  const query = new URLSearchParams({
    clean: "true",
    format: "json",
    limit: String(limit),
  });
  const items = await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items?${query.toString()}`, {
    method: "GET",
    headers: {},
  });
  const rawItems = Array.isArray(items) ? items : [];
  const scrapedAt = new Date().toISOString();
  return rawItems
    .map((item, index) => normalizeItem(item, actorKey, index))
    .map((result) => ({ ...result, datasetId, scrapedAt }));
}

async function verifiedDatasetItems(
  runId: string,
  datasetId: string,
  actorKey?: ActorKey,
  settings: Settings = {},
) {
  const run = await actorRun(runId);
  if (!run.defaultDatasetId || run.defaultDatasetId !== datasetId) {
    throw new BadRequestError(
      "datasetId does not belong to the supplied Sourcify run. Re-run Sourcify and try again.",
    );
  }
  return (await datasetItems(datasetId, actorKey, settings)).map((result) => ({
    ...result,
    runId,
    datasetId,
    actorId: run.actorId,
  }));
}


class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
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

function normalizeActorInput(actorKey: ActorKey, input: Record<string, unknown>): Record<string, unknown> {
  if (actorKey !== "youtube-fast" && actorKey !== "youtube-shorts") return input;
  if (!("duration" in input)) return input;
  const duration = normalizeYoutubeDuration(input.duration);
  if (!duration) {
    throw new BadRequestError(
      `Invalid YouTube duration: ${JSON.stringify(input.duration)}. Allowed values: "all", "s", "l".`,
    );
  }
  return { ...input, duration };
}

async function runActor(body: Extract<RequestBody, { action: "run" }>) {
  if (!body.actorKey) throw new Error("actorKey is required.");
  const actorId = registryActorId(body.actorKey);
  if (!actorId) throw new Error(`${actorLabels[body.actorKey].label} actor ID is not configured.`);

  const settings = body.settings ?? {};
  const waitForFinish = safeSettingNumber(settings.waitForFinishSecs, 30, 0, 60);
  const params = new URLSearchParams({
    waitForFinish: String(waitForFinish),
  });
  params.set("maxItems", String(safeSettingNumber(settings.maxItems, 50, 1, 1000)));
  if (settings.maxTotalChargeUsd !== undefined) {
    params.set("maxTotalChargeUsd", String(Number(settings.maxTotalChargeUsd)));
  }

  const normalizedInput = normalizeActorInput(body.actorKey, asRecord(body.input));

  const runResponse = await apifyFetch(`/actors/${encodeURIComponent(actorId)}/runs?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(normalizedInput),
  });
  const run = asRecord(runResponse.data);
  const runId = asString(run.id);
  const datasetId = asString(run.defaultDatasetId);
  const status = asString(run.status);
  const terminal = ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(status ?? "");
  const results = datasetId && terminal ? await datasetItems(datasetId, body.actorKey, settings) : [];

  const topic = body.topic?.trim() || undefined;
  const scrapedAt = new Date().toISOString();
  const enrichedResults = results.map((result) => ({
    ...result,
    runId,
    datasetId,
    actorId,
    topic,
    scrapedAt,
  }));

  return {
    runId,
    datasetId,
    status,
    usageTotalUsd: asNumber(run.usageTotalUsd) ?? null,
    results: settings.includeDownloadableOnly ? enrichedResults.filter((result) => result.downloadable) : enrichedResults,
  };
}

function assetTypeFromMime(mimeType: string): "image" | "video" | "audio" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "other";
}

function extensionFromMime(mimeType: string, url: string): string {
  const knownExtensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "image/avif": "avif",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/mpeg": "mpeg",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
    "video/x-msvideo": "avi",
  };
  if (knownExtensions[mimeType]) return knownExtensions[mimeType];
  try {
    const fromPath = new URL(url).pathname.split(".").pop()?.toLowerCase();
    if (fromPath && /^[a-z0-9]{2,5}$/.test(fromPath)) return fromPath;
  } catch {
    // fall through
  }
  return "bin";
}

const resolveMediaDns: DnsResolver = async (hostname) => {
  const lookups = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA"),
  ]);
  return lookups.flatMap((lookup) => lookup.status === "fulfilled" ? lookup.value : []);
};

function sourcifyMediaByteLimit(): number {
  const configured = Number(Deno.env.get("SOURCIFY_MAX_MEDIA_BYTES"));
  if (!Number.isSafeInteger(configured) || configured <= 0) return MAX_SOURCIFY_MEDIA_BYTES;
  return Math.min(configured, MAX_SOURCIFY_MEDIA_BYTES);
}

class FinalizeItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalizeItemError";
  }
}

async function finalizeResults(
  body: Extract<RequestBody, { action: "finalize" }>,
  authHeader: string,
  userId: string,
) {
  const references = body.results ?? [];
  if (references.length === 0) throw new BadRequestError("results are required.");
  if (references.length > 50) throw new BadRequestError("A maximum of 50 results can be finalized at once.");

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  if (body.projectId) {
    const project = await supabaseClient
      .from("projects")
      .select("id")
      .eq("id", body.projectId)
      .eq("user_id", userId)
      .single();
    if (project.error || !project.data) throw new BadRequestError("Project not found or access denied.");
  }

  let trustedSelections: Awaited<ReturnType<typeof resolveTrustedFinalizeResults<SourcifyResult>>>;
  try {
    trustedSelections = await resolveTrustedFinalizeResults<SourcifyResult>({
      references,
      loadRun: actorRun,
      loadDataset: (datasetId, actorKey) => datasetItems(
        datasetId,
        isActorKey(actorKey) ? actorKey : undefined,
        { maxItems: 1000 },
      ),
    });
  } catch (error) {
    if (error instanceof SourcifyProvenanceError) throw new BadRequestError(error.message);
    console.error("[sourcify-apify] finalize provenance lookup failed", error instanceof Error ? error.name : "unknown");
    throw new Error("Could not verify Sourcify run provenance. Re-run Sourcify and try again.");
  }

  const assets: Array<{ resultId: string; assetId: string; url: string }> = [];
  const skipped: Array<{ resultId: string; reason: string }> = [];
  const maxMediaBytes = sourcifyMediaByteLimit();

  for (const selection of trustedSelections) {
    const result: SourcifyResult = {
      ...selection.item,
      runId: selection.reference.runId,
      datasetId: selection.reference.datasetId,
      actorId: selection.run.actorId,
      topic: selection.reference.topic,
    };
    const sourceUrl = result.mediaUrl ?? result.sourceUrl;
    if (!sourceUrl) {
      skipped.push({ resultId: result.id, reason: "The trusted dataset item has no downloadable media URL." });
      continue;
    }

    let attemptedStoragePath: string | undefined;
    try {
      const media = await fetchValidatedMedia({
        url: sourceUrl,
        resolveDns: resolveMediaDns,
        maxBytes: maxMediaBytes,
      });
      const limited = createByteLimitedStream(media.response.body!, {
        maxBytes: maxMediaBytes,
        expectedBytes: media.contentLength,
      });

      const assetType = assetTypeFromMime(media.contentType);
      const extension = extensionFromMime(media.contentType, media.finalUrl.toString());
      const safeTitle = result.title.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 60) || "sourcify";
      const fileName = `${safeTitle}.${extension}`;
      const storagePath = body.projectId
        ? `${userId}/${body.projectId}/${assetType}/${Date.now()}_${crypto.randomUUID()}_${fileName}`
        : `${userId}/${assetType}/${Date.now()}_${crypto.randomUUID()}_${fileName}`;
      attemptedStoragePath = storagePath;

      const upload = await supabaseClient.storage.from("project-assets").upload(storagePath, limited.stream, {
        contentType: media.contentType,
        cacheControl: "3600",
        upsert: false,
      });
      if (upload.error) {
        throw limited.getFailure() ?? new FinalizeItemError("The media could not be uploaded to project storage.");
      }
      const uploadedBytes = limited.getBytesRead();
      if (uploadedBytes !== media.contentLength) {
        throw new FinalizeItemError("The media upload did not complete at the declared Content-Length.");
      }

      const publicUrl = supabaseClient.storage.from("project-assets").getPublicUrl(storagePath).data.publicUrl;
      const inserted = await supabaseClient
        .from("project_assets")
        .insert({
          project_id: body.projectId ?? null,
          name: fileName,
          url: publicUrl,
          thumbnail_url: result.thumbnailUrl ?? publicUrl,
          type: assetType,
          size: uploadedBytes,
          metadata: {
            mime_type: media.contentType,
            storage_bucket: "project-assets",
            storage_path: storagePath,
            asset_category: body.assetCategory ?? "finalized",
            visibility: "private",
            original_file_name: fileName,
            user_id: userId,
            sourcify: {
              result_id: result.id,
              platform: result.platform,
              actor_key: result.actorKey ?? null,
              actor_id: result.actorId ?? null,
              run_id: result.runId ?? null,
              dataset_id: result.datasetId ?? null,
              topic: result.topic ?? null,
              scraped_at: result.scrapedAt ?? null,
              source_url: result.sourceUrl ?? null,
              media_url: result.mediaUrl ?? null,
              creator: result.creator ?? null,
              metrics: result.metrics,
              raw: result.raw,
            },
          },
        })
        .select("id,url")
        .single();

      if (inserted.error) {
        throw new FinalizeItemError("The media was uploaded, but its library record could not be saved.");
      }

      assets.push({ resultId: result.id, assetId: inserted.data.id, url: inserted.data.url });
      attemptedStoragePath = undefined;
    } catch (error) {
      if (attemptedStoragePath) {
        try {
          const cleanup = await supabaseClient.storage.from("project-assets").remove([attemptedStoragePath]);
          if (cleanup.error) {
            console.warn("[sourcify-apify] failed to clean up an attempted storage upload");
          }
        } catch {
          console.warn("[sourcify-apify] failed to clean up an attempted storage upload");
        }
      }
      skipped.push({
        resultId: result.id,
        reason: error instanceof SourcifyMediaError || error instanceof FinalizeItemError
          ? error.message
          : "The media could not be saved safely. Re-run Sourcify and try again.",
      });
    }
  }

  return { success: true, assets, skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as RequestBody;

    switch (body.action) {
      case "plan": {
        const topic = body.topic?.trim();
        if (!topic) return errorResponse("topic is required", 400);
        return successResponse(await planSources(topic, body.settings));
      }
      case "run":
        return successResponse(await runActor(body));
      case "results": {
        if (!body.datasetId) return errorResponse("datasetId is required", 400);
        const results = body.runId
          ? await verifiedDatasetItems(body.runId, body.datasetId, body.actorKey, body.settings)
          : await datasetItems(body.datasetId, body.actorKey, body.settings);
        return successResponse({ results });
      }
      case "finalize":
        return successResponse(await finalizeResults(body, authHeader, user.id), 201);
      default:
        return errorResponse("Unsupported action", 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof BadRequestError ? 400 : 500;
    return errorResponse(message, status);
  }
});
