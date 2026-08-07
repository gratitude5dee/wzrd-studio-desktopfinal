import type { NextRequest } from "next/server";

import { requireApiUser } from "../../_lib/auth";
import { apiJson } from "../../_lib/responses";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteContext {
	params: Promise<{ path?: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const { path = [] } = await context.params;
	return apiJson({
		path,
		configured: false,
		message: "Agent route is authenticated but not connected to a web agent runtime yet.",
	});
}

export async function POST(request: NextRequest, context: RouteContext) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const { path = [] } = await context.params;
	return apiJson(
		{
			error: "agent_runtime_unconfigured",
			path,
			message:
				"Agent execution requires the Vercel agent runtime/persistence phase before requests can run.",
		},
		{ status: 501 }
	);
}
