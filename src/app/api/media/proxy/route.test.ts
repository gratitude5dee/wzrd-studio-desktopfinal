// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetchPublicHttpUrl: vi.fn(),
	requireApiUser: vi.fn(),
}));

vi.mock("../../_lib/auth", () => ({
	requireApiUser: mocks.requireApiUser,
}));

vi.mock("../../_lib/media-url", () => ({
	parsePublicHttpUrl: (value: string | null) =>
		value
			? { ok: true, url: new URL(value) }
			: { ok: false, status: 400, error: "missing_url", message: "Missing URL" },
	fetchPublicHttpUrl: mocks.fetchPublicHttpUrl,
}));

import { GET } from "./route";

describe("media proxy", () => {
	beforeEach(() => {
		mocks.requireApiUser.mockResolvedValue({
			ok: true,
			context: { accessToken: "token", user: { id: "user-1" } },
		});
	});

	it("forwards Range and preserves partial-content headers under COEP", async () => {
		mocks.fetchPublicHttpUrl.mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3, 4]), {
				status: 206,
				headers: {
					"Accept-Ranges": "bytes",
					"Content-Length": "4",
					"Content-Range": "bytes 100-103/1000",
					"Content-Type": "video/mp4",
				},
			})
		);

		const sourceUrl = "https://media.example.test/video.mp4";
		const request = {
			nextUrl: new URL(
				`http://localhost/api/media/proxy?url=${encodeURIComponent(sourceUrl)}`
			),
			headers: new Headers([
				["authorization", "Bearer token"],
				["range", "bytes=100-199"],
			]),
		} as NextRequest;
		expect(request.headers.get("range")).toBe("bytes=100-199");

		const response = await GET(request);

		expect(response.status).toBe(206);
		expect(response.headers.get("accept-ranges")).toBe("bytes");
		expect(response.headers.get("content-range")).toBe("bytes 100-103/1000");
		expect(response.headers.get("cross-origin-resource-policy")).toBe(
			"same-origin"
		);

		const [, init] = mocks.fetchPublicHttpUrl.mock.calls[0] as [URL, RequestInit];
		expect(init.headers).toBeInstanceOf(Headers);
		expect((init.headers as Headers).get("range")).toBe("bytes=100-199");
	});
});
