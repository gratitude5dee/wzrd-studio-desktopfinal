import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { authenticateRequest } from "../_shared/auth.ts";
import { errorResponse, handleCors, safeErrorResponse, successResponse } from "../_shared/response.ts";
import {
  createPostzAdminClient,
  publishGroupById,
  publishPostById,
} from "../_shared/postz/publish-core.ts";

type Body =
  | { action: "publish-post"; post_id: string }
  | { action: "publish-group"; group_id: string };

type Caller =
  | { type: "service" }
  | { type: "user"; userId: string };

function bearerToken(headers: Headers): string | null {
  const auth = headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.replace("Bearer ", "").trim();
}

async function resolveCaller(headers: Headers): Promise<Caller> {
  const token = bearerToken(headers);
  const schedulerSecret = Deno.env.get("POSTZ_SCHEDULER_SECRET");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (token && ((schedulerSecret && token === schedulerSecret) || (serviceRole && token === serviceRole))) {
    return { type: "service" };
  }

  const user = await authenticateRequest(headers);
  return { type: "user", userId: user.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const caller = await resolveCaller(req.headers);
    const body = (await req.json()) as Body;
    const supabaseAdmin = createPostzAdminClient();

    if (body.action === "publish-post") {
      if (!body.post_id) return errorResponse("post_id is required", 400);
      const result = await publishPostById({
        supabaseAdmin,
        postId: body.post_id,
        ownerId: caller.type === "user" ? caller.userId : null,
        allowDraft: caller.type === "user",
      });
      return successResponse({ success: result.state !== "error", result });
    }

    if (body.action === "publish-group") {
      if (!body.group_id) return errorResponse("group_id is required", 400);
      const result = await publishGroupById({
        supabaseAdmin,
        groupId: body.group_id,
        ownerId: caller.type === "user" ? caller.userId : null,
        allowDraft: caller.type === "user",
      });
      return successResponse({
        success: !result.results.some((row) => row.state === "error"),
        ...result,
      });
    }

    return errorResponse("Unsupported action", 400);
  } catch (error) {
    return safeErrorResponse(error, "postz-publish");
  }
});
