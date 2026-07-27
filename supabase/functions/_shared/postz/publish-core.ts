import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import { decryptToken, encryptToken } from "./crypto.ts";
import { isPostzComposioEnabled, publishWithComposio } from "./composio.ts";
import { getPostzComposioProviderConfig } from "./composio-config.ts";
import { getProvider, isProviderConfigured } from "./providers/index.ts";
import type { ChannelRow, PostDetails, PostResponse, ProviderCapabilities } from "./providers/types.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

type MediaRef = {
  asset_id?: string | null;
  id?: string | null;
  url?: string | null;
  cdn_url?: string | null;
  cdnUrl?: string | null;
  preview_url?: string | null;
  previewUrl?: string | null;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  mime_type?: string | null;
  mimeType?: string | null;
  kind?: string | null;
  width?: number;
  height?: number;
  duration_seconds?: number;
  durationSeconds?: number;
  size_bytes?: number;
  sizeBytes?: number;
};

type PostRow = {
  id: string;
  owner_id: string;
  channel_id: string;
  group_id: string;
  state: string;
  publish_date: string;
  content: string;
  title: string | null;
  description: string | null;
  settings: Record<string, unknown> | null;
  media: unknown;
  poll: unknown;
  parent_post_id: string | null;
  first_comment: string | null;
  release_url: string | null;
  release_provider_id: string | null;
  error: string | null;
  attempts: number;
  interval_in_days: number | null;
  creation_method: string;
  deleted_at: string | null;
};

export type PublishResult = {
  post_id: string;
  channel_id: string;
  group_id: string;
  state: "published" | "skipped" | "error";
  release_url?: string | null;
  release_provider_id?: string | null;
  error?: string;
  retryable?: boolean;
};

export type PublishGroupResult = {
  group_id: string;
  results: PublishResult[];
  next_group_id?: string | null;
};

export class PublishCoreError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "PublishCoreError";
    this.retryable = retryable;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asMediaRefs(value: unknown): MediaRef[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item) as MediaRef);
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function mediaKindFrom(input: { explicit?: string | null; mime?: string | null; assetType?: string | null }): "image" | "video" {
  const explicit = input.explicit?.toLowerCase();
  if (explicit === "video" || explicit === "image") return explicit;
  const mime = input.mime?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  const assetType = input.assetType?.toLowerCase();
  return assetType === "video" ? "video" : "image";
}

function bestUrlFromAsset(asset: Record<string, unknown>): string | null {
  const metadata = asRecord(asset.media_metadata ?? asset.metadata);
  return (
    asString(asset.cdn_url) ??
    asString(asset.preview_url) ??
    asString(asset.url) ??
    asString(metadata.cdn_url) ??
    asString(metadata.preview_url) ??
    asString(metadata.url) ??
    null
  );
}

