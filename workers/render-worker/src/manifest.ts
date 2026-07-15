import { z } from "zod";

export const RENDER_MANIFEST_VERSION = 1 as const;
export const MAX_RENDER_DURATION_SECONDS = 30 * 60;
export const MAX_RENDER_ASSETS = 64;
export const MAX_RENDER_TEXT_ENTRIES = 500;
export const MAX_RENDER_ASSET_BYTES = 2 * 1024 * 1024 * 1024;

export const CLOUD_RENDER_EFFECTS = ["fade_in", "fade_out"] as const;
export const CLOUD_RENDER_TRANSITIONS = [
	"crossfade",
	"audio_crossfade",
] as const;
export const CLOUD_INELIGIBLE_FEATURES = ["remotion", "markdown"] as const;

export const CLOUD_RENDER_PARITY_MATRIX = {
	video_tracks: "supported",
	audio_tracks: "supported",
	clip_trims_splits_word_cuts: "supported",
	volume_mute_fades_mixing: "supported",
	position_scale_rotation_opacity: "supported",
	images_stickers_overlays: "supported",
	text_captions: "supported_with_bundled_font_fallback",
	crossfade_fade_audio_crossfade: "allowlist_only",
	remotion_tracks: "in_browser_only",
	unknown_features: "rejected",
} as const;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const APIFY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const identifierSchema = z.string().regex(IDENTIFIER_PATTERN);
const finiteNumberSchema = z.number().finite();
const timelineTimeSchema = finiteNumberSchema
	.min(0)
	.max(MAX_RENDER_DURATION_SECONDS);
const positiveDurationSchema = finiteNumberSchema
	.gt(0)
	.max(MAX_RENDER_DURATION_SECONDS);
const colorSchema = z.string().regex(HEX_COLOR_PATTERN);

function isSafeStoragePath(path: string): boolean {
	const hasControlCharacter = Array.from(path).some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127;
	});
	if (
		path.length < 3 ||
		path.length > 1024 ||
		path.startsWith("/") ||
		path.startsWith("\\") ||
		path.includes("\\") ||
		path.includes("//") ||
		path.includes("%") ||
		path.includes("?") ||
		path.includes("#") ||
		hasControlCharacter ||
		URL_SCHEME_PATTERN.test(path)
	) {
		return false;
	}

	const segments = path.split("/");
	return (
		segments.length >= 2 &&
		segments.every(
			(segment) => segment.length > 0 && segment !== "." && segment !== ".."
		)
	);
}

export const renderAssetRefSchema = z
	.object({
		bucket: z.literal("project-assets"),
		path: z.string().refine(isSafeStoragePath, {
			message: "Asset path must be a relative project-assets object path.",
		}),
	})
	.strict();

const positionSchema = z
	.object({
		x: finiteNumberSchema.min(-15360).max(15360),
		y: finiteNumberSchema.min(-8640).max(8640),
	})
	.strict();

const scaleSchema = z
	.object({
		x: finiteNumberSchema.gt(0).max(20),
		y: finiteNumberSchema.gt(0).max(20),
	})
	.strict();

const transformSchema = z
	.object({
		position: positionSchema,
		scale: scaleSchema,
		rotation: finiteNumberSchema.min(-3600).max(3600),
		opacity: finiteNumberSchema.min(0).max(1),
	})
	.strict();

const wordKeepRangeSchema = z
	.object({
		startSeconds: timelineTimeSchema,
		endSeconds: timelineTimeSchema,
	})
	.strict()
	.refine((range) => range.endSeconds > range.startSeconds, {
		message: "Word-cut range end must be after its start.",
	});

const wordCutsSchema = z
	.object({
		mode: z.literal("keep"),
		ranges: z.array(wordKeepRangeSchema).min(1).max(MAX_RENDER_TEXT_ENTRIES),
	})
	.strict();

const clipEffectSchema = z
	.object({
		type: z.enum(CLOUD_RENDER_EFFECTS),
		durationSeconds: positiveDurationSchema,
	})
	.strict();

