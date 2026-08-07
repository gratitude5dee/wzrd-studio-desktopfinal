import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getFfmpegWasmFallbackState,
	isFfmpegWasmAsset,
	isFfmpegWasmFallbackAvailable,
	resolveFfmpegWasmAssetUrl,
} from "../index";

function setCrossOriginIsolated(value: boolean) {
	Object.defineProperty(globalThis, "crossOriginIsolated", {
		configurable: true,
		value,
	});
}

describe("ffmpeg-web helpers", () => {
	const originalWorker = globalThis.Worker;

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalWorker) {
			Object.defineProperty(globalThis, "Worker", {
				configurable: true,
				value: originalWorker,
			});
		} else {
			delete (globalThis as typeof globalThis & { Worker?: typeof Worker })
				.Worker;
		}
		setCrossOriginIsolated(false);
	});

	it("only allows the self-hosted FFmpeg core assets", () => {
		expect(isFfmpegWasmAsset("ffmpeg-core.js")).toBe(true);
		expect(isFfmpegWasmAsset("ffmpeg-core.wasm")).toBe(true);
		expect(isFfmpegWasmAsset("../secret")).toBe(false);
		expect(() => resolveFfmpegWasmAssetUrl("../secret")).toThrow(
			"Unsupported FFmpeg wasm asset"
		);
	});

	it("resolves same-origin asset URLs", () => {
		expect(resolveFfmpegWasmAssetUrl("ffmpeg-core.js")).toBe(
			"/ffmpeg/ffmpeg-core.js"
		);
		expect(resolveFfmpegWasmAssetUrl("ffmpeg-core.wasm", "/assets/ffmpeg/")).toBe(
			"/assets/ffmpeg/ffmpeg-core.wasm"
		);
	});

	it("requires cross-origin isolation by default", async () => {
		Object.defineProperty(globalThis, "Worker", {
			configurable: true,
			value: class {},
		});
		setCrossOriginIsolated(false);
		const fetchImpl = vi.fn();

		await expect(
			isFfmpegWasmFallbackAvailable({ fetchImpl: fetchImpl as typeof fetch })
		).resolves.toBe(false);
		expect(fetchImpl).not.toHaveBeenCalled();

		await expect(
			getFfmpegWasmFallbackState({ fetchImpl: fetchImpl as typeof fetch })
		).resolves.toMatchObject({
			available: false,
			reason: "cross_origin_isolation_required",
		});
	});

	it("returns true when isolation, workers, and assets are available", async () => {
		Object.defineProperty(globalThis, "Worker", {
			configurable: true,
			value: class {},
		});
		setCrossOriginIsolated(true);
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

		await expect(
			getFfmpegWasmFallbackState({ fetchImpl: fetchImpl as typeof fetch })
		).resolves.toMatchObject({
			available: true,
			coreUrl: "/ffmpeg/ffmpeg-core.js",
			wasmUrl: "/ffmpeg/ffmpeg-core.wasm",
		});
		expect(fetchImpl).toHaveBeenCalledWith("/ffmpeg/ffmpeg-core.js", {
			method: "HEAD",
		});
		expect(fetchImpl).toHaveBeenCalledWith("/ffmpeg/ffmpeg-core.wasm", {
			method: "HEAD",
		});
	});

	it("reports the first missing FFmpeg asset", async () => {
		Object.defineProperty(globalThis, "Worker", {
			configurable: true,
			value: class {},
		});
		setCrossOriginIsolated(true);
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({ ok: false })
			.mockResolvedValueOnce({ ok: true });

		await expect(
			getFfmpegWasmFallbackState({ fetchImpl: fetchImpl as typeof fetch })
		).resolves.toMatchObject({
			available: false,
			reason: "missing_core_asset",
		});
	});
});
