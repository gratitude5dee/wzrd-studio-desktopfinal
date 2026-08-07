import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireApiUser } from "../../_lib/auth";
import { apiJson } from "../../_lib/responses";
import { fetchPublicHttpUrl, parsePublicHttpUrl } from "../../_lib/media-url";

export const runtime = "nodejs";
export const maxDuration = 30;

const PASS_THROUGH_HEADERS = [
	"accept-ranges",
	"cache-control",
	"content-length",
	"content-range",
	"content-type",
	"etag",
	"last-modified",
] as const;

export async function GET(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const source =
		request.nextUrl.searchParams.get("url") ??
		request.nextUrl.searchParams.get("src");
	const parsed = parsePublicHttpUrl(source);
	if ("error" in parsed) {
		return apiJson(
			{ error: parsed.error, message: parsed.message },
			{ status: parsed.status }
		);
	}

	const requestHeaders = new Headers();
	const range = request.headers.get("range");
	if (range) requestHeaders.set("range", range);

	const upstream = await fetchPublicHttpUrl(parsed.url, {
		headers: requestHeaders,
	});
	if (!upstream.ok && upstream.status !== 206) {
		return apiJson(
			{
				error: "media_fetch_failed",
				status: upstream.status,
				message: "Unable to fetch remote media.",
			},
			{ status: upstream.status >= 400 ? upstream.status : 502 }
		);
	}

	const responseHeaders = new Headers();
	for (const key of PASS_THROUGH_HEADERS) {
		const value = upstream.headers.get(key);
		if (value) responseHeaders.set(key, value);
	}
	responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
	responseHeaders.set("Cache-Control", "private, max-age=3600");

	return new NextResponse(upstream.body, {
		status: upstream.status,
		headers: responseHeaders,
	});
}
