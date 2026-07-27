import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";
import {
  executeComposioTool,
  listComposioProviderSummaries,
  revokeComposioConnection,
  startComposioConnection,
} from "../_shared/postz/composio.ts";

type ActionBody =
  | { action: "list-connected-accounts" }
  | { action: "list-providers" }
  | { action: "connection-status" }
  | { action: "initiate-connection"; provider: string; app_return_url?: string | null }
  | { action: "revoke"; channel_id?: string | null; connected_account_id?: string | null }
  | { action: "execute"; provider: string; tool_slug: string; arguments?: Record<string, unknown> };

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as ActionBody;
    const supabaseAdmin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    if (
      body.action === "list-providers" ||
      body.action === "list-connected-accounts" ||
      body.action === "connection-status"
    ) {
      const providers = await listComposioProviderSummaries({ supabaseAdmin, ownerId: user.id });
      return successResponse({
        providers,
        connections: providers.filter((provider) => provider.connected),
      });
    }

    if (body.action === "initiate-connection") {
      if (!body.provider) return errorResponse("provider is required", 400);
      const result = await startComposioConnection({
        ownerId: user.id,
        provider: body.provider,
        callbackUrl: body.app_return_url ?? null,
      });
      return successResponse(result);
    }

    if (body.action === "revoke") {
      const result = await revokeComposioConnection({
        supabaseAdmin,
        ownerId: user.id,
        channelId: body.channel_id ?? null,
        connectedAccountId: body.connected_account_id ?? null,
      });
      return successResponse(result);
    }

    if (body.action === "execute") {
      if (!body.provider) return errorResponse("provider is required", 400);
      if (!body.tool_slug) return errorResponse("tool_slug is required", 400);
      const result = await executeComposioTool({
        ownerId: user.id,
        provider: body.provider,
        toolSlug: body.tool_slug,
        arguments: body.arguments ?? {},
      });
      return successResponse({ result });
    }

    return errorResponse("Unsupported action", 400);
  } catch (error) {
    return safeErrorResponse(error, "postz-composio");
  }
});
