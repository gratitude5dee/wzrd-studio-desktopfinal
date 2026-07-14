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
	retentionSweepMs: number;
	outputRetentionMs: number;
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

function integerEnv(
	name: string,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	const raw = clean(process.env[name]);
	const value = raw === undefined ? fallback : Number(raw);
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
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

	const leaseSeconds = integerEnv("LEASE_SECONDS", 60, 15, 900);
	const heartbeatMs = integerEnv("HEARTBEAT_MS", 15_000, 1_000, 300_000);
	if (heartbeatMs >= leaseSeconds * 1_000) {
		throw new Error("HEARTBEAT_MS must be shorter than LEASE_SECONDS.");
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
		concurrency: integerEnv("WORKER_CONCURRENCY", 2, 1, 10),
		leaseSeconds,
		heartbeatMs,
		pollMs: integerEnv("CLAIM_POLL_MS", 2_000, 250, 60_000),
		retentionSweepMs: integerEnv(
			"RETENTION_SWEEP_MS",
			60 * 60 * 1_000,
			60_000,
			24 * 60 * 60 * 1_000
		),
		outputRetentionMs:
			integerEnv("OUTPUT_RETENTION_HOURS", 168, 1, 8_760) * 60 * 60 * 1_000,
		tempRetentionMs:
			integerEnv("TEMP_RETENTION_HOURS", 24, 1, 168) * 60 * 60 * 1_000,
		workRoot: resolve(clean(process.env.WORK_ROOT) ?? "/tmp/wzrd-render-worker"),
		ffmpegPath: resolve(clean(process.env.FFMPEG_PATH) ?? "/usr/bin/ffmpeg"),
		ffprobePath: resolve(clean(process.env.FFPROBE_PATH) ?? "/usr/bin/ffprobe"),
		apifyToken: clean(process.env.APIFY_TOKEN) ?? null,
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
