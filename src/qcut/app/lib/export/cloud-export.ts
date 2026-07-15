import {
	MAX_RENDER_DURATION_SECONDS,
	RENDER_MANIFEST_VERSION,
	type QCutTimelineManifestV1,
	validateRenderManifest,
} from "@/app/api/render/_lib/manifest";
import { uploadProjectAsset } from "@/lib/storage/resumable-upload";
import { resolveSubtitleStyle } from "@qcut-app/lib/captions/subtitle-style";
import type { TimelineElement, TimelineTrack } from "@qcut-app/types/timeline";
import type { ExportSettingsWithAudio } from "@qcut-app/types/export";
import type { MediaItem } from "@qcut-app/stores/media/media-store-types";
import type { EffectInstance } from "@qcut-app/types/effects";

export const CLOUD_EXPORT_SHORT_DURATION_SECONDS = 30;
export const CLOUD_RENDER_POLL_INTERVAL_MS = 2_500;
export const CLOUD_RENDER_MAX_POLL_INTERVAL_MS = 10_000;

export type CloudRenderJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface CloudRenderJob {
	id: string;
	idempotencyHash: string;
	userId: string;
	projectId: string;
	status: CloudRenderJobStatus;
	kind: string;
	manifestSchemaVersion: number;
	batchId: string | null;
	batchIndex: number | null;
	batchTotal: number | null;
	progress: number;
	stage: string | null;
	progressMessage: string | null;
	attempts: number;
	maxAttempts: number;
	retryAt: string | null;
	generation: number;
	startedAt: string | null;
	completedAt: string | null;
	cancelRequested: boolean;
	storagePath: string | null;
	outputStoragePath: string | null;
	outputBytes: number | null;
	outputDurationSeconds: number | null;
	outputWidth: number | null;
	outputHeight: number | null;
	outputSha256: string | null;
	signedUrl: string | null;
	error: string | null;
	errorCode: string | null;
	errorMessage: string | null;
	request: Record<string, unknown>;
	result: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface CloudWordCuts {
	sourceDurationSeconds: number;
	ranges: Array<{ startSeconds: number; endSeconds: number }>;
}

export interface CloudTimelineSerializationInput {
	projectId: string;
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	settings: ExportSettingsWithAudio;
	totalDuration: number;
	fps?: number;
	backgroundColor?: string;
	effectsByElementId?: ReadonlyMap<string, EffectInstance[]>;
	wordCutsByElementId?: ReadonlyMap<string, CloudWordCuts>;
}

export type CloudIneligibilityCode =
	| "invalid_project"
	| "unsupported_format"
	| "unsupported_feature"
	| "missing_asset"
	| "invalid_timeline"
	| "invalid_manifest";

export interface CloudIneligibilityReason {
	code: CloudIneligibilityCode;
	message: string;
	elementId?: string;
	feature?: string;
}

export type CloudParityEligibility =
	| {
			eligible: true;
			requiresUploads: MediaItem[];
			manifest?: QCutTimelineManifestV1;
	  }
	| {
			eligible: false;
			reasons: CloudIneligibilityReason[];
	  };

export class CloudExportError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly status?: number,
		public readonly clientFallbackRecommended = false
	) {
		super(message);
		this.name = "CloudExportError";
	}
}

type ManifestTrack = QCutTimelineManifestV1["tracks"][number];
type ManifestClip = ManifestTrack["clips"][number];
type ManifestEffects = Extract<ManifestClip, { type: "video" }>["effects"];

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TERMINAL_STATUSES = new Set<CloudRenderJobStatus>([
	"succeeded",
	"failed",
	"cancelled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeIdentifier(value: string, fallback: string): string {
	if (IDENTIFIER_PATTERN.test(value)) return value;
	const normalized = value
		.replace(/[^A-Za-z0-9_-]+/g, "-")
		.replace(/^-+/, "")
		.slice(0, 128);
	return IDENTIFIER_PATTERN.test(normalized) ? normalized : fallback;
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
	if (!value || value === "transparent") return value === "transparent" ? "#00000000" : fallback;
	if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) return value.toLowerCase();
	const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i);
	if (short) {
		return `#${short
			.slice(1)
			.filter(Boolean)
			.map((part) => `${part}${part}`)
			.join("")}`.toLowerCase();
	}
	return fallback;
}

