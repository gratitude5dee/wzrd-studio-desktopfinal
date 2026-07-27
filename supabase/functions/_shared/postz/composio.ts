import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import {
  buildComposioPublishRequest,
  getPostzComposioProviderConfig,
  listPostzComposioProviderConfigs,
  mapComposioStatus,
  type ComposioPostDetails,
  type ComposioToolkitConnection,
  type PostzComposioProviderSummary,
} from "./composio-config.ts";
import type { ChannelRow, PostDetails, PostResponse } from "./providers/types.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

type ToolkitItem = {
  slug?: string;
  name?: string;
  logo?: string;
  connection?: {
    isActive?: boolean;
    is_active?: boolean;
    connectedAccount?: { id?: string; status?: string; createdAt?: string; created_at?: string };
    connected_account?: { id?: string; status?: string; createdAt?: string; created_at?: string };
  } | null;
};

type ChannelWithProfile = ChannelRow & {
  token_ref?: string | null;
  refresh_token_ref?: string | null;
  profile?: Record<string, unknown> | null;
  created_at?: string | null;
};

export class ComposioBridgeError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "ComposioBridgeError";
    this.retryable = retryable;
  }
}

function getComposioApiKey(): string | null {
  const key = Deno.env.get("COMPOSIO_API_KEY")?.trim();
  return key || null;
}

export function isPostzComposioEnabled(): boolean {
  return Deno.env.get("POSTZ_USE_COMPOSIO")?.toLowerCase() === "true";
}

export function isPostzComposioConfigured(): boolean {
  return Boolean(getComposioApiKey());
}

function requireComposioApiKey(): string {
  const key = getComposioApiKey();
  if (!key) {
    throw new ComposioBridgeError("COMPOSIO_API_KEY is not configured.", false);
  }
  return key;
}

function userScopedId(userId: string): string {
  return `wzrd:${userId}`;
}

