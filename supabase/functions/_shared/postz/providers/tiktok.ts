import type { AuthTokenDetails, ChannelRow, PostDetails, PostResponse, PostzProvider, ProviderCapabilities } from "./types.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function ensureScopes(required: string[], returned: unknown) {
  const scopeString = typeof returned === "string" ? returned : "";
  const scopes = new Set(scopeString.split(/[\s,]+/).filter(Boolean));
  for (const scope of required) {
    if (!scopes.has(scope)) {
      throw new Error(`TikTok scope missing: ${scope}`);
    }
  }
}

const SCOPES = [
  "video.list",
  "user.info.basic",
  "video.publish",
  "video.upload",
  "user.info.profile",
  "user.info.stats",
];

const CAPABILITIES: ProviderCapabilities = {
  text: { maxLength: 2000, supportsThreads: false },
  media: {
    images: true,
    video: true,
    maxImages: 35,
    maxVideoSeconds: 0,
    maxFileBytes: 0,
    required: true,
  },
  firstComment: false,
};

const tiktokProvider: PostzProvider = {
  identifier: "tiktok",
  name: "TikTok",
  implemented: true,
  capabilities: CAPABILITIES,
  requiredEnvVars: ["POSTZ_TIKTOK_CLIENT_ID", "POSTZ_TIKTOK_CLIENT_SECRET"],

  async generateAuthUrl(input: { state: string; codeVerifier: string; redirect: string }) {
    const clientKey = requiredEnv("POSTZ_TIKTOK_CLIENT_ID");

    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: input.redirect,
      state: input.state,
      response_type: "code",
      scope: SCOPES.join(","),
    });

    return {
      url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
      codeVerifier: input.codeVerifier,
      state: input.state,
    };
  },

  async authenticate(input: { code: string; codeVerifier: string; redirect: string }): Promise<AuthTokenDetails> {
    const clientKey = requiredEnv("POSTZ_TIKTOK_CLIENT_ID");
    const clientSecret = requiredEnv("POSTZ_TIKTOK_CLIENT_SECRET");

    const tokenBody = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirect,
    });

    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`TikTok token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    const accessToken = String(tokenJson.access_token ?? "");
    const refreshToken = String(tokenJson.refresh_token ?? "");
    ensureScopes(SCOPES, tokenJson.scope);

    const userRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const userJson = await userRes.json();
    if (!userRes.ok) {
      throw new Error(`TikTok user info failed: ${JSON.stringify(userJson)}`);
    }

    const user = userJson?.data?.user ?? {};
    const openId = String(user.open_id ?? "");

    return {
      id: openId.replace(/-/g, ""),
      name: String(user.display_name ?? ""),
      username: String(user.username ?? ""),
      picture: String(user.avatar_url ?? ""),
      accessToken,
      refreshToken,
      expiresIn: 23 * 60 * 60,
    };
  },

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const clientKey = requiredEnv("POSTZ_TIKTOK_CLIENT_ID");
    const clientSecret = requiredEnv("POSTZ_TIKTOK_CLIENT_SECRET");

    const tokenBody = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`TikTok refresh failed: ${JSON.stringify(tokenJson)}`);
    }

    const accessToken = String(tokenJson.access_token ?? "");
    const nextRefresh = String(tokenJson.refresh_token ?? refreshToken);

    const userRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const userJson = await userRes.json();
    if (!userRes.ok) {
      throw new Error(`TikTok user info failed: ${JSON.stringify(userJson)}`);
    }

    const user = userJson?.data?.user ?? {};
    const openId = String(user.open_id ?? "");

    return {
      id: openId.replace(/-/g, ""),
      name: String(user.display_name ?? ""),
      username: String(user.username ?? ""),
      picture: String(user.avatar_url ?? ""),
      accessToken,
      refreshToken: nextRefresh,
      expiresIn: 23 * 60 * 60,
    };
  },

  async post(channel: ChannelRow, accessToken: string, posts: PostDetails[]): Promise<PostResponse[]> {
    const responses: PostResponse[] = [];

    for (const post of posts) {
      const media = post.media?.find((item) => item.type === "video") ?? post.media?.[0];
      if (!media?.url) {
        throw new Error("TikTok publishing requires a media URL");
      }

      const settings = (post.settings ?? {}) as Record<string, any>;
      const postInfo = {
        title: post.message.slice(0, CAPABILITIES.text.maxLength),
        privacy_level: String(settings.privacy_level ?? "SELF_ONLY"),
        disable_duet: settings.duet === undefined ? false : !settings.duet,
        disable_comment: settings.comment === undefined ? false : !settings.comment,
        disable_stitch: settings.stitch === undefined ? false : !settings.stitch,
        brand_content_toggle: Boolean(settings.brand_content_toggle ?? false),
        brand_organic_toggle: Boolean(settings.brand_organic_toggle ?? false),
      };

      const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: postInfo,
          source_info: {
            source: "PULL_FROM_URL",
            video_url: media.url,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(`TikTok publish init failed (${res.status}): ${JSON.stringify(json)}`);
      }

      const publishId = String(json?.data?.publish_id ?? "");
      if (!publishId) {
        throw new Error(`TikTok publish init missing publish_id: ${JSON.stringify(json)}`);
      }

      responses.push({
        id: post.id,
        postId: publishId,
        releaseURL: channel.username ? `https://www.tiktok.com/@${channel.username}` : "https://www.tiktok.com/",
        status: "processing",
      });
    }

    return responses;
  },
};

export default tiktokProvider;
