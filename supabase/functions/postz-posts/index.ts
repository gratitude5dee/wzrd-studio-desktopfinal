import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";

type PostState = "DRAFT" | "QUEUE" | "PUBLISHING" | "PUBLISHED" | "ERROR";

type MediaRef = {
  asset_id: string;
  url?: string | null;
  cdn_url?: string | null;
  mime_type?: string | null;
  kind?: string | null;
  width?: number;
  height?: number;
  duration_seconds?: number;
  size_bytes?: number;
};

type GroupCreateChannel = {
  channel_id: string;
  content: string;
  title?: string | null;
  description?: string | null;
  media?: MediaRef[];
  settings?: Record<string, unknown> | null;
  poll?: Record<string, unknown> | null;
  first_comment?: string | null;
};

type GroupCreate = {
  publish_date: string;
  state: PostState;
  channels: GroupCreateChannel[];
  tags?: string[];
  repeat?: { interval_in_days: number } | null;
};

type Body =
  | { action: "list"; from: string; to: string; state?: string | null }
  | { action: "get"; id: string }
  | { action: "get-group"; group_id: string }
  | { action: "create"; group: GroupCreate }
  | { action: "update"; group_id: string; group: GroupCreate }
  | { action: "update-date"; id?: string; group_id?: string; publish_date: string }
  | { action: "delete"; group_id: string }
  | { action: "duplicate"; group_id: string }
  | { action: "validate"; group: GroupCreate }
  | { action: "find-slot"; channel_id?: string | null }
  | { action: "post-now"; group_id: string };

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function invokePostzPublishGroup(groupId: string, authHeader: string | null) {
  const base = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const res = await fetch(`${base}/functions/v1/postz-publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ action: "publish-group", group_id: groupId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Postz publish failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isDemoChannel(row: Record<string, unknown>): boolean {
  return (
    asRecord(row.profile).seeded === true ||
    String(row.token_ref ?? "").startsWith("seed:") ||
    String(row.provider_account_id ?? "").includes(":seed:")
  );
}

async function getGroupDemoStatus(input: {
  supabaseAdmin: any;
  ownerId: string;
  groupId: string;
}): Promise<{ found: boolean; hasDemoChannel: boolean }> {
  const { data: posts, error: postsError } = await input.supabaseAdmin
    .from("postz_posts")
    .select("channel_id")
    .eq("owner_id", input.ownerId)
    .eq("group_id", input.groupId)
    .is("deleted_at", null);
  if (postsError) throw postsError;

  const channelIds = [...new Set(((posts ?? []) as unknown as Array<Record<string, unknown>>)
    .map((post) => asString(post.channel_id))
    .filter((id): id is string => Boolean(id)))];

  if (channelIds.length === 0) return { found: false, hasDemoChannel: false };

  const { data: channels, error: channelsError } = await input.supabaseAdmin
    .from("postz_channels")
    .select("id,token_ref,profile,provider_account_id")
    .eq("owner_id", input.ownerId)
    .in("id", channelIds)
    .is("deleted_at", null);
  if (channelsError) throw channelsError;

  return {
    found: true,
    hasDemoChannel: ((channels ?? []) as unknown as Array<Record<string, unknown>>).some(isDemoChannel),
  };
}

function asMediaArray(value: unknown): MediaRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .map((row) => ({
      asset_id: asString(row.asset_id ?? row.assetId ?? row.id) ?? "",
      url: asString(row.url),
      cdn_url: asString(row.cdn_url ?? row.cdnUrl),
      mime_type: asString(row.mime_type ?? row.mimeType),
      kind: asString(row.kind),
      width: typeof row.width === "number" ? row.width : undefined,
      height: typeof row.height === "number" ? row.height : undefined,
      duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : undefined,
      size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : undefined,
    }))
    .filter((row) => Boolean(row.asset_id));
}

type Capability = {
  maxLength: number;
  maxMedia: number;
  mediaRequired: boolean;
  titleRequired: boolean;
};

const DEFAULT_CAPABILITIES: Capability = {
  maxLength: 2200,
  maxMedia: 10,
  mediaRequired: false,
  titleRequired: false,
};

const CAPABILITIES_BY_PROVIDER: Record<string, Capability> = {
  x: { maxLength: 280, maxMedia: 4, mediaRequired: false, titleRequired: false },
  tiktok: { maxLength: 2200, maxMedia: 1, mediaRequired: true, titleRequired: false },
  instagram: { maxLength: 2200, maxMedia: 10, mediaRequired: true, titleRequired: false },
  threads: { maxLength: 500, maxMedia: 10, mediaRequired: false, titleRequired: false },
  youtube: { maxLength: 5000, maxMedia: 1, mediaRequired: true, titleRequired: true },
  linkedin: { maxLength: 3000, maxMedia: 9, mediaRequired: false, titleRequired: false },
  "linkedin-page": { maxLength: 3000, maxMedia: 9, mediaRequired: false, titleRequired: false },
};

function validateAgainstCapabilities(input: {
  provider: string;
  content: string;
  title?: string | null;
  media: MediaRef[];
}): { issues: Array<{ level: "error" | "warning"; message: string }> } {
  const provider = input.provider;
  const cap = CAPABILITIES_BY_PROVIDER[provider] ?? DEFAULT_CAPABILITIES;
  const issues: Array<{ level: "error" | "warning"; message: string }> = [];

  if ((input.content ?? "").length > cap.maxLength) {
    issues.push({ level: "error", message: `Content exceeds ${cap.maxLength} characters for ${provider}.` });
  }

  if (cap.titleRequired && !asString(input.title)) {
    issues.push({ level: "error", message: `Title is required for ${provider}.` });
  }

  if (input.media.length > cap.maxMedia) {
    issues.push({ level: "error", message: `Too many media attachments for ${provider} (max ${cap.maxMedia}).` });
  }

  if (cap.mediaRequired && input.media.length === 0) {
    issues.push({ level: "error", message: `Media is required for ${provider}.` });
  }

  return { issues };
}

function computeNextSlot(postingTimes: Array<{ time?: unknown }>, now: Date): Date {
  const times = postingTimes
    .map((row) => (typeof row.time === "number" ? row.time : Number(row.time)))
    .filter((value) => Number.isFinite(value) && value >= 0 && value < 24 * 60)
    .sort((a, b) => a - b);

  if (times.length === 0) {
    const fallback = new Date(now);
    fallback.setMinutes(fallback.getMinutes() + 15);
    return fallback;
  }

  const todayMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  for (const minutes of times) {
    const candidate = new Date(todayMidnightUtc.getTime() + minutes * 60_000);
    if (candidate.getTime() > now.getTime()) return candidate;
  }

  const tomorrowMidnightUtc = new Date(todayMidnightUtc.getTime() + 24 * 60 * 60_000);
  return new Date(tomorrowMidnightUtc.getTime() + times[0] * 60_000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as Body;

    const supabaseAdmin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

    switch (body.action) {
      case "list": {
        const from = new Date(body.from);
        const to = new Date(body.to);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          return errorResponse("Invalid from/to range", 400);
        }

        const query = supabaseAdmin
          .from("postz_posts")
          .select("*")
          .eq("owner_id", user.id)
          .is("deleted_at", null)
          .gte("publish_date", from.toISOString())
          .lte("publish_date", to.toISOString())
          .order("publish_date", { ascending: true });

        if (body.state) {
          query.eq("state", body.state);
        }

        const { data, error } = await query;
        if (error) throw error;
        return successResponse({ posts: data ?? [] });
      }

      case "get": {
        const { data, error } = await supabaseAdmin
          .from("postz_posts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("id", body.id)
          .is("deleted_at", null)
          .single();
        if (error) throw error;
        return successResponse({ post: data });
      }

      case "get-group": {
        const { data, error } = await supabaseAdmin
          .from("postz_posts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("group_id", body.group_id)
          .is("deleted_at", null)
          .order("publish_date", { ascending: true });
        if (error) throw error;
        return successResponse({ group_id: body.group_id, posts: data ?? [] });
      }

      case "validate": {
        const group = body.group;
        const channelIds = group.channels.map((ch) => ch.channel_id);
        if (channelIds.length === 0) return errorResponse("channels are required", 400);

        const { data: channels, error } = await supabaseAdmin
          .from("postz_channels")
          .select("id,provider,token_ref,profile,provider_account_id")
          .eq("owner_id", user.id)
          .in("id", channelIds)
          .is("deleted_at", null);
        if (error) throw error;

        const providerByChannel = new Map<string, string>();
        for (const channel of (channels ?? []) as unknown as Array<Record<string, unknown>>) {
          const id = asString(channel.id);
          if (id) providerByChannel.set(id, String(channel.provider ?? "unknown"));
        }

        const per_channel = group.channels.map((ch) => {
          const provider = providerByChannel.get(ch.channel_id) ?? "unknown";
          const media = asMediaArray(ch.media);
          const res = validateAgainstCapabilities({ provider, content: ch.content ?? "", title: ch.title ?? null, media });
          return { channel_id: ch.channel_id, issues: res.issues };
        });

        return successResponse({ per_channel });
      }

      case "create": {
        const group = body.group;
        const publishDate = new Date(group.publish_date);
        if (Number.isNaN(publishDate.getTime())) return errorResponse("Invalid publish_date", 400);

        if (!group.channels?.length) return errorResponse("channels are required", 400);

        // Load channel providers for validation.
        const channelIds = group.channels.map((ch) => ch.channel_id);
        const { data: channels, error: channelsError } = await supabaseAdmin
          .from("postz_channels")
          .select("id,provider,token_ref,profile,provider_account_id")
          .eq("owner_id", user.id)
          .in("id", channelIds)
          .is("deleted_at", null);
        if (channelsError) throw channelsError;

        const channelRows = (channels ?? []) as unknown as Array<Record<string, unknown>>;
        if (group.state === "QUEUE" && channelRows.some(isDemoChannel)) {
          return errorResponse("Demo channels cannot be scheduled or published. Connect a real channel first.", 400);
        }

        const providerByChannel = new Map<string, string>();
        for (const channel of channelRows) {
          const id = asString(channel.id);
          if (id) providerByChannel.set(id, String(channel.provider ?? "unknown"));
        }

        const validation = group.channels.map((ch) => {
          const provider = providerByChannel.get(ch.channel_id) ?? "unknown";
          return {
            channel_id: ch.channel_id,
            provider,
            ...validateAgainstCapabilities({
              provider,
              content: ch.content ?? "",
              title: ch.title ?? null,
              media: asMediaArray(ch.media),
            }),
          };
        });

        const errors = validation.flatMap((row) => row.issues.filter((issue) => issue.level === "error"));
        if (errors.length > 0) {
          return errorResponse("Validation failed", 400, { per_channel: validation.map(({ channel_id, issues }) => ({ channel_id, issues })) });
        }

        const groupId = crypto.randomUUID();
        const nowIso = new Date().toISOString();

        const rows = group.channels.map((ch) => ({
          owner_id: user.id,
          channel_id: ch.channel_id,
          group_id: groupId,
          state: group.state,
          publish_date: publishDate.toISOString(),
          content: ch.content ?? "",
          title: ch.title ?? null,
          description: ch.description ?? null,
          settings: ch.settings ?? null,
          media: asMediaArray(ch.media) as unknown,
          poll: ch.poll ?? null,
          first_comment: ch.first_comment ?? null,
          interval_in_days: group.repeat?.interval_in_days ?? null,
          creation_method: "ui",
          created_at: nowIso,
          updated_at: nowIso,
        }));

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("postz_posts")
          .insert(rows)
          .select("*");
        if (insertError) throw insertError;

        const posts = inserted ?? [];

        // Tags (optional): upsert tags by name and join.
        const tagNames = asStringArray(group.tags).map((t) => t.trim()).filter(Boolean);
        if (tagNames.length > 0) {
          for (const tagName of tagNames) {
            const { data: tag, error: tagErr } = await supabaseAdmin
              .from("postz_tags")
              .upsert({ owner_id: user.id, name: tagName }, { onConflict: "owner_id,name" })
              .select("id")
              .single();
            if (tagErr) throw tagErr;
            for (const post of posts) {
              await supabaseAdmin.from("postz_post_tags").upsert({
                owner_id: user.id,
                post_id: post.id,
                tag_id: tag.id,
              }, { onConflict: "post_id,tag_id" });
            }
          }
        }

        return successResponse({ group_id: groupId, posts }, 201);
      }


      case "update": {
        const groupId = body.group_id;
        const group = body.group;
        const publishDate = new Date(group.publish_date);
        if (Number.isNaN(publishDate.getTime())) return errorResponse("Invalid publish_date", 400);
        if (!group.channels?.length) return errorResponse("channels are required", 400);

        const { data: existing, error: existingError } = await supabaseAdmin
          .from("postz_posts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("group_id", groupId)
          .is("deleted_at", null);
        if (existingError) throw existingError;
        if (!existing || existing.length === 0) return errorResponse("Group not found", 404);

        // Validate against channel provider capabilities.
        const channelIds = group.channels.map((ch) => ch.channel_id);
        const { data: channels, error: channelsError } = await supabaseAdmin
          .from("postz_channels")
          .select("id,provider,token_ref,profile,provider_account_id")
          .eq("owner_id", user.id)
          .in("id", channelIds)
          .is("deleted_at", null);
        if (channelsError) throw channelsError;

        const channelRows = (channels ?? []) as unknown as Array<Record<string, unknown>>;
        if (group.state === "QUEUE" && channelRows.some(isDemoChannel)) {
          return errorResponse("Demo channels cannot be scheduled or published. Connect a real channel first.", 400);
        }

        const providerByChannel = new Map<string, string>();
        for (const channel of channelRows) {
          const id = asString(channel.id);
          if (id) providerByChannel.set(id, String(channel.provider ?? "unknown"));
        }

        const validation = group.channels.map((ch) => {
          const provider = providerByChannel.get(ch.channel_id) ?? "unknown";
          return {
            channel_id: ch.channel_id,
            provider,
            ...validateAgainstCapabilities({
              provider,
              content: ch.content ?? "",
              title: ch.title ?? null,
              media: asMediaArray(ch.media),
            }),
          };
        });

        const errors = validation.flatMap((row) => row.issues.filter((issue) => issue.level === "error"));
        if (errors.length > 0) {
          return errorResponse("Validation failed", 400, { per_channel: validation.map(({ channel_id, issues }) => ({ channel_id, issues })) });
        }

        const existingByChannel = new Map<string, any>();
        for (const post of existing) {
          existingByChannel.set(String(post.channel_id), post);
        }

        const nowIso = new Date().toISOString();
        const keepChannelIds = new Set(channelIds);

        // Update or insert posts for each requested channel.
        for (const ch of group.channels) {
          const row = existingByChannel.get(ch.channel_id);
          const payload = {
            state: group.state,
            publish_date: publishDate.toISOString(),
            content: ch.content ?? "",
            title: ch.title ?? null,
            description: ch.description ?? null,
            settings: ch.settings ?? null,
            media: asMediaArray(ch.media) as unknown,
            poll: ch.poll ?? null,
            first_comment: ch.first_comment ?? null,
            interval_in_days: group.repeat?.interval_in_days ?? null,
            updated_at: nowIso,
          };

          if (row) {
            const { error } = await supabaseAdmin
              .from("postz_posts")
              .update(payload)
              .eq("owner_id", user.id)
              .eq("id", row.id)
              .is("deleted_at", null);
            if (error) throw error;
          } else {
            const insertPayload = {
              owner_id: user.id,
              channel_id: ch.channel_id,
              group_id: groupId,
              creation_method: "ui",
              created_at: nowIso,
              ...payload,
            };
            const { error } = await supabaseAdmin.from("postz_posts").insert(insertPayload);
            if (error) throw error;
          }
        }

        // Soft-delete posts removed from the group.
        const removedChannelIds = existing
          .map((post) => String(post.channel_id))
          .filter((channelId) => !keepChannelIds.has(channelId));
        if (removedChannelIds.length > 0) {
          const { error } = await supabaseAdmin
            .from("postz_posts")
            .update({ deleted_at: nowIso })
            .eq("owner_id", user.id)
            .eq("group_id", groupId)
            .in("channel_id", removedChannelIds)
            .is("deleted_at", null);
          if (error) throw error;
        }

        const { data: refreshed, error: refreshedError } = await supabaseAdmin
          .from("postz_posts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("group_id", groupId)
          .is("deleted_at", null)
          .order("publish_date", { ascending: true });
        if (refreshedError) throw refreshedError;
        return successResponse({ group_id: groupId, posts: refreshed ?? [] });
      }

      case "update-date": {
        const publishDate = new Date(body.publish_date);
        if (Number.isNaN(publishDate.getTime())) return errorResponse("Invalid publish_date", 400);

        if (!body.id && !body.group_id) return errorResponse("id or group_id is required", 400);

        let query = supabaseAdmin
          .from("postz_posts")
          .update({ publish_date: publishDate.toISOString() })
          .eq("owner_id", user.id)
          .is("deleted_at", null);

        if (body.id) query = query.eq("id", body.id);
        if (body.group_id) query = query.eq("group_id", body.group_id);

        const { error } = await query;
        if (error) throw error;

        return successResponse({ success: true });
      }

      case "delete": {
        const { error } = await supabaseAdmin
          .from("postz_posts")
          .update({ deleted_at: new Date().toISOString() })
          .eq("owner_id", user.id)
          .eq("group_id", body.group_id)
          .is("deleted_at", null);
        if (error) throw error;
        return successResponse({ success: true });
      }

      case "duplicate": {
        // Phase 2 convenience: duplicate a group into a new group_id scheduled 1 hour later.
        const { data: posts, error } = await supabaseAdmin
          .from("postz_posts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("group_id", body.group_id)
          .is("deleted_at", null);
        if (error) throw error;
        const original = posts ?? [];
        if (original.length === 0) return errorResponse("Group not found", 404);

        const newGroupId = crypto.randomUUID();
        const baseDate = new Date(original[0].publish_date ?? new Date().toISOString());
        baseDate.setHours(baseDate.getHours() + 1);

        const nowIso = new Date().toISOString();
        const rows = original.map((post) => ({
          owner_id: user.id,
          channel_id: post.channel_id,
          group_id: newGroupId,
          state: post.state,
          publish_date: baseDate.toISOString(),
          content: post.content,
          title: post.title,
          description: post.description,
          settings: post.settings,
          media: post.media,
          poll: post.poll,
          parent_post_id: null,
          first_comment: post.first_comment,
          interval_in_days: post.interval_in_days,
          creation_method: post.creation_method,
          created_at: nowIso,
          updated_at: nowIso,
        }));

        const { data: inserted, error: insertError } = await supabaseAdmin.from("postz_posts").insert(rows).select("*");
        if (insertError) throw insertError;
        return successResponse({ group_id: newGroupId, posts: inserted ?? [] }, 201);
      }

      case "find-slot": {
        // Uses channel.posting_times (minutes from midnight) to compute the next recommended time.
        const now = new Date();

        let channelId = body.channel_id ?? null;
        if (!channelId) {
          const { data: first } = await supabaseAdmin
            .from("postz_channels")
            .select("id")
            .eq("owner_id", user.id)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();
          channelId = first?.id ?? null;
        }

        if (!channelId) {
          const fallback = new Date(now);
          fallback.setMinutes(fallback.getMinutes() + 15);
          return successResponse({ publish_date: fallback.toISOString() });
        }

        const { data: channel, error } = await supabaseAdmin
          .from("postz_channels")
          .select("posting_times")
          .eq("owner_id", user.id)
          .eq("id", channelId)
          .is("deleted_at", null)
          .single();
        if (error) throw error;

        const postingTimes = Array.isArray(channel.posting_times) ? channel.posting_times : [];
        const next = computeNextSlot(postingTimes, now);
        return successResponse({ publish_date: next.toISOString() });
      }

      case "post-now": {
        const demoStatus = await getGroupDemoStatus({ supabaseAdmin, ownerId: user.id, groupId: body.group_id });
        if (!demoStatus.found) return errorResponse("Group not found", 404);
        if (demoStatus.hasDemoChannel) {
          return errorResponse("Demo channels cannot be published. Connect a real channel first.", 400);
        }

        const nowIso = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from("postz_posts")
          .update({ publish_date: nowIso, state: "QUEUE" })
          .eq("owner_id", user.id)
          .eq("group_id", body.group_id)
          .is("deleted_at", null);
        if (error) throw error;
        const result = await invokePostzPublishGroup(body.group_id, req.headers.get("Authorization"));
        return successResponse(result);
      }

      default:
        return errorResponse("Unsupported action", 400);
    }
  } catch (error) {
    return safeErrorResponse(error, "postz-posts");
  }
});
