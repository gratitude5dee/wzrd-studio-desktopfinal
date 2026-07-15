import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForApifyRun } from "../src/apify.js";
import type { MediaIngestManifestV1 } from "../src/manifest.js";
import { PROJECT_ID, USER_ID, makeConfig } from "./fixtures.js";

const manifest: MediaIngestManifestV1 = {
	manifestVersion: 1,
	kind: "media_ingest",
	projectId: PROJECT_ID,
	source: {
		provider: "apify",
		actorRunId: "run_123",
		datasetId: "dataset_123",
		itemId: "item_123",
	},
	destination: {
		bucket: "project-assets",
		path: `${USER_ID}/ingest/output.mp4`,
	},
};

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("Apify ingest polling", () => {
	it("waits for SUCCEEDED before allowing transfer work", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { status: "RUNNING", defaultDatasetId: "dataset_123" } }), {
					status: 200,
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { status: "SUCCEEDED", defaultDatasetId: "dataset_123" } }), {
					status: 200,
				})
			);
		vi.stubGlobal("fetch", fetchMock);
		const waiting = waitForApifyRun(makeConfig(), manifest, new AbortController().signal);

		await vi.advanceTimersByTimeAsync(20);
		await expect(waiting).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
			"https://api.apify.com/v2/actor-runs/run_123"
		);
	});

	it("treats ABORTING as active until a terminal state arrives", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						data: { status: "ABORTING", defaultDatasetId: "dataset_123" },
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						data: { status: "ABORTED", defaultDatasetId: "dataset_123" },
					}),
					{ status: 200 }
				)
			);
		vi.stubGlobal("fetch", fetchMock);
		const waiting = waitForApifyRun(
			makeConfig(),
			manifest,
			new AbortController().signal
		);
		const rejected = expect(waiting).rejects.toMatchObject({
			code: "apify_failed",
			retryable: false,
		});
		await vi.advanceTimersByTimeAsync(20);
		await rejected;
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("rejects terminal actor failure without polling forever", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: { status: "FAILED", defaultDatasetId: "dataset_123" } }), {
				status: 200,
			})
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			waitForApifyRun(makeConfig(), manifest, new AbortController().signal)
		).rejects.toMatchObject({ code: "apify_failed", retryable: false });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
