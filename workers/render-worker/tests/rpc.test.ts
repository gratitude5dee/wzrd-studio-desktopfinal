import { describe, expect, it, vi } from "vitest";

import {
	acknowledgeCancellation,
	claimJobs,
	completeJob,
	failJob,
	heartbeatJob,
	type WorkerSupabaseClient,
} from "../src/supabase.js";
import { makeConfig, makeJob } from "./fixtures.js";

describe("render job RPC signatures", () => {
	it("claims through the approved three-argument RPC", async () => {
		const job = makeJob();
		const rpc = vi.fn().mockResolvedValue({ data: [job], error: null });
		const client = { rpc } as unknown as WorkerSupabaseClient;
		const config = makeConfig();

		await expect(claimJobs(client, config, 2)).resolves.toHaveLength(1);
		expect(rpc).toHaveBeenCalledWith("claim_web_render_jobs", {
			p_worker_id: config.workerId,
			p_limit: 2,
			p_lease_seconds: config.leaseSeconds,
		});
	});

	it("heartbeats with attempt and generation fences", async () => {
		const job = makeJob({ attempts: 2, generation: 3 });
		const rpc = vi.fn().mockResolvedValue({
			data: [{ cancel_requested: false, generation: 3, attempt: 2 }],
			error: null,
		});
		const client = { rpc } as unknown as WorkerSupabaseClient;
		const config = makeConfig();

		await heartbeatJob(client, config, job, {
			value: 45,
			stage: "rendering",
			message: null,
		});
		expect(rpc).toHaveBeenCalledWith("heartbeat_web_render_job", {
			p_job_id: job.id,
			p_worker_id: config.workerId,
			p_attempt: 2,
			p_generation: 3,
			p_lease_seconds: config.leaseSeconds,
			p_progress: 45,
			p_stage: "rendering",
			p_progress_message: null,
		});
	});

	it("completes only with immutable output metadata and all fences", async () => {
		const job = makeJob();
		const rpc = vi.fn().mockResolvedValue({ data: [job], error: null });
		const client = { rpc } as unknown as WorkerSupabaseClient;
		const config = makeConfig();
		const metadata = {
			bytes: 123,
			durationSeconds: 4,
			width: 640,
			height: 360,
			sha256: "b".repeat(64),
		};

		await completeJob(client, config, job, "owner/project/hash/attempts/1-0.mp4", metadata);
		expect(rpc).toHaveBeenCalledWith("complete_web_render_job", {
			p_job_id: job.id,
			p_worker_id: config.workerId,
			p_attempt: job.attempts,
			p_generation: job.generation,
			p_output_storage_path: "owner/project/hash/attempts/1-0.mp4",
			p_output_bytes: 123,
			p_output_duration_seconds: 4,
			p_output_width: 640,
			p_output_height: 360,
			p_output_sha256: "b".repeat(64),
		});
	});

	it("fails and acknowledges cancellation with the approved fenced signatures", async () => {
		const job = makeJob({ attempts: 3, generation: 2 });
		const rpc = vi.fn().mockResolvedValue({ data: [job], error: null });
		const client = { rpc } as unknown as WorkerSupabaseClient;
		const config = makeConfig();

		await failJob(client, config, job, "render_failed", "FFmpeg failed", false);
		expect(rpc).toHaveBeenNthCalledWith(1, "fail_web_render_job", {
			p_job_id: job.id,
			p_worker_id: config.workerId,
			p_attempt: 3,
			p_generation: 2,
			p_error_code: "render_failed",
			p_error_message: "FFmpeg failed",
			p_retryable: false,
		});

		await acknowledgeCancellation(client, config, job);
		expect(rpc).toHaveBeenNthCalledWith(2, "acknowledge_cancel_web_render_job", {
			p_job_id: job.id,
			p_worker_id: config.workerId,
			p_attempt: 3,
			p_generation: 2,
		});
	});
});
