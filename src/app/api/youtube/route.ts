import type { NextRequest } from "next/server";

import { requireApiUser } from "../_lib/auth";
import { apiJson } from "../_lib/responses";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	return apiJson({
		configured: false,
		message: "YouTube OAuth/upload is not configured for the Vercel web target yet.",
	});
}

export async function POST(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	return apiJson(
		{
			error: "youtube_upload_unconfigured",
			message:
				"YouTube upload requires the server OAuth configuration phase before uploads can run.",
		},
		{ status: 501 }
	);
}