async function resolveAssetUrl(input: {
  supabaseAdmin: SupabaseAdmin;
  ownerId: string;
  ref: MediaRef;
}): Promise<{ url: string; kind: "image" | "video"; meta: Record<string, unknown> }> {
  const directUrl = asString(input.ref.cdn_url ?? input.ref.cdnUrl) ?? asString(input.ref.url);
  if (isHttpUrl(directUrl)) {
    return {
      url: directUrl,
      kind: mediaKindFrom({ explicit: input.ref.kind, mime: input.ref.mime_type ?? input.ref.mimeType }),
      meta: {
        width: input.ref.width,
        height: input.ref.height,
        duration_seconds: input.ref.duration_seconds ?? input.ref.durationSeconds,
        size_bytes: input.ref.size_bytes ?? input.ref.sizeBytes,
      },
    };
  }

  const assetId = asString(input.ref.asset_id ?? input.ref.id);
  if (!assetId) {
    throw new PublishCoreError("Media is missing a URL or asset id.", false);
  }

  const { data: asset, error } = await input.supabaseAdmin
    .from("project_assets")
    .select("*")
    .eq("id", assetId)
    .maybeSingle();

  if (error) throw error;
  if (!asset) {
    throw new PublishCoreError(`Media asset ${assetId} was not found.`, false);
  }

  const row = asset as unknown as Record<string, unknown>;
  const rowOwner = asString(row.user_id);
  if (rowOwner && rowOwner !== input.ownerId) {
    throw new PublishCoreError("Media asset does not belong to this user.", false);
  }

  const metadata = asRecord(row.media_metadata ?? row.metadata);
  const publicUrl = bestUrlFromAsset(row);
  if (isHttpUrl(publicUrl)) {
    return {
      url: publicUrl,
      kind: mediaKindFrom({
        explicit: asString(row.asset_type ?? row.type),
        mime: asString(row.mime_type ?? metadata.mime_type),
        assetType: asString(row.asset_type ?? row.type),
      }),
      meta: metadata,
    };
  }

  const bucket = asString(row.storage_bucket ?? metadata.storage_bucket);
  const path = asString(row.storage_path ?? metadata.storage_path);
  if (!bucket || !path) {
    throw new PublishCoreError(`Media asset ${assetId} does not have a publishable URL.`, false);
  }

  const { data: signed, error: signError } = await input.supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 6);

  if (signError || !signed?.signedUrl) {
    throw new PublishCoreError(`Unable to sign media asset ${assetId}.`, true);
  }

  return {
    url: signed.signedUrl,
    kind: mediaKindFrom({
      explicit: asString(row.asset_type ?? row.type),
      mime: asString(row.mime_type ?? metadata.mime_type),
      assetType: asString(row.asset_type ?? row.type),
    }),
    meta: metadata,
  };
}

async function buildPostDetails(input: {
  supabaseAdmin: SupabaseAdmin;
  post: PostRow;
  provider: string;
}): Promise<PostDetails> {
  const media = await Promise.all(
    asMediaRefs(input.post.media).map(async (ref) => {
      const resolved = await resolveAssetUrl({ supabaseAdmin: input.supabaseAdmin, ownerId: input.post.owner_id, ref });
      return {
        id: asString(ref.asset_id ?? ref.id) ?? crypto.randomUUID(),
        url: resolved.url,
        type: resolved.kind,
        meta: resolved.meta,
      };
    }),
  );

  return {
    id: input.post.id,
    message: input.post.content ?? "",
    settings: {
      __type: input.provider,
      title: input.post.title,
      description: input.post.description,
      ...(input.post.settings ?? {}),
    },
    media,
    poll: input.post.poll as PostDetails["poll"],
  };
}

function validatePostDetails(input: {
  capabilities: ProviderCapabilities;
  details: PostDetails;
  title?: string | null;
}) {
  const { capabilities, details } = input;
  const message = details.message ?? "";
  const media = details.media ?? [];
  const imageCount = media.filter((item) => item.type === "image").length;
  const videoCount = media.filter((item) => item.type === "video").length;

  if (message.length > capabilities.text.maxLength) {
    throw new PublishCoreError(`Content exceeds ${capabilities.text.maxLength} characters.`, false);
  }

  if (capabilities.title && !asString(input.title)) {
    throw new PublishCoreError("Title is required for this provider.", false);
  }

  if (capabilities.media.required && media.length === 0) {
    throw new PublishCoreError("Media is required for this provider.", false);
  }

  if (!capabilities.media.images && imageCount > 0) {
    throw new PublishCoreError("Images are not supported by this provider.", false);
  }

  if (!capabilities.media.video && videoCount > 0) {
    throw new PublishCoreError("Video is not supported by this provider.", false);
  }

  if (capabilities.media.maxImages > 0 && imageCount > capabilities.media.maxImages) {
    throw new PublishCoreError(`Too many images for this provider.`, false);
  }

  if (videoCount > 1) {
    throw new PublishCoreError("Only one video can be published at a time.", false);
  }
}

