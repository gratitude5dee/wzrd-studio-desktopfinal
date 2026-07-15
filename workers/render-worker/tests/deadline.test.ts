import { afterEach, describe, expect, it, vi } from "vitest";

import { createRenderDeadline } from "../src/worker.js";

afterEach(() => {
	vi.useRealTimers();
});

describe("render attempt deadline", () => {
	it("combines parent aborts with RENDER_TIMEOUT_MS", async () => {
		vi.useFakeTimers();
		const parent = new AbortController();
		const deadline = createRenderDeadline(1_000, [parent.signal]);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(deadline.signal.aborted).toBe(true);
		expect(deadline.signal.reason).toMatchObject({
			code: "render_timeout",
			retryable: true,
		});
		deadline.stop();

		const parentReason = new Error("lease lost");
		const combined = createRenderDeadline(2_000, [parent.signal]);
		parent.abort(parentReason);
		expect(combined.signal.reason).toBe(parentReason);
		combined.stop();
	});
});