function outputDuration(element: TimelineElement): number {
	return element.duration - element.trimStart - element.trimEnd;
}

function storageRef(item: MediaItem): { bucket: "project-assets"; path: string } | null {
	const metadata = item.metadata ?? {};
	const bucket = metadata.storageBucket ?? metadata.storage_bucket;
	const path = metadata.storagePath ?? metadata.storage_path;
	return bucket === "project-assets" && typeof path === "string" && path.trim()
		? { bucket: "project-assets", path: path.trim() }
		: null;
}

function referencedMediaItem(
	element: TimelineElement,
	mediaById: ReadonlyMap<string, MediaItem>
): MediaItem | null {
	if (element.type === "media" || element.type === "sticker") {
		return mediaById.get(element.mediaId) ?? null;
	}
	return null;
}

function visibleElements(tracks: TimelineTrack[]): TimelineElement[] {
	return tracks.flatMap((track) => track.elements.filter((element) => !element.hidden));
}

function mapEffects(
	element: TimelineElement,
	effectsByElementId: CloudTimelineSerializationInput["effectsByElementId"]
): ManifestEffects | undefined {
	const effects = (effectsByElementId?.get(element.id) ?? []).filter(
		(effect) => effect.enabled
	);
	if (effects.length === 0) return undefined;

	const mapped = effects.map((effect) => {
		if (effect.animations?.length) {
			throw new CloudExportError(
				"unsupported_feature",
				`Animated effect ${effect.name} is not eligible for cloud rendering.`,
				400,
				true
			);
		}
		if (effect.effectType !== "fade-in" && effect.effectType !== "fade-out") {
			throw new CloudExportError(
				"unsupported_feature",
				`${effect.name || effect.effectType} is not eligible for cloud rendering.`,
				400,
				true
			);
		}
		if (!(effect.duration > 0) || effect.duration > outputDuration(element)) {
			throw new CloudExportError(
				"invalid_manifest",
				`Effect ${effect.name} must have a positive duration within its clip.`,
				400,
				true
			);
		}
		return {
			type: effect.effectType === "fade-in" ? ("fade_in" as const) : ("fade_out" as const),
			durationSeconds: effect.duration,
		};
	});

	if (new Set(mapped.map((effect) => effect.type)).size !== mapped.length) {
		throw new CloudExportError(
			"invalid_manifest",
			`Clip ${element.id} repeats a cloud render effect.`,
			400,
			true
		);
	}
	return mapped;
}

function visualTransform(
	element: TimelineElement,
	mediaItem?: MediaItem
): Extract<ManifestClip, { type: "video" }>["transform"] {
	const opacity =
		element.type === "text"
			? element.opacity
			: element.type === "sticker"
				? element.opacity ?? 1
				: finite((element as TimelineElement & { opacity?: number }).opacity, 1);
	const widthScale =
		mediaItem?.width && element.width ? element.width / mediaItem.width : 1;
	const heightScale =
		mediaItem?.height && element.height ? element.height / mediaItem.height : 1;
	return {
		position: {
			x: finite(element.x, 0),
			y: finite(element.y, 0),
		},
		scale: {
			x: widthScale > 0 ? widthScale : 1,
			y: heightScale > 0 ? heightScale : 1,
		},
		rotation: finite(element.rotation, 0),
		opacity: Math.max(0, Math.min(1, finite(opacity, 1))),
	};
}

function audioSettings(
	element: TimelineElement,
	trackMuted: boolean
): Extract<ManifestClip, { type: "audio" }>["audio"] {
	const volume = element.type === "media" ? finite(element.volume, 1) : 1;
	return {
		volume: Math.max(0, Math.min(4, volume)),
		muted: trackMuted || volume === 0,
		fadeInSeconds: 0,
		fadeOutSeconds: 0,
	};
}