const audioSettingsSchema = z
	.object({
		volume: finiteNumberSchema.min(0).max(4),
		muted: z.boolean(),
		fadeInSeconds: timelineTimeSchema,
		fadeOutSeconds: timelineTimeSchema,
	})
	.strict();

const videoClipSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("video"),
		source: renderAssetRefSchema,
		startSeconds: timelineTimeSchema,
		durationSeconds: positiveDurationSchema,
		sourceStartSeconds: timelineTimeSchema,
		sourceDurationSeconds: positiveDurationSchema,
		transform: transformSchema,
		audio: audioSettingsSchema,
		wordCuts: wordCutsSchema.optional(),
		effects: z.array(clipEffectSchema).max(2).optional(),
	})
	.strict();

const audioClipSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("audio"),
		source: renderAssetRefSchema,
		startSeconds: timelineTimeSchema,
		durationSeconds: positiveDurationSchema,
		sourceStartSeconds: timelineTimeSchema,
		sourceDurationSeconds: positiveDurationSchema,
		audio: audioSettingsSchema,
		wordCuts: wordCutsSchema.optional(),
		effects: z.array(clipEffectSchema).max(2).optional(),
	})
	.strict();

const imageClipSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("image"),
		source: renderAssetRefSchema,
		startSeconds: timelineTimeSchema,
		durationSeconds: positiveDurationSchema,
		transform: transformSchema,
		effects: z.array(clipEffectSchema).max(2).optional(),
	})
	.strict();

const stickerClipSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("sticker"),
		source: renderAssetRefSchema,
		startSeconds: timelineTimeSchema,
		durationSeconds: positiveDurationSchema,
		transform: transformSchema,
	})
	.strict();

const textStyleSchema = z
	.object({
		fontFamily: z.string().trim().min(1).max(100),
		fontSize: finiteNumberSchema.gt(0).max(512),
		fontWeight: z.enum(["normal", "bold"]),
		fontStyle: z.enum(["normal", "italic"]),
		textDecoration: z.enum(["none", "underline", "line-through"]),
		textAlign: z.enum(["left", "center", "right"]),
		color: colorSchema,
		backgroundColor: colorSchema,
	})
	.strict();

const textClipSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("text"),
		content: z.string().min(1).max(10_000),
		startSeconds: timelineTimeSchema,
		durationSeconds: positiveDurationSchema,
		transform: transformSchema,
		style: textStyleSchema,
		effects: z.array(clipEffectSchema).max(2).optional(),
	})
	.strict();

const captionPositionSchema = z
	.object({
		align: z.enum(["top", "center", "bottom"]),
		x: finiteNumberSchema.min(-15360).max(15360),
		y: finiteNumberSchema.min(-8640).max(8640),
	})
	.strict();

const captionStyleSchema = z
	.object({
		fontFamily: z.string().trim().min(1).max(100),
		fontSize: finiteNumberSchema.gt(0).max(512),
		fontColor: colorSchema,
		fontOpacity: finiteNumberSchema.min(0).max(1),
		bold: z.boolean(),
		italic: z.boolean(),
		underline: z.boolean(),
		outlineColor: colorSchema,
		outlineWidth: finiteNumberSchema.min(0).max(32),
		shadowColor: colorSchema,
		shadowOffset: positionSchema,
		backgroundColor: colorSchema,
		backgroundOpacity: finiteNumberSchema.min(0).max(1),
		position: captionPositionSchema,
		lineSpacing: finiteNumberSchema.min(0.5).max(4),
	})
	.strict();

const captionSegmentSchema = z
	.object({
		id: identifierSchema,
		text: z.string().min(1).max(2_000),
		startSeconds: timelineTimeSchema,
		endSeconds: timelineTimeSchema,
	})
	.strict()
	.refine((segment) => segment.endSeconds > segment.startSeconds, {
		message: "Caption segment end must be after its start.",
	});

const captionClipSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("captions"),
		startSeconds: timelineTimeSchema,
		durationSeconds: positiveDurationSchema,
		language: z.string().trim().min(1).max(32),
		source: z.enum(["transcription", "manual", "imported"]),
		segments: z.array(captionSegmentSchema).min(1).max(MAX_RENDER_TEXT_ENTRIES),
		style: captionStyleSchema,
	})
	.strict();

const videoTrackSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("video"),
		muted: z.boolean(),
		clips: z.array(videoClipSchema).max(512),
	})
	.strict();

const audioTrackSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("audio"),
		muted: z.boolean(),
		clips: z.array(audioClipSchema).max(512),
	})
	.strict();

const imageTrackSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("image"),
		clips: z.array(imageClipSchema).max(512),
	})
	.strict();

const stickerTrackSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("sticker"),
		clips: z.array(stickerClipSchema).max(512),
	})
	.strict();

const textTrackSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("text"),
		clips: z.array(textClipSchema).max(MAX_RENDER_TEXT_ENTRIES),
	})
	.strict();

const captionTrackSchema = z
	.object({
		id: identifierSchema,
		type: z.literal("captions"),
		clips: z.array(captionClipSchema).max(MAX_RENDER_TEXT_ENTRIES),
	})
	.strict();

const timelineTrackSchema = z.discriminatedUnion("type", [
	videoTrackSchema,
	audioTrackSchema,
	imageTrackSchema,
	stickerTrackSchema,
	textTrackSchema,
	captionTrackSchema,
]);

const transitionSchema = z
	.object({
		id: identifierSchema,
		type: z.enum(CLOUD_RENDER_TRANSITIONS),
		fromClipId: identifierSchema,
		toClipId: identifierSchema,
		durationSeconds: positiveDurationSchema,
	})
	.strict();

const outputSettingsSchema = z
	.object({
		format: z.literal("mp4"),
		videoCodec: z.literal("h264"),
		audioCodec: z.literal("aac"),
		width: z.number().int().min(16).max(3840),
		height: z.number().int().min(16).max(2160),
		fps: finiteNumberSchema.gt(0).max(60),
		durationSeconds: positiveDurationSchema,
		backgroundColor: colorSchema,
	})
	.strict();

export const qcutTimelineManifestV1Schema = z
	.object({
		manifestVersion: z.literal(RENDER_MANIFEST_VERSION),
		kind: z.literal("qcut_timeline"),
		projectId: z.string().uuid(),
		output: outputSettingsSchema,
		tracks: z.array(timelineTrackSchema).min(1).max(64),
		transitions: z.array(transitionSchema).max(256),
	})
	.strict();

const clipperOutputSettingsSchema = z
	.object({
		format: z.literal("mp4"),
		videoCodec: z.literal("h264"),
		audioCodec: z.literal("aac"),
		preset: z.literal("vertical_9_16"),
		width: z.literal(1080),
		height: z.literal(1920),
		fps: finiteNumberSchema.gt(0).max(60),
		durationSeconds: positiveDurationSchema,
		backgroundColor: colorSchema,
	})
	.strict();

const clipperLogoSchema = z
	.object({
		source: renderAssetRefSchema,
		transform: transformSchema,
	})
	.strict();

export const clipperVerticalManifestV1Schema = z
	.object({
		manifestVersion: z.literal(RENDER_MANIFEST_VERSION),
		kind: z.literal("clipper_vertical"),
		projectId: z.string().uuid(),
		output: clipperOutputSettingsSchema,
		source: renderAssetRefSchema,
		trim: z
			.object({
				startSeconds: timelineTimeSchema,
				durationSeconds: positiveDurationSchema,
			})
			.strict(),
		logo: clipperLogoSchema.optional(),
	})
	.strict();

export const mediaIngestManifestV1Schema = z
	.object({
		manifestVersion: z.literal(RENDER_MANIFEST_VERSION),
		kind: z.literal("media_ingest"),
		projectId: z.string().uuid(),
		source: z
			.object({
				provider: z.literal("apify"),
				actorRunId: z.string().regex(APIFY_ID_PATTERN),
				datasetId: z.string().regex(APIFY_ID_PATTERN),
				itemId: z.string().regex(APIFY_ID_PATTERN),
			})
			.strict(),
		destination: renderAssetRefSchema,
	})
	.strict();

