import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";
import {
  createPostzAdminClient,
  publishGroupById,
} from "../_shared/postz/publish-core.ts";

type SchedulerBody = {
  limit?: number;
  source?: string;
  scheduled_at?: string;
};

type CandidateRow = {
  group_id: string;
  publish_date: string;
  attempts?: number | null;
  error?: string | null;
  updated_at?: string | null;
};

function bearerToken(headers: Headers): string | null {
  const auth = headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.replace("Bearer ", "").trim();
}

function assertSchedulerAuth(headers: Headers) {
  const token = bearerToken(headers);
  const schedulerSecret = Deno.env.get("POSTZ_SCHEDULER_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && ((schedulerSecret && token === schedulerSecret) || (serviceRole && token === serviceRole))) {
    return;
  }
  throw new Error("Unauthorized scheduler invocation");
}

function retryDue(row: CandidateRow, nowMs: number): boolean {
  if (row.error?.startsWith("[terminal]")) return false;
  const attempts = row.attempts ?? 0;
  const backoffMinutes = Math.min(60, Math.max(1, 2 ** attempts));
  const baseMs = new Date(row.updated_at ?? row.publish_date).getTime();
  return baseMs + backoffMinutes * 60_000 <= nowMs;
}

function uniqueGroups(rows: CandidateRow[], limit: number): string[] {
  const groups: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.group_id)) continue;
    seen.add(row.group_id);
    groups.push(row.group_id);
    if (groups.length >= limit) break;
  }
  return groups;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    assertSchedulerAuth(req.headers);
    const body = (await req.json().catch(() => ({}))) as SchedulerBody;
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);
    const now = new Date();
    const nowIso = now.toISOString();
    const supabaseAdmin = createPostzAdminClient();

    const { data: queued, error: queuedError } = await supabaseAdmin
      .from("postz_posts")
      .select("group_id,publish_date,attempts,error,updated_at")
      .eq("state", "QUEUE")
      .lte("publish_date", nowIso)
      .is("deleted_at", null)
      .order("publish_date", { ascending: true })
      .limit(limit);
    if (queuedError) throw queuedError;

    const { data: retryRows, error: retryError } = await supabaseAdmin
      .from("postz_posts")
      .select("group_id,publish_date,attempts,error,updated_at")
      .eq("state", "ERROR")
      .lt("attempts", 5)
      .lte("publish_date", nowIso)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (retryError) throw retryError;

    const retryDueRows = ((retryRows ?? []) as unknown as CandidateRow[]).filter((row) => retryDue(row, now.getTime()));
    const queuedRows = (queued ?? []) as unknown as CandidateRow[];
    const groupIds = uniqueGroups([...queuedRows, ...retryDueRows], limit);

    const results = [];
    for (const groupId of groupIds) {
      results.push(await publishGroupById({
        supabaseAdmin,
        groupId,
        ownerId: null,
        allowDraft: false,
      }));
    }

    return successResponse({
      success: true,
      source: body.source ?? "manual",
      scheduled_at: body.scheduled_at ?? nowIso,
      drained_groups: groupIds.length,
      results,
    });
  } catch (error) {
    return safeErrorResponse(error, "postz-scheduler");
  }
});
