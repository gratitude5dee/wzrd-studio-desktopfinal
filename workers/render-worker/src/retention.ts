import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { WorkerConfig } from "./config.js";
import type { WorkerSupabaseClient } from "./supabase.js";

const MAX_STORAGE_ENTRIES_PER_SWEEP = 10_000;
const STORAGE_DELETE_BATCH = 100;
const WINNER_LOOKUP_BATCH = 50;

function safeEntryName(name: string): boolean {
	return (
		name.length > 0 &&
		name !== "." &&
		name !== ".." &&
		!name.includes("/") &&
		!name.includes("\\")
	);
}

export async function sweepStaleTemp(config: WorkerConfig): Promise<number> {
	let entries: string[];
	try {
		entries = await readdir(config.workRoot);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
		throw error;
	}
	const cutoff = Date.now() - config.tempRetentionMs;
	let removed = 0;
	for (const entry of entries) {
		if (!safeEntryName(entry)) continue;
		const path = join(config.workRoot, entry);
		try {
			const metadata = await stat(path);
			if (!metadata.isDirectory() || metadata.mtimeMs >= cutoff) continue;
			await rm(path, { recursive: true, force: true });
			removed += 1;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return removed;
}

interface StorageEntry {
	name: string;
	id?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface RetentionOutput {
	path: string;
	createdAtMs: number;
}

async function listOutputs(
	client: WorkerSupabaseClient
): Promise<RetentionOutput[]> {
	const bucket = client.storage.from("render-outputs");
	const pendingPrefixes = [""];
	const outputs: RetentionOutput[] = [];
	let visited = 0;

	while (
		pendingPrefixes.length > 0 &&
		visited < MAX_STORAGE_ENTRIES_PER_SWEEP
	) {
		const prefix = pendingPrefixes.shift() ?? "";
		for (
			let offset = 0;
			offset < MAX_STORAGE_ENTRIES_PER_SWEEP;
			offset += 1_000
		) {
			const result = await bucket.list(prefix, {
				limit: 1_000,
				offset,
				sortBy: { column: "name", order: "asc" },
			});
			if (result.error) {
				throw new Error(`Output retention list failed: ${result.error.message}`);
			}
			const entries = (result.data ?? []) as StorageEntry[];
			for (const entry of entries) {
				visited += 1;
				if (
					visited > MAX_STORAGE_ENTRIES_PER_SWEEP ||
					!safeEntryName(entry.name)
				) {
					break;
				}
				const path = prefix ? `${prefix}/${entry.name}` : entry.name;
				if (!entry.id) {
					pendingPrefixes.push(path);
					continue;
				}
				const createdAtMs = Date.parse(
					entry.created_at ?? entry.updated_at ?? ""
				);
				if (Number.isFinite(createdAtMs)) outputs.push({ path, createdAtMs });
			}
			if (
				entries.length < 1_000 ||
				visited >= MAX_STORAGE_ENTRIES_PER_SWEEP
			) {
				break;
			}
		}
	}
	return outputs;
}

async function findWinningPaths(
	client: WorkerSupabaseClient,
	paths: string[]
): Promise<Set<string>> {
	const winners = new Set<string>();
	for (let index = 0; index < paths.length; index += WINNER_LOOKUP_BATCH) {
		const batch = paths.slice(index, index + WINNER_LOOKUP_BATCH);
		const result = await client
			.from("web_render_jobs")
			.select("output_storage_path")
			.in("output_storage_path", batch);
		if (result.error) {
			throw new Error(`Output retention cross-reference failed: ${result.error.message}`);
		}
		for (const row of result.data ?? []) {
			if (
				row &&
				typeof row === "object" &&
				"output_storage_path" in row &&
				typeof row.output_storage_path === "string"
			) {
				winners.add(row.output_storage_path);
			}
		}
	}
	return winners;
}

export function selectExpiredOutputPaths(
	outputs: RetentionOutput[],
	winningPaths: ReadonlySet<string>,
	config: WorkerConfig,
	nowMs = Date.now()
): string[] {
	return outputs
		.filter((output) => {
			const retentionMs = winningPaths.has(output.path)
				? config.winningOutputRetentionMs
				: config.unreferencedOutputRetentionMs;
			return output.createdAtMs < nowMs - retentionMs;
		})
		.map((output) => output.path);
}

export async function sweepExpiredOutputs(
	client: WorkerSupabaseClient,
	config: WorkerConfig
): Promise<number> {
	const outputs = await listOutputs(client);
	const candidates = outputs.filter(
		(output) =>
			output.createdAtMs < Date.now() - config.unreferencedOutputRetentionMs
	);
	const winners = await findWinningPaths(
		client,
		candidates.map((output) => output.path)
	);
	const expired = selectExpiredOutputPaths(candidates, winners, config);
	const bucket = client.storage.from("render-outputs");
	let removed = 0;
	for (let index = 0; index < expired.length; index += STORAGE_DELETE_BATCH) {
		const batch = expired.slice(index, index + STORAGE_DELETE_BATCH);
		const result = await bucket.remove(batch);
		if (result.error) {
			throw new Error(`Output retention remove failed: ${result.error.message}`);
		}
		removed += batch.length;
	}
	return removed;
}

export async function sweepExpiredJobs(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	nowMs = Date.now()
): Promise<number> {
	const cutoff = new Date(nowMs - config.jobRetentionMs).toISOString();
	const result = await client
		.from("web_render_jobs")
		.delete({ count: "exact" })
		.in("status", ["succeeded", "failed", "cancelled"])
		.lt("completed_at", cutoff);
	if (result.error) {
		throw new Error(`Render job retention failed: ${result.error.message}`);
	}
	return result.count ?? 0;
}

export async function runRetentionSweep(
	client: WorkerSupabaseClient,
	config: WorkerConfig
): Promise<void> {
	const tempSweep = sweepStaleTemp(config);
	// Cross-reference winners before deleting old terminal job rows. Otherwise a
	// winning object could be misclassified as an unreferenced attempt.
	const outputsRemoved = await sweepExpiredOutputs(client, config);
	const jobsRemoved = await sweepExpiredJobs(client, config);
	const tempRemoved = await tempSweep;
	console.info(
		JSON.stringify({
			level: "info",
			action: "retention_sweep",
			tempRemoved,
			outputsRemoved,
			jobsRemoved,
		})
	);
}
