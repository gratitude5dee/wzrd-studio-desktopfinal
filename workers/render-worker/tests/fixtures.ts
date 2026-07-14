import type { WorkerConfig } from "../src/config.js";
import type {
	ClipperVerticalManifestV1,
	QCutTimelineManifestV1,
} from "../src/manifest.js";
import type { LocalAsset, RenderJobRecord } from "../src/types.js";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
export const JOB_ID = "33333333-3333-4333-8333-333333333333";
export const IDEMPOTENCY_HASH = "a".repeat(64);

export const transform = {
	position: { x: 12, y: -8 },
	scale: { x: 1.25, y: 0.75 },
	rotation: 15,
	opacity: 0.8,
} as const;

export const audio = {
	volume: 0.8,
	muted: false,
	fadeInSeconds: 0.1,
	fadeOutSeconds: 0.1,
} as const;

function source(name: string) {
	return {
		bucket: "project-assets" as const,
		path: `${USER_ID}/projects/${PROJECT_ID}/${name}`,
	};
}

export function makeQCutManifest(): QCutTimelineManifestV1 {
	return {
		manifestVersion: 1,
		kind: "qcut_timeline",
		projectId: PROJECT_ID,
		output: {
			format: "mp4",
			videoCodec: "h264",
			audioCodec: "aac",
			width: 640,
			height: 360,
			fps: 30,
			durationSeconds: 4,
			backgroundColor: "#101010",
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
						source: source("video.mp4"),
						startSeconds: 0,
						durationSeconds: 2,
						sourceStartSeconds: 1,
						sourceDurationSeconds: 4,
						transform,
						audio,
						wordCuts: {
							mode: "keep",
							ranges: [
								{ startSeconds: 0, endSeconds: 1 },
								{ startSeconds: 2, endSeconds: 3 },
							],
						},
						effects: [{ type: "fade_in", durationSeconds: 0.25 }],
					},
				],
			},
			{
				id: "audio-track",
				type: "audio",
				muted: false,
				clips: [
					{
						id: "audio-a",
						type: "audio",
						source: source("audio-a.wav"),
						startSeconds: 0,
						durationSeconds: 2,
						sourceStartSeconds: 0,
						sourceDurationSeconds: 2,
						audio,
					},
					{
						id: "audio-b",
						type: "audio",
						source: source("audio-b.wav"),
						startSeconds: 2,
						durationSeconds: 2,
						sourceStartSeconds: 0,
						sourceDurationSeconds: 2,
						audio,
						effects: [{ type: "fade_out", durationSeconds: 0.25 }],
					},
				],
			},
			{
				id: "image-track",
				type: "image",
				clips: [
					{
						id: "image-a",
						type: "image",
						source: source("image.png"),
						startSeconds: 0,
						durationSeconds: 4,
						transform: { ...transform, rotation: 0 },
						effects: [{ type: "fade_out", durationSeconds: 0.5 }],
					},
				],
			},
			{
				id: "sticker-track",
				type: "sticker",
				clips: [
					{
						id: "sticker-a",
						type: "sticker",
						source: source("sticker.png"),
						startSeconds: 1,
						durationSeconds: 2,
						transform,
					},
				],
			},
			{
				id: "text-track",
				type: "text",
				clips: [
					{
						id: "text-a",
						type: "text",
						content: "Hello {WZRD}",
						startSeconds: 0,
						durationSeconds: 4,
						transform,
						style: {
							fontFamily: "Inter",
							fontSize: 42,
							fontWeight: "bold",
							fontStyle: "italic",
							textDecoration: "underline",
							textAlign: "center",
							color: "#ffffff",
							backgroundColor: "#00000080",
						},
						effects: [{ type: "fade_in", durationSeconds: 0.3 }],
					},
				],
			},
			{
				id: "caption-track",
				type: "captions",
				clips: [
					{
						id: "caption-a",
						type: "captions",
						startSeconds: 0,
						durationSeconds: 4,
						language: "en",
						source: "manual",
						segments: [
							{ id: "caption-segment", text: "Caption", startSeconds: 0, endSeconds: 2 },
						],
						style: {
							fontFamily: "Arial",
							fontSize: 30,
							fontColor: "#ffffff",
							fontOpacity: 1,
							bold: true,
							italic: false,
							underline: false,
							outlineColor: "#000000",
							outlineWidth: 2,
							shadowColor: "#000000",
							shadowOffset: { x: 2, y: 2 },
							backgroundColor: "#000000",
							backgroundOpacity: 0.4,
							position: { align: "bottom", x: 0, y: -10 },
							lineSpacing: 1,
						},
					},
				],
			},
		],
		transitions: [
			{
				id: "visual-transition",
				type: "crossfade",
				fromClipId: "video-a",
				toClipId: "image-a",
				durationSeconds: 0.5,
			},
			{
				id: "audio-transition",
				type: "audio_crossfade",
				fromClipId: "audio-a",
				toClipId: "audio-b",
				durationSeconds: 0.5,
			},
		],
	};
}