function mediaClip(
	element: Extract<TimelineElement, { type: "media" }>,
	item: MediaItem,
	trackMuted: boolean,
	input: CloudTimelineSerializationInput
): ManifestClip {
	const source = storageRef(item);
	if (!source) {
		throw new CloudExportError(
			"missing_asset",
			`${item.name || element.mediaId} must be uploaded before cloud rendering.`,
			400,
			true
		);
	}
	const durationSeconds = outputDuration(element);
	const effects = mapEffects(element, input.effectsByElementId);
	const cuts = input.wordCutsByElementId?.get(element.id);
	const base = {
		id: normalizeIdentifier(element.id, "media-clip"),
		source,
		startSeconds: element.startTime,
		durationSeconds,
		sourceStartSeconds: element.trimStart,
		sourceDurationSeconds: cuts?.sourceDurationSeconds ?? durationSeconds,
		audio: audioSettings(element, trackMuted),
		...(cuts
			? {
					wordCuts: {
						mode: "keep" as const,
						ranges: cuts.ranges,
					},
				}
			: {}),
		...(effects ? { effects } : {}),
	};
	if (item.type === "audio") return { ...base, type: "audio" };
	if (item.type === "video") {
		return { ...base, type: "video", transform: visualTransform(element, item) };
	}
	return {
		id: base.id,
		type: "image",
		source,
		startSeconds: base.startSeconds,
		durationSeconds,
		transform: visualTransform(element, item),
		...(effects ? { effects } : {}),
	};
}

function textClip(
	element: Extract<TimelineElement, { type: "text" }>,
	input: CloudTimelineSerializationInput
): Extract<ManifestClip, { type: "text" }> {
	const effects = mapEffects(element, input.effectsByElementId);
	return {
		id: normalizeIdentifier(element.id, "text-clip"),
		type: "text",
		content: element.content,
		startSeconds: element.startTime,
		durationSeconds: outputDuration(element),
		transform: visualTransform(element),
		style: {
			fontFamily: element.fontFamily || "Arial",
			fontSize: element.fontSize,
			fontWeight: element.fontWeight,
			fontStyle: element.fontStyle,
			textDecoration: element.textDecoration,
			textAlign: element.textAlign,
			color: normalizeHexColor(element.color, "#ffffff"),
			backgroundColor: normalizeHexColor(element.backgroundColor, "#00000000"),
		},
		...(effects ? { effects } : {}),
	};
}

function captionClip(
	element: Extract<TimelineElement, { type: "captions" }>
): Extract<ManifestClip, { type: "captions" }> {
	const style = resolveSubtitleStyle(element.style);
	if (style.karaokeMode && style.karaokeMode !== "none") {
		throw new CloudExportError(
			"unsupported_feature",
			`Caption karaoke mode ${style.karaokeMode} is not eligible for cloud rendering.`,
			400,
			true
		);
	}
	const durationSeconds = outputDuration(element);
	return {
		id: normalizeIdentifier(element.id, "caption-clip"),
		type: "captions",
		startSeconds: element.startTime,
		durationSeconds,
		language: element.language || "und",
		source: element.source,
		segments: [
			{
				id: normalizeIdentifier(`${element.id}-segment`, "caption-segment"),
				text: element.text,
				startSeconds: 0,
				endSeconds: durationSeconds,
			},
		],
		style: {
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			fontColor: normalizeHexColor(style.fontColor, "#ffffff"),
			fontOpacity: style.fontOpacity,
			bold: style.bold,
			italic: style.italic,
			underline: style.underline,
			outlineColor: normalizeHexColor(style.outlineColor, "#000000"),
			outlineWidth: style.outlineWidth,
			shadowColor: normalizeHexColor(style.shadowColor, "#000000"),
			shadowOffset: style.shadowOffset,
			backgroundColor: normalizeHexColor(style.backgroundColor, "#000000"),
			backgroundOpacity: style.bgOpacity,
			position: style.position,
			lineSpacing: style.lineSpacing,
		},
	};
}