export const renderManifestV1Schema = z.discriminatedUnion("kind", [
	qcutTimelineManifestV1Schema,
	clipperVerticalManifestV1Schema,
	mediaIngestManifestV1Schema,
]);

export type RenderAssetRef = z.infer<typeof renderAssetRefSchema>;
export type QCutTimelineManifestV1 = z.infer<
	typeof qcutTimelineManifestV1Schema
>;
export type ClipperVerticalManifestV1 = z.infer<
	typeof clipperVerticalManifestV1Schema
>;
export type MediaIngestManifestV1 = z.infer<
	typeof mediaIngestManifestV1Schema
>;
export type RenderManifestV1 = z.infer<typeof renderManifestV1Schema>;
export type ClientRenderManifestV1 =
	| QCutTimelineManifestV1
	| ClipperVerticalManifestV1;

export type RenderManifestErrorCode =
	| "invalid_manifest"
	| "unsupported_manifest_version"
	| "unsupported_feature"
	| "unsafe_manifest";

export type RenderManifestValidationResult =
	| {
			ok: true;
			manifest: RenderManifestV1;
			assets: RenderAssetRef[];
	  }
	| {
			ok: false;
			status: number;
			error: RenderManifestErrorCode;
			message: string;
	  };

export interface ManifestValidationOptions {
	allowMediaIngest?: boolean;
}

const DANGEROUS_MANIFEST_KEYS = new Set([
	"args",
	"command",
	"ffmpeg",
	"ffmpegargs",
	"ffmpeg_args",
	"file",
	"filepath",
	"file_path",
	"filter",
	"filtercomplex",
	"filtergraph",
	"filter_graph",
	"inputurl",
	"input_url",
	"shell",
	"url",
]);

const UNSUPPORTED_FEATURE_KEYS = new Set([
	"blendmode",
	"chromakey",
	"effectids",
	"keyframes",
	"mask",
	"masks",
	"playbackrate",
	"speed",
]);

function findDangerousManifestKey(value: unknown): string | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findDangerousManifestKey(item);
			if (found) return found;
		}
		return null;
	}
	if (!value || typeof value !== "object") return null;

	for (const [key, child] of Object.entries(value)) {
		const normalized = key.toLowerCase();
		if (
			DANGEROUS_MANIFEST_KEYS.has(normalized) ||
			normalized.includes("filtergraph") ||
			normalized.includes("ffmpeg")
		) {
			return key;
		}
		const found = findDangerousManifestKey(child);
		if (found) return found;
	}
	return null;
}

function findUnsupportedFeature(value: unknown, parentKey = ""): string | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findUnsupportedFeature(item, parentKey);
			if (found) return found;
		}
		return null;
	}
	if (!value || typeof value !== "object") return null;

	const record = value as Record<string, unknown>;
	if (
		parentKey === "" &&
		typeof record.kind === "string" &&
		!["qcut_timeline", "clipper_vertical", "media_ingest"].includes(record.kind)
	) {
		return record.kind;
	}
	if (
		parentKey === "tracks" &&
		typeof record.type === "string" &&
		!["video", "audio", "image", "sticker", "text", "captions"].includes(
			record.type
		)
	) {
		return record.type;
	}
	if (
		parentKey === "clips" &&
		typeof record.type === "string" &&
		!["video", "audio", "image", "sticker", "text", "captions"].includes(
			record.type
		)
	) {
		return record.type;
	}
	for (const feature of CLOUD_INELIGIBLE_FEATURES) {
		if (
			record.type === feature ||
			record.kind === feature ||
			Object.prototype.hasOwnProperty.call(record, feature)
		) {
			return feature;
		}
	}
	for (const key of Object.keys(record)) {
		if (UNSUPPORTED_FEATURE_KEYS.has(key.toLowerCase())) return key;
	}

	if (
		parentKey === "effects" &&
		typeof record.type === "string" &&
		!(CLOUD_RENDER_EFFECTS as readonly string[]).includes(record.type)
	) {
		return record.type;
	}
	if (
		parentKey === "transitions" &&
		typeof record.type === "string" &&
		!(CLOUD_RENDER_TRANSITIONS as readonly string[]).includes(record.type)
	) {
		return record.type;
	}

	for (const [key, child] of Object.entries(record)) {
		const found = findUnsupportedFeature(child, key);
		if (found) return found;
	}
	return null;
}

