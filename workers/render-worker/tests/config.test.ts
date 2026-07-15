import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";

const ENV_NAMES = [
	"SUPABASE_URL",
	"SUPABASE_SERVICE_ROLE_KEY",
	"LEASE_SECONDS",
	"APIFY_API_TOKEN",
	"APIFY_TOKEN",
	"MAX_CONCURRENT",
	"WORKER_CONCURRENCY",
	"HEARTBEAT_INTERVAL_MS",
	"HEARTBEAT_MS",
	"WORK_DIR",
	"WORK_ROOT",
] as const;

function baseEnv(): void {
	for (const name of ENV_NAMES) vi.stubEnv(name, "");
	vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
	vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("Railway worker configuration", () => {
	it("uses the approved Railway names and defaults the lease to 120 seconds", () => {
		baseEnv();
		vi.stubEnv("APIFY_API_TOKEN", "approved-apify");
		vi.stubEnv("APIFY_TOKEN", "legacy-apify");
		vi.stubEnv("MAX_CONCURRENT", "4");
		vi.stubEnv("WORKER_CONCURRENCY", "2");
		vi.stubEnv("HEARTBEAT_INTERVAL_MS", "20000");
		vi.stubEnv("HEARTBEAT_MS", "10000");
		vi.stubEnv("WORK_DIR", "/tmp/approved-work");
		vi.stubEnv("WORK_ROOT", "/tmp/legacy-work");

		const config = loadConfig();
		expect(config).toMatchObject({
			leaseSeconds: 120,
			apifyToken: "approved-apify",
			concurrency: 4,
			heartbeatMs: 20_000,
			workRoot: "/tmp/approved-work",
		});
	});

	it("keeps legacy aliases as fallbacks", () => {
		baseEnv();
		vi.stubEnv("APIFY_TOKEN", "legacy-apify");
		vi.stubEnv("WORKER_CONCURRENCY", "3");
		vi.stubEnv("HEARTBEAT_MS", "12000");
		vi.stubEnv("WORK_ROOT", "/tmp/legacy-work");

		expect(loadConfig()).toMatchObject({
			apifyToken: "legacy-apify",
			concurrency: 3,
			heartbeatMs: 12_000,
			workRoot: "/tmp/legacy-work",
		});
	});
});
