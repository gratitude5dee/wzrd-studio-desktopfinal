import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/integrations/supabase/server";

export interface ApiUserContext {
	accessToken: string;
	user: {
		id: string;
		email?: string;
	};
}

export type ApiAuthResult =
	| { ok: true; context: ApiUserContext }
	| { ok: false; response: NextResponse };

function unauthorized(message: string) {
	return NextResponse.json(
		{ error: "unauthorized", message },
		{
			status: 401,
			headers: { "Cache-Control": "no-store" },
		}
	);
}

export async function requireApiUser(
	request: NextRequest
): Promise<ApiAuthResult> {
	const authorization = request.headers.get("authorization") ?? "";
	const match = authorization.match(/^Bearer\s+(.+)$/i);
	const accessToken = match?.[1]?.trim();

	if (!accessToken) {
		return {
			ok: false,
			response: unauthorized("Missing bearer token."),
		};
	}

	try {
		const supabase = createSupabaseServerClient(accessToken);
		const { data, error } = await supabase.auth.getUser(accessToken);

		if (error || !data.user) {
			return {
				ok: false,
				response: unauthorized("Invalid bearer token."),
			};
		}

		return {
			ok: true,
			context: {
				accessToken,
				user: {
					id: data.user.id,
					email: data.user.email,
				},
			},
		};
	} catch {
		return {
			ok: false,
			response: unauthorized("Unable to verify bearer token."),
		};
	}
}
