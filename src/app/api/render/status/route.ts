import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/integrations/supabase/server";

import { requireApiUser } from "../../_lib/auth";
import { apiJson } from "../../_lib/responses";
import {
	WEB_RENDER_JOB_COLUMNS,
	isUuid,
	mapRenderJob,
	type WebRenderJobRecord,
} from "../_lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 10;

interface SupabaseErrorLike {
	code?: string;
	message?: string;
}

interface SupabaseQueryResult {
	data: unknown;
	error: SupabaseErrorLike | null;
}

interface SupabaseQueryBuilder {
	select(columns: string): SupabaseQueryBuilder;
	eq(column: string, value: string): SupabaseQueryBuilder;
	maybeSingle(): Promise<SupabaseQueryResult>;
}

interface RenderJobSupabaseClient {
	from(table: string): SupabaseQueryBuilder;
}

function isMissingRenderJobsTable(error: SupabaseErrorLike | null | undefined) {
	return (
		error?.code === "42P01" ||
		error?.code === "PGRST205" ||
		/web_render_jobs/i.test(error?.message ?? "")
	);
}

export async function GET(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const jobId = request.nextUrl.searchParams.get("jobId");
	if (!jobId) {
		return apiJson(
			{ error: "missing_job_id", message: "Missing jobId parameter." },
			{ status: 400 }
		);
	}
	if (!isUuid(jobId)) {
		return apiJson(
			{ error: "invalid_job_id", message: "jobId must be a UUID." },
			{ status: 400 }
		);
	}

	const supabase = createSupabaseServerClient(
		auth.context.accessToken
	) as unknown as RenderJobSupabaseClient;
	const { data, error } = await supabase
		.from("web_render_jobs")
		.select(WEB_RENDER_JOB_COLUMNS)
		.eq("id", jobId)
		.eq("user_id", auth.context.user.id)
		.maybeSingle();

	if (isMissingRenderJobsTable(error)) {
		return apiJson(
			{
				error: "render_jobs_unavailable",
				message:
					"Apply the web_render_jobs Supabase migration before checking render offload jobs.",
			},
			{ status: 503 }
		);
	}
	if (error) {
		return apiJson(
			{
				error: "render_job_lookup_failed",
				message: "Unable to check render job status.",
			},
			{ status: 500 }
		);
	}

	if (!data) {
		return apiJson(
			{
				error: "render_job_not_found",
				jobId,
				message: "Render job was not found for the authenticated user.",
			},
			{ status: 404 }
		);
	}

	return apiJson({ job: mapRenderJob(data as WebRenderJobRecord) });
}