function stickerClip(
	element: Extract<TimelineElement, { type: "sticker" }>,
	item: MediaItem
): Extract<ManifestClip, { type: "sticker" }> {
	const source = storageRef(item);
	if (!source) {
		throw new CloudExportError(
			"missing_asset",
			`${item.name || element.mediaId} must be uploaded before cloud rendering.`,
			400,
			true
		);
	}
	return {
		id: normalizeIdentifier(element.id, "sticker-clip"),
		type: "sticker",
		source,
		startSeconds: element.startTime,
		durationSeconds: outputDuration(element),
		transform: visualTransform(element, item),
	};
}

function trackFromClips(
	track: TimelineTrack,
	type: ManifestTrack["type"],
	clips: ManifestClip[],
	mixed: boolean
): ManifestTrack {
	const id = normalizeIdentifier(
		mixed ? `${track.id}-${type}` : track.id,
		`${type}-track`
	);
	if (type === "video" || type === "audio") {
		return { id, type, muted: track.muted ?? false, clips } as ManifestTrack;
	}
	return { id, type, clips } as ManifestTrack;
}

function buildTracks(input: CloudTimelineSerializationInput): ManifestTrack[] {
	const mediaById = new Map(input.mediaItems.map((item) => [item.id, item]));
	const output: ManifestTrack[] = [];

	for (const track of input.tracks) {
		const clipsByType = new Map<ManifestTrack["type"], ManifestClip[]>();
		for (const element of track.elements) {
			if (element.hidden) continue;
			if (!(outputDuration(element) > 0)) {
				throw new CloudExportError(
					"invalid_timeline",
					`Clip ${element.id} must have a positive trimmed duration.`,
					400,
					true
				);
			}
			if (element.effectIds?.length && !input.effectsByElementId?.has(element.id)) {
				throw new CloudExportError(
					"unsupported_feature",
					`Clip ${element.id} references effects that cannot be resolved for cloud rendering.`,
					400,
					true
				);
			}

			let clip: ManifestClip;
			if (element.type === "media") {
				const item = mediaById.get(element.mediaId);
				if (!item) {
					throw new CloudExportError(
						"missing_asset",
						`Media item ${element.mediaId} was not found.`,
						400,
						true
					);
				}
				clip = mediaClip(element, item, track.muted ?? false, input);
			} else if (element.type === "text") {
				clip = textClip(element, input);
			} else if (element.type === "captions") {
				if (input.effectsByElementId?.get(element.id)?.some((effect) => effect.enabled)) {
					throw new CloudExportError(
						"unsupported_feature",
						"Caption effects are not eligible for cloud rendering.",
						400,
						true
					);
				}
				clip = captionClip(element);
			} else if (element.type === "sticker") {
				if (input.effectsByElementId?.get(element.id)?.some((effect) => effect.enabled)) {
					throw new CloudExportError(
						"unsupported_feature",
						"Sticker effects are not eligible for cloud rendering.",
						400,
						true
					);
				}
				const item = mediaById.get(element.mediaId);
				if (!item) {
					throw new CloudExportError(
						"missing_asset",
						`Sticker media item ${element.mediaId} was not found.`,
						400,
						true
					);
				}
				clip = stickerClip(element, item);
			} else {
				throw new CloudExportError(
					"unsupported_feature",
					`${element.type} tracks remain in-browser and are not eligible for cloud rendering.`,
					400,
					true
				);
			}
			const clips = clipsByType.get(clip.type) ?? [];
			clips.push(clip);
			clipsByType.set(clip.type, clips);
		}

		const mixed = clipsByType.size > 1;
		for (const [type, clips] of clipsByType) {
			output.push(trackFromClips(track, type, clips, mixed));
		}
	}
	return output;
}

