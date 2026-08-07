import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
	getSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		auth: {
			getSession: supabaseMocks.getSession,
		},
	},
}));

import { createVercelAdapter } from "../index";

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;

function installObjectUrlStub(value = "blob:proxied-media") {
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => value),
	});
}

describe("createVercelAdapter", () => {
	beforeEach(() => {
		installObjectUrlStub();
		supabaseMocks.getSession.mockResolvedValue({
			data: { session: null },
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		globalThis.fetch = originalFetch;
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: originalCreateObjectURL,
		});
	});

	it("uses the authenticated media proxy before falling back to browser fetch", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response("video", {
				status: 200,
				headers: { "content-type": "video/mp4" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();
		const result = await adapter.mediaImport.cacheRemoteMedia?.({
			url: "https://cdn.example.com/render/output.mp4",
			operationId: "asset-1",
		});

		expect(result).toMatchObject({
			name: "output.mp4",
			path: "blob:proxied-media",
			mediaUrl: "blob:proxied-media",
			mimeType: "video/mp4",
			size: 5,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/media/proxy?url=https%3A%2F%2Fcdn.example.com%2Frender%2Foutput.mp4&operationId=asset-1",
			{ headers: undefined }
		);
	});

	it("falls back to the base web adapter when the proxy cannot fetch media", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const value = String(input);
			if (value.startsWith("/api/media/proxy")) {
				return new Response(null, { status: 502 });
			}
			return new Response("direct", {
				status: 200,
				headers: { "content-type": "video/mp4" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();
		const result = await adapter.mediaImport.cacheRemoteMedia?.({
			url: "https://cdn.example.com/direct.mp4",
			operationId: "asset-2",
		});

		expect(result).toMatchObject({
			name: "direct.mp4",
			path: "blob:proxied-media",
			mediaUrl: "blob:proxied-media",
			mimeType: "video/mp4",
			size: 6,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenLastCalledWith("https://cdn.example.com/direct.mp4", {
			mode: "cors",
		});
	});

	it("resolves self-hosted FFmpeg wasm assets for Vercel", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();

		await expect(
			adapter.ffmpeg.getFFmpegResourcePath("ffmpeg-core.js")
		).resolves.toBe("/ffmpeg/ffmpeg-core.js");
		await expect(
			adapter.ffmpeg.checkFFmpegResource("ffmpeg-core.wasm")
		).resolves.toBe(true);
		await expect(
			adapter.ffmpeg.getFFmpegResourcePath("../secret")
		).rejects.toThrow("Unsupported FFmpeg resource");
	});

	it("queues CLI render offload without pretending the output is ready", async () => {
		const projectId = "22222222-2222-4222-8222-222222222222";
		supabaseMocks.getSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
		});
		const fetchMock = vi.fn(async () => {
			return Response.json(
				{ job: { id: "33333333-3333-4333-8333-333333333333", status: "queued" } },
				{ status: 202 }
			);
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const adapter = createVercelAdapter();
		const result = await adapter.ffmpeg.exportVideoCLI({
			projectId,
			sessionId: "session-1",
			duration: 30,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("async result polling is not wired");
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/render",
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: "Bearer token-1",
					"Content-Type": "application/json",
				},
			})
		);
		const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(JSON.parse(String(init.body))).toMatchObject({
			projectId,
			idempotencyKey: "ffmpeg-cli:session-1",
			request: { projectId, sessionId: "session-1", duration: 30 },
		});
	});
});
