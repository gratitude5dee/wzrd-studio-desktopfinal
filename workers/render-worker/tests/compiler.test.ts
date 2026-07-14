import { describe, expect, it } from "vitest";

import {
	compileClipperManifest,
	compileQCutManifest,
	createAssetResolver,
} from "../src/ffmpeg.js";
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
});
