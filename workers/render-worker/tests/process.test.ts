import { describe, expect, it } from "vitest";

import { LeaseLostError } from "../src/errors.js";
import { runCommand } from "../src/process.js";

describe("native process cancellation", () => {
	it("kills a running process immediately when the lease signal aborts", async () => {
		const controller = new AbortController();
		const startedAt = Date.now();
		const command = runCommand({
			command: process.execPath,
			args: ["-e", "setInterval(() => {}, 1000)"],
			signal: controller.signal,
		});
		setTimeout(() => controller.abort(new LeaseLostError()), 50);

		await expect(command).rejects.toBeInstanceOf(LeaseLostError);
		expect(Date.now() - startedAt).toBeLessThan(2_000);
	});
});