export function collectManifestAssets(manifest: RenderManifestV1): RenderAssetRef[] {
	if (manifest.kind === "clipper_vertical") {
		return manifest.logo
			? [manifest.source, manifest.logo.source]
			: [manifest.source];
	}
	if (manifest.kind === "media_ingest") {
		// The destination does not exist yet and is generated by a trusted API.
		return [];
	}

	const assets: RenderAssetRef[] = [];
	for (const track of manifest.tracks) {
		if (
			track.type === "video" ||
			track.type === "audio" ||
			track.type === "image" ||
			track.type === "sticker"
		) {
			for (const clip of track.clips) assets.push(clip.source);
		}
	}
	return assets;
}

function validateWordCuts(
	wordCuts: z.infer<typeof wordCutsSchema> | undefined,
	sourceDurationSeconds: number,
	outputDurationSeconds: number
): string | null {
	if (!wordCuts) return null;

	let previousEnd = -1;
	let keptDuration = 0;
	for (const range of wordCuts.ranges) {
		if (range.startSeconds < previousEnd) {
			return "Word-cut keep ranges must be sorted and non-overlapping.";
		}
		if (range.endSeconds > sourceDurationSeconds) {
			return "Word-cut keep ranges must stay within the source clip.";
		}
		keptDuration += range.endSeconds - range.startSeconds;
		previousEnd = range.endSeconds;
	}

	if (Math.abs(keptDuration - outputDurationSeconds) > 0.01) {
		return "Word-cut keep ranges must add up to the clip duration.";
	}
	return null;
}

