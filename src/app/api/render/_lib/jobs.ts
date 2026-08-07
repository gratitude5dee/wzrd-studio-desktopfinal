import { createHash } from "node:crypto";

export const WEB_RENDER_JOB_COLUMNS =
	"id,idempotency_hash,user_id,project_id,status,storage_path,error,request,result,created_at,updated_at";

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
	renderRequest: Record<string, unknown>;
	storagePath: string | null;
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
	created_at: string;
	updated_at: string;
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const MAX_RENDER_REQUEST_BYTES = 64 * 1024;
const MAX_STORAGE_PATH_LENGTH = 1024;

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

function readRenderRequest(record: Record<string, unknown>) {
	const candidate =
		record.request ?? record.renderRequest ?? record.payload ?? {};

	if (!isRecord(candidate)) {
		return {
			ok: false as const,
			status: 400,
			error: "invalid_render_request",
			message: "Render request must be a JSON object.",
		};
	}

	const serialized = stableJson(candidate);
	if (Buffer.byteLength(serialized, "utf8") > MAX_RENDER_REQUEST_BYTES) {
		return {
			ok: false as const,
			status: 413,
			error: "render_request_too_large",
			message: "Render request metadata must be 64 KB or smaller.",
		};
	}

	return { ok: true as const, value: candidate };
}

function hasControlCharacter(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code >= 0 && code <= 31) return true;
	}
	return false;
}

function readStoragePath(record: Record<string, unknown>) {
	const candidate = record.storagePath ?? record.outputStoragePath;
	if (candidate === undefined || candidate === null || candidate === "") {
		return { ok: true as const, value: null };
	}

	if (
		typeof candidate !== "string" ||
		candidate.length > MAX_STORAGE_PATH_LENGTH ||
		hasControlCharacter(candidate)
	) {
		return {
			ok: false as const,
			status: 400,
			error: "invalid_storage_path",
			message: "storagePath must be a short printable string.",
		};
	}

	return { ok: true as const, value: candidate };
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

	const projectId = String(body.projectId ?? body.project_id ?? "").trim();
	if (!isUuid(projectId)) {
		return {
			ok: false,
			status: 400,
			error: "invalid_project_id",
			message: "projectId must be a UUID owned by the authenticated user.",
		};
	}

	const request = readRenderRequest(body);
	if (request.ok === false) {
		return {
			ok: false,
			status: request.status,
			error: request.error,
			message: request.message,
		};
	}

	const storagePath = readStoragePath(body);
	if (storagePath.ok === false) {
		return {
			ok: false,
			status: storagePath.status,
			error: storagePath.error,
			message: storagePath.message,
		};
	}

	const suppliedHash =
		typeof body.idempotencyHash === "string"
			? body.idempotencyHash.trim().toLowerCase()
			: "";
	if (suppliedHash && !SHA256_HEX_PATTERN.test(suppliedHash)) {
		return {
			ok: false,
			status: 400,
			error: "invalid_idempotency_hash",
			message: "idempotencyHash must be a SHA-256 hex string.",
		};
	}

	const idempotencyKey =
		typeof body.idempotencyKey === "string"
			? body.idempotencyKey.trim()
			: "";
	const idempotencyHash =
		suppliedHash ||
		createIdempotencyHash(
			idempotencyKey
				? { userId, projectId, idempotencyKey }
				: { userId, projectId, request: request.value }
		);

	return {
		ok: true,
		value: {
			projectId,
			idempotencyHash,
			renderRequest: request.value,
			storagePath: storagePath.value,
		},
	};
}

export function mapRenderJob(record: WebRenderJobRecord) {
	return {
		id: record.id,
		idempotencyHash: record.idempotency_hash,
		userId: record.user_id,
		projectId: record.project_id,
		status: normalizeRenderJobStatus(record.status) ?? "queued",
		storagePath: record.storage_path ?? null,
		error: record.error ?? null,
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
