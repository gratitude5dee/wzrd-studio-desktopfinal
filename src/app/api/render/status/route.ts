import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { requireApiUser } from "../../_lib/auth";
import { apiJson } from "../../_lib/responses";
import {
	RENDER_OUTPUT_SIGNED_URL_TTL_SECONDS,
	WEB_RENDER_JOB_COLUMNS,
	isUuid,
	mapRenderJob,
	normalizeRenderJobStatus,
	type WebRenderJobRecord,
} from "../_lib/jobs";
import {
	getRenderAdminClient,
	isRenderContractUnavailable,
	renderJobsUnavailable,
	type RenderAdminClient,
} from "../_lib/server";

export const runtime = "nodejs";
export const maxDuration = 10;

async function mapJobWithFreshOutputUrl(
	admin: RenderAdminClient,
	record: WebRenderJobRecord
) {
	if (record.status !== "succeeded") return mapRenderJob(record);
	if (!record.output_storage_path) {
		throw new Error("A succeeded render job has no output object.");
	}

	const signed = await admin.storage
		.from("render-outputs")
		.createSignedUrl(
			record.output_storage_path,
			RENDER_OUTPUT_SIGNED_URL_TTL_SECONDS,
			{ cacheNonce: randomUUID() }
		);
	if (signed.error || !signed.data?.signedUrl) {
		throw new Error("Unable to sign the render output object.");
	}
	return mapRenderJob(record, { signedUrl: signed.data.signedUrl });
}

function summarizeBatch(records: WebRenderJobRecord[]) {
	const statuses = records.map(
		(record) => normalizeRenderJobStatus(record.status) ?? "queued"
	);
	const terminalCount = statuses.filter((status) =>
		["succeeded", "failed", "cancelled"].includes(status)
	).length;
	const progress =
		records.reduce((total, record) => total + Number(record.progress || 0), 0) /
		records.length;

	let status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "partial";
	if (statuses.every((value) => value === "succeeded")) status = "succeeded";
	else if (terminalCount === records.length) {
		if (statuses.every((value) => value === "cancelled")) status = "cancelled";
		else if (statuses.every((value) => value === "failed")) status = "failed";
		else status = "partial";
	} else if (statuses.some((value) => value === "running")) status = "running";
	else status = "queued";

	return {
		status,
		progress: Math.max(0, Math.min(100, progress)),
		completed: terminalCount,
		total: records.length,
	};
}

export async function GET(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const jobId = request.nextUrl.searchParams.get("jobId");
	const batchId = request.nextUrl.searchParams.get("batchId");
	if ((!jobId && !batchId) || (jobId && batchId)) {
		return apiJson(
			{
				error: "invalid_status_query",
				message: "Provide exactly one of jobId or batchId.",
			},
			{ status: 400 }
		);
	}
	const selectedId = jobId ?? batchId;
	if (!isUuid(selectedId)) {
		return apiJson(
			{
				error: jobId ? "invalid_job_id" : "invalid_batch_id",
				message: `${jobId ? "jobId" : "batchId"} must be a UUID.`,
			},
			{ status: 400 }
		);
	}

	const adminResult = getRenderAdminClient();
	if (adminResult.ok === false) return adminResult.response;
	const admin = adminResult.client;

	if (jobId) {
		const result = await admin
			.from("web_render_jobs")
			.select(WEB_RENDER_JOB_COLUMNS)
			.eq("id", jobId)
			.eq("user_id", auth.context.user.id)
			.maybeSingle();
		if (isRenderContractUnavailable(result.error)) {
			return renderJobsUnavailable(
				"Apply the secure web render jobs migrations before checking render jobs."
			);
		}
		if (result.error) {
			return apiJson(
				{
					error: "render_job_lookup_failed",
					message: "Unable to check render job status.",
				},
				{ status: 500 }
			);
		}
		if (!result.data) {
			return apiJson(
				{
					error: "render_job_not_found",
					jobId,
					message: "Render job was not found for the authenticated user.",
				},
				{ status: 404 }
			);
		}

		try {
			return apiJson({
				job: await mapJobWithFreshOutputUrl(
					admin,
					result.data as WebRenderJobRecord
				),
			});
		} catch {
			return apiJson(
				{
					error: "render_output_unavailable",
					message: "Unable to create a fresh download URL for the render output.",
				},
				{ status: 502 }
			);
		}
	}

	const result = await admin
		.from("web_render_jobs")
		.select(WEB_RENDER_JOB_COLUMNS)
		.eq("batch_id", batchId)
		.eq("user_id", auth.context.user.id)
		.order("batch_index", { ascending: true });
	if (isRenderContractUnavailable(result.error)) {
		return renderJobsUnavailable(
			"Apply the secure web render jobs migrations before checking render batches."
		);
	}
	if (result.error) {
		return apiJson(
			{
				error: "render_job_lookup_failed",
				message: "Unable to check render batch status.",
			},
			{ status: 500 }
		);
	}
	const records = Array.isArray(result.data)
		? (result.data as WebRenderJobRecord[])
		: [];
	if (records.length === 0) {
		return apiJson(
			{
				error: "render_batch_not_found",
				batchId,
				message: "Render batch was not found for the authenticated user.",
			},
			{ status: 404 }
		);
	}

	try {
		return apiJson({
			batchId,
			batch: summarizeBatch(records),
			jobs: await Promise.all(
				records.map((record) => mapJobWithFreshOutputUrl(admin, record))
			),
		});
	} catch {
		return apiJson(
			{
				error: "render_output_unavailable",
				message: "Unable to create fresh download URLs for the render batch.",
			},
			{ status: 502 }
		);
	}
}
