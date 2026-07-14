import { describe, expect, it } from "vitest";

import {
	MAX_RENDER_REQUEST_BYTES,
	createIdempotencyHash,
	isUuid,
	mapRenderJob,
	parseCreateRenderJobRequest,
	parseRenderJobActionRequest,
	readRenderJsonBody,
	stableJson,
	type WebRenderJobRecord,
} from "../jobs";
import {
	BATCH_ID,
	JOB_ID,
	PROJECT_ID,
	USER_ID,
	makeClipperManifest,
} from "./fixtures";

function makeJob(
	overrides: Partial<WebRenderJobRecord> = {}
): WebRenderJobRecord {
	return {
		id: JOB_ID,
		idempotency_hash: "b".repeat(64),
		user_id: USER_ID,
		project_id: PROJECT_ID,
		status: "running",
		storage_path: null,
		error: null,
		request: makeClipperManifest(),
		result: {},
		kind: "clipper_vertical",
		manifest_schema_version: 1,
		batch_id: null,
		batch_index: null,
		batch_total: null,
		progress: "42.5",
		stage: "rendering",
		progress_message: "Encoding",
		attempts: 2,
		max_attempts: 3,
		retry_at: null,
		generation: 1,
		started_at: "2026-07-14T00:01:00.000Z",
		completed_at: null,
		cancel_requested: false,
		output_storage_path: null,
		output_bytes: null,
		output_duration_seconds: null,
		output_width: null,
		output_height: null,
		output_sha256: null,
		error_code: null,
		error_message: null,
		created_at: "2026-07-14T00:00:00.000Z",
		updated_at: "2026-07-14T00:01:00.000Z",
		...overrides,
	};
}

describe("web render job helpers", () => {
	it("validates UUIDs", () => {
		expect(isUuid(PROJECT_ID)).toBe(true);
		expect(isUuid("demo")).toBe(false);
	});

	it("serializes objects stably for idempotency hashing", () => {
		const left = { b: 2, a: { d: 4, c: 3 } };
		const right = { a: { c: 3, d: 4 }, b: 2 };

		expect(stableJson(left)).toBe(stableJson(right));
		expect(createIdempotencyHash(left)).toBe(createIdempotencyHash(right));
	});

	it("derives the hash only from owner, project, and canonical manifest", () => {
		const manifest = makeClipperManifest();
		const parsed = parseCreateRenderJobRequest(
			{
				projectId: PROJECT_ID,
				manifest,
				idempotencyHash: "a".repeat(64),
				idempotencyKey: "caller-value",
			},
			USER_ID
		);
		const parsedAgain = parseCreateRenderJobRequest(
			{
				manifest: {
					...manifest,
					output: { ...manifest.output },
				},
				idempotencyHash: "c".repeat(64),
			},
			USER_ID
		);

		expect(parsed.ok).toBe(true);
		expect(parsedAgain.ok).toBe(true);
		if (parsed.ok && parsedAgain.ok) {
			expect(parsed.value.idempotencyHash).toBe(parsedAgain.value.idempotencyHash);
			expect(parsed.value.idempotencyHash).not.toBe("a".repeat(64));
			expect(parsed.value.manifest).toEqual(manifest);
		}
	});

	it("validates all-or-none zero-based batch metadata", () => {
		expect(
			parseCreateRenderJobRequest(
				{
					manifest: makeClipperManifest(),
					batchId: BATCH_ID,
					batchIndex: 1,
					batchTotal: 3,
				},
				USER_ID
			)
		).toMatchObject({
			ok: true,
			value: { batchId: BATCH_ID, batchIndex: 1, batchTotal: 3 },
		});
		expect(
			parseCreateRenderJobRequest(
				{ manifest: makeClipperManifest(), batchId: BATCH_ID },
				USER_ID
			)
		).toMatchObject({ ok: false, error: "invalid_batch" });
	});

	it("requires project and manifest identity to agree", () => {
		expect(
			parseCreateRenderJobRequest(
				{
					projectId: "55555555-5555-4555-8555-555555555555",
					manifest: makeClipperManifest(),
				},
				USER_ID
			)
		).toMatchObject({ ok: false, error: "project_manifest_mismatch" });
	});

	it("enforces the 64 KB body cap before parsing", async () => {
		const request = new Request("http://localhost/api/render", {
			method: "POST",
			body: JSON.stringify({ padding: "x".repeat(MAX_RENDER_REQUEST_BYTES) }),
		});
		await expect(readRenderJsonBody(request)).resolves.toMatchObject({
			ok: false,
			status: 413,
			error: "render_request_too_large",
		});
	});

	it("parses action job ids", () => {
		expect(parseRenderJobActionRequest({ jobId: JOB_ID })).toEqual({
			ok: true,
			jobId: JOB_ID,
		});
		expect(parseRenderJobActionRequest({ jobId: "bad" })).toMatchObject({
			ok: false,
			error: "invalid_job_id",
		});
	});

	it("maps progress, attempts, output metadata, and fresh URL fields", () => {
		expect(
			mapRenderJob(
				makeJob({
					status: "succeeded",
					output_storage_path: `${USER_ID}/${PROJECT_ID}/${"b".repeat(64)}/attempts/2-1.mp4`,
					output_bytes: "1234",
					output_duration_seconds: "5.25",
					output_width: 1080,
					output_height: 1920,
					output_sha256: "d".repeat(64),
				}),
				{ signedUrl: "https://signed.example/one" }
			)
		).toMatchObject({
			id: JOB_ID,
			status: "succeeded",
			progress: 42.5,
			attempts: 2,
			generation: 1,
			outputBytes: 1234,
			outputDurationSeconds: 5.25,
			signedUrl: "https://signed.example/one",
		});
	});
});
