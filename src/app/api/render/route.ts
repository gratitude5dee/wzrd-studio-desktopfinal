import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/integrations/supabase/server";

import { requireApiUser } from "../_lib/auth";
import { apiJson, readJsonBody } from "../_lib/responses";
import {
	WEB_RENDER_JOB_COLUMNS,
	mapRenderJob,
	parseCreateRenderJobRequest,
	type WebRenderJobRecord,
} from "./_lib/jobs";

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
	insert(values: Record<string, unknown>): SupabaseQueryBuilder;
	maybeSingle(): Promise<SupabaseQueryResult>;
	single(): Promise<SupabaseQueryResult>;
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

function isUniqueViolation(error: SupabaseErrorLike | null | undefined) {
	return error?.code === "23505";
}

function renderJobsUnavailable() {
	return apiJson(
		{
			error: "render_jobs_unavailable",
			message:
				"Apply the web_render_jobs Supabase migration before queueing browser render offload jobs.",
		},
		{ status: 503 }
	);
}

export async function POST(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const parsed = parseCreateRenderJobRequest(
		await readJsonBody(request),
		auth.context.user.id
	);
	if (parsed.ok === false) {
		return apiJson(
			{ error: parsed.error, message: parsed.message },
			{ status: parsed.status }
		);
	}

	const supabase = createSupabaseServerClient(
		auth.context.accessToken
	) as unknown as RenderJobSupabaseClient;

	const { data: project, error: projectError } = await supabase
		.from("projects")
		.select("id")
		.eq("id", parsed.value.projectId)
		.eq("user_id", auth.context.user.id)
		.maybeSingle();

	if (projectError) {
		return apiJson(
			{
				error: "project_lookup_failed",
				message: "Unable to verify project ownership.",
			},
			{ status: 500 }
		);
	}
	if (!project) {
		return apiJson(
			{
				error: "project_not_found",
				message: "Project was not found for the authenticated user.",
			},
			{ status: 404 }
		);
	}

	const existing = await supabase
		.from("web_render_jobs")
		.select(WEB_RENDER_JOB_COLUMNS)
		.eq("user_id", auth.context.user.id)
		.eq("idempotency_hash", parsed.value.idempotencyHash)
		.maybeSingle();

	if (isMissingRenderJobsTable(existing.error)) {
		return renderJobsUnavailable();
	}
	if (existing.error) {
		return apiJson(
			{
				error: "render_job_lookup_failed",
				message: "Unable to check existing render jobs.",
			},
			{ status: 500 }
		);
	}
	if (existing.data) {
		return apiJson({
			job: mapRenderJob(existing.data as WebRenderJobRecord),
			idempotent: true,
		});
	}

	const insert = await supabase
		.from("web_render_jobs")
		.insert({
			user_id: auth.context.user.id,
			project_id: parsed.value.projectId,
			idempotency_hash: parsed.value.idempotencyHash,
			status: "queued",
			storage_path: parsed.value.storagePath,
			request: parsed.value.renderRequest,
		})
		.select(WEB_RENDER_JOB_COLUMNS)
		.single();

	if (isMissingRenderJobsTable(insert.error)) {
		return renderJobsUnavailable();
	}
	if (isUniqueViolation(insert.error)) {
		const duplicate = await supabase
			.from("web_render_jobs")
			.select(WEB_RENDER_JOB_COLUMNS)
			.eq("user_id", auth.context.user.id)
			.eq("idempotency_hash", parsed.value.idempotencyHash)
			.maybeSingle();

		if (duplicate.data) {
			return apiJson({
				job: mapRenderJob(duplicate.data as WebRenderJobRecord),
				idempotent: true,
			});
		}
	}
	if (insert.error) {
		return apiJson(
			{
				error: "render_job_create_failed",
				message: "Unable to queue render job.",
			},
			{ status: 500 }
		);
	}

	return apiJson(
		{
			job: mapRenderJob(insert.data as WebRenderJobRecord),
			idempotent: false,
		},
		{ status: 202 }
	);
}
