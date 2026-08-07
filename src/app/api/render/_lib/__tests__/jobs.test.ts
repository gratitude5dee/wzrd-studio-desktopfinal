import { describe, expect, it } from "vitest";

import {
	createIdempotencyHash,
	isUuid,
	mapRenderJob,
	parseCreateRenderJobRequest,
	stableJson,
} from "../jobs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

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

	it("parses a queue request and derives a deterministic hash", () => {
		const parsed = parseCreateRenderJobRequest(
			{
				projectId: PROJECT_ID,
				request: { timelineHash: "abc", settings: { quality: "medium" } },
			},
			USER_ID
		);
		const parsedAgain = parseCreateRenderJobRequest(
			{
				project_id: PROJECT_ID,
				renderRequest: { settings: { quality: "medium" }, timelineHash: "abc" },
			},
			USER_ID
		);

		expect(parsed.ok).toBe(true);
		expect(parsedAgain.ok).toBe(true);
		if (parsed.ok && parsedAgain.ok) {
			expect(parsed.value.idempotencyHash).toBe(
				parsedAgain.value.idempotencyHash
			);
			expect(parsed.value.storagePath).toBeNull();
		}
	});

	it("accepts an explicit SHA-256 idempotency hash", () => {
		const hash = "a".repeat(64);
		const parsed = parseCreateRenderJobRequest(
			{ projectId: PROJECT_ID, idempotencyHash: hash, request: {} },
			USER_ID
		);

		expect(parsed).toMatchObject({
			ok: true,
			value: { idempotencyHash: hash },
		});
	});

	it("rejects invalid project ids and non-object render requests", () => {
		expect(
			parseCreateRenderJobRequest({ projectId: "demo", request: {} }, USER_ID)
		).toMatchObject({ ok: false, error: "invalid_project_id" });
		expect(
			parseCreateRenderJobRequest(
				{ projectId: PROJECT_ID, request: ["too", "large"] },
				USER_ID
			)
		).toMatchObject({ ok: false, error: "invalid_render_request" });
	});

	it("maps database rows to API jobs with safe defaults", () => {
		expect(
			mapRenderJob({
				id: PROJECT_ID,
				idempotency_hash: "b".repeat(64),
				user_id: USER_ID,
				project_id: PROJECT_ID,
				status: "unknown",
				storage_path: null,
				error: null,
				request: null,
				result: null,
				created_at: "2026-06-20T00:00:00.000Z",
				updated_at: "2026-06-20T00:00:00.000Z",
			})
		).toMatchObject({
			id: PROJECT_ID,
			status: "queued",
			storagePath: null,
			request: {},
			result: {},
		});
	});
});