function validateQCutTimeline(manifest: QCutTimelineManifestV1): string | null {
	const trackIds = new Set<string>();
	const clipTypes = new Map<string, string>();
	const clipDurations = new Map<string, number>();
	let textEntryCount = 0;

	for (const track of manifest.tracks) {
		if (trackIds.has(track.id)) return `Duplicate track id: ${track.id}.`;
		trackIds.add(track.id);

		for (const clip of track.clips) {
			if (clipTypes.has(clip.id)) return `Duplicate clip id: ${clip.id}.`;
			clipTypes.set(clip.id, clip.type);
			clipDurations.set(clip.id, clip.durationSeconds);

			if (clip.startSeconds + clip.durationSeconds > manifest.output.durationSeconds + 0.01) {
				return `Clip ${clip.id} extends beyond the output duration.`;
			}

			if (clip.type === "text") textEntryCount += 1;
			if (clip.type === "captions") {
				textEntryCount += clip.segments.length;
				const segmentIds = new Set<string>();
				for (const segment of clip.segments) {
					if (segmentIds.has(segment.id)) {
						return `Duplicate caption segment id: ${segment.id}.`;
					}
					segmentIds.add(segment.id);
					if (segment.endSeconds > clip.durationSeconds + 0.01) {
						return `Caption segment ${segment.id} extends beyond its caption clip.`;
					}
				}
			}

			if (clip.type === "video" || clip.type === "audio") {
				if (
					clip.sourceStartSeconds + clip.sourceDurationSeconds >
					MAX_RENDER_DURATION_SECONDS
				) {
					return `Source range for clip ${clip.id} exceeds the duration limit.`;
				}
				if (clip.audio.fadeInSeconds + clip.audio.fadeOutSeconds > clip.durationSeconds) {
					return `Audio fades for clip ${clip.id} exceed its duration.`;
				}
				const wordCutError = validateWordCuts(
					clip.wordCuts,
					clip.sourceDurationSeconds,
					clip.durationSeconds
				);
				if (wordCutError) return wordCutError;
				if (
					!clip.wordCuts &&
					Math.abs(clip.sourceDurationSeconds - clip.durationSeconds) > 0.01
				) {
					return `Clip ${clip.id} changes playback speed, which is not supported.`;
				}
			}

			if ("effects" in clip && clip.effects) {
				const effectTypes = new Set<string>();
				for (const effect of clip.effects) {
					if (effectTypes.has(effect.type)) {
						return `Clip ${clip.id} repeats effect ${effect.type}.`;
					}
					if (effect.durationSeconds > clip.durationSeconds) {
						return `Effect ${effect.type} exceeds clip ${clip.id}'s duration.`;
					}
					effectTypes.add(effect.type);
				}
			}
		}
	}

	if (textEntryCount > MAX_RENDER_TEXT_ENTRIES) {
		return `Text and caption entries cannot exceed ${MAX_RENDER_TEXT_ENTRIES}.`;
	}

	const transitionIds = new Set<string>();
	for (const transition of manifest.transitions) {
		if (transitionIds.has(transition.id)) {
			return `Duplicate transition id: ${transition.id}.`;
		}
		transitionIds.add(transition.id);
		const fromType = clipTypes.get(transition.fromClipId);
		const toType = clipTypes.get(transition.toClipId);
		if (!fromType || !toType || transition.fromClipId === transition.toClipId) {
			return `Transition ${transition.id} must reference two different clips.`;
		}
		if (
			transition.type === "crossfade" &&
			(!["video", "image"].includes(fromType) ||
				!["video", "image"].includes(toType))
		) {
			return `Transition ${transition.id} requires visual clips.`;
		}
		if (
			transition.type === "audio_crossfade" &&
			(fromType !== "audio" || toType !== "audio")
		) {
			return `Transition ${transition.id} requires audio clips.`;
		}
		const fromDuration = clipDurations.get(transition.fromClipId);
		const toDuration = clipDurations.get(transition.toClipId);
		if (
			fromDuration === undefined ||
			toDuration === undefined ||
			transition.durationSeconds > fromDuration ||
			transition.durationSeconds > toDuration
		) {
			return `Transition ${transition.id} exceeds one of its clips.`;
		}
	}

	return null;
}

function validateManifestSemantics(manifest: RenderManifestV1): string | null {
	if (manifest.kind === "qcut_timeline") return validateQCutTimeline(manifest);
	if (manifest.kind === "clipper_vertical") {
		if (manifest.trim.durationSeconds !== manifest.output.durationSeconds) {
			return "Clipper trim duration must match output duration.";
		}
		if (
			manifest.trim.startSeconds + manifest.trim.durationSeconds >
			MAX_RENDER_DURATION_SECONDS
		) {
			return "Clipper source trim exceeds the duration limit.";
		}
	}
	return null;
}

export function validateRenderManifest(
	input: unknown,
	options: ManifestValidationOptions = {}
): RenderManifestValidationResult {
	if (
		input &&
		typeof input === "object" &&
		"manifestVersion" in input &&
		(input as { manifestVersion?: unknown }).manifestVersion !==
			RENDER_MANIFEST_VERSION
	) {
		return {
			ok: false,
			status: 400,
			error: "unsupported_manifest_version",
			message: `Only render manifest version ${RENDER_MANIFEST_VERSION} is supported.`,
		};
	}

	const dangerousKey = findDangerousManifestKey(input);
	if (dangerousKey) {
		return {
			ok: false,
			status: 400,
			error: "unsafe_manifest",
			message: `Render manifests cannot contain client-controlled command, path, or URL field ${dangerousKey}.`,
		};
	}

	const unsupportedFeature = findUnsupportedFeature(input);
	if (unsupportedFeature) {
		return {
			ok: false,
			status: 400,
			error: "unsupported_feature",
			message: `${unsupportedFeature} is not eligible for cloud rendering.`,
		};
	}

	const parsed = renderManifestV1Schema.safeParse(input);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const location = issue?.path.length ? `${issue.path.join(".")}: ` : "";
		return {
			ok: false,
			status: 400,
			error: "invalid_manifest",
			message: `${location}${issue?.message ?? "Invalid render manifest."}`,
		};
	}

	if (parsed.data.kind === "media_ingest" && !options.allowMediaIngest) {
		return {
			ok: false,
			status: 400,
			error: "unsupported_feature",
			message: "media_ingest manifests are server-only and cannot be client-enqueued.",
		};
	}

	const semanticError = validateManifestSemantics(parsed.data);
	if (semanticError) {
		return {
			ok: false,
			status: 400,
			error: "invalid_manifest",
			message: semanticError,
		};
	}

	const assets = collectManifestAssets(parsed.data);
	if (assets.length > MAX_RENDER_ASSETS) {
		return {
			ok: false,
			status: 400,
			error: "invalid_manifest",
			message: `Render manifests cannot reference more than ${MAX_RENDER_ASSETS} assets.`,
		};
	}

	return { ok: true, manifest: parsed.data, assets };
}

