import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../environment", () => ({
	isElectron: vi.fn(),
}));

import { isElectron } from "../environment";
import { getFFmpegResourceUrl } from "../resources";

const mockIsElectron = vi.mocked(isElectron);
const originalFetch = globalThis.fetch;

describe("getFFmpegResourceUrl", () => {
	beforeEach(() => {
		mockIsElectron.mockReturnValue(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		globalThis.fetch = originalFetch;
	});

	it("resolves web assets from the same-origin public ffmpeg path", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;

		await expect(getFFmpegResourceUrl("ffmpeg-core.js")).resolves.toBe(
			"/ffmpeg/ffmpeg-core.js"
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith("/ffmpeg/ffmpeg-core.js", {
			method: "HEAD",
		});
	});

	it("rejects unsupported asset names before fetching", async () => {
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(getFFmpegResourceUrl("../secret")).rejects.toThrow(
			"Unsupported FFmpeg resource"
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("prefers app protocol assets in Electron", async () => {
		mockIsElectron.mockReturnValue(true);
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;

		await expect(getFFmpegResourceUrl("ffmpeg-core.wasm")).resolves.toBe(
			"app://ffmpeg/ffmpeg-core.wasm"
		);

		expect(fetchMock).toHaveBeenCalledWith("app://ffmpeg/ffmpeg-core.wasm");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("falls back to same-origin assets when the Electron app protocol is unavailable", async () => {
		mockIsElectron.mockReturnValue(true);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;

		await expect(getFFmpegResourceUrl("ffmpeg-core.wasm")).resolves.toBe(
			"/ffmpeg/ffmpeg-core.wasm"
		);

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"app://ffmpeg/ffmpeg-core.wasm"
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"/ffmpeg/ffmpeg-core.wasm",
			{ method: "HEAD" }
		);
	});
});
