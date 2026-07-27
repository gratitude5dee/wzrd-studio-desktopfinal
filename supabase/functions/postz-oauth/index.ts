import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";
import { decryptToken, encryptToken } from "../_shared/postz/crypto.ts";
import { isPostzComposioEnabled, listComposioProviderSummaries, startComposioConnection } from "../_shared/postz/composio.ts";
import { getProvider, isProviderConfigured, listProviders } from "../_shared/postz/providers/index.ts";
import type { OAuthTarget } from "../_shared/postz/providers/types.ts";

type StartBody = { action: "start"; provider: string; redirect?: string | null; app_return_url?: string | null };
type ListProvidersBody = { action: "list-providers" };
type ListTargetsBody = { action: "list-targets"; provider: string; state_id: string };
type FinalizeBody = { action: "finalize"; provider: string; state_id: string; target_id: string };

type ActionBody = StartBody | ListProvidersBody | ListTargetsBody | FinalizeBody;

type OAuthStateRow = {
  id: string;
  owner_id: string;
  provider: string;
  state: string;
  code_verifier: string;
  redirect: string;
  expires_at: string;
  access_token_ref?: string | null;
  refresh_token_ref?: string | null;
  token_expires_at?: string | null;
  auth_details?: any;
  app_return_url?: string | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function makeCodeVerifier(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

function makeState(): string {
  return crypto.randomUUID();
}

function getDefaultRedirect(): string {
  const base = requiredEnv("SUPABASE_URL");
  return `${base.replace(/\/+$/, "")}/functions/v1/postz-oauth`;
}

function defaultAppReturnUrl(): string {
  return "wzrd://postz/connected";
}

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeAppReturnUrl(value: string | null | undefined): string {
  const fallback = defaultAppReturnUrl();
  if (!value) return fallback;

  try {
    const url = new URL(value);
    if (url.protocol === "wzrd:") return url.toString();
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/postz/connected";
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function isAllowedAppReturnUrl(value: string, requestOrigin: string | null): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "wzrd:") return true;
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;

    const publicWebUrl = Deno.env.get("PUBLIC_WEB_URL");
    const allowedOrigins = new Set(
      (publicWebUrl ?? "")
        .split(",")
        .map((item) => originOf(item.trim()))
        .filter((item): item is string => Boolean(item)),
    );
    if (requestOrigin) allowedOrigins.add(requestOrigin);
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:3000");
    allowedOrigins.add("http://127.0.0.1:5173");

    return allowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}

function connectionRedirectUrl(base: string | null | undefined, params: Record<string, string | null | undefined>): string {
  const target = normalizeAppReturnUrl(base);
  const url = new URL(target);
  url.searchParams.set("connected", "1");
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function redirectResponse(url: string, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: url,
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function loadOauthState(input: {
  supabaseAdmin: ReturnType<typeof createClient>;
  provider: string;
  stateId: string;
  ownerId: string;
}): Promise<OAuthStateRow> {
  const { data, error } = await input.supabaseAdmin
    .from("postz_oauth_state")
    .select("*")
    .eq("id", input.stateId)
    .eq("owner_id", input.ownerId)
    .eq("provider", input.provider)
    .gt("expires_at", nowIso())
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("OAuth state expired or invalid");
  return data as unknown as OAuthStateRow;
}

async function upsertChannel(input: {
  supabaseAdmin: ReturnType<typeof createClient>;
  ownerId: string;
  provider: string;
  providerAccountId: string;
  name: string;
  username: string;
  picture: string | null;
  tokenRef: string;
  refreshRef: string | null;
  tokenExpiresAt: string | null;
  additionalSettings: unknown[];
}) {
  const payload = {
    owner_id: input.ownerId,
    provider: input.provider,
    provider_account_id: input.providerAccountId,
    name: input.name,
    username: input.username,
    picture: input.picture,
    profile: null,
    token_ref: input.tokenRef,
    refresh_token_ref: input.refreshRef,
    token_expires_at: input.tokenExpiresAt,
    status: "connected",
    disabled: false,
    posting_times: [{ time: 120 }, { time: 400 }, { time: 700 }],
    additional_settings: input.additionalSettings,
    custom_instance_url: null,
    deleted_at: null,
  };

  const { data: channelRow, error: channelError } = await input.supabaseAdmin
    .from("postz_channels")
    .upsert(payload, { onConflict: "owner_id,provider,provider_account_id" })
    .select("id")
    .maybeSingle();

  if (channelError) throw channelError;
  return (channelRow as any)?.id ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabaseAdmin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    ) as unknown as ReturnType<typeof createClient>;

    if (req.method === "GET") {
      // Provider callback (OAuth2): /postz-oauth?code=...&state=...
      // Provider callback (OAuth1 X): /postz-oauth?oauth_token=...&oauth_verifier=...
      const url = new URL(req.url);
      const code = url.searchParams.get("code") ?? url.searchParams.get("oauth_verifier");
      const state = url.searchParams.get("state") ?? url.searchParams.get("oauth_token");
      const error = url.searchParams.get("error");

      if (error) {
        const { data: stateRow } = state
          ? await supabaseAdmin
            .from("postz_oauth_state")
            .select("app_return_url")
            .eq("state", state)
            .maybeSingle()
          : { data: null };
        return redirectResponse(connectionRedirectUrl((stateRow as any)?.app_return_url, { status: "error", error }));
      }

      if (!code || !state) {
        return errorResponse("Missing code/state", 400);
      }

      const { data: oauthState, error: oauthError } = await supabaseAdmin
        .from("postz_oauth_state")
        .select("*")
        .eq("state", state)
        .gt("expires_at", nowIso())
        .maybeSingle();

      if (oauthError) throw oauthError;
      if (!oauthState) {
        return errorResponse("OAuth state expired or invalid", 400);
      }

      const row = oauthState as unknown as OAuthStateRow;
      const appReturnUrl = row.app_return_url ?? defaultAppReturnUrl();
      const provider = getProvider(row.provider);
      if (!provider) {
        return errorResponse("Unsupported provider", 400);
      }

      const tokenDetails = await provider.authenticate({
        code,
        codeVerifier: row.code_verifier,
        redirect: row.redirect,
      });

      if (tokenDetails.error) {
        return redirectResponse(
          connectionRedirectUrl(appReturnUrl, { status: "error", provider: row.provider, error: tokenDetails.error }),
        );
      }

      const accessTokenRef = await encryptToken(tokenDetails.accessToken);
      const refreshRef = tokenDetails.refreshToken ? await encryptToken(tokenDetails.refreshToken) : null;
      const expiresAt = tokenDetails.expiresIn
        ? new Date(Date.now() + tokenDetails.expiresIn * 1000).toISOString()
        : null;

      // Persist tokens temporarily for providers that need a second step.
      await supabaseAdmin
        .from("postz_oauth_state")
        .update({
          access_token_ref: accessTokenRef,
          refresh_token_ref: refreshRef,
          token_expires_at: expiresAt,
          auth_details: {
            id: tokenDetails.id,
            name: tokenDetails.name,
            username: tokenDetails.username,
            picture: tokenDetails.picture ?? null,
            additionalSettings: tokenDetails.additionalSettings ?? [],
          },
        })
        .eq("id", row.id);

      if (provider.listTargets) {
        const targets = await provider.listTargets(tokenDetails.accessToken);

        if (targets.length === 1) {
          const target = targets[0];
          const finalized = provider.finalizeTarget
            ? await provider.finalizeTarget(tokenDetails.accessToken, target)
            : {
              id: target.id,
              name: target.name,
              username: "",
              picture: "",
              accessToken: tokenDetails.accessToken,
            };

          const finalTokenRef = await encryptToken(finalized.accessToken);

          const channelId = await upsertChannel({
            supabaseAdmin,
            ownerId: row.owner_id,
            provider: row.provider,
            providerAccountId: finalized.id,
            name: finalized.name,
            username: finalized.username,
            picture: finalized.picture ?? null,
            tokenRef: finalTokenRef,
            refreshRef,
            tokenExpiresAt: expiresAt,
            additionalSettings: tokenDetails.additionalSettings ?? [],
          });

          await supabaseAdmin.from("postz_oauth_state").delete().eq("id", row.id);

          return redirectResponse(
            connectionRedirectUrl(appReturnUrl, { status: "success", provider: row.provider, channel: channelId }),
          );
        }

        if (targets.length === 0) {
          const channelId = await upsertChannel({
            supabaseAdmin,
            ownerId: row.owner_id,
            provider: row.provider,
            providerAccountId: tokenDetails.id,
            name: tokenDetails.name,
            username: tokenDetails.username,
            picture: tokenDetails.picture ?? null,
            tokenRef: accessTokenRef,
            refreshRef,
            tokenExpiresAt: expiresAt,
            additionalSettings: tokenDetails.additionalSettings ?? [],
          });

          await supabaseAdmin.from("postz_oauth_state").delete().eq("id", row.id);

          return redirectResponse(
            connectionRedirectUrl(appReturnUrl, { status: "success", provider: row.provider, channel: channelId }),
          );
        }

        // Needs user choice (page/channel/etc.) — redirect back with a state reference.
        return redirectResponse(
          connectionRedirectUrl(appReturnUrl, { status: "needs_target", provider: row.provider, state_id: row.id }),
        );
      }

      const channelId = await upsertChannel({
        supabaseAdmin,
        ownerId: row.owner_id,
        provider: row.provider,
        providerAccountId: tokenDetails.id,
        name: tokenDetails.name,
        username: tokenDetails.username,
        picture: tokenDetails.picture ?? null,
        tokenRef: accessTokenRef,
        refreshRef,
        tokenExpiresAt: expiresAt,
        additionalSettings: tokenDetails.additionalSettings ?? [],
      });

      await supabaseAdmin.from("postz_oauth_state").delete().eq("id", row.id);

      return redirectResponse(
        connectionRedirectUrl(appReturnUrl, { status: "success", provider: row.provider, channel: channelId }),
      );
    }

    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as ActionBody;

    if (isPostzComposioEnabled()) {
      if (body.action === "list-providers") {
        const providers = await listComposioProviderSummaries({ supabaseAdmin, ownerId: user.id });
        return successResponse({ providers });
      }

      if (body.action === "start") {
        const appReturnUrl = normalizeAppReturnUrl(body.app_return_url);
        if (!isAllowedAppReturnUrl(appReturnUrl, req.headers.get("Origin"))) {
          return errorResponse("App return URL is not allowed", 400);
        }
        const result = await startComposioConnection({
          ownerId: user.id,
          provider: body.provider,
          callbackUrl: appReturnUrl,
        });
        return successResponse(result);
      }

      if (body.action === "list-targets" || body.action === "finalize") {
        return errorResponse("Composio connections do not require target selection", 400);
      }
    }

    if (body.action === "list-providers") {
      return successResponse({ providers: listProviders() });
    }

    if (body.action === "start") {
      const provider = getProvider(body.provider);
      if (!provider) {
        return errorResponse("Unsupported provider", 400);
      }

      if (provider.implemented !== true) {
        return errorResponse("Provider not implemented", 400);
      }

      if (!isProviderConfigured(provider)) {
        return errorResponse("Provider not configured", 400);
      }

      const redirect = body.redirect ?? getDefaultRedirect();
      const appReturnUrl = normalizeAppReturnUrl(body.app_return_url);
      if (!isAllowedAppReturnUrl(appReturnUrl, req.headers.get("Origin"))) {
        return errorResponse("App return URL is not allowed", 400);
      }
      const state = makeState();
      const codeVerifier = makeCodeVerifier();

      const authUrl = await provider.generateAuthUrl({ state, codeVerifier, redirect });

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const oauthInsert = {
        owner_id: user.id,
        provider: provider.identifier,
        state: authUrl.state,
        code_verifier: authUrl.codeVerifier,
        redirect,
        app_return_url: appReturnUrl,
        expires_at: expiresAt,
      };

      const inserted = await supabaseAdmin.from("postz_oauth_state").insert(oauthInsert).select("id").maybeSingle();
      if (inserted.error) throw inserted.error;

      return successResponse({ url: authUrl.url });
    }

    if (body.action === "list-targets") {
      const provider = getProvider(body.provider);
      if (!provider || !provider.listTargets) {
        return errorResponse("Provider does not support targets", 400);
      }

      const row = await loadOauthState({
        supabaseAdmin,
        provider: provider.identifier,
        stateId: body.state_id,
        ownerId: user.id,
      });

      if (!row.access_token_ref) {
        return errorResponse("OAuth state missing token", 400);
      }

      const accessToken = await decryptToken(row.access_token_ref);
      const targets = await provider.listTargets(accessToken);

      return successResponse({ targets });
    }

    if (body.action === "finalize") {
      const provider = getProvider(body.provider);
      if (!provider || !provider.listTargets) {
        return errorResponse("Provider does not support targets", 400);
      }

      const row = await loadOauthState({
        supabaseAdmin,
        provider: provider.identifier,
        stateId: body.state_id,
        ownerId: user.id,
      });

      if (!row.access_token_ref) {
        return errorResponse("OAuth state missing token", 400);
      }

      const accessToken = await decryptToken(row.access_token_ref);
      const targets = await provider.listTargets(accessToken);
      const target = targets.find((t) => t.id === body.target_id);
      if (!target) {
        return errorResponse("Target not found", 404);
      }

      const finalized = provider.finalizeTarget
        ? await provider.finalizeTarget(accessToken, target as OAuthTarget)
        : {
          id: target.id,
          name: target.name,
          username: "",
          picture: "",
          accessToken,
        };

      const tokenRef = await encryptToken(finalized.accessToken);

      const channelId = await upsertChannel({
        supabaseAdmin,
        ownerId: user.id,
        provider: provider.identifier,
        providerAccountId: finalized.id,
        name: finalized.name,
        username: finalized.username,
        picture: finalized.picture ?? null,
        tokenRef,
        refreshRef: row.refresh_token_ref ?? null,
        tokenExpiresAt: row.token_expires_at ?? null,
        additionalSettings: Array.isArray(row.auth_details?.additionalSettings) ? row.auth_details.additionalSettings : [],
      });

      await supabaseAdmin.from("postz_oauth_state").delete().eq("id", row.id);

      return successResponse({ channel_id: channelId });
    }

    return errorResponse("Unsupported action", 400);
  } catch (error) {
    return safeErrorResponse(error, "postz-oauth");
  }
});
