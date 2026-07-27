import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";
import {
  buildWzrdOsPlan,
  createWzrdOsRunPreview,
  type WzrdOsPlan,
  type WzrdOsPlanContext,
  type WzrdOsRunPreview,
} from "../_shared/wzrdos/plan.ts";

type Body =
  | { action: "plan"; prompt?: string; context?: WzrdOsPlanContext }
  | { action: "run-preview"; plan?: WzrdOsPlan }
  | { action: "history"; limit?: number };

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function isMissingTableError(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return record.code === "42P01" || String(record.message ?? "").includes("wzrdos_runs");
}

async function persistRun(userId: string, plan: WzrdOsPlan, run: WzrdOsRunPreview): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from("wzrdos_runs")
    .insert({
      id: run.id.replace(/^wzrdos_run_/, ""),
      user_id: userId,
      plan_id: plan.id,
      status: run.status,
      mode: run.mode,
      prompt: plan.prompt,
      summary: run.summary,
      plan,
      events: run.events,
      started_at: run.startedAt,
      completed_at: run.completedAt,
    });

  if (error) {
    console.warn("wzrdos-agent.persistRun skipped", error.message);
    return false;
  }

  return true;
}

async function listRuns(userId: string, limit = 8) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 25));
  const { data, error } = await supabaseAdmin()
    .from("wzrdos_runs")
    .select("id, plan_id, status, mode, summary, created_at, completed_at, events")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isMissingTableError(error)) {
      return { runs: [], persistence: "unavailable" };
    }
    throw error;
  }

  return { runs: data ?? [], persistence: "available" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = await req.json().catch(() => ({})) as Body;

    if (body.action === "plan") {
      const prompt = body.prompt?.trim();
      if (!prompt) {
        return errorResponse("prompt is required", 400);
      }

      return successResponse({
        plan: buildWzrdOsPlan(prompt, body.context ?? {}),
        tool_registry: [
          "generate_content",
          "scrape_sources",
          "schedule_posts",
          "list_assets",
          "list_channels",
          "get_credits",
        ],
      });
    }

    if (body.action === "run-preview") {
      if (!body.plan) {
        return errorResponse("plan is required", 400);
      }

      const run = createWzrdOsRunPreview(body.plan);
      run.persisted = await persistRun(user.id, body.plan, run);
      return successResponse({ run });
    }

    if (body.action === "history") {
      return successResponse(await listRuns(user.id, body.limit));
    }

    return errorResponse("Unsupported WZRDOS action", 400);
  } catch (error) {
    if (error instanceof Error && /authorization|auth/i.test(error.message)) {
      return errorResponse(error.message, 401);
    }
    return safeErrorResponse(error, "wzrdos-agent");
  }
});
