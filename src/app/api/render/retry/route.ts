import type { NextRequest } from "next/server";

import { requireApiUser } from "../../_lib/auth";
import { apiJson } from "../../_lib/responses";
import {
	WEB_RENDER_JOB_COLUMNS,
	mapRenderJob,
	normalizeRenderJobStatus,
	parseRenderJobActionRequest,
	readRenderJsonBody,
	type WebRenderJobRecord,
} from "../_lib/jobs";
import {
	firstRpcRow,
	getRenderAdminClient,
	isRenderContractUnavailable,
	renderJobsUnavailable,
} from "../_lib/server";

export const runtime = "nodejs";
export const maxDuration = 10;

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
	const parsed = parseRenderJobActionRequest(body.value);
	if (parsed.ok === false) {
		return apiJson(
			{ error: parsed.error, message: parsed.message },
			{ status: parsed.status }
		);
	}

	const adminResult = getRenderAdminClient();
	if (adminResult.ok === false) return adminResult.response;
	const admin = adminResult.client;
	const owned = await admin
		.from("web_render_jobs")
		.select(WEB_RENDER_JOB_COLUMNS)
		.eq("id", parsed.jobId)
		.eq("user_id", auth.context.user.id)
		.maybeSingle();
	if (isRenderContractUnavailable(owned.error)) {
		return renderJobsUnavailable(
			"Apply the secure web render jobs migrations before retrying render jobs."
		);
	}
	if (owned.error) {
		return apiJson(
			{
				error: "render_job_lookup_failed",
				message: "Unable to verify render job ownership.",
			},
			{ status: 500 }
		);
	}
	if (!owned.data) {
		return apiJson(
			{
				error: "render_job_not_found",
				message: "Render job was not found for the authenticated user.",
			},
			{ status: 404 }
		);
	}

	const currentStatus = normalizeRenderJobStatus(
		(owned.data as WebRenderJobRecord).status
	);
	if (currentStatus !== "failed" && currentStatus !== "cancelled") {
		return apiJson(
			{
				error: "invalid_job_state",
				message: "Only failed or cancelled render jobs can be retried.",
			},
			{ status: 409 }
		);
	}

	const retried = await admin.rpc("retry_web_render_job", {
		p_job_id: parsed.jobId,
		p_user_id: auth.context.user.id,
	});
	if (isRenderContractUnavailable(retried.error)) {
		return renderJobsUnavailable(
			"Apply the secure web render jobs migrations before retrying render jobs."
		);
	}
	if (retried.error) {
		return apiJson(
			{
				error: "render_job_retry_failed",
				message: "Unable to retry the render job.",
			},
			{ status: 500 }
		);
	}
	const row = firstRpcRow(retried.data);
	if (!row) {
		return apiJson(
			{
				error: "invalid_job_state",
				message: "The render job changed state before it could be retried.",
			},
			{ status: 409 }
		);
	}

	return apiJson({ job: mapRenderJob(row as unknown as WebRenderJobRecord) });
}
