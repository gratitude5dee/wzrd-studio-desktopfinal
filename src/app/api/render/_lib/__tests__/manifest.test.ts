import { describe, expect, it, vi } from "vitest";

import {
	CLOUD_RENDER_PARITY_MATRIX,
	MAX_RENDER_ASSET_BYTES,
	validateRenderManifest,
	verifyManifestAssets,
} from "../manifest";
import {
	OTHER_USER_ID,
	PROJECT_ID,
	USER_ID,
	makeClipperManifest,
	makeParityManifest,
} from "./fixtures";

function asRecord(value: unknown): Record<string, unknown> {
	return value as Record<string, unknown>;
}

describe("render manifest v1 contract", () => {
	it("accepts only the documented parity allowlist", () => {
		const result = validateRenderManifest(makeParityManifest());

		expect(result.ok).toBe(true);
		expect(CLOUD_RENDER_PARITY_MATRIX).toMatchObject({
			video_tracks: "supported",
			audio_tracks: "supported",
			crossfade_fade_audio_crossfade: "allowlist_only",
			remotion_tracks: "in_browser_only",
			unknown_features: "rejected",
		});
	});

	it("rejects unknown versions and unknown strict-schema keys", () => {
		expect(
			validateRenderManifest({ ...makeClipperManifest(), manifestVersion: 2 })
		).toMatchObject({
			ok: false,
			error: "unsupported_manifest_version",
		});
		expect(
			validateRenderManifest({ ...makeClipperManifest(), surprise: true })
		).toMatchObject({ ok: false, error: "invalid_manifest" });
	});

	it("rejects URL, filesystem, traversal, and raw FFmpeg/filter inputs", () => {
		for (const path of [
			"https://example.com/source.mp4",
			"file:///tmp/source.mp4",
			"/tmp/source.mp4",
			`${USER_ID}/../source.mp4`,
			`${USER_ID}\\source.mp4`,
		]) {
			expect(
				validateRenderManifest({
					...makeClipperManifest(),
					source: { bucket: "project-assets", path },
				})
			).toMatchObject({ ok: false });
		}
		expect(
			validateRenderManifest({
				...makeClipperManifest(),
				filtergraph: "[0:v]scale=1920:1080[out]",
			})
		).toMatchObject({ ok: false, error: "unsafe_manifest" });
	});

	it("classifies unsupported effects, transitions, tracks, and speed controls", () => {
		const manifest = makeParityManifest();
		const unsupportedTransition = structuredClone(manifest);
		asRecord(unsupportedTransition.transitions[0]).type = "wipe";
		expect(validateRenderManifest(unsupportedTransition)).toMatchObject({
			ok: false,
			error: "unsupported_feature",
		});

		const unsupportedEffect = structuredClone(manifest);
		asRecord(unsupportedEffect.tracks[0].clips[0]).effects = [
			{ type: "blur", durationSeconds: 1 },
		];
		expect(validateRenderManifest(unsupportedEffect)).toMatchObject({
			ok: false,
			error: "unsupported_feature",
		});

		const speed = structuredClone(manifest);
		asRecord(speed.tracks[0].clips[0]).playbackRate = 2;
		expect(validateRenderManifest(speed)).toMatchObject({
			ok: false,
			error: "unsupported_feature",
		});

		const remotion = structuredClone(manifest);
		asRecord(remotion.tracks[0]).type = "remotion";
		expect(validateRenderManifest(remotion)).toMatchObject({
			ok: false,
			error: "unsupported_feature",
		});
	});

	it("enforces output, duration, fps, transition, and asset-count bounds", () => {
		const tooWide = structuredClone(makeParityManifest());
		asRecord(tooWide.output).width = 3841;
		expect(validateRenderManifest(tooWide)).toMatchObject({
			ok: false,
			error: "invalid_manifest",
		});

		const tooFast = structuredClone(makeParityManifest());
		asRecord(tooFast.output).fps = 61;
		expect(validateRenderManifest(tooFast)).toMatchObject({
			ok: false,
			error: "invalid_manifest",
		});

		const longTransition = structuredClone(makeParityManifest());
		asRecord(longTransition.transitions[0]).durationSeconds = 6;
		expect(validateRenderManifest(longTransition)).toMatchObject({
			ok: false,
			error: "invalid_manifest",
		});

		const tooManyAssets = makeParityManifest();
		const videoTrack = tooManyAssets.tracks[0];
		if (videoTrack.type !== "video") throw new Error("fixture track mismatch");
		videoTrack.clips = Array.from({ length: 65 }, (_, index) => ({
			...videoTrack.clips[0],
			id: `video-${index}`,
			source: {
				bucket: "project-assets" as const,
				path: `${USER_ID}/projects/${PROJECT_ID}/${index}.mp4`,
			},
		}));
		tooManyAssets.transitions = [];
		expect(validateRenderManifest(tooManyAssets)).toMatchObject({
			ok: false,
			error: "invalid_manifest",
		});
	});

	it("keeps media_ingest server-only", () => {
		const ingest = {
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
				path: `${USER_ID}/ingest/source.mp4`,
			},
		};

		expect(validateRenderManifest(ingest)).toMatchObject({
			ok: false,
			error: "unsupported_feature",
		});
		expect(validateRenderManifest(ingest, { allowMediaIngest: true })).toMatchObject({
			ok: true,
			assets: [],
		});
	});
});

describe("render manifest asset ownership", () => {
	it("rejects a foreign owner path without querying storage", async () => {
		const info = vi.fn();
		const result = await verifyManifestAssets(
			{ storage: { from: () => ({ info }) } },
			[
				{
					bucket: "project-assets",
					path: `${OTHER_USER_ID}/projects/${PROJECT_ID}/source.mp4`,
				},
			],
			USER_ID
		);

		expect(result).toMatchObject({ ok: false, error: "asset_not_owned" });
		expect(info).not.toHaveBeenCalled();
	});

	it("requires existing objects no larger than 2 GB", async () => {
		const asset = makeClipperManifest().source;
		const valid = await verifyManifestAssets(
			{
				storage: {
					from: () => ({
						info: vi.fn().mockResolvedValue({
							data: { size: MAX_RENDER_ASSET_BYTES },
							error: null,
						}),
					}),
				},
			},
			[asset],
			USER_ID
		);
		expect(valid).toMatchObject({ ok: true });

		const oversized = await verifyManifestAssets(
			{
				storage: {
					from: () => ({
						info: vi.fn().mockResolvedValue({
							data: { size: MAX_RENDER_ASSET_BYTES + 1 },
							error: null,
						}),
					}),
				},
			},
			[asset],
			USER_ID
		);
		expect(oversized).toMatchObject({ ok: false, error: "asset_too_large" });
	});
});
