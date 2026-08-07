import { describe, expect, it } from "vitest";

import { parsePublicHttpUrl } from "../media-url";

describe("parsePublicHttpUrl", () => {
	it("accepts public http and https URLs", () => {
		expect(parsePublicHttpUrl("https://cdn.example.com/a.mp4")).toMatchObject({
			ok: true,
		});
		expect(parsePublicHttpUrl("http://media.example.com/a.mp4")).toMatchObject({
			ok: true,
		});
	});

	it("rejects local/private hosts and unsupported schemes", () => {
		expect(parsePublicHttpUrl("http://localhost:3000/a.mp4")).toMatchObject({
			ok: false,
			error: "blocked_host",
		});
		expect(parsePublicHttpUrl("http://127.0.0.1/a.mp4")).toMatchObject({
			ok: false,
			error: "blocked_host",
		});
		expect(parsePublicHttpUrl("http://192.168.1.1/a.mp4")).toMatchObject({
			ok: false,
			error: "blocked_host",
		});
		expect(parsePublicHttpUrl("file:///tmp/a.mp4")).toMatchObject({
			ok: false,
			error: "unsupported_protocol",
		});
	});

	it("rejects URLs with credentials", () => {
		expect(parsePublicHttpUrl("https://user:pass@example.com/a.mp4")).toMatchObject(
			{
				ok: false,
				error: "url_credentials_not_allowed",
			}
		);
	});
});
