export type PostzPostState = "DRAFT" | "QUEUE" | "PUBLISHING" | "PUBLISHED" | "ERROR";

export interface ProviderCapabilities {
  text: { maxLength: number; supportsThreads: boolean };
  media: {
    images: boolean;
    video: boolean;
    maxImages: number;
    maxVideoSeconds: number;
    maxFileBytes: number;
    aspectRatios?: string[];
    required?: boolean;
  };
  poll?: { maxOptions: number; maxDurationHours: number };
  firstComment: boolean;
  title?: boolean;
}

export interface AuthTokenDetails {
  id: string;
  name: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  picture?: string;
  username: string;
  additionalSettings?: {
    title: string;
    description: string;
    type: "checkbox" | "text" | "textarea";
    value: unknown;
    regex?: string;
  }[];
  error?: string;
}

export interface PostDetails {
  id: string;
  message: string;
  settings: any;
  media?: { id: string; url: string; type: "image" | "video"; meta?: any }[];
  poll?: { options: string[]; duration: number };
}

export interface PostResponse {
  id: string;
  postId: string;
  releaseURL: string;
  status: string;
}

export type ChannelRow = {
  id: string;
  owner_id: string;
  provider: string;
  provider_account_id: string;
  name: string | null;
  username: string | null;
  picture: string | null;
  profile: any;
  token_expires_at: string | null;
  status: string;
  disabled: boolean;
  posting_times: any;
  additional_settings: any;
  custom_instance_url: string | null;
};

export type OAuthTarget = {
  id: string;
  name: string;
  meta?: Record<string, unknown>;
};

export interface PostzProvider {
  identifier: string;
  name: string;
  implemented?: boolean;
  capabilities: ProviderCapabilities;

  /** Environment variable names required for this provider to be usable. */
  requiredEnvVars?: string[];

  generateAuthUrl(input: { state: string; codeVerifier: string; redirect: string }):
    Promise<{ url: string; codeVerifier: string; state: string }>;

  authenticate(input: { code: string; codeVerifier: string; redirect: string }): Promise<AuthTokenDetails>;

  refreshToken(refreshToken: string): Promise<AuthTokenDetails>;

  post(channel: ChannelRow, accessToken: string, posts: PostDetails[]): Promise<PostResponse[]>;

  analytics?: (channel: ChannelRow, accessToken: string, sinceDays: number) => Promise<any[]>;

  /**
   * Some providers require a second step after OAuth (choose a page/channel/etc.).
   *
   * The accessToken here is the freshly-authenticated token.
   */
  listTargets?: (accessToken: string) => Promise<OAuthTarget[]>;

  /**
   * Given a selected target, produce the final token/account info to store in postz_channels.
   *
   * For some providers, this swaps the stored token (e.g. page access token) or enriches profile fields.
   */
  finalizeTarget?: (accessToken: string, target: OAuthTarget) => Promise<{
    id: string;
    name: string;
    username: string;
    picture?: string;
    accessToken: string;
  }>;
}

export type ProviderSummary = {
  identifier: string;
  name: string;
  configured: boolean;
  implemented: boolean;
  connectable: boolean;
};
