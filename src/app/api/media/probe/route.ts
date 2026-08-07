import type { NextRequest } from "next/server";

import { requireApiUser } from "../../_lib/auth";
import { fetchPublicHttpUrl, parsePublicHttpUrl } from "../../_lib/media-url";
import { apiJson, readJsonBody } from "../../_lib/responses";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const body = await readJsonBody(request);
	const url =
		body && typeof body === "object" && "url" in body
			? String((body as { url?: unknown }).url ?? "")
			: "";
	const parsed = parsePublicHttpUrl(url);
	if ("error" in parsed) {
		return apiJson(
			{ error: parsed.error, message: parsed.message },
			{ status: parsed.status }
		);
	}

	let upstream = await fetchPublicHttpUrl(parsed.url, { method: "HEAD" });
	if (!upstream.ok || upstream.status === 405) {
		upstream = await fetchPublicHttpUrl(parsed.url, {
			headers: { range: "bytes=0-0" },
		});
	}

	if (!upstream.ok && upstream.status !== 206) {
		return apiJson(
			{
				error: "media_probe_failed",
				status: upstream.status,
				message: "Unable to probe remote media.",
			},
			{ status: upstream.status >= 400 ? upstream.status : 502 }
		);
	}

	return apiJson({
		url: parsed.url.toString(),
		mimeType: upstream.headers.get("content-type"),
		size: Number(upstream.headers.get("content-length")) || null,
		acceptRanges: upstream.headers.get("accept-ranges"),
		durationSeconds: null,
	});
}
