import { describe, expect, it } from "vitest";

import {
	compileClipperManifest,
	compileQCutManifest,
	createFfmpegWorkerError,
	createAssetResolver,
	isDeterministicFfmpegFailure,
	validateOutputExpectation,
	validateSourceRanges,
} from "../src/ffmpeg.js";
import { CommandExecutionError } from "../src/process.js";
import type { LocalAsset } from "../src/types.js";
import {
	makeClipperManifest,
	makeLocalAssets,
	makeQCutManifest,
} from "./fixtures.js";

describe("validated FFmpeg manifest compiler", () => {
	it("compiles video/audio/text/captions/images/stickers/word cuts/transforms and effects", () => {
		const manifest = makeQCutManifest();
		const compiled = compileQCutManifest(
			manifest,
			createAssetResolver(makeLocalAssets(manifest)),
			"/tmp/output.mp4",
			"/tmp/overlays.ass"
		);
		const filterIndex = compiled.args.indexOf("-filter_complex");
		const graph = compiled.args[filterIndex + 1];

		expect(compiled.args).not.toContain("-c");
		expect(compiled.args.at(-1)).toBe("/tmp/output.mp4");
		expect(graph).toContain("concat=n=2:v=1:a=0");
		expect(graph).toContain("concat=n=2:v=0:a=1");
		expect(graph).toContain("rotate=");
		expect(graph).toContain("overlay=");
		expect(graph).toContain("amix=inputs=");
		expect(graph).toContain("afade=t=in");
		expect(graph).toContain("subtitles=filename=");
		expect(compiled.ass).toContain("DejaVu Sans");
		expect(compiled.ass).toContain("Hello \\{WZRD\\}");
		expect(compiled.ass).toContain("Caption");
		expect(compiled.ass).toContain("\\fad(300,0)");
	});

	it("compiles the vertical clipper crop and trusted logo overlay", () => {
		const manifest = makeClipperManifest();
		const assets: LocalAsset[] = [
			{
				bucket: "project-assets",
				path: manifest.source.path,
				filePath: "/tmp/source.mp4",
				bytes: 10,
				probe: {
					durationSeconds: 10,
					width: 1920,
					height: 1080,
					hasVideo: true,
					hasAudio: true,
					videoCodec: "h264",
					audioCodec: "aac",
					formatName: "mp4",
				},
			},
			{
				bucket: "project-assets",
				path: manifest.logo!.source.path,
				filePath: "/tmp/logo.png",
				bytes: 10,
				probe: {
					durationSeconds: 0,
					width: 100,
					height: 100,
					hasVideo: true,
					hasAudio: false,
					videoCodec: "png",
					audioCodec: null,
					formatName: "image2",
				},
			},
		];
		const compiled = compileClipperManifest(
			manifest,
			createAssetResolver(assets),
			"/tmp/vertical.mp4"
		);
		const graph = compiled.args[compiled.args.indexOf("-filter_complex") + 1];
		expect(graph).toContain("scale=1080:1920:force_original_aspect_ratio=increase");
		expect(graph).toContain("crop=1080:1920");
		expect(graph).toContain("overlay=");
		expect(compiled.args).toContain("/tmp/logo.png");
	});

	it("rejects source trims that exceed the probed asset duration", () => {
		const manifest = makeQCutManifest();
		const assets = makeLocalAssets(manifest);
		const video = assets.find((asset) => asset.path.endsWith("video.mp4"));
		if (!video) throw new Error("fixture mismatch");
		video.probe.durationSeconds = 4.9;

		expect(() => validateSourceRanges(manifest, assets)).toThrow(
			/exceeds the probed media duration/i
		);
	});

	it("classifies deterministic FFmpeg failures as nonretryable", () => {
		const deterministic = new CommandExecutionError(
			"ffmpeg",
			1,
			"Invalid argument"
		);
		expect(isDeterministicFfmpegFailure(deterministic)).toBe(true);
		expect(createFfmpegWorkerError("render failed", deterministic)).toMatchObject({
			code: "render_failed",
			retryable: false,
		});
		expect(
			isDeterministicFfmpegFailure(
				new CommandExecutionError(
					"ffmpeg",
					1,
					"Resource temporarily unavailable"
				)
			)
		).toBe(false);
	});

	it("requires exact manifest dimensions/duration/codecs and required streams", () => {
		const probe = makeLocalAssets(makeQCutManifest())[0]!.probe;
		const expected = {
			width: 640,
			height: 360,
			durationSeconds: 10,
			fps: 30,
			requireAudio: true,
			videoCodec: "h264" as const,
			audioCodec: "aac" as const,
		};
		expect(() => validateOutputExpectation(probe, expected)).not.toThrow();
		expect(() =>
			validateOutputExpectation({ ...probe, width: 641 }, expected)
		).toThrow(/does not match/i);
		expect(() =>
			validateOutputExpectation({ ...probe, durationSeconds: 11 }, expected)
		).toThrow(/does not match/i);
		expect(() =>
			validateOutputExpectation(
				{ ...probe, hasAudio: false, audioCodec: null },
				expected
			)
		).toThrow(/required streams/i);
	});
});
