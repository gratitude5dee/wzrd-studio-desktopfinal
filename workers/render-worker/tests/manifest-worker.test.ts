import { describe, expect, it, vi } from "vitest";

import { validateRenderManifest, verifyManifestAssets } from "../src/manifest.js";
import { outputStoragePath, validateClaimedJob } from "../src/worker.js";
import {
	IDEMPOTENCY_HASH,
	PROJECT_ID,
	USER_ID,
	makeJob,
	makeQCutManifest,
} from "./fixtures.js";

describe("worker manifest revalidation", () => {
	it("accepts the full supported parity fixture and fences job columns", () => {
		const manifest = makeQCutManifest();
		expect(validateRenderManifest(manifest)).toMatchObject({ ok: true });
		expect(validateClaimedJob(makeJob())).toMatchObject({ manifest });
	});

	it("rejects unsafe commands, foreign assets, and mismatched job columns", async () => {
		expect(
			validateRenderManifest({ ...makeQCutManifest(), ffmpegArgs: ["-i", "https://evil"] })
		).toMatchObject({ ok: false, error: "unsafe_manifest" });
		expect(() => validateClaimedJob(makeJob({ kind: "clipper_vertical" }))).toThrow(
			/columns do not match/i
		);

		const info = vi.fn();
		const result = await verifyManifestAssets(
			{ storage: { from: () => ({ info }) } },
			[
				{
					bucket: "project-assets",
					path: `99999999-9999-4999-8999-999999999999/projects/${PROJECT_ID}/x.mp4`,
				},
			],
			USER_ID
		);
		expect(result).toMatchObject({ ok: false, error: "asset_not_owned" });
		expect(info).not.toHaveBeenCalled();
	});

	it("derives the immutable output path from the exact attempt and generation", () => {
		expect(outputStoragePath(makeJob({ attempts: 3, generation: 4 }))).toBe(
			`${USER_ID}/${PROJECT_ID}/${IDEMPOTENCY_HASH}/attempts/3-4.mp4`
		);
	});

	it("rejects oversized claimed manifests even if their shape would otherwise parse", () => {
		const manifest = makeQCutManifest();
		const textTrack = manifest.tracks.find((track) => track.type === "text");
		if (!textTrack || textTrack.type !== "text") throw new Error("fixture mismatch");
		textTrack.clips = Array.from({ length: 500 }, (_, index) => ({
			...textTrack.clips[0]!,
			id: `text-${index}`,
			content: "x".repeat(200),
		}));
		expect(() => validateClaimedJob(makeJob({ request: manifest }))).toThrow(/64 KB/i);
	});
});
