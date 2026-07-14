import { createHash } from "node:crypto";

import {
	RENDER_MANIFEST_VERSION,
	type RenderAssetRef,
	type RenderManifestV1,
	validateRenderManifest,
} from "./manifest";

export const WEB_RENDER_JOB_COLUMNS =
	"id,idempotency_hash,user_id,project_id,status,storage_path,error,request,result,kind,manifest_schema_version,batch_id,batch_index,batch_total,progress,stage,progress_message,attempts,max_attempts,retry_at,generation,started_at,completed_at,cancel_requested,output_storage_path,output_bytes,output_duration_seconds,output_width,output_height,output_sha256,error_code,error_message,created_at,updated_at";

export const MAX_RENDER_REQUEST_BYTES = 64 * 1024;
export const MAX_RUNNING_RENDER_JOBS_PER_USER = 2;
export const MAX_QUEUED_RENDER_JOBS_PER_USER = 10;
export const MAX_RENDER_ENQUEUES_PER_HOUR = 25;
export const RENDER_OUTPUT_SIGNED_URL_TTL_SECONDS = 5 * 60;

export const WEB_RENDER_JOB_STATUSES = [
	"queued",
	"running",
	"succeeded",
	"failed",
	"cancelled",
] as const;

export type WebRenderJobStatus = (typeof WEB_RENDER_JOB_STATUSES)[number];

export interface ParsedRenderJobRequest {
	projectId: string;
	idempotencyHash: string;
	manifest: RenderManifestV1;
	assets: RenderAssetRef[];
	batchId: string | null;
	batchIndex: number | null;
	batchTotal: number | null;
}

export type ParseRenderJobRequestResult =
	| { ok: true; value: ParsedRenderJobRequest }
	| { ok: false; status: number; error: string; message: string };

export interface WebRenderJobRecord {
	id: string;
	idempotency_hash: string;
	user_id: string;
	project_id: string;
	status: string;
	storage_path: string | null;
	error: string | null;
	request: unknown;
	result: unknown;
	kind: string;
	manifest_schema_version: number;
	batch_id: string | null;
	batch_index: number | null;
	batch_total: number | null;
	progress: number | string;
	stage: string | null;
	progress_message: string | null;
	attempts: number;
	max_attempts: number;
	retry_at: string | null;
	generation: number;
	started_at: string | null;
	completed_at: string | null;
	cancel_requested: boolean;
	output_storage_path: string | null;
	output_bytes: number | string | null;
	output_duration_seconds: number | string | null;
	output_width: number | null;
	output_height: number | null;
	output_sha256: string | null;
	error_code: string | null;
	error_message: string | null;
	created_at: string;
	updated_at: string;
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_TOTAL = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeRenderJobStatus(
	value: unknown
): WebRenderJobStatus | null {
	return typeof value === "string" &&
		(WEB_RENDER_JOB_STATUSES as readonly string[]).includes(value)
		? (value as WebRenderJobStatus)
		: null;
}

export function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableJson(item)).join(",")}]`;
	}

	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
		.join(",")}}`;
}

