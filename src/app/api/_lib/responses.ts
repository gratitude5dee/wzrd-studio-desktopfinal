import { NextResponse } from "next/server";

export function apiJson(
	body: Record<string, unknown>,
	init: ResponseInit = {}
) {
	const headers = new Headers(init.headers);
	headers.set("Cache-Control", "no-store");

	return NextResponse.json(body, {
		...init,
		headers,
	});
}

export async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}
