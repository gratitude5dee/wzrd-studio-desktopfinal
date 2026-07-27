export type PostzProvider =
  | "x"
  | "tiktok"
  | "instagram"
  | "instagram-standalone"
  | "threads"
  | "youtube"
  | "linkedin"
  | "linkedin-page"
  | "facebook"
  | "discord"
  | "telegram"
  | "bluesky"
  | "mastodon"
  | (string & {});

export type PostzOAuthProviderSummary = {
  identifier: PostzProvider;
  name: string;
  configured: boolean;
  implemented: boolean;
  connectable?: boolean;
  toolkit?: string;
  logo?: string;
  connected?: boolean;
  status?: "connected" | "needs_reauth" | "disabled" | "error" | "disconnected";
  connected_account_id?: string | null;
  channel_id?: string | null;
  source?: "native" | "composio";
};

export type PostzComposioProviderSummary = PostzOAuthProviderSummary & {
  toolkit: string;
  logo: string;
  connected: boolean;
  status: "connected" | "needs_reauth" | "disabled" | "error" | "disconnected";
  connected_account_id: string | null;
  channel_id: string | null;
  source: "composio";
};

export type PostzOAuthTarget = {
  id: string;
  name: string;
  meta?: Record<string, unknown>;
};

export type PostzChannelStatus = "connected" | "needs_reauth" | "disabled" | "error";

export type PostzPostState = "DRAFT" | "QUEUE" | "PUBLISHING" | "PUBLISHED" | "ERROR";

export type PostzCreationMethod = "ui" | "ai" | "api" | "autopost";

export type PostzPostingTime = { time: number };

export type PostzMediaRef = {
  asset_id: string;
  url?: string;
  cdn_url?: string;
  mime_type?: string;
  kind?: "image" | "video" | "gif";
  width?: number;
  height?: number;
  duration_seconds?: number;
  size_bytes?: number;
};

export type PostzPoll = {
  options: string[];
  duration: number;
};

export type PostzChannel = {
  id: string;
  owner_id: string;
  workspace_id?: string | null;
  provider: PostzProvider;
  provider_account_id: string;
  name: string | null;
  username: string | null;
  picture: string | null;
  profile: Record<string, unknown> | null;
  token_expires_at: string | null;
  status: PostzChannelStatus;
  disabled: boolean;
  posting_times: PostzPostingTime[];
  additional_settings: unknown[];
  custom_instance_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostzPost = {
  id: string;
  owner_id: string;
  channel_id: string;
  group_id: string;
  state: PostzPostState;
  publish_date: string;
  content: string;
  title: string | null;
  description: string | null;
  settings: Record<string, unknown> | null;
  media: PostzMediaRef[];
  poll: PostzPoll | null;
  parent_post_id: string | null;
  first_comment: string | null;
  release_url: string | null;
  release_provider_id: string | null;
  error: string | null;
  attempts: number;
  interval_in_days: number | null;
  creation_method: PostzCreationMethod;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostzTag = {
  id: string;
  owner_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostzSet = {
  id: string;
  owner_id: string;
  name: string;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostzSignature = {
  id: string;
  owner_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostzValidationIssue = {
  level: "error" | "warning";
  message: string;
};

export type PostzPerChannelValidation = {
  channel_id: string;
  issues: PostzValidationIssue[];
};

export type PostzPostGroupCreateChannelInput = {
  channel_id: string;
  content: string;
  title?: string | null;
  description?: string | null;
  media?: PostzMediaRef[];
  settings?: Record<string, unknown> | null;
  poll?: PostzPoll | null;
  first_comment?: string | null;
};

export type PostzPostGroupCreateInput = {
  publish_date: string;
  state: PostzPostState;
  channels: PostzPostGroupCreateChannelInput[];
  tags?: string[];
  repeat?: { interval_in_days: number } | null;
};

export type PostzGroup = {
  group_id: string;
  posts: PostzPost[];
};
