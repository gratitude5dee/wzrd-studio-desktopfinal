import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { WorkerConfig } from "./config.js";
import type { WorkerSupabaseClient } from "./supabase.js";

const MAX_STORAGE_ENTRIES_PER_SWEEP = 10_000;

function safeEntryName(name: string): boolean {
	return name.length > 0 && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\");
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

export async function sweepExpiredOutputs(
	client: WorkerSupabaseClient,
	config: WorkerConfig
): Promise<number> {
	const bucket = client.storage.from("render-outputs");
	const cutoff = Date.now() - config.outputRetentionMs;
	const pendingPrefixes = [""];
	const expired: string[] = [];
	let visited = 0;

	while (pendingPrefixes.length > 0 && visited < MAX_STORAGE_ENTRIES_PER_SWEEP) {
		const prefix = pendingPrefixes.shift() ?? "";
		for (let offset = 0; offset < MAX_STORAGE_ENTRIES_PER_SWEEP; offset += 1_000) {
			const result = await bucket.list(prefix, {
				limit: 1_000,
				offset,
				sortBy: { column: "name", order: "asc" },
			});
			if (result.error) throw new Error(`Output retention list failed: ${result.error.message}`);
			const entries = (result.data ?? []) as StorageEntry[];
			for (const entry of entries) {
				visited += 1;
				if (visited > MAX_STORAGE_ENTRIES_PER_SWEEP || !safeEntryName(entry.name)) break;
				const path = prefix ? `${prefix}/${entry.name}` : entry.name;
				if (!entry.id) {
					pendingPrefixes.push(path);
					continue;
				}
				const createdAt = Date.parse(entry.created_at ?? entry.updated_at ?? "");
				if (Number.isFinite(createdAt) && createdAt < cutoff) expired.push(path);
			}
			if (entries.length < 1_000 || visited >= MAX_STORAGE_ENTRIES_PER_SWEEP) break;
		}
	}

	let removed = 0;
	for (let index = 0; index < expired.length; index += 100) {
		const batch = expired.slice(index, index + 100);
		const result = await bucket.remove(batch);
		if (result.error) throw new Error(`Output retention remove failed: ${result.error.message}`);
		removed += batch.length;
	}
	return removed;
}

export async function runRetentionSweep(
	client: WorkerSupabaseClient,
	config: WorkerConfig
): Promise<void> {
	const [tempRemoved, outputsRemoved] = await Promise.all([
		sweepStaleTemp(config),
		sweepExpiredOutputs(client, config),
	]);
	console.info(
		JSON.stringify({
			level: "info",
			action: "retention_sweep",
			tempRemoved,
			outputsRemoved,
		})
	);
}