interface StorageInfoResult {
	data: { size?: number | string | null } | null;
	error: {
		message?: string;
		status?: number | string;
		statusCode?: number | string;
	} | null;
}

export interface ManifestStorageClient {
	storage: {
		from(bucket: string): {
			info(path: string): Promise<StorageInfoResult>;
		};
	};
}

export type ManifestAssetVerificationResult =
	| { ok: true; assets: Array<RenderAssetRef & { size: number }> }
	| {
			ok: false;
			status: number;
			error:
				| "asset_not_owned"
				| "asset_not_found"
				| "asset_too_large"
				| "asset_lookup_failed";
			message: string;
	  };

function storageErrorIsNotFound(error: StorageInfoResult["error"]): boolean {
	const status = Number(error?.status ?? error?.statusCode);
	return status === 400 || status === 404 || /not found/i.test(error?.message ?? "");
}

export async function verifyManifestAssets(
	client: ManifestStorageClient,
	assets: RenderAssetRef[],
	userId: string
): Promise<ManifestAssetVerificationResult> {
	const uniqueAssets = new Map<string, RenderAssetRef>();
	for (const asset of assets) {
		if (asset.path.split("/")[0] !== userId) {
			return {
				ok: false,
				status: 403,
				error: "asset_not_owned",
				message: "Every render asset must be stored in the authenticated user's folder.",
			};
		}
		uniqueAssets.set(`${asset.bucket}/${asset.path}`, asset);
	}

	const verified: Array<RenderAssetRef & { size: number }> = [];
	for (const asset of uniqueAssets.values()) {
		let result: StorageInfoResult;
		try {
			result = await client.storage.from(asset.bucket).info(asset.path);
		} catch {
			return {
				ok: false,
				status: 502,
				error: "asset_lookup_failed",
				message: "Unable to verify a render asset.",
			};
		}

		if (result.error || !result.data) {
			return storageErrorIsNotFound(result.error)
				? {
						ok: false,
						status: 404,
						error: "asset_not_found",
						message: `Render asset was not found: ${asset.path}.`,
					}
				: {
						ok: false,
						status: 502,
						error: "asset_lookup_failed",
						message: "Unable to verify a render asset.",
					};
		}

		const size = Number(result.data.size);
		if (!Number.isFinite(size) || size < 0) {
			return {
				ok: false,
				status: 502,
				error: "asset_lookup_failed",
				message: "Render asset metadata did not include a valid size.",
			};
		}
		if (size > MAX_RENDER_ASSET_BYTES) {
			return {
				ok: false,
				status: 413,
				error: "asset_too_large",
				message: "Render assets cannot exceed 2 GB.",
			};
		}
		verified.push({ ...asset, size });
	}

	return { ok: true, assets: verified };
}

export function isCloudRenderEligible(input: unknown): input is ClientRenderManifestV1 {
	const validation = validateRenderManifest(input);
	return validation.ok && validation.manifest.kind !== "media_ingest";
}
