import type {
	ClipperVerticalManifestV1,
	QCutTimelineManifestV1,
} from "../manifest";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
export const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
export const JOB_ID = "33333333-3333-4333-8333-333333333333";
export const BATCH_ID = "44444444-4444-4444-8444-444444444444";

export const transform = {
	position: { x: 0, y: 0 },
	scale: { x: 1, y: 1 },
	rotation: 0,
	opacity: 1,
} as const;

export const audioSettings = {
	volume: 1,
	muted: false,
	fadeInSeconds: 0,
	fadeOutSeconds: 0,
} as const;

export function makeClipperManifest(
	userId = USER_ID
): ClipperVerticalManifestV1 {
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
			durationSeconds: 5,
			backgroundColor: "#000000",
		},
		source: {
			bucket: "project-assets",
			path: `${userId}/projects/${PROJECT_ID}/source.mp4`,
		},
		trim: { startSeconds: 2, durationSeconds: 5 },
	};
}

export function makeParityManifest(): QCutTimelineManifestV1 {
	return {
		manifestVersion: 1,
		kind: "qcut_timeline",
		projectId: PROJECT_ID,
		output: {
			format: "mp4",
			videoCodec: "h264",
			audioCodec: "aac",
			width: 1920,
			height: 1080,
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
						durationSeconds: 5,
						sourceStartSeconds: 0,
						sourceDurationSeconds: 5,
						transform,
						audio: audioSettings,
						effects: [{ type: "fade_in", durationSeconds: 0.5 }],
					},
					{
						id: "video-b",
						type: "video",
						source: {
							bucket: "project-assets",
							path: `${USER_ID}/projects/${PROJECT_ID}/b.mp4`,
						},
						startSeconds: 5,
						durationSeconds: 5,
						sourceStartSeconds: 1,
						sourceDurationSeconds: 5,
						transform,
						audio: audioSettings,
						effects: [{ type: "fade_out", durationSeconds: 0.5 }],
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
						source: {
							bucket: "project-assets",
							path: `${USER_ID}/projects/${PROJECT_ID}/a.wav`,
						},
						startSeconds: 0,
						durationSeconds: 5,
						sourceStartSeconds: 0,
						sourceDurationSeconds: 5,
						audio: audioSettings,
					},
					{
						id: "audio-b",
						type: "audio",
						source: {
							bucket: "project-assets",
							path: `${USER_ID}/projects/${PROJECT_ID}/b.wav`,
						},
						startSeconds: 5,
						durationSeconds: 5,
						sourceStartSeconds: 0,
						sourceDurationSeconds: 5,
						audio: audioSettings,
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
						source: {
							bucket: "project-assets",
							path: `${USER_ID}/projects/${PROJECT_ID}/overlay.png`,
						},
						startSeconds: 0,
						durationSeconds: 10,
						transform,
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
						source: {
							bucket: "project-assets",
							path: `${USER_ID}/projects/${PROJECT_ID}/sticker.png`,
						},
						startSeconds: 0,
						durationSeconds: 10,
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
						content: "Hello",
						startSeconds: 0,
						durationSeconds: 10,
						transform,
						style: {
							fontFamily: "DejaVu Sans",
							fontSize: 64,
							fontWeight: "bold",
							fontStyle: "normal",
							textDecoration: "none",
							textAlign: "center",
							color: "#ffffff",
							backgroundColor: "#00000000",
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
				toClipId: "video-b",
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
