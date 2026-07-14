import type { NextRequest } from "next/server";

import { requireApiUser } from "../_lib/auth";
import { apiJson } from "../_lib/responses";
import {
	WEB_RENDER_JOB_COLUMNS,
	mapRenderJob,
	parseCreateRenderJobRequest,
	readRenderJsonBody,
	type WebRenderJobRecord,
} from "./_lib/jobs";
import { verifyManifestAssets } from "./_lib/manifest";
import {
	getRenderAdminClient,
	isRenderContractUnavailable,
	firstRpcRow,
	renderJobsUnavailable,
	type SupabaseErrorLike,
} from "./_lib/server";

export const runtime = "nodejs";
export const maxDuration = 10;

const CONTRACT_UNAVAILABLE_MESSAGE =
	"Apply the secure web render jobs migrations before queueing browser render jobs.";

function databaseFailure(error: SupabaseErrorLike | null, message: string) {
	if (isRenderContractUnavailable(error)) {
		return renderJobsUnavailable(CONTRACT_UNAVAILABLE_MESSAGE);
	}
	return apiJson({ error: "render_job_create_failed", message }, { status: 500 });
}

export async function POST(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const body = await readRenderJsonBody(request);
	if (body.ok === false) {
		return apiJson(
			{ error: body.error, message: body.message },
			{ status: body.status }
		);
	}
	const parsed = parseCreateRenderJobRequest(body.value, auth.context.user.id);
	if (parsed.ok === false) {
		return apiJson(
			{ error: parsed.error, message: parsed.message },
			{ status: parsed.status }
		);
	}

	const adminResult = getRenderAdminClient();
	if (adminResult.ok === false) return adminResult.response;
	const admin = adminResult.client;

	const project = await admin
		.from("projects")
		.select("id")
		.eq("id", parsed.value.projectId)
		.eq("user_id", auth.context.user.id)
		.maybeSingle();
	if (project.error) {
		return apiJson(
			{
				error: "project_lookup_failed",
				message: "Unable to verify project ownership.",
			},
			{ status: 500 }
		);
	}
	if (!project.data) {
		return apiJson(
			{
				error: "project_not_found",
				message: "Project was not found for the authenticated user.",
			},
			{ status: 404 }
		);
	}

	const assetVerification = await verifyManifestAssets(
		admin,
		parsed.value.assets,
		auth.context.user.id
	);
	if (assetVerification.ok === false) {
		return apiJson(
			{
				error: assetVerification.error,
				message: assetVerification.message,
			},
			{ status: assetVerification.status }
		);
	}

	const existing = await admin
		.from("web_render_jobs")
		.select(WEB_RENDER_JOB_COLUMNS)
		.eq("user_id", auth.context.user.id)
		.eq("idempotency_hash", parsed.value.idempotencyHash)
		.maybeSingle();
	if (existing.error) {
		return databaseFailure(existing.error, "Unable to check existing render jobs.");
	}
	if (existing.data) {
		return apiJson({
			job: mapRenderJob(existing.data as WebRenderJobRecord),
			idempotent: true,
		});
	}

	const enqueue = await admin.rpc("enqueue_web_render_job", {
		p_user_id: auth.context.user.id,
		p_project_id: parsed.value.projectId,
		p_idempotency_hash: parsed.value.idempotencyHash,
		p_manifest: parsed.value.manifest,
		p_kind: parsed.value.manifest.kind,
		p_manifest_schema_version: parsed.value.manifest.manifestVersion,
		p_batch_id: parsed.value.batchId,
		p_batch_index: parsed.value.batchIndex,
		p_batch_total: parsed.value.batchTotal,
	});
	if (enqueue.error) {
		if (/render_(active|hourly)_quota_exceeded/.test(enqueue.error.message ?? "")) {
			return apiJson(
				{ error: "quota_exceeded", message: "The render job limit has been reached." },
				{ status: 429 }
			);
		}
		return databaseFailure(enqueue.error, "Unable to queue render job.");
	}
	const row = firstRpcRow(enqueue.data);
	if (!row) return databaseFailure(null, "Unable to queue render job.");

	return apiJson(
		{
			job: mapRenderJob(row as unknown as WebRenderJobRecord),
			idempotent: false,
		},
		{ status: 202 }
	);
}
