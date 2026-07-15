import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";

export interface WorkerConfig {
	supabaseUrl: string;
	supabaseServiceRoleKey: string;
	workerId: string;
	port: number;
	concurrency: number;
	leaseSeconds: number;
	heartbeatMs: number;
	pollMs: number;
	renderTimeoutMs: number;
	minFreeDiskBytes: number;
	retentionSweepMs: number;
	unreferencedOutputRetentionMs: number;
	winningOutputRetentionMs: number;
	jobRetentionMs: number;
	tempRetentionMs: number;
	workRoot: string;
	ffmpegPath: string;
	ffprobePath: string;
	apifyToken: string | null;
	apifyPollMs: number;
	apifyTimeoutMs: number;
	apifyMediaHostAllowlist: string[];
}

function clean(value: string | undefined): string | undefined {
	if (!value || value === "undefined" || value === "null") return undefined;
	return value.trim() || undefined;
}

function firstEnv(names: readonly string[]): string | undefined {
	for (const name of names) {
		const value = clean(process.env[name]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function integerEnv(
	names: string | readonly string[],
	fallback: number,
	minimum: number,
	maximum: number
): number {
	const candidates = typeof names === "string" ? [names] : names;
	const raw = firstEnv(candidates);
	const value = raw === undefined ? fallback : Number(raw);
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new Error(
			`${candidates[0]} must be an integer between ${minimum} and ${maximum}.`
		);
	}
	return value;
}

function requiredUrl(name: string): string {
	const value = clean(process.env[name]);
	if (!value) throw new Error(`${name} is required.`);
	const url = new URL(value);
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`${name} must use http or https.`);
	}
	return url.toString().replace(/\/$/, "");
}

export function loadConfig(): WorkerConfig {
	const supabaseServiceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
	if (!supabaseServiceRoleKey) {
		throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
	}

	const leaseSeconds = integerEnv("LEASE_SECONDS", 120, 15, 900);
	const heartbeatMs = integerEnv(
		["HEARTBEAT_INTERVAL_MS", "HEARTBEAT_MS"],
		15_000,
		1_000,
		300_000
	);
	if (heartbeatMs >= leaseSeconds * 1_000) {
		throw new Error(
			"HEARTBEAT_INTERVAL_MS must be shorter than LEASE_SECONDS."
		);
	}

	const allowlist = (
		clean(process.env.APIFY_MEDIA_HOST_ALLOWLIST) ??
		"apify.com,.apify.com,apifyusercontent.com,.apifyusercontent.com"
	)
		.split(",")
		.map((host) => host.trim().toLowerCase())
		.filter(Boolean);

	return {
		supabaseUrl: requiredUrl("SUPABASE_URL"),
		supabaseServiceRoleKey,
		workerId:
			clean(process.env.WORKER_ID) ??
			`${hostname().slice(0, 80)}-${process.pid}-${randomUUID().slice(0, 8)}`,
		port: integerEnv("PORT", 3000, 1, 65_535),
		concurrency: integerEnv(["MAX_CONCURRENT", "WORKER_CONCURRENCY"], 2, 1, 10),
		leaseSeconds,
		heartbeatMs,
		pollMs: integerEnv("CLAIM_POLL_MS", 2_000, 250, 60_000),
		renderTimeoutMs: integerEnv(
			"RENDER_TIMEOUT_MS",
			45 * 60 * 1_000,
			1_000,
			2 * 60 * 60 * 1_000
		),
		minFreeDiskBytes: integerEnv(
			"MIN_FREE_DISK_BYTES",
			5 * 1024 * 1024 * 1024,
			0,
			Number.MAX_SAFE_INTEGER
		),
		retentionSweepMs: integerEnv(
			"RETENTION_SWEEP_MS",
			60 * 60 * 1_000,
			60_000,
			24 * 60 * 60 * 1_000
		),
		unreferencedOutputRetentionMs:
			integerEnv("UNREFERENCED_ATTEMPT_RETENTION_HOURS", 24, 1, 168) *
			60 *
			60 *
			1_000,
		winningOutputRetentionMs:
			integerEnv(["WINNING_OUTPUT_RETENTION_DAYS", "OUTPUT_RETENTION_DAYS"], 14, 1, 365) *
			24 *
			60 *
			60 *
			1_000,
		jobRetentionMs:
			integerEnv("JOB_RETENTION_DAYS", 30, 1, 365) * 24 * 60 * 60 * 1_000,
		tempRetentionMs:
			integerEnv("TEMP_RETENTION_HOURS", 24, 1, 168) * 60 * 60 * 1_000,
		workRoot: resolve(
			firstEnv(["WORK_DIR", "WORK_ROOT"]) ?? "/tmp/wzrd-render-worker"
		),
		ffmpegPath: resolve(clean(process.env.FFMPEG_PATH) ?? "/usr/bin/ffmpeg"),
		ffprobePath: resolve(clean(process.env.FFPROBE_PATH) ?? "/usr/bin/ffprobe"),
		apifyToken: firstEnv(["APIFY_API_TOKEN", "APIFY_TOKEN"]) ?? null,
		apifyPollMs: integerEnv("APIFY_POLL_MS", 5_000, 1_000, 60_000),
		apifyTimeoutMs: integerEnv(
			"APIFY_TIMEOUT_MS",
			30 * 60 * 1_000,
			30_000,
			2 * 60 * 60 * 1_000
		),
		apifyMediaHostAllowlist: allowlist,
	};
}