export function buildRenderManifest(
	input: CloudTimelineSerializationInput
): QCutTimelineManifestV1 {
	if (!UUID_PATTERN.test(input.projectId)) {
		throw new CloudExportError(
			"invalid_project",
			"Cloud rendering requires the WZRD project UUID.",
			400,
			true
		);
	}
	if (input.settings.format !== "mp4") {
		throw new CloudExportError(
			"unsupported_format",
			"Cloud rendering currently exports MP4 (H.264/AAC).",
			400,
			true
		);
	}
	const manifest: QCutTimelineManifestV1 = {
		manifestVersion: RENDER_MANIFEST_VERSION,
		kind: "qcut_timeline",
		projectId: input.projectId,
		output: {
			format: "mp4",
			videoCodec: "h264",
			audioCodec: "aac",
			width: input.settings.width,
			height: input.settings.height,
			fps: input.fps ?? 30,
			durationSeconds: input.totalDuration,
			backgroundColor: normalizeHexColor(input.backgroundColor, "#000000"),
		},
		tracks: buildTracks(input),
		transitions: [],
	};
	const validation = validateRenderManifest(manifest);
	if (validation.ok === false) {
		throw new CloudExportError(
			validation.error,
			validation.message,
			validation.status,
			true
		);
	}
	if (validation.manifest.kind !== "qcut_timeline") {
		throw new CloudExportError("invalid_manifest", "Expected a QCut timeline manifest.");
	}
	return validation.manifest;
}

export function analyzeCloudRenderEligibility(
	input: CloudTimelineSerializationInput
): CloudParityEligibility {
	const reasons: CloudIneligibilityReason[] = [];
	if (!UUID_PATTERN.test(input.projectId)) {
		reasons.push({
			code: "invalid_project",
			message: "Cloud rendering requires the WZRD project UUID.",
		});
	}
	if (input.settings.format !== "mp4") {
		reasons.push({
			code: "unsupported_format",
			message: "Cloud rendering currently exports MP4 (H.264/AAC).",
		});
	}
	if (!(input.totalDuration > 0) || input.totalDuration > MAX_RENDER_DURATION_SECONDS) {
		reasons.push({
			code: "invalid_timeline",
			message: "Cloud timelines must be between 0 and 30 minutes.",
		});
	}

	const mediaById = new Map(input.mediaItems.map((item) => [item.id, item]));
	const uploads = new Map<string, MediaItem>();
	for (const element of visibleElements(input.tracks)) {
		if (element.type === "remotion" || element.type === "markdown") {
			reasons.push({
				code: "unsupported_feature",
				message: `${element.type} tracks remain in-browser.`,
				elementId: element.id,
				feature: element.type,
			});
			continue;
		}
		const item = referencedMediaItem(element, mediaById);
		if ((element.type === "media" || element.type === "sticker") && !item) {
			reasons.push({
				code: "missing_asset",
				message: `Media item for clip ${element.id} was not found.`,
				elementId: element.id,
			});
		} else if (item && !storageRef(item)) {
			if (item.file?.size > 0) uploads.set(item.id, item);
			else {
				reasons.push({
					code: "missing_asset",
					message: `${item.name || item.id} is not stored in project-assets.`,
					elementId: element.id,
				});
			}
		}
		const effects = (input.effectsByElementId?.get(element.id) ?? []).filter(
			(effect) => effect.enabled
		);
		for (const effect of effects) {
			if (
				effect.animations?.length ||
				(effect.effectType !== "fade-in" && effect.effectType !== "fade-out") ||
				!(effect.duration > 0)
			) {
				reasons.push({
					code: "unsupported_feature",
					message: `${effect.name || effect.effectType} is not eligible for cloud rendering.`,
					elementId: element.id,
					feature: effect.effectType,
				});
			}
		}
		if (
			element.type === "captions" &&
			element.style?.karaokeMode &&
			element.style.karaokeMode !== "none"
		) {
			reasons.push({
				code: "unsupported_feature",
				message: `Caption karaoke mode ${element.style.karaokeMode} remains in-browser.`,
				elementId: element.id,
				feature: "caption_karaoke",
			});
		}
	}

	if (visibleElements(input.tracks).length === 0) {
		reasons.push({ code: "invalid_timeline", message: "The timeline has no visible clips." });
	}
	if (reasons.length > 0) return { eligible: false, reasons };
	if (uploads.size > 0) return { eligible: true, requiresUploads: [...uploads.values()] };
	try {
		return {
			eligible: true,
			requiresUploads: [],
			manifest: buildRenderManifest(input),
		};
	} catch (error) {
		return {
			eligible: false,
			reasons: [
				{
					code:
						error instanceof CloudExportError &&
						["invalid_project", "unsupported_format", "unsupported_feature", "missing_asset", "invalid_timeline"].includes(error.code)
							? (error.code as CloudIneligibilityCode)
							: "invalid_manifest",
					message: error instanceof Error ? error.message : "Invalid cloud render manifest.",
				},
			],
		};
	}
}

