import { describe, expect, it, vi } from "vitest";

import {
	selectExpiredOutputPaths,
	sweepExpiredJobs,
} from "../src/retention.js";
import type { WorkerSupabaseClient } from "../src/supabase.js";
import { makeConfig } from "./fixtures.js";

describe("render retention policy", () => {
	it("keeps winners for 14 days and unreferenced attempts for 24 hours", () => {
		const now = Date.parse("2026-07-15T00:00:00.000Z");
		const hour = 60 * 60 * 1_000;
		const day = 24 * hour;
		const outputs = [
			{ path: "unreferenced-old", createdAtMs: now - 25 * hour },
			{ path: "unreferenced-new", createdAtMs: now - 12 * hour },
			{ path: "winner-old", createdAtMs: now - 15 * day },
			{ path: "winner-new", createdAtMs: now - 13 * day },
		];
		const winners = new Set(["winner-old", "winner-new"]);

		expect(selectExpiredOutputPaths(outputs, winners, makeConfig(), now)).toEqual([
			"unreferenced-old",
			"winner-old",
		]);
	});

	it("deletes only terminal jobs completed more than 30 days ago", async () => {
		const now = Date.parse("2026-07-15T00:00:00.000Z");
		const builder = {
			delete: vi.fn(),
			in: vi.fn(),
			lt: vi.fn(),
			then: (
				resolve: (value: { data: null; error: null; count: number }) => unknown
			) => Promise.resolve({ data: null, error: null, count: 7 }).then(resolve),
		};
		builder.delete.mockReturnValue(builder);
		builder.in.mockReturnValue(builder);
		builder.lt.mockReturnValue(builder);
		const from = vi.fn(() => builder);
		const client = { from } as unknown as WorkerSupabaseClient;

		await expect(sweepExpiredJobs(client, makeConfig(), now)).resolves.toBe(7);
		expect(from).toHaveBeenCalledWith("web_render_jobs");
		expect(builder.delete).toHaveBeenCalledWith({ count: "exact" });
		expect(builder.in).toHaveBeenCalledWith("status", [
			"succeeded",
			"failed",
			"cancelled",
		]);
		expect(builder.lt).toHaveBeenCalledWith(
			"completed_at",
			"2026-06-15T00:00:00.000Z"
		);
	});
});
