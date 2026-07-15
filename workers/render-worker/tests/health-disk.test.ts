import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { getDiskFreeBytes, hasDiskAdmission } from "../src/disk.js";
import {
	closeHealthServer,
	healthSnapshot,
	startHealthServer,
	type WorkerHealthState,
} from "../src/health.js";

const servers: Awaited<ReturnType<typeof startHealthServer>>[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map(closeHealthServer));
});

function state(overrides: Partial<WorkerHealthState> = {}): WorkerHealthState {
	return {
		workerId: "worker-test",
		capacity: 2,
		active: 0,
		startedAt: new Date().toISOString(),
		lastClaimAt: null,
		lastClaimError: null,
		diskFreeBytes: 10_000,
		minFreeDiskBytes: 1_000,
		shuttingDown: false,
		...overrides,
	};
}

describe("disk admission and health", () => {
	it("reads filesystem availability with statfs and enforces the threshold", async () => {
		const free = await getDiskFreeBytes(tmpdir());
		expect(free).toBeGreaterThan(0);
		expect(hasDiskAdmission(free, free)).toBe(true);
		expect(hasDiskAdmission(free, free + 1)).toBe(false);
	});

	it("reports diskFreeBytes on healthz and fails health below admission", async () => {
		const healthState = state({ diskFreeBytes: 999, minFreeDiskBytes: 1_000 });
		expect(healthSnapshot(healthState)).toMatchObject({
			healthy: false,
			body: { status: "insufficient_disk", diskFreeBytes: 999 },
		});
		const server = await startHealthServer(0, healthState);
		servers.push(server);
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("missing address");
		const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			status: "insufficient_disk",
			diskFreeBytes: 999,
			minFreeDiskBytes: 1_000,
		});
	});
});