function safeObjectName(name: string): string {
	const extension = name.includes(".") ? `.${name.split(".").pop()}` : "";
	const stem = name
		.replace(/\.[^.]+$/, "")
		.replace(/[^A-Za-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return `${stem || "asset"}${extension.replace(/[^A-Za-z0-9.]/g, "")}`;
}

export async function prepareCloudMediaAssets(
	input: CloudTimelineSerializationInput,
	options: {
		userId: string;
		accessToken: string;
		signal?: AbortSignal;
		onProgress?: (progress: number, message: string) => void;
	}
): Promise<void> {
	const eligibility = analyzeCloudRenderEligibility(input);
	if (eligibility.eligible === false) {
		throw new CloudExportError(
			eligibility.reasons[0]?.code ?? "unsupported_feature",
			eligibility.reasons[0]?.message ?? "Timeline is not eligible for cloud rendering.",
			400,
			true
		);
	}
	for (let index = 0; index < eligibility.requiresUploads.length; index += 1) {
		const item = eligibility.requiresUploads[index];
		const path = `${options.userId}/projects/${input.projectId}/${crypto.randomUUID()}-${safeObjectName(item.name || item.file.name)}`;
		await uploadProjectAsset(item.file, {
			path,
			accessToken: options.accessToken,
			signal: options.signal,
			onProgress: ({ percentage }) => {
				const overall = ((index + percentage / 100) / eligibility.requiresUploads.length) * 100;
				options.onProgress?.(overall, `Uploading ${item.name || item.file.name}`);
			},
		});
		item.metadata = {
			...(item.metadata ?? {}),
			storageBucket: "project-assets",
			storagePath: path,
		};
	}
}

async function getCloudSession(): Promise<{
	accessToken: string;
	userId: string;
}> {
	const { supabase } = await import("@/integrations/supabase/client");
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session?.access_token || !session.user?.id) {
		throw new CloudExportError(
			"authentication_required",
			"Cloud rendering requires an authenticated Supabase session.",
			401,
			true
		);
	}
	return { accessToken: session.access_token, userId: session.user.id };
}

async function parseApiResponse<T>(response: Response): Promise<T> {
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const error = isRecord(body) && typeof body.error === "string" ? body.error : "render_request_failed";
		const message =
			isRecord(body) && typeof body.message === "string"
				? body.message
				: `Render request failed with status ${response.status}.`;
		throw new CloudExportError(
			error,
			message,
			response.status,
			response.status === 503 || error === "unsupported_feature"
		);
	}
	if (!isRecord(body)) {
		throw new CloudExportError("invalid_response", "Render API returned an invalid response.");
	}
	return body as T;
}

async function authenticatedFetch(
	url: string,
	init: RequestInit,
	options: { accessToken?: string; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
	const accessToken = options.accessToken ?? (await getCloudSession()).accessToken;
	const fetchImpl = options.fetchImpl ?? fetch;
	return fetchImpl(url, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...init.headers,
		},
	});
}

export async function enqueueRenderJob(
	manifest: QCutTimelineManifestV1,
	options: { accessToken?: string; fetchImpl?: typeof fetch } = {}
): Promise<{ job: CloudRenderJob; idempotent: boolean }> {
	const response = await authenticatedFetch(
		"/api/render",
		{
			method: "POST",
			body: JSON.stringify({ projectId: manifest.projectId, manifest }),
		},
		options
	);
	return parseApiResponse(response);
}

export async function getRenderJob(
	jobId: string,
	options: { accessToken?: string; fetchImpl?: typeof fetch } = {}
): Promise<CloudRenderJob> {
	const response = await authenticatedFetch(
		`/api/render/status?jobId=${encodeURIComponent(jobId)}`,
		{ method: "GET" },
		options
	);
	const body = await parseApiResponse<{ job: CloudRenderJob }>(response);
	return body.job;
}

