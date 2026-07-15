import { describe, expect, it, vi } from "vitest";

import type { CloudRenderJob } from "../cloud-export";
import { CloudExportEngine } from "../export-engine-cloud";

function mockCanvas(): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.getContext = vi.fn(() => ({
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
	})) as unknown as typeof canvas.getContext;
	return canvas;
}

function job(status: CloudRenderJob["status"]): CloudRenderJob {
	return {
		id: "33333333-3333-4333-8333-333333333333",
		status,
		progress: status === "succeeded" ? 100 : 0,
		signedUrl: status === "succeeded" ? "https://signed.example/output.mp4" : null,
	} as CloudRenderJob;
}

describe("CloudExportEngine", () => {
	it("conforms to ExportEngine by returning the completed render blob", async () => {
		const queued = job("queued");
		const succeeded = job("succeeded");
		const output = new Blob(["video"], { type: "video/mp4" });
		const progress = vi.fn();
		const dependencies = {
			analyzeEligibility: vi.fn(() => ({ eligible: true, requiresUploads: [] })),
			getSession: vi.fn(async () => ({ accessToken: "token", userId: "user-1" })),
			prepareAssets: vi.fn(async () => undefined),
			buildManifest: vi.fn(() => ({ projectId: "project-1" })),
			enqueueJob: vi.fn(async () => ({ job: queued, idempotent: false })),
			pollJob: vi.fn(async (_id, options) => {
				options?.onProgress?.({ ...succeeded, progressMessage: "Finalizing" });
				return succeeded;
			}),
			fetchResult: vi.fn(async () => ({ blob: output, job: succeeded })),
			cancelJob: vi.fn(),
			retryJob: vi.fn(),
		};
		const engine = new CloudExportEngine(
			mockCanvas(),
			{
				format: "mp4",
				quality: "720p",
				filename: "render.mp4",
				width: 1280,
				height: 720,
			} as any,
			[],
			[],
			60,
			{
				projectId: "22222222-2222-4222-8222-222222222222",
				dependencies: dependencies as any,
			}
		);

		await expect(engine.export(progress)).resolves.toBe(output);
		expect(engine.isExportInProgress()).toBe(false);
		expect(engine.getCurrentJob()?.status).toBe("succeeded");
		expect(dependencies.enqueueJob).toHaveBeenCalledOnce();
		expect(dependencies.pollJob).toHaveBeenCalledOnce();
		expect(dependencies.fetchResult).toHaveBeenCalledWith(
			succeeded.id,
			expect.objectContaining({ signedUrl: succeeded.signedUrl })
		);
		expect(progress).toHaveBeenLastCalledWith(100, "Export complete!");
	});

	it("rejects cloud-ineligible timelines before authentication or enqueue", async () => {
		const dependencies = {
			analyzeEligibility: vi.fn(() => ({
				eligible: false,
				reasons: [
					{
						code: "unsupported_feature",
						message: "Markdown remains in-browser.",
					},
				],
			})),
			getSession: vi.fn(),
			enqueueJob: vi.fn(),
		};
		const engine = new CloudExportEngine(
			mockCanvas(),
			{ format: "mp4", width: 1280, height: 720 } as any,
			[],
			[],
			60,
			{ dependencies: dependencies as any }
		);

		await expect(engine.export()).rejects.toMatchObject({
			code: "unsupported_feature",
			clientFallbackRecommended: true,
		});
		expect(dependencies.getSession).not.toHaveBeenCalled();
		expect(dependencies.enqueueJob).not.toHaveBeenCalled();
	});
});
