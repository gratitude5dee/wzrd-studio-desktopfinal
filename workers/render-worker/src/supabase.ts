import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { WorkerConfig } from "./config.js";
import { LeaseLostError, messageFromUnknown } from "./errors.js";
import type { JobProgress, OutputMetadata, RenderJobRecord } from "./types.js";

interface RpcError {
	code?: string;
	message?: string;
}

interface RpcResult {
	data: unknown;
	error: RpcError | null;
}

export type WorkerSupabaseClient = SupabaseClient;

export function createWorkerSupabase(config: WorkerConfig): WorkerSupabaseClient {
	return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
		auth: {
			autoRefreshToken: false,
			detectSessionInUrl: false,
			persistSession: false,
		},
	});
}

function rows(data: unknown): Record<string, unknown>[] {
	if (Array.isArray(data)) {
		return data.filter(
			(row): row is Record<string, unknown> =>
				!!row && typeof row === "object" && !Array.isArray(row)
		);
	}
	return data && typeof data === "object" && !Array.isArray(data)
		? [data as Record<string, unknown>]
		: [];
}

function rpcError(name: string, error: RpcError): Error {
	return new Error(`${name} failed${error.code ? ` (${error.code})` : ""}: ${error.message ?? "unknown error"}`);
}

async function rpc(
	client: WorkerSupabaseClient,
	name: string,
	args: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
	const result = (await client.rpc(name, args)) as unknown as RpcResult;
	if (result.error) throw rpcError(name, result.error);
	return rows(result.data);
}

function stringField(row: Record<string, unknown>, field: string): string {
	const value = row[field];
	if (typeof value !== "string" || !value) {
		throw new Error(`Claimed render job is missing ${field}.`);
	}
	return value;
}

function integerField(row: Record<string, unknown>, field: string): number {
	const value = Number(row[field]);
	if (!Number.isInteger(value)) {
		throw new Error(`Claimed render job has an invalid ${field}.`);
	}
	return value;
}

function parseClaimedRow(row: Record<string, unknown>): RenderJobRecord {
	return {
		id: stringField(row, "id"),
		idempotency_hash: stringField(row, "idempotency_hash"),
		user_id: stringField(row, "user_id"),
		project_id: stringField(row, "project_id"),
		status: stringField(row, "status"),
		request: row.request,
		kind: stringField(row, "kind"),
		manifest_schema_version: integerField(row, "manifest_schema_version"),
		attempts: integerField(row, "attempts"),
		max_attempts: integerField(row, "max_attempts"),
		generation: integerField(row, "generation"),
		cancel_requested: row.cancel_requested === true,
		lease_expires_at:
			typeof row.lease_expires_at === "string" ? row.lease_expires_at : null,
	};
}

export async function claimJobs(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	limit: number
): Promise<RenderJobRecord[]> {
	const claimed = await rpc(client, "claim_web_render_jobs", {
		p_worker_id: config.workerId,
		p_limit: limit,
		p_lease_seconds: config.leaseSeconds,
	});
	return claimed.map(parseClaimedRow);
}

export interface HeartbeatResult {
	cancelRequested: boolean;
	generation: number;
	attempt: number;
}

export async function heartbeatJob(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: RenderJobRecord,
	progress: JobProgress
): Promise<HeartbeatResult> {
	const heartbeatRows = await rpc(client, "heartbeat_web_render_job", {
		p_job_id: job.id,
		p_worker_id: config.workerId,
		p_attempt: job.attempts,
		p_generation: job.generation,
		p_lease_seconds: config.leaseSeconds,
		p_progress: progress.value,
		p_stage: progress.stage,
		p_progress_message: progress.message,
	});
	const row = heartbeatRows[0];
	if (!row) throw new LeaseLostError();
	return {
		cancelRequested: row.cancel_requested === true,
		generation: Number(row.generation),
		attempt: Number(row.attempt),
	};
}

export async function completeJob(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: RenderJobRecord,
	outputStoragePath: string,
	metadata: OutputMetadata
): Promise<void> {
	const completed = await rpc(client, "complete_web_render_job", {
		p_job_id: job.id,
		p_worker_id: config.workerId,
		p_attempt: job.attempts,
		p_generation: job.generation,
		p_output_storage_path: outputStoragePath,
		p_output_bytes: metadata.bytes,
		p_output_duration_seconds: metadata.durationSeconds,
		p_output_width: metadata.width,
		p_output_height: metadata.height,
		p_output_sha256: metadata.sha256,
	});
	if (completed.length === 0) throw new LeaseLostError();
}

export async function failJob(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: RenderJobRecord,
	errorCode: string,
	errorMessage: string,
	retryable: boolean
): Promise<boolean> {
	const failed = await rpc(client, "fail_web_render_job", {
		p_job_id: job.id,
		p_worker_id: config.workerId,
		p_attempt: job.attempts,
		p_generation: job.generation,
		p_error_code: errorCode.slice(0, 100),
		p_error_message: errorMessage.slice(0, 1_000),
		p_retryable: retryable,
	});
	return failed.length > 0;
}

export async function acknowledgeCancellation(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: RenderJobRecord
): Promise<boolean> {
	const cancelled = await rpc(client, "acknowledge_cancel_web_render_job", {
		p_job_id: job.id,
		p_worker_id: config.workerId,
		p_attempt: job.attempts,
		p_generation: job.generation,
	});
	return cancelled.length > 0;
}

export function logRpcFailure(action: string, error: unknown): void {
	console.error(JSON.stringify({ level: "error", action, error: messageFromUnknown(error) }));
}
