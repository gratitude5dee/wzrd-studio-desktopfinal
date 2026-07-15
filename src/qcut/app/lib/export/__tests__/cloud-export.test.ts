import { describe, expect, it, vi } from "vitest";

import { validateRenderManifest } from "@/app/api/render/_lib/manifest";
import {
	analyzeCloudRenderEligibility,
	buildRenderManifest,
	pollRenderJob,
	type CloudRenderJob,
} from "../cloud-export";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function serializationInput() {
	return {
		projectId: PROJECT_ID,
		settings: {
			format: "mp4",
			quality: "720p",
			filename: "render.mp4",
			width: 1280,
			height: 720,
			includeAudio: true,
		},
		totalDuration: 10,
		tracks: [
			{
				id: "video-track",
				type: "video",
				muted: false,
				elements: [
					{
						id: "video-a",
						type: "media",
						mediaId: "media-a",
						startTime: 0,
						duration: 10,
						trimStart: 0,
						trimEnd: 0,
						x: 0,
						y: 0,
						width: 1280,
						height: 720,
						rotation: 0,
						volume: 1,
					},
				],
			},
		],
		mediaItems: [
			{
				id: "media-a",
				name: "a.mp4",
				type: "video",
				file: new File([], "a.mp4", { type: "video/mp4" }),
				width: 1280,
				height: 720,
				metadata: {
					storageBucket: "project-assets",
					storagePath: `${USER_ID}/projects/${PROJECT_ID}/a.mp4`,
				},
			},
		],
	} as any;
}

function job(status: CloudRenderJob["status"], progress: number): CloudRenderJob {
	return {
		id: "33333333-3333-4333-8333-333333333333",
		status,
		progress,
		progressMessage: status,
	} as CloudRenderJob;
}

describe("cloud export contract", () => {
	it("serializes a timeline into the strict v1 render manifest", () => {
		const manifest = buildRenderManifest(serializationInput());

		expect(manifest).toEqual({
			manifestVersion: 1,
			kind: "qcut_timeline",
			projectId: PROJECT_ID,
			output: {
				format: "mp4",
				videoCodec: "h264",
				audioCodec: "aac",
				width: 1280,
				height: 720,
				fps: 30,
				durationSeconds: 10,
				backgroundColor: "#000000",
			},
			tracks: [
				{
					id: "video-track",
					type: "video",
					muted: false,
					clips: [
						{
							id: "video-a",
							type: "video",
							source: {
								bucket: "project-assets",
								path: `${USER_ID}/projects/${PROJECT_ID}/a.mp4`,
							},
							startSeconds: 0,
							durationSeconds: 10,
							sourceStartSeconds: 0,
							sourceDurationSeconds: 10,
							audio: {
								volume: 1,
								muted: false,
								fadeInSeconds: 0,
								fadeOutSeconds: 0,
							},
							transform: {
								position: { x: 0, y: 0 },
								scale: { x: 1, y: 1 },
								rotation: 0,
								opacity: 1,
							},
						},
					],
				},
			],
			transitions: [],
		});
		expect(validateRenderManifest(manifest).ok).toBe(true);
	});

	it("rejects unsupported features before enqueue", () => {
		const input = serializationInput();
		input.tracks = [
			{
				id: "markdown-track",
				type: "markdown",
				elements: [
					{
						id: "markdown-a",
						type: "markdown",
						startTime: 0,
						duration: 10,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		] as any;

		expect(analyzeCloudRenderEligibility(input)).toMatchObject({
			eligible: false,
			reasons: [{ code: "unsupported_feature", feature: "markdown" }],
		});
	});

	it("polls with backoff until a terminal job is returned", async () => {
		const jobs = [job("queued", 0), job("running", 45), job("succeeded", 100)];
		const fetchImpl = vi.fn(async () =>
			Response.json({ job: jobs.shift() }, { status: 200 })
		) as unknown as typeof fetch;
		const sleep = vi.fn(async () => undefined);
		const onProgress = vi.fn();

		const result = await pollRenderJob("job-1", {
			accessToken: "token",
			fetchImpl,
			sleep,
			onProgress,
		});

		expect(result.status).toBe("succeeded");
		expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([2500, 3500, 4900]);
		expect(onProgress).toHaveBeenCalledTimes(3);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});
});
