import type { AuthTokenDetails, PostResponse, PostzProvider, ProviderCapabilities } from "./types.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function pct(input: string): string {
  return encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function signOAuth1(input: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  extraParams?: Record<string, string>;
}): Promise<string> {
  const method = input.method.toUpperCase();
  const urlObj = new URL(input.url);
  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: input.consumerKey,
    oauth_nonce: randomNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  };

  if (input.token) {
    oauthParams.oauth_token = input.token;
  }

  const allParams: Record<string, string> = {
    ...oauthParams,
    ...(input.extraParams ?? {}),
  };

  // Include query params in signature base string
  for (const [key, value] of urlObj.searchParams.entries()) {
    allParams[key] = value;
  }

  const paramString = Object.keys(allParams)
    .sort()
    .map((key) => `${pct(key)}=${pct(allParams[key])}`)
    .join("&");

  const baseString = [method, pct(baseUrl), pct(paramString)].join("&");
  const signingKey = `${pct(input.consumerSecret)}&${pct(input.tokenSecret ?? "")}`;
  const signature = await hmacSha1Base64(signingKey, baseString);

  oauthParams.oauth_signature = signature;

  if (input.extraParams) {
    // oauth_callback and oauth_verifier are treated as oauth params
    for (const [key, value] of Object.entries(input.extraParams)) {
      oauthParams[key] = value;
    }
  }

  return (
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((key) => `${pct(key)}="${pct(oauthParams[key])}"`)
      .join(", ")
  );
}

function parseFormEncoded(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

const CAPABILITIES: ProviderCapabilities = {
  text: { maxLength: 280, supportsThreads: true },
  media: {
    images: true,
    video: true,
    maxImages: 4,
    maxVideoSeconds: 140,
    maxFileBytes: 512 * 1024 * 1024,
    required: false,
  },
  firstComment: false,
};

const xProvider: PostzProvider = {
  identifier: "x",
  name: "X",
  capabilities: CAPABILITIES,
  requiredEnvVars: ["POSTZ_X_API_KEY", "POSTZ_X_API_SECRET"],

  async generateAuthUrl(input: { state: string; codeVerifier: string; redirect: string }) {
    const consumerKey = requiredEnv("POSTZ_X_API_KEY");
    const consumerSecret = requiredEnv("POSTZ_X_API_SECRET");

    const auth = await signOAuth1({
      method: "POST",
      url: "https://api.twitter.com/oauth/request_token",
      consumerKey,
      consumerSecret,
      extraParams: {
        oauth_callback: input.redirect,
      },
    });

    const res = await fetch("https://api.twitter.com/oauth/request_token", {
      method: "POST",
      headers: {
        Authorization: auth,
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`X request_token failed: ${text}`);
    }

    const parsed = parseFormEncoded(text);
    const oauthToken = parsed.oauth_token;
    const oauthTokenSecret = parsed.oauth_token_secret;

    if (!oauthToken || !oauthTokenSecret) {
      throw new Error(`X request_token missing oauth_token: ${text}`);
    }

    // In OAuth1.0a, oauth_token itself is the correlation id.
    return {
      url: `https://api.twitter.com/oauth/authenticate?oauth_token=${encodeURIComponent(oauthToken)}`,
      codeVerifier: `${oauthToken}:${oauthTokenSecret}`,
      state: oauthToken,
    };
  },

  async authenticate(input: { code: string; codeVerifier: string; redirect: string }): Promise<AuthTokenDetails> {
    const consumerKey = requiredEnv("POSTZ_X_API_KEY");
    const consumerSecret = requiredEnv("POSTZ_X_API_SECRET");

    const [oauthToken, oauthTokenSecret] = input.codeVerifier.split(":");
    if (!oauthToken || !oauthTokenSecret) {
      throw new Error("Invalid X codeVerifier format");
    }

    const auth = await signOAuth1({
      method: "POST",
      url: "https://api.twitter.com/oauth/access_token",
      consumerKey,
      consumerSecret,
      token: oauthToken,
      tokenSecret: oauthTokenSecret,
      extraParams: {
        oauth_verifier: input.code,
      },
    });

    const res = await fetch("https://api.twitter.com/oauth/access_token", {
      method: "POST",
      headers: {
        Authorization: auth,
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`X access_token exchange failed: ${text}`);
    }

    const parsed = parseFormEncoded(text);
    const accessToken = parsed.oauth_token;
    const accessSecret = parsed.oauth_token_secret;

    if (!accessToken || !accessSecret) {
      throw new Error(`X token response missing oauth_token: ${text}`);
    }

    const userAuth = await signOAuth1({
      method: "GET",
      url: "https://api.twitter.com/2/users/me?user.fields=username,verified,profile_image_url,name",
      consumerKey,
      consumerSecret,
      token: accessToken,
      tokenSecret: accessSecret,
    });

    const userRes = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=username,verified,profile_image_url,name",
      {
        method: "GET",
        headers: {
          Authorization: userAuth,
        },
      },
    );

    const userJson = await userRes.json();
    if (!userRes.ok) {
      throw new Error(`X users/me failed: ${JSON.stringify(userJson)}`);
    }

    const user = userJson?.data ?? {};

    return {
      id: String(user.id ?? parsed.user_id ?? ""),
      name: String(user.name ?? ""),
      username: String(user.username ?? parsed.screen_name ?? ""),
      picture: String(user.profile_image_url ?? ""),
      accessToken: `${accessToken}:${accessSecret}`,
      refreshToken: "",
      expiresIn: undefined,
      additionalSettings: [
        {
          title: "Verified",
          description: "Is this a verified user? (Premium)",
          type: "checkbox",
          value: Boolean(user.verified),
        },
      ],
    };
  },

  async refreshToken(): Promise<AuthTokenDetails> {
    return {
      id: "",
      name: "",
      username: "",
      picture: "",
      accessToken: "",
      refreshToken: "",
      expiresIn: undefined,
    };
  },

  async post(): Promise<PostResponse[]> {
    throw new Error("X publishing not implemented yet");
  },
};

export default xProvider;