export function createIdempotencyHash(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function readBatchMetadata(record: Record<string, unknown>) {
	const batchId = record.batchId ?? record.batch_id;
	const batchIndex = record.batchIndex ?? record.batch_index;
	const batchTotal = record.batchTotal ?? record.batch_total;
	const supplied = [batchId, batchIndex, batchTotal].filter(
		(value) => value !== undefined && value !== null
	).length;

	if (supplied === 0) {
		return {
			ok: true as const,
			value: { batchId: null, batchIndex: null, batchTotal: null },
		};
	}
	if (
		supplied !== 3 ||
		!isUuid(batchId) ||
		!Number.isInteger(batchIndex) ||
		!Number.isInteger(batchTotal) ||
		(batchIndex as number) < 0 ||
		(batchTotal as number) < 1 ||
		(batchTotal as number) > MAX_BATCH_TOTAL ||
		(batchIndex as number) >= (batchTotal as number)
	) {
		return {
			ok: false as const,
			status: 400,
			error: "invalid_batch",
			message:
				"batchId, batchIndex, and batchTotal must describe a valid zero-based batch position.",
		};
	}

	return {
		ok: true as const,
		value: {
			batchId,
			batchIndex: batchIndex as number,
			batchTotal: batchTotal as number,
		},
	};
}

export function parseCreateRenderJobRequest(
	body: unknown,
	userId: string
): ParseRenderJobRequestResult {
	if (!isRecord(body)) {
		return {
			ok: false,
			status: 400,
			error: "invalid_body",
			message: "Expected a JSON object body.",
		};
	}

	const manifestInput = body.manifest;
	const manifestValidation = validateRenderManifest(manifestInput);
	if (manifestValidation.ok === false) {
		return {
			ok: false,
			status: manifestValidation.status,
			error: manifestValidation.error,
			message: manifestValidation.message,
		};
	}

	const projectId = String(
		body.projectId ?? body.project_id ?? manifestValidation.manifest.projectId
	).trim();
	if (!isUuid(projectId)) {
		return {
			ok: false,
			status: 400,
			error: "invalid_project_id",
			message: "projectId must be a UUID owned by the authenticated user.",
		};
	}
	if (projectId !== manifestValidation.manifest.projectId) {
		return {
			ok: false,
			status: 400,
			error: "project_manifest_mismatch",
			message: "projectId must match the render manifest projectId.",
		};
	}

	const serializedManifest = stableJson(manifestValidation.manifest);
	if (Buffer.byteLength(serializedManifest, "utf8") > MAX_RENDER_REQUEST_BYTES) {
		return {
			ok: false,
			status: 413,
			error: "render_request_too_large",
			message: "Render requests must be 64 KB or smaller.",
		};
	}

	const batch = readBatchMetadata(body);
	if (batch.ok === false) {
		return {
			ok: false,
			status: batch.status,
			error: batch.error,
			message: batch.message,
		};
	}

	// Caller-supplied hashes/keys are intentionally ignored. The server-owned
	// identity is the authenticated owner, project, and canonical parsed manifest.
	const idempotencyHash = createIdempotencyHash({
		userId,
		projectId,
		manifest: manifestValidation.manifest,
	});

	return {
		ok: true,
		value: {
			projectId,
			idempotencyHash,
			manifest: manifestValidation.manifest,
			assets: manifestValidation.assets,
			...batch.value,
		},
	};
}

export type ReadRenderJsonBodyResult =
	| { ok: true; value: unknown }
	| { ok: false; status: number; error: string; message: string };

export async function readRenderJsonBody(
	request: Request
): Promise<ReadRenderJsonBodyResult> {
	const contentLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_RENDER_REQUEST_BYTES) {
		return {
			ok: false,
			status: 413,
			error: "render_request_too_large",
			message: "Render requests must be 64 KB or smaller.",
		};
	}

	const reader = request.body?.getReader();
	if (!reader) {
		return {
			ok: false,
			status: 400,
			error: "invalid_body",
			message: "Expected a JSON object body.",
		};
	}

	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			receivedBytes += value.byteLength;
			if (receivedBytes > MAX_RENDER_REQUEST_BYTES) {
				await reader.cancel();
				return {
					ok: false,
					status: 413,
					error: "render_request_too_large",
					message: "Render requests must be 64 KB or smaller.",
				};
			}
			chunks.push(value);
		}
	} catch {
		return {
			ok: false,
			status: 400,
			error: "invalid_body",
			message: "Expected a JSON object body.",
		};
	}

	const bytes = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		return { ok: true, value: JSON.parse(text) as unknown };
	} catch {
		return {
			ok: false,
			status: 400,
			error: "invalid_body",
			message: "Expected a JSON object body.",
		};
	}
}

export function parseRenderJobActionRequest(body: unknown) {
	if (!isRecord(body) || !isUuid(body.jobId ?? body.job_id)) {
		return {
			ok: false as const,
			status: 400,
			error: "invalid_job_id",
			message: "jobId must be a UUID.",
		};
	}
	return { ok: true as const, jobId: (body.jobId ?? body.job_id) as string };
}

function nullableNumber(value: number | string | null): number | null {
	if (value === null) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

export function mapRenderJob(
	record: WebRenderJobRecord,
	options: { signedUrl?: string | null } = {}
) {
	return {
		id: record.id,
		idempotencyHash: record.idempotency_hash,
		userId: record.user_id,
		projectId: record.project_id,
		status: normalizeRenderJobStatus(record.status) ?? "queued",
		kind: record.kind,
		manifestSchemaVersion:
			record.manifest_schema_version ?? RENDER_MANIFEST_VERSION,
		batchId: record.batch_id ?? null,
		batchIndex: record.batch_index ?? null,
		batchTotal: record.batch_total ?? null,
		progress: nullableNumber(record.progress) ?? 0,
		stage: record.stage ?? null,
		progressMessage: record.progress_message ?? null,
		attempts: record.attempts ?? 0,
		maxAttempts: record.max_attempts ?? 3,
		retryAt: record.retry_at ?? null,
		generation: record.generation ?? 0,
		startedAt: record.started_at ?? null,
		completedAt: record.completed_at ?? null,
		cancelRequested: record.cancel_requested ?? false,
		storagePath: record.storage_path ?? null,
		outputStoragePath: record.output_storage_path ?? null,
		outputBytes: nullableNumber(record.output_bytes),
		outputDurationSeconds: nullableNumber(record.output_duration_seconds),
		outputWidth: record.output_width ?? null,
		outputHeight: record.output_height ?? null,
		outputSha256: record.output_sha256 ?? null,
		signedUrl: options.signedUrl ?? null,
		error: record.error_message ?? record.error ?? null,
		errorCode: record.error_code ?? null,
		errorMessage: record.error_message ?? record.error ?? null,
		request:
			record.request && typeof record.request === "object"
				? record.request
				: {},
		result:
			record.result && typeof record.result === "object" ? record.result : {},
		createdAt: record.created_at,
		updatedAt: record.updated_at,
	};
}