export interface PollRenderJobOptions {
	onProgress?: (job: CloudRenderJob) => void;
	signal?: AbortSignal;
	accessToken?: string;
	fetchImpl?: typeof fetch;
	initialDelayMs?: number;
	maxDelayMs?: number;
	sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException("Polling aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(resolve, delayMs);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason ?? new DOMException("Polling aborted", "AbortError"));
			},
			{ once: true }
		);
	});
}

export async function pollRenderJob(
	jobId: string,
	options: PollRenderJobOptions = {}
): Promise<CloudRenderJob> {
	let delayMs = options.initialDelayMs ?? CLOUD_RENDER_POLL_INTERVAL_MS;
	const maxDelayMs = options.maxDelayMs ?? CLOUD_RENDER_MAX_POLL_INTERVAL_MS;
	const sleep = options.sleep ?? abortableSleep;
	while (true) {
		await sleep(delayMs, options.signal);
		const job = await getRenderJob(jobId, options);
		options.onProgress?.(job);
		if (TERMINAL_STATUSES.has(job.status)) return job;
		delayMs = Math.min(maxDelayMs, Math.max(1, Math.round(delayMs * 1.4)));
	}
}

async function renderJobAction(
	path: "cancel" | "retry",
	jobId: string,
	options: { accessToken?: string; fetchImpl?: typeof fetch } = {}
): Promise<CloudRenderJob> {
	const response = await authenticatedFetch(
		`/api/render/${path}`,
		{ method: "POST", body: JSON.stringify({ jobId }) },
		options
	);
	const body = await parseApiResponse<{ job: CloudRenderJob }>(response);
	return body.job;
}

export function cancelRenderJob(
	jobId: string,
	options?: { accessToken?: string; fetchImpl?: typeof fetch }
): Promise<CloudRenderJob> {
	return renderJobAction("cancel", jobId, options);
}

export function retryRenderJob(
	jobId: string,
	options?: { accessToken?: string; fetchImpl?: typeof fetch }
): Promise<CloudRenderJob> {
	return renderJobAction("retry", jobId, options);
}

export async function fetchRenderResult(
	jobId: string,
	options: {
		signedUrl?: string | null;
		accessToken?: string;
		fetchImpl?: typeof fetch;
	} = {}
): Promise<{ blob: Blob; job: CloudRenderJob }> {
	const fetchImpl = options.fetchImpl ?? fetch;
	let job = await getRenderJob(jobId, options);
	if (job.status !== "succeeded") {
		throw new CloudExportError(
			"render_not_ready",
			`Render job is ${job.status}; the output is not ready to download.`
		);
	}
	let signedUrl = options.signedUrl ?? job.signedUrl;
	if (!signedUrl) {
		throw new CloudExportError(
			"render_output_unavailable",
			"The render output does not have a download URL."
		);
	}
	let response = await fetchImpl(signedUrl);
	if (response.status === 401 || response.status === 403) {
		job = await getRenderJob(jobId, options);
		signedUrl = job.signedUrl;
		if (!signedUrl) {
			throw new CloudExportError(
				"render_output_unavailable",
				"Unable to refresh the render download URL."
			);
		}
		response = await fetchImpl(signedUrl);
	}
	if (!response.ok) {
		throw new CloudExportError(
			"render_download_failed",
			`Unable to download the render output (${response.status}).`,
			response.status
		);
	}
	return { blob: await response.blob(), job };
}

export async function downloadRenderResult(
	jobId: string,
	filename: string,
	options: {
		signedUrl?: string | null;
		accessToken?: string;
		fetchImpl?: typeof fetch;
	} = {}
): Promise<CloudRenderJob> {
	const { blob, job } = await fetchRenderResult(jobId, options);
	if (typeof document === "undefined" || typeof URL === "undefined") {
		throw new CloudExportError("download_unavailable", "Browser downloads are unavailable.");
	}
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename.toLowerCase().endsWith(".mp4") ? filename : `${filename}.mp4`;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
	return job;
}

export async function getAuthenticatedCloudSession(): Promise<{
	accessToken: string;
	userId: string;
}> {
	return getCloudSession();
}
