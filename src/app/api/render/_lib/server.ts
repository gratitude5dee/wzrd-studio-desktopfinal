import type { NextResponse } from "next/server";

import {
	createSupabaseAdminClient,
	SupabaseAdminConfigurationError,
} from "../../_lib/admin-client";
import { apiJson } from "../../_lib/responses";

export interface SupabaseErrorLike {
	code?: string;
	message?: string;
	status?: number | string;
	statusCode?: number | string;
}

export interface SupabaseQueryResult<T = unknown> {
	data: T;
	error: SupabaseErrorLike | null;
	count?: number | null;
}

export interface RenderQueryBuilder
	extends PromiseLike<SupabaseQueryResult> {
	select(
		columns: string,
		options?: { count?: "exact"; head?: boolean }
	): RenderQueryBuilder;
	eq(column: string, value: unknown): RenderQueryBuilder;
	in(column: string, values: readonly unknown[]): RenderQueryBuilder;
	gte(column: string, value: string): RenderQueryBuilder;
	order(
		column: string,
		options?: { ascending?: boolean; nullsFirst?: boolean }
	): RenderQueryBuilder;
	limit(count: number): RenderQueryBuilder;
	insert(values: Record<string, unknown>): RenderQueryBuilder;
	maybeSingle(): Promise<SupabaseQueryResult>;
	single(): Promise<SupabaseQueryResult>;
}

interface SignedUrlResult {
	data: { signedUrl: string } | null;
	error: SupabaseErrorLike | null;
}

export interface RenderAdminClient {
	from(table: string): RenderQueryBuilder;
	rpc(
		functionName: string,
		args: Record<string, unknown>
	): PromiseLike<SupabaseQueryResult>;
	storage: {
		from(bucket: string): {
			info(path: string): Promise<{
				data: { size?: number | string | null } | null;
				error: SupabaseErrorLike | null;
			}>;
			createSignedUrl(
				path: string,
				expiresIn: number,
				options?: { cacheNonce?: string; download?: string | boolean }
			): Promise<SignedUrlResult>;
		};
	};
}

export function getRenderAdminClient():
	| { ok: true; client: RenderAdminClient }
	| { ok: false; response: NextResponse } {
	try {
		return {
			ok: true,
			client: createSupabaseAdminClient() as unknown as RenderAdminClient,
		};
	} catch (error) {
		if (error instanceof SupabaseAdminConfigurationError) {
			return {
				ok: false,
				response: apiJson(
					{
						error: error.code,
						message: "The render service is not configured.",
					},
					{ status: 500 }
				),
			};
		}
		throw error;
	}
}

export function isRenderContractUnavailable(
	error: SupabaseErrorLike | null | undefined
): boolean {
	if (!error) return false;
	if (
		["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
			error.code ?? ""
		)
	) {
		return true;
	}
	return /(relation|column|function|schema cache).*(web_render_job|cancel_web_render|retry_web_render)/i.test(
		error.message ?? ""
	);
}

export function isUniqueViolation(
	error: SupabaseErrorLike | null | undefined
): boolean {
	return error?.code === "23505";
}

export function renderJobsUnavailable(message: string) {
	return apiJson(
		{ error: "render_jobs_unavailable", message },
		{ status: 503 }
	);
}

export function firstRpcRow(data: unknown): Record<string, unknown> | null {
	if (Array.isArray(data)) {
		const row = data[0];
		return row && typeof row === "object"
			? (row as Record<string, unknown>)
			: null;
	}
	return data && typeof data === "object"
		? (data as Record<string, unknown>)
		: null;
}