export function makeClipperManifest(): ClipperVerticalManifestV1 {
	return {
		manifestVersion: 1,
		kind: "clipper_vertical",
		projectId: PROJECT_ID,
		output: {
			format: "mp4",
			videoCodec: "h264",
			audioCodec: "aac",
			preset: "vertical_9_16",
			width: 1080,
			height: 1920,
			fps: 30,
			durationSeconds: 3,
			backgroundColor: "#000000",
		},
		source: source("video.mp4"),
		trim: { startSeconds: 1, durationSeconds: 3 },
		logo: { source: source("sticker.png"), transform },
	};
}

export function makeLocalAssets(manifest = makeQCutManifest()): LocalAsset[] {
	const paths = new Map<string, "visual" | "audio" | "video">();
	for (const track of manifest.tracks) {
		if (
			track.type === "video" ||
			track.type === "audio" ||
			track.type === "image" ||
			track.type === "sticker"
		) {
			for (const clip of track.clips) {
				paths.set(
					clip.source.path,
					clip.type === "audio" ? "audio" : clip.type === "video" ? "video" : "visual"
				);
			}
		}
	}
	return [...paths].map(([path, kind], index) => ({
		bucket: "project-assets",
		path,
		filePath: `/tmp/test-asset-${index}${path.endsWith(".wav") ? ".wav" : path.endsWith(".png") ? ".png" : ".mp4"}`,
		bytes: 100,
		probe: {
			durationSeconds: 10,
			width: kind === "audio" ? null : 640,
			height: kind === "audio" ? null : 360,
			hasVideo: kind !== "audio",
			hasAudio: kind !== "visual",
			formatName: "fixture",
		},
	}));
}

export function makeJob(overrides: Partial<RenderJobRecord> = {}): RenderJobRecord {
	return {
		id: JOB_ID,
		idempotency_hash: IDEMPOTENCY_HASH,
		user_id: USER_ID,
		project_id: PROJECT_ID,
		status: "running",
		request: makeQCutManifest(),
		kind: "qcut_timeline",
		manifest_schema_version: 1,
		attempts: 1,
		max_attempts: 3,
		generation: 0,
		cancel_requested: false,
		lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
		...overrides,
	};
}

export function makeConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
	return {
		supabaseUrl: "https://project.supabase.co",
		supabaseServiceRoleKey: "service-role",
		workerId: "worker-test",
		port: 3000,
		concurrency: 2,
		leaseSeconds: 60,
		heartbeatMs: 15_000,
		pollMs: 2_000,
		retentionSweepMs: 60_000,
		outputRetentionMs: 604_800_000,
		tempRetentionMs: 86_400_000,
		workRoot: "/tmp/wzrd-render-worker-test",
		ffmpegPath: "/usr/bin/ffmpeg",
		ffprobePath: "/usr/bin/ffprobe",
		apifyToken: "apify-token",
		apifyPollMs: 10,
		apifyTimeoutMs: 1_000,
		apifyMediaHostAllowlist: ["example.apifyusercontent.com"],
		...overrides,
	};
}