async function createComposioSession(userId: string, toolkits?: string[]) {
  const { Composio } = await import("https://esm.sh/@composio/core@0.10.0");
  const composio = new Composio({ apiKey: requireComposioApiKey() });
  return composio.create(userScopedId(userId), {
    manageConnections: false,
    ...(toolkits && toolkits.length > 0 ? { toolkits: { enable: toolkits } } : {}),
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function connectionFromToolkit(item: ToolkitItem | null | undefined): ComposioToolkitConnection {
  const connection = item?.connection ?? null;
  const connectedAccount = connection?.connectedAccount ?? connection?.connected_account ?? null;
  const id = asString(connectedAccount?.id);
  return {
    id,
    status: asString(connectedAccount?.status),
    isActive: Boolean(connection?.isActive ?? connection?.is_active),
  };
}

function channelStatusFromComposio(connection: ComposioToolkitConnection): "connected" | "needs_reauth" | "disabled" | "error" {
  const status = mapComposioStatus(connection);
  return status === "disconnected" ? "disabled" : status;
}

function providerEnvSuffix(provider: string): string {
  return provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function callbackUrlWithPostzParams(callbackUrl: string | null | undefined, provider: string): string | undefined {
  if (!callbackUrl) return undefined;
  try {
    const url = new URL(callbackUrl);
    url.searchParams.set("connected", "1");
    url.searchParams.set("provider", provider);
    return url.toString();
  } catch {
    return callbackUrl;
  }
}

async function listSessionToolkits(userId: string): Promise<ToolkitItem[]> {
  const configs = listPostzComposioProviderConfigs();
  const session = await createComposioSession(userId, configs.map((config) => config.toolkit));
  const result = await session.toolkits({ toolkits: configs.map((config) => config.toolkit) });
  return Array.isArray(result?.items) ? result.items as ToolkitItem[] : [];
}

async function upsertComposioChannel(input: {
  supabaseAdmin: SupabaseAdmin;
  ownerId: string;
  provider: string;
  toolkit: string;
  label: string;
  logo: string;
  connection: ComposioToolkitConnection;
  toolkitItem?: ToolkitItem | null;
}): Promise<string | null> {
  if (!input.connection.id) return null;

  const profile = {
    composio: true,
    source: "composio",
    toolkit: input.toolkit,
    connected_account_id: input.connection.id,
    connected_account_status: input.connection.status,
    logo: input.logo,
  };

  const payload = {
    owner_id: input.ownerId,
    provider: input.provider,
    provider_account_id: input.connection.id,
    name: input.toolkitItem?.name ?? input.label,
    username: input.connection.id,
    picture: input.toolkitItem?.logo ?? input.logo,
    profile,
    token_ref: `composio:${input.connection.id}`,
    refresh_token_ref: null,
    token_expires_at: null,
    status: channelStatusFromComposio(input.connection),
    disabled: channelStatusFromComposio(input.connection) !== "connected",
    posting_times: [{ time: 120 }, { time: 400 }, { time: 700 }],
    additional_settings: [],
    custom_instance_url: null,
    deleted_at: null,
  };

  const { data, error } = await input.supabaseAdmin
    .from("postz_channels")
    .upsert(payload, { onConflict: "owner_id,provider,provider_account_id" })
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return asString((data as Record<string, unknown> | null)?.id);
}

async function listLocalComposioChannels(input: {
  supabaseAdmin: SupabaseAdmin;
  ownerId: string;
}): Promise<ChannelWithProfile[]> {
  const providers = listPostzComposioProviderConfigs().map((config) => config.provider);
  const { data, error } = await input.supabaseAdmin
    .from("postz_channels")
    .select("*")
    .eq("owner_id", input.ownerId)
    .in("provider", providers)
    .is("deleted_at", null);

  if (error) throw error;
  return (data ?? []) as unknown as ChannelWithProfile[];
}

export async function listComposioProviderSummaries(input: {
  supabaseAdmin: SupabaseAdmin;
  ownerId: string;
}): Promise<PostzComposioProviderSummary[]> {
  const configured = isPostzComposioConfigured();
  const localChannels = await listLocalComposioChannels(input);
  const channelByProvider = new Map<string, ChannelWithProfile>();
  for (const channel of localChannels) {
    const profile = asRecord(channel.profile);
    if (profile.composio === true || String(channel.token_ref ?? "").startsWith("composio:")) {
      channelByProvider.set(channel.provider, channel);
    }
  }

  if (!configured) {
    return listPostzComposioProviderConfigs().map((config) => {
      const channel = channelByProvider.get(config.provider);
      return {
        identifier: config.provider,
        name: config.label,
        toolkit: config.toolkit,
        logo: config.logo,
        configured: false,
        implemented: true,
        connectable: false,
        connected: false,
        status: channel?.status === "connected" ? "connected" : "disconnected",
        connected_account_id: asString(channel?.provider_account_id),
        channel_id: asString(channel?.id),
        source: "composio",
      };
    });
  }

  const toolkitItems = await listSessionToolkits(input.ownerId);
  const toolkitBySlug = new Map(toolkitItems.map((item) => [item.slug, item]));
  const summaries: PostzComposioProviderSummary[] = [];

  for (const config of listPostzComposioProviderConfigs()) {
    const toolkitItem = toolkitBySlug.get(config.toolkit) ?? null;
    const connection = connectionFromToolkit(toolkitItem);
    const status = mapComposioStatus(connection);
    const channelId = status === "connected"
      ? await upsertComposioChannel({
        supabaseAdmin: input.supabaseAdmin,
        ownerId: input.ownerId,
        provider: config.provider,
        toolkit: config.toolkit,
        label: config.label,
        logo: config.logo,
        connection,
        toolkitItem,
      })
      : asString(channelByProvider.get(config.provider)?.id);

    summaries.push({
      identifier: config.provider,
      name: toolkitItem?.name ?? config.label,
      toolkit: config.toolkit,
      logo: toolkitItem?.logo ?? config.logo,
      configured: true,
      implemented: true,
      connectable: true,
      connected: status === "connected",
      status,
      connected_account_id: connection.id,
      channel_id: channelId,
      source: "composio",
    });
  }

  return summaries;
}

export async function startComposioConnection(input: {
  ownerId: string;
  provider: string;
  callbackUrl?: string | null;
}): Promise<{ url: string }> {
  const config = getPostzComposioProviderConfig(input.provider);
  if (!config) {
    throw new ComposioBridgeError("Unsupported Composio provider.", false);
  }

  const session = await createComposioSession(input.ownerId, [config.toolkit]);
  const callbackUrl = callbackUrlWithPostzParams(input.callbackUrl, config.provider);
  const connectionRequest = await session.authorize(
    config.toolkit,
    callbackUrl ? { callbackUrl } : undefined,
  );
  const url = connectionRequest?.redirectUrl ?? connectionRequest?.redirect_url;
  if (!url) {
    throw new ComposioBridgeError("Composio did not return a connection URL.", true);
  }

  return { url };
}

async function composioApiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`https://backend.composio.dev/api/v3.1${path}`, {
    ...init,
    headers: {
      "x-api-key": requireComposioApiKey(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ComposioBridgeError(`Composio API failed (${res.status}): ${JSON.stringify(payload)}`, res.status >= 500);
  }
  return payload;
}

export async function revokeComposioConnection(input: {
  supabaseAdmin: SupabaseAdmin;
  ownerId: string;
  channelId?: string | null;
  connectedAccountId?: string | null;
}): Promise<{ success: boolean; connected_account_id: string | null }> {
  let channel: ChannelWithProfile | null = null;

  if (input.channelId) {
    const { data, error } = await input.supabaseAdmin
      .from("postz_channels")
      .select("*")
      .eq("id", input.channelId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();
    if (error) throw error;
    channel = data as unknown as ChannelWithProfile | null;
  }

  const profile = asRecord(channel?.profile);
  const connectedAccountId =
    input.connectedAccountId ??
    asString(profile.connected_account_id) ??
    asString(channel?.provider_account_id);

  if (!connectedAccountId) {
    throw new ComposioBridgeError("Connected account id is required.", false);
  }

  await composioApiFetch(`/connected_accounts/${encodeURIComponent(connectedAccountId)}/revoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (channel?.id) {
    const { error } = await input.supabaseAdmin
      .from("postz_channels")
      .update({
        status: "disabled",
        disabled: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", channel.id)
      .eq("owner_id", input.ownerId);
    if (error) throw error;
  }

  return { success: true, connected_account_id: connectedAccountId };
}

export async function executeComposioTool(input: {
  ownerId: string;
  provider: string;
  toolSlug: string;
  arguments: Record<string, unknown>;
}): Promise<unknown> {
  if (Deno.env.get("POSTZ_COMPOSIO_MOCK_EXECUTE")?.toLowerCase() === "true") {
    return {
      data: {
        id: `mock:${input.toolSlug}:${crypto.randomUUID()}`,
        url: null,
        provider: input.provider,
      },
    };
  }

  const config = getPostzComposioProviderConfig(input.provider);
  const session = await createComposioSession(input.ownerId, config ? [config.toolkit] : undefined);
  return session.execute(input.toolSlug, input.arguments);
}

function parseComposioExecutionResult(result: unknown, fallbackId: string): { postId: string; releaseUrl: string | null } {
  const record = asRecord(result);
  const data = asRecord(record.data ?? record.result ?? result);
  const nested = asRecord(data.data ?? data.result);
  const merged = { ...data, ...nested };
  return {
    postId:
      asString(merged.post_id) ??
      asString(merged.postId) ??
      asString(merged.publish_id) ??
      asString(merged.id) ??
      fallbackId,
    releaseUrl:
      asString(merged.permalink) ??
      asString(merged.permalink_url) ??
      asString(merged.release_url) ??
      asString(merged.url),
  };
}

export async function publishWithComposio(input: {
  ownerId: string;
  channel: ChannelRow;
  details: PostDetails;
}): Promise<PostResponse[]> {
  const details: ComposioPostDetails = {
    id: input.details.id,
    message: input.details.message,
    settings: asRecord(input.details.settings),
    media: input.details.media,
    poll: input.details.poll,
  };
  const override = Deno.env.get(`POSTZ_COMPOSIO_${providerEnvSuffix(input.channel.provider)}_PUBLISH_TOOL`) ?? null;
  const request = buildComposioPublishRequest({
    provider: input.channel.provider,
    details,
    toolSlugOverride: override,
  });
  const result = await executeComposioTool({
    ownerId: input.ownerId,
    provider: input.channel.provider,
    toolSlug: request.toolSlug,
    arguments: request.arguments,
  });
  const parsed = parseComposioExecutionResult(result, `composio:${request.toolSlug}:${input.details.id}`);
  return [{
    id: input.details.id,
    postId: parsed.postId,
    releaseURL: parsed.releaseUrl ?? "",
    status: "published",
  }];
}
