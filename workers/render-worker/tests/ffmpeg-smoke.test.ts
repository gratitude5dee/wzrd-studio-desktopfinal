import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
	compileQCutManifest,
	createAssetResolver,
	inspectOutput,
	normalizeIngestMedia,
	renderWithFfmpeg,
} from "../src/ffmpeg.js";
import { runCommand } from "../src/process.js";
import { makeConfig, makeLocalAssets, makeQCutManifest } from "./fixtures.js";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FFmpeg fixture smoke", () => {
	it("renders the parity fixture with native argv", async () => {
		await access("/usr/bin/ffmpeg");
		const directory = await mkdtemp(join(tmpdir(), "wzrd-worker-smoke-"));
		directories.push(directory);
		const signal = AbortSignal.timeout(60_000);
		const videoPath = join(directory, "video.mp4");
		const audioAPath = join(directory, "audio-a.wav");
		const audioBPath = join(directory, "audio-b.wav");
		const imagePath = join(directory, "image.ppm");
		const stickerPath = join(directory, "sticker.ppm");
		await Promise.all([
			runCommand({
				command: "/usr/bin/ffmpeg",
				args: [
					"-hide_banner",
					"-loglevel",
					"error",
					"-f",
					"lavfi",
					"-i",
					"testsrc2=size=320x180:rate=30:duration=5",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=440:duration=5",
					"-c:v",
					"libx264",
					"-pix_fmt",
					"yuv420p",
					"-c:a",
					"aac",
					"-shortest",
					videoPath,
				],
				signal,
			}),
			runCommand({
				command: "/usr/bin/ffmpeg",
				args: [
					"-hide_banner",
					"-loglevel",
					"error",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=550:duration=2",
					audioAPath,
				],
				signal,
			}),
			runCommand({
				command: "/usr/bin/ffmpeg",
				args: [
					"-hide_banner",
					"-loglevel",
					"error",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=660:duration=2",
					audioBPath,
				],
				signal,
			}),
			writeFile(
				imagePath,
				Buffer.concat([Buffer.from("P6\n2 2\n255\n"), Buffer.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0])])
			),
			writeFile(
				stickerPath,
				Buffer.concat([Buffer.from("P6\n2 2\n255\n"), Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0])])
			),
		]);

		const manifest = makeQCutManifest();
		const assets = makeLocalAssets(manifest).map((asset) => {
			const name = asset.path.split("/").at(-1);
			const filePath =
				name === "video.mp4"
					? videoPath
					: name === "audio-a.wav"
						? audioAPath
						: name === "audio-b.wav"
							? audioBPath
							: name === "image.png"
								? imagePath
								: stickerPath;
			return { ...asset, filePath };
		});
		const outputPath = join(directory, "output.mp4");
		const assPath = join(directory, "overlays.ass");
		const compiled = compileQCutManifest(
			manifest,
			createAssetResolver(assets),
			outputPath,
			assPath
		);
		const config = makeConfig();
		await renderWithFfmpeg(
			config,
			compiled,
			assPath,
			manifest.output.durationSeconds,
			signal,
			() => undefined
		);
		const metadata = await inspectOutput(config, outputPath, signal, {
			width: manifest.output.width,
			height: manifest.output.height,
			durationSeconds: manifest.output.durationSeconds,
			fps: manifest.output.fps,
			requireAudio: true,
			videoCodec: "h264",
			audioCodec: "aac",
		});

		expect(metadata).toMatchObject({ width: 640, height: 360 });
		expect(metadata.durationSeconds).toBeGreaterThanOrEqual(3.9);
		expect(metadata.bytes).toBeGreaterThan(1_000);
		expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
		await expect(
			inspectOutput(config, outputPath, signal, {
				width: 641,
				height: 360,
				durationSeconds: 4,
				fps: 30,
				requireAudio: true,
				videoCodec: "h264",
				audioCodec: "aac",
			})
		).rejects.toMatchObject({ code: "output_invalid", retryable: false });

		const normalizedPath = join(directory, "normalized-ingest.mp4");
		await normalizeIngestMedia(
			config,
			videoPath,
			normalizedPath,
			5,
			signal,
			() => undefined
		);
		const normalized = await inspectOutput(config, normalizedPath, signal);
		expect(normalized).toMatchObject({ width: 320, height: 180 });
		expect(normalized.durationSeconds).toBeGreaterThanOrEqual(4.9);
	}, 60_000);
});
