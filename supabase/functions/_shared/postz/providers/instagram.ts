import type { AuthTokenDetails, ChannelRow, OAuthTarget, PostDetails, PostResponse, PostzProvider, ProviderCapabilities } from "./types.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function ensureScopes(required: string[], returned: string[]) {
  const scopes = new Set(returned);
  for (const scope of required) {
    if (!scopes.has(scope)) {
      throw new Error(`Instagram scope missing: ${scope}`);
    }
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Instagram request failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchPaginated(startUrl: string): Promise<any[]> {
  const items: any[] = [];
  const seen = new Set<string>();

  let next: string | undefined = startUrl;
  while (next) {
    const json = await fetchJson(next);
    for (const item of (json.data ?? [])) {
      if (item?.id && !seen.has(String(item.id))) {
        seen.add(String(item.id));
        items.push(item);
      }
    }
    next = json.paging?.next;
  }

  return items;
}

const SCOPES = [
  "instagram_basic",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
];

const CAPABILITIES: ProviderCapabilities = {
  text: { maxLength: 2200, supportsThreads: false },
  media: {
    images: true,
    video: true,
    maxImages: 10,
    maxVideoSeconds: 0,
    maxFileBytes: 0,
    required: true,
  },
  firstComment: false,
};

const instagramProvider: PostzProvider = {
  identifier: "instagram",
  name: "Instagram (Facebook Business)",
  implemented: true,
  capabilities: CAPABILITIES,
  requiredEnvVars: ["POSTZ_INSTAGRAM_CLIENT_ID", "POSTZ_INSTAGRAM_CLIENT_SECRET"],

  async generateAuthUrl(input: { state: string; codeVerifier: string; redirect: string }) {
    const clientId = requiredEnv("POSTZ_INSTAGRAM_CLIENT_ID");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirect,
      state: input.state,
      scope: SCOPES.join(","),
    });

    return {
      url: `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`,
      codeVerifier: input.codeVerifier,
      state: input.state,
    };
  },

  async authenticate(input: { code: string; codeVerifier: string; redirect: string }): Promise<AuthTokenDetails> {
    const clientId = requiredEnv("POSTZ_INSTAGRAM_CLIENT_ID");
    const clientSecret = requiredEnv("POSTZ_INSTAGRAM_CLIENT_SECRET");

    // exchange for short token
    const shortToken = await fetchJson(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(input.redirect)}` +
        `&client_secret=${encodeURIComponent(clientSecret)}` +
        `&code=${encodeURIComponent(input.code)}`,
    );

    // exchange for long-lived user token
    const longToken = await fetchJson(
      `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&client_secret=${encodeURIComponent(clientSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(String(shortToken.access_token ?? ""))}`,
    );

    const accessToken = String(longToken.access_token ?? "");

    const permissions = await fetchJson(
      `https://graph.facebook.com/v20.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
    );

    const granted = (permissions.data ?? [])
      .filter((row: any) => row?.status === "granted")
      .map((row: any) => String(row.permission));

    ensureScopes(SCOPES, granted);

    const me = await fetchJson(
      `https://graph.facebook.com/v20.0/me?fields=id,name,picture&access_token=${encodeURIComponent(accessToken)}`,
    );

    return {
      id: String(me.id ?? ""),
      name: String(me.name ?? ""),
      username: "",
      picture: String(me?.picture?.data?.url ?? ""),
      accessToken,
      refreshToken: accessToken,
      expiresIn: 59 * 24 * 60 * 60,
    };
  },

  async refreshToken(_refreshToken: string): Promise<AuthTokenDetails> {
    // Postiz does not refresh Meta Graph long-lived tokens automatically in this provider.
    throw new Error("Instagram refreshToken not implemented yet");
  },

  async post(channel: ChannelRow, accessToken: string, posts: PostDetails[]): Promise<PostResponse[]> {
    const [pageAccessToken] = accessToken.split("___");
    if (!pageAccessToken) throw new Error("Instagram channel is missing a page access token");

    const responses: PostResponse[] = [];

    for (const post of posts) {
      const media = post.media?.[0];
      if (!media?.url) throw new Error("Instagram publishing requires media");

      const createParams = new URLSearchParams({
        caption: post.message ?? "",
        access_token: pageAccessToken,
      });

      if (media.type === "video") {
        createParams.set("media_type", "REELS");
        createParams.set("video_url", media.url);
      } else {
        createParams.set("image_url", media.url);
      }

      const createJson = await fetchJson(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(channel.provider_account_id)}/media?${createParams.toString()}`,
      );
      const creationId = String(createJson.id ?? "");
      if (!creationId) throw new Error(`Instagram media container missing id: ${JSON.stringify(createJson)}`);

      for (let i = 0; i < 20; i += 1) {
        const statusJson = await fetchJson(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(pageAccessToken)}`,
        );
        const status = String(statusJson.status_code ?? "");
        if (status === "FINISHED") break;
        if (status === "ERROR" || status === "EXPIRED") {
          throw new Error(`Instagram media container failed: ${JSON.stringify(statusJson)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const publishParams = new URLSearchParams({
        creation_id: creationId,
        access_token: pageAccessToken,
      });
      const publishJson = await fetchJson(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(channel.provider_account_id)}/media_publish?${publishParams.toString()}`,
      );

      const mediaId = String(publishJson.id ?? "");
      if (!mediaId) throw new Error(`Instagram publish missing media id: ${JSON.stringify(publishJson)}`);

      responses.push({
        id: post.id,
        postId: mediaId,
        releaseURL: channel.username ? `https://www.instagram.com/${channel.username}/` : "https://www.instagram.com/",
        status: "published",
      });
    }

    return responses;
  },

  async listTargets(accessToken: string): Promise<OAuthTarget[]> {
    const allFacebookPages: any[] = [];

    // Pages explicitly shared during OAuth
    allFacebookPages.push(
      ...(await fetchPaginated(
        `https://graph.facebook.com/v20.0/me/accounts?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${encodeURIComponent(accessToken)}`,
      )),
    );

    // Attempt to discover pages via Business Manager too.
    try {
      const businesses = await fetchPaginated(
        `https://graph.facebook.com/v20.0/me/businesses?access_token=${encodeURIComponent(accessToken)}`,
      );

      for (const business of businesses) {
        if (!business?.id) continue;
        try {
          allFacebookPages.push(
            ...(await fetchPaginated(
              `https://graph.facebook.com/v20.0/${business.id}/owned_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${encodeURIComponent(accessToken)}`,
            )),
          );
        } catch {
          // ignore
        }

        try {
          allFacebookPages.push(
            ...(await fetchPaginated(
              `https://graph.facebook.com/v20.0/${business.id}/client_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${encodeURIComponent(accessToken)}`,
            )),
          );
        } catch {
          // ignore
        }
      }
    } catch {
      // Business Manager API not available for all users.
    }

    const seen = new Set<string>();
    const targets: OAuthTarget[] = [];

    for (const page of allFacebookPages) {
      const ig = page?.instagram_business_account;
      if (!ig?.id) continue;
      if (seen.has(String(ig.id))) continue;
      seen.add(String(ig.id));

      const igInfo = await fetchJson(
        `https://graph.facebook.com/v20.0/${ig.id}?fields=username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
      );

      targets.push({
        id: String(ig.id),
        name: String(igInfo.name ?? ""),
        meta: {
          pageId: String(page.id ?? ""),
          picture: String(igInfo.profile_picture_url ?? ""),
          username: String(igInfo.username ?? ""),
        },
      });
    }

    return targets.filter((t) => Boolean(t.id) && Boolean(t.meta?.pageId));
  },

  async finalizeTarget(accessToken: string, target: OAuthTarget) {
    const pageId = String(target.meta?.pageId ?? "");
    if (!pageId) {
      throw new Error("Instagram target missing pageId");
    }

    const pageInfo = await fetchJson(
      `https://graph.facebook.com/v20.0/${pageId}?fields=access_token,name,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`,
    );

    const pageAccessToken = String(pageInfo.access_token ?? "");

    const igInfo = await fetchJson(
      `https://graph.facebook.com/v20.0/${target.id}?fields=username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
    );

    return {
      id: String(igInfo.id ?? target.id),
      name: String(igInfo.name ?? target.name),
      username: String(igInfo.username ?? ""),
      picture: String(igInfo.profile_picture_url ?? ""),
      // Match Postiz storage format: `${page_access_token}___${user_access_token}`
      accessToken: `${pageAccessToken}___${accessToken}`,
    };
  },
};

export default instagramProvider;