async function writePublishLog(input: {
  supabaseAdmin: SupabaseAdmin;
  post: PostRow;
  attempt: number;
  outcome: string;
  detail: Record<string, unknown>;
}) {
  await input.supabaseAdmin.from("postz_publish_log").insert({
    owner_id: input.post.owner_id,
    post_id: input.post.id,
    channel_id: input.post.channel_id,
    attempt: input.attempt,
    outcome: input.outcome,
    detail: input.detail,
  });
}

function classifyError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof PublishCoreError) {
    return { message: error.message, retryable: error.retryable };
  }

  const message = error instanceof Error ? error.message : String(error);
  const retryable = /\b(429|500|502|503|504)\b|rate limit|temporar|timeout|network/i.test(message);
  return { message, retryable };
}

async function markPostError(input: {
  supabaseAdmin: SupabaseAdmin;
  post: PostRow;
  error: unknown;
}): Promise<PublishResult> {
  const attempt = (input.post.attempts ?? 0) + 1;
  const classified = classifyError(input.error);
  const errorText = `${classified.retryable ? "[retryable]" : "[terminal]"} ${classified.message}`.slice(0, 2000);

  await input.supabaseAdmin
    .from("postz_posts")
    .update({
      state: "ERROR",
      error: errorText,
      attempts: attempt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.post.id);

  await writePublishLog({
    supabaseAdmin: input.supabaseAdmin,
    post: input.post,
    attempt,
    outcome: "error",
    detail: { error: classified.message, retryable: classified.retryable },
  });

  return {
    post_id: input.post.id,
    channel_id: input.post.channel_id,
    group_id: input.post.group_id,
    state: "error",
    error: classified.message,
    retryable: classified.retryable,
  };
}

async function claimPost(input: {
  supabaseAdmin: SupabaseAdmin;
  postId: string;
  ownerId?: string | null;
  allowDraft?: boolean;
}): Promise<PostRow | null> {
  const states = input.allowDraft ? ["DRAFT", "QUEUE", "ERROR"] : ["QUEUE", "ERROR"];
  let query = input.supabaseAdmin
    .from("postz_posts")
    .update({
      state: "PUBLISHING",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.postId)
    .in("state", states)
    .is("deleted_at", null);

  if (input.ownerId) query = query.eq("owner_id", input.ownerId);

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  return data as unknown as PostRow | null;
}

async function loadChannel(input: {
  supabaseAdmin: SupabaseAdmin;
  post: PostRow;
}): Promise<ChannelRow & { token_ref?: string | null; refresh_token_ref?: string | null; profile?: unknown }> {
  const { data, error } = await input.supabaseAdmin
    .from("postz_channels")
    .select("*")
    .eq("id", input.post.channel_id)
    .eq("owner_id", input.post.owner_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PublishCoreError("Connected channel was not found.", false);
  const channel = data as unknown as ChannelRow & {
    token_ref?: string | null;
    refresh_token_ref?: string | null;
    profile?: unknown;
  };
  if (channel.disabled || channel.status !== "connected") {
    throw new PublishCoreError("Channel is not connected.", false);
  }
  if (String(channel.token_ref ?? "").startsWith("seed:") || asRecord(channel.profile).seeded === true) {
    throw new PublishCoreError("Demo channels cannot publish. Connect a real channel first.", false);
  }
  return channel;
}

async function getAccessToken(input: {
  supabaseAdmin: SupabaseAdmin;
  provider: NonNullable<ReturnType<typeof getProvider>>;
  channel: ChannelRow & { token_ref?: string | null; refresh_token_ref?: string | null };
}): Promise<string> {
  if (!input.channel.token_ref) {
    throw new PublishCoreError("Channel is missing an access token.", false);
  }

  const expiresAt = input.channel.token_expires_at ? new Date(input.channel.token_expires_at).getTime() : null;
  const expiresSoon = expiresAt !== null && expiresAt < Date.now() + 5 * 60 * 1000;
  if (!expiresSoon) {
    return decryptToken(input.channel.token_ref);
  }

  if (!input.channel.refresh_token_ref) {
    await input.supabaseAdmin.from("postz_channels").update({ status: "needs_reauth" }).eq("id", input.channel.id);
    throw new PublishCoreError("Channel needs to be reconnected.", false);
  }

  try {
    const refreshToken = await decryptToken(input.channel.refresh_token_ref);
    const refreshed = await input.provider.refreshToken(refreshToken);
    const tokenRef = await encryptToken(refreshed.accessToken);
    const refreshRef = refreshed.refreshToken
      ? await encryptToken(refreshed.refreshToken)
      : input.channel.refresh_token_ref;
    const nextExpiresAt = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
      : input.channel.token_expires_at;

    await input.supabaseAdmin
      .from("postz_channels")
      .update({
        token_ref: tokenRef,
        refresh_token_ref: refreshRef,
        token_expires_at: nextExpiresAt,
        status: "connected",
      })
      .eq("id", input.channel.id);

    return refreshed.accessToken;
  } catch (error) {
    await input.supabaseAdmin.from("postz_channels").update({ status: "needs_reauth" }).eq("id", input.channel.id);
    const message = error instanceof Error ? error.message : String(error);
    throw new PublishCoreError(`Channel token refresh failed: ${message}`, false);
  }
}

async function publishClaimedPost(input: {
  supabaseAdmin: SupabaseAdmin;
  post: PostRow;
}): Promise<PublishResult> {
  try {
    const channel = await loadChannel(input);
    const provider = getProvider(channel.provider);
    const details = await buildPostDetails({
      supabaseAdmin: input.supabaseAdmin,
      post: input.post,
      provider: provider?.identifier ?? channel.provider,
    });

    if (provider) {
      validatePostDetails({ capabilities: provider.capabilities, details, title: input.post.title });
    }

    const useComposio =
      asRecord(channel.profile).composio === true ||
      String(channel.token_ref ?? "").startsWith("composio:") ||
      (isPostzComposioEnabled() && Boolean(getPostzComposioProviderConfig(channel.provider)));

    let responses: PostResponse[];
    if (useComposio) {
      responses = await publishWithComposio({
        ownerId: input.post.owner_id,
        channel,
        details,
      });
    } else {
      if (!provider) throw new PublishCoreError("Unsupported provider.", false);
      if (!isProviderConfigured(provider)) {
        throw new PublishCoreError("Provider is not configured for publishing.", false);
      }

      const accessToken = await getAccessToken({ supabaseAdmin: input.supabaseAdmin, provider, channel });
      responses = await provider.post(channel, accessToken, [details]);
    }
    const first = responses[0] as PostResponse | undefined;
    const attempt = (input.post.attempts ?? 0) + 1;

    await input.supabaseAdmin
      .from("postz_posts")
      .update({
        state: "PUBLISHED",
        release_url: first?.releaseURL ?? null,
        release_provider_id: first?.postId ?? first?.id ?? null,
        error: null,
        attempts: attempt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.post.id);

    await writePublishLog({
      supabaseAdmin: input.supabaseAdmin,
      post: input.post,
      attempt,
      outcome: "published",
      detail: { provider: provider?.identifier ?? channel.provider, source: useComposio ? "composio" : "native", responses },
    });

    return {
      post_id: input.post.id,
      channel_id: input.post.channel_id,
      group_id: input.post.group_id,
      state: "published",
      release_url: first?.releaseURL ?? null,
      release_provider_id: first?.postId ?? first?.id ?? null,
    };
  } catch (error) {
    return markPostError({ supabaseAdmin: input.supabaseAdmin, post: input.post, error });
  }
}

async function loadPost(input: {
  supabaseAdmin: SupabaseAdmin;
  postId: string;
  ownerId?: string | null;
}): Promise<PostRow | null> {
  let query = input.supabaseAdmin
    .from("postz_posts")
    .select("*")
    .eq("id", input.postId)
    .is("deleted_at", null);

  if (input.ownerId) query = query.eq("owner_id", input.ownerId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as PostRow | null;
}

export async function publishPostById(input: {
  supabaseAdmin: SupabaseAdmin;
  postId: string;
  ownerId?: string | null;
  allowDraft?: boolean;
}): Promise<PublishResult> {
  const claimed = await claimPost(input);
  if (!claimed) {
    const existing = await loadPost(input);
    if (existing?.state === "PUBLISHED") {
      return {
        post_id: existing.id,
        channel_id: existing.channel_id,
        group_id: existing.group_id,
        state: "skipped",
        release_url: existing.release_url,
        release_provider_id: existing.release_provider_id,
      };
    }
    throw new PublishCoreError("Post is not publishable in its current state.", false);
  }

  return publishClaimedPost({ supabaseAdmin: input.supabaseAdmin, post: claimed });
}

async function cloneRecurringGroup(input: {
  supabaseAdmin: SupabaseAdmin;
  posts: PostRow[];
  intervalDays: number;
}): Promise<string | null> {
  if (!Number.isFinite(input.intervalDays) || input.intervalDays < 1) return null;

  const nextGroupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = input.posts.map((post) => ({
    owner_id: post.owner_id,
    channel_id: post.channel_id,
    group_id: nextGroupId,
    state: "QUEUE",
    publish_date: addDays(post.publish_date, input.intervalDays),
    content: post.content,
    title: post.title,
    description: post.description,
    settings: post.settings,
    media: post.media,
    poll: post.poll,
    parent_post_id: null,
    first_comment: post.first_comment,
    release_url: null,
    release_provider_id: null,
    error: null,
    attempts: 0,
    interval_in_days: input.intervalDays,
    creation_method: "autopost",
    created_at: now,
    updated_at: now,
  }));

  const { error } = await input.supabaseAdmin.from("postz_posts").insert(rows);
  if (error) throw error;
  return nextGroupId;
}

export async function publishGroupById(input: {
  supabaseAdmin: SupabaseAdmin;
  groupId: string;
  ownerId?: string | null;
  allowDraft?: boolean;
  cloneRecurrence?: boolean;
}): Promise<PublishGroupResult> {
  let query = input.supabaseAdmin
    .from("postz_posts")
    .select("*")
    .eq("group_id", input.groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (input.ownerId) query = query.eq("owner_id", input.ownerId);

  const { data, error } = await query;
  if (error) throw error;
  const posts = (data ?? []) as unknown as PostRow[];
  if (posts.length === 0) throw new PublishCoreError("Post group was not found.", false);

  const results: PublishResult[] = [];
  for (const post of posts) {
    if (post.state === "PUBLISHED") {
      results.push({
        post_id: post.id,
        channel_id: post.channel_id,
        group_id: post.group_id,
        state: "skipped",
        release_url: post.release_url,
        release_provider_id: post.release_provider_id,
      });
      continue;
    }

    if (post.error?.startsWith("[terminal]") && post.state === "ERROR") {
      results.push({
        post_id: post.id,
        channel_id: post.channel_id,
        group_id: post.group_id,
        state: "skipped",
        error: post.error,
        retryable: false,
      });
      continue;
    }

    results.push(await publishPostById({
      supabaseAdmin: input.supabaseAdmin,
      postId: post.id,
      ownerId: input.ownerId ?? null,
      allowDraft: input.allowDraft,
    }));
  }

  const publishedNow = results.some((result) => result.state === "published");
  const anyError = results.some((result) => result.state === "error");
  const intervalDays = posts.find((post) => (post.interval_in_days ?? 0) > 0)?.interval_in_days ?? null;
  const nextGroupId = input.cloneRecurrence !== false && publishedNow && !anyError && intervalDays
    ? await cloneRecurringGroup({ supabaseAdmin: input.supabaseAdmin, posts, intervalDays })
    : null;

  return {
    group_id: input.groupId,
    results,
    next_group_id: nextGroupId,
  };
}

export function createPostzAdminClient(): SupabaseAdmin {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new PublishCoreError("Supabase admin credentials are not configured.", false);
  }
  return createClient(url, serviceKey);
}
