import { supabase } from "@/integrations/supabase/client";
import {
  type PostzChannel,
  type PostzGroup,
  type PostzPerChannelValidation,
  type PostzPost,
  type PostzPostGroupCreateInput,
  type PostzOAuthProviderSummary,
  type PostzOAuthTarget,
  type PostzComposioProviderSummary,
} from "@/types/postz";

type InvokeBody =
  | { action: "list"; from: string; to: string; state?: string | null }
  | { action: "get"; id: string }
  | { action: "get-group"; group_id: string }
  | { action: "create"; group: PostzPostGroupCreateInput }
  | { action: "update"; group_id: string; group: PostzPostGroupCreateInput }
  | { action: "update-date"; id?: string; group_id?: string; publish_date: string }
  | { action: "delete"; group_id: string }
  | { action: "duplicate"; group_id: string }
  | { action: "validate"; group: PostzPostGroupCreateInput }
  | { action: "find-slot"; channel_id?: string | null }
  | { action: "post-now"; group_id: string };

async function invokePostzPosts<T>(body: InvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("postz-posts", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Postz returned an empty response.");
  }

  return data as T;
}

async function invokePostzChannels<T>(body: { action: "list" | "seed" }): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("postz-channels", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Postz returned an empty response.");
  }

  return data as T;
}

type OAuthInvokeBody =
  | { action: "list-providers" }
  | { action: "start"; provider: string; redirect?: string | null; app_return_url?: string | null }
  | { action: "list-targets"; provider: string; state_id: string }
  | { action: "finalize"; provider: string; state_id: string; target_id: string };

async function invokePostzOauth<T>(body: OAuthInvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("postz-oauth", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Postz returned an empty response.");
  }

  return data as T;
}

type ComposioInvokeBody =
  | { action: "list-providers" }
  | { action: "list-connected-accounts" }
  | { action: "connection-status" }
  | { action: "initiate-connection"; provider: string; app_return_url?: string | null }
  | { action: "revoke"; channel_id?: string | null; connected_account_id?: string | null }
  | { action: "execute"; provider: string; tool_slug: string; arguments?: Record<string, unknown> };

async function invokePostzComposio<T>(body: ComposioInvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("postz-composio", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Postz returned an empty response.");
  }

  return data as T;
}

export const postzQueryKeys = {
  oauthTargets: (provider: string, stateId: string) => ["postz", "oauth", "targets", provider, stateId] as const,
  channels: ["postz", "channels"] as const,
  oauthProviders: ["postz", "oauth", "providers"] as const,
  integrations: ["postz", "integrations"] as const,
  postsWindow: (from: string, to: string, state: string | null) => ["postz", "posts", "window", from, to, state] as const,
  postGroup: (groupId: string) => ["postz", "posts", "group", groupId] as const,
} as const;

export const postzService = {
  // Channels (Phase 2: seeded + read-only; Phase 3: real OAuth providers)
  async listChannels(): Promise<PostzChannel[]> {
    const res = await invokePostzChannels<{ channels: PostzChannel[] }>({ action: "list" });
    return res.channels;
  },

  async seedChannels(): Promise<PostzChannel[]> {
    const res = await invokePostzChannels<{ channels: PostzChannel[] }>({ action: "seed" });
    return res.channels;
  },


  // OAuth (Phase 3)
  async listOauthProviders(): Promise<PostzOAuthProviderSummary[]> {
    const res = await invokePostzOauth<{ providers: PostzOAuthProviderSummary[] }>({ action: "list-providers" });
    return res.providers;
  },

  async startOauth(input: { provider: string; redirect?: string | null; app_return_url?: string | null }): Promise<{ url: string }> {
    return invokePostzOauth<{ url: string }>({
      action: "start",
      provider: input.provider,
      redirect: input.redirect ?? null,
      app_return_url: input.app_return_url ?? null,
    });
  },

  async listOauthTargets(input: { provider: string; state_id: string }): Promise<PostzOAuthTarget[]> {
    const res = await invokePostzOauth<{ targets: PostzOAuthTarget[] }>({
      action: "list-targets",
      provider: input.provider,
      state_id: input.state_id,
    });
    return res.targets;
  },

  async finalizeOauthTarget(input: { provider: string; state_id: string; target_id: string }): Promise<{ channel_id: string }> {
    return invokePostzOauth<{ channel_id: string }>({
      action: "finalize",
      provider: input.provider,
      state_id: input.state_id,
      target_id: input.target_id,
    });
  },

  async listIntegrationProviders(): Promise<PostzComposioProviderSummary[]> {
    const res = await invokePostzComposio<{ providers: PostzComposioProviderSummary[] }>({ action: "list-providers" });
    return res.providers;
  },

  async startComposioConnection(input: { provider: string; app_return_url?: string | null }): Promise<{ url: string }> {
    return invokePostzComposio<{ url: string }>({
      action: "initiate-connection",
      provider: input.provider,
      app_return_url: input.app_return_url ?? null,
    });
  },

  async revokeComposioConnection(input: { channel_id?: string | null; connected_account_id?: string | null }): Promise<{ success: boolean }> {
    return invokePostzComposio<{ success: boolean }>({
      action: "revoke",
      channel_id: input.channel_id ?? null,
      connected_account_id: input.connected_account_id ?? null,
    });
  },


  // Posts
  async listPostsWindow(input: { from: string; to: string; state?: string | null }): Promise<PostzPost[]> {
    const res = await invokePostzPosts<{ posts: PostzPost[] }>({
      action: "list",
      from: input.from,
      to: input.to,
      state: input.state ?? null,
    });
    return res.posts;
  },

  async getPost(input: { id: string }): Promise<PostzPost> {
    const res = await invokePostzPosts<{ post: PostzPost }>({ action: "get", id: input.id });
    return res.post;
  },


  async updateGroup(input: { group_id: string; group: PostzPostGroupCreateInput }): Promise<PostzGroup> {
    return invokePostzPosts<PostzGroup>({ action: "update", group_id: input.group_id, group: input.group });
  },

  async getGroup(input: { group_id: string }): Promise<PostzGroup> {
    const res = await invokePostzPosts<PostzGroup>({ action: "get-group", group_id: input.group_id });
    return res;
  },

  async createGroup(input: { group: PostzPostGroupCreateInput }): Promise<PostzGroup> {
    return invokePostzPosts<PostzGroup>({ action: "create", group: input.group });
  },

  async updateGroupDate(input: { id?: string; group_id?: string; publish_date: string }): Promise<{ success: boolean }> {
    return invokePostzPosts<{ success: boolean }>({
      action: "update-date",
      id: input.id,
      group_id: input.group_id,
      publish_date: input.publish_date,
    });
  },

  async deleteGroup(input: { group_id: string }): Promise<{ success: boolean }> {
    return invokePostzPosts<{ success: boolean }>({ action: "delete", group_id: input.group_id });
  },

  async validateGroup(input: { group: PostzPostGroupCreateInput }): Promise<{ per_channel: PostzPerChannelValidation[] }> {
    return invokePostzPosts<{ per_channel: PostzPerChannelValidation[] }>({ action: "validate", group: input.group });
  },

  async findSlot(input: { channel_id?: string | null }): Promise<{ publish_date: string }> {
    return invokePostzPosts<{ publish_date: string }>({ action: "find-slot", channel_id: input.channel_id ?? null });
  },

  async postNow(input: { group_id: string }): Promise<{ success: boolean; results?: unknown[] }> {
    return invokePostzPosts<{ success: boolean; results?: unknown[] }>({ action: "post-now", group_id: input.group_id });
  },
};
