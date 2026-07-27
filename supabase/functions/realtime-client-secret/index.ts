import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { errorResponse, handleCors, successResponse } from "../_shared/response.ts";

/**
 * GA endpoint for ephemeral client secrets. The browser uses the returned
 * `value` with `/v1/realtime/calls`; never send a standard OpenAI API key
 * to the client.
 */
const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

async function hashSafetyIdentifier(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`wzrd:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const user = await authenticateRequest(req.headers);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return errorResponse("OPENAI_API_KEY is not configured", 500);
    }

    const model = Deno.env.get("WZRD_REALTIME_MODEL") || "gpt-realtime-2";
    const voice = Deno.env.get("WZRD_REALTIME_VOICE") || "marin";
    const safetyIdentifier = await hashSafetyIdentifier(user.id);

    const response = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          audio: {
            output: { voice },
          },
        },
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? JSON.stringify((payload as { error: unknown }).error)
          : "Failed to create Realtime client secret";
      return errorResponse(message, response.status);
    }

    return successResponse(payload);
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to create Realtime client secret", 500);
  }
});
