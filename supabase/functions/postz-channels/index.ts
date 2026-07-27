import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";
import { isPostzComposioEnabled, listComposioProviderSummaries } from "../_shared/postz/composio.ts";

type ActionBody =
  | { action: "list" }
  | { action: "seed" };

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function pickChannelColumns() {
  // Never return token material to the client.
  return [
    "id",
    "owner_id",
    "workspace_id",
    "provider",
    "provider_account_id",
    "name",
    "username",
    "picture",
    "profile",
    "token_expires_at",
    "status",
    "disabled",
    "posting_times",
    "additional_settings",
    "custom_instance_url",
    "created_at",
    "updated_at",
    "deleted_at",
  ].join(",");
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

    if (isPostzComposioEnabled()) {
      await listComposioProviderSummaries({ supabaseAdmin, ownerId: user.id });
    }

    if (body.action === "seed") {
      // Seed demo channels for Phase 2 so the UI can be used before OAuth/provider work lands.
      const { count } = await supabaseAdmin
        .from("postz_channels")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .is("deleted_at", null);

      if ((count ?? 0) === 0) {
        const seedRows = [
          {
            owner_id: user.id,
            provider: "youtube",
            provider_account_id: `${user.id}:seed:youtube`,
            name: "YouTube (demo)",
            username: "@demo",
            picture: null,
            profile: { seeded: true },
            token_ref: `seed:${crypto.randomUUID()}`,
            refresh_token_ref: null,
            token_expires_at: null,
            status: "connected",
            disabled: false,
            posting_times: [{ time: 120 }, { time: 400 }, { time: 700 }],
            additional_settings: [],
            custom_instance_url: null,
          },
          {
            owner_id: user.id,
            provider: "tiktok",
            provider_account_id: `${user.id}:seed:tiktok`,
            name: "TikTok (demo)",
            username: "@demo",
            picture: null,
            profile: { seeded: true },
            token_ref: `seed:${crypto.randomUUID()}`,
            refresh_token_ref: null,
            token_expires_at: null,
            status: "connected",
            disabled: false,
            posting_times: [{ time: 120 }, { time: 400 }, { time: 700 }],
            additional_settings: [],
            custom_instance_url: null,
          },
          {
            owner_id: user.id,
            provider: "instagram",
            provider_account_id: `${user.id}:seed:instagram`,
            name: "Instagram (demo)",
            username: "@demo",
            picture: null,
            profile: { seeded: true },
            token_ref: `seed:${crypto.randomUUID()}`,
            refresh_token_ref: null,
            token_expires_at: null,
            status: "connected",
            disabled: false,
            posting_times: [{ time: 120 }, { time: 400 }, { time: 700 }],
            additional_settings: [],
            custom_instance_url: null,
          },
        ];

        const inserted = await supabaseAdmin.from("postz_channels").insert(seedRows);
        if (inserted.error) {
          throw inserted.error;
        }
      }
    }

    if (body.action !== "list" && body.action !== "seed") {
      return errorResponse("Unsupported action", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("postz_channels")
      .select(pickChannelColumns())
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return successResponse({ channels: data ?? [] });
  } catch (error) {
    return safeErrorResponse(error, "postz-channels");
  }
});
