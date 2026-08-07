import { z } from "zod3";

import { PanelView } from "@qcut-app/types/panel";
import { TIMELINE_CONSTANTS } from "@qcut-app/constants/timeline-constants";
import { generateUUID } from "@qcut-app/lib/utils";

import { useProjectStore } from "@qcut-app/stores/project-store";
import { useMediaStore } from "@qcut-app/stores/media/media-store";
import { useTimelineStore } from "@qcut-app/stores/timeline/timeline-store";
import { usePlaybackStore } from "@qcut-app/stores/editor/playback-store";
import { useExportStore } from "@qcut-app/stores/export-store";
import { useCaptionsStore } from "@qcut-app/stores/captions-store";
import { useEffectsStore } from "@qcut-app/stores/ai/effects-store";

import type { TrackType } from "@qcut-app/types/timeline";
import type { SelectedElement } from "@qcut-app/stores/timeline/types";
type CommandSource = "renderer" | "mcp";

type CommandLogEntry = {
	id: string;
	ts: number;
	source: CommandSource;
	command: string;
	args: unknown;
	ok: boolean;
	code?: string;
	error?: string;
	durationMs: number;
};

const COMMAND_LOG_MAX = 200;
const commandLog: CommandLogEntry[] = [];

function pushCommandLog(entry: CommandLogEntry) {
	commandLog.push(entry);
	while (commandLog.length > COMMAND_LOG_MAX) {
		commandLog.shift();
	}
}

// Basic rate limiting to avoid runaway agent loops.
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_CALLS = 10;
const recentCalls: number[] = [];

function checkRateLimitOrThrow() {
	const now = Date.now();
	while (recentCalls.length > 0 && recentCalls[0] < now - RATE_LIMIT_WINDOW_MS) {
		recentCalls.shift();
	}
	if (recentCalls.length >= RATE_LIMIT_MAX_CALLS) {
		throw new Error(
			`Rate limited: too many editor commands (${RATE_LIMIT_MAX_CALLS}/${RATE_LIMIT_WINDOW_MS}ms)`
		);
	}
	recentCalls.push(now);
}


type EditorCommandName =
	| "getProjectState"
	| "listMedia"
	| "importMediaByUrl"
	| "addClip"
	| "addText"
	| "splitElement"
	| "trimElement"
	| "moveElement"
	| "deleteElement"
	| "addTrack"
	| "setText"
	| "applyEffect"
	| "addCaptionsFromTranscript"
	| "setPlayhead"
	| "selectElements"
	| "undo"
	| "redo"
	| "export"
	| "getExportStatus";

type CommandResult<T = unknown> =
	| { ok: true; result: T }
	| { ok: false; error: string; code?: string };

type CommandFailure = Extract<CommandResult, { ok: false }>;

function ok<T>(result: T): CommandResult<T> {
	return { ok: true, result };
}

function err(message: string, code?: string): CommandResult {
	return { ok: false, error: message, code };
}

function isCommandFailure(result: CommandResult): result is CommandFailure {
	return "error" in result;
}

function guessMediaTypeFromUrl(rawUrl: string): "image" | "video" | "audio" {
	const url = rawUrl.toLowerCase();
	if (url.match(/\.(mp3|wav|m4a|aac|flac|ogg)(\?|#|$)/)) return "audio";
	if (url.match(/\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/)) return "video";
	if (url.match(/\.(png|jpg|jpeg|webp|gif|bmp)(\?|#|$)/)) return "image";
	return "video";
}

function getActiveQcutProjectId(): string | null {
	return useProjectStore.getState().activeProject?.id ?? null;
}

function requireActiveProjectId(): string {
	const projectId = getActiveQcutProjectId();
	if (!projectId) {
		throw new Error("Editor is not ready (no active QCut project loaded)");
	}
	return projectId;
}

async function waitFor({
	predicate,
	timeoutMs,
	intervalMs,
}: {
	predicate: () => boolean;
	timeoutMs: number;
	intervalMs?: number;
}) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (predicate()) return;
		await new Promise((r) => setTimeout(r, intervalMs ?? 50));
	}
	throw new Error(`Timed out after ${timeoutMs}ms`);
}

const importMediaByUrlSchema = z.object({
	url: z.string().url(),
	name: z.string().optional(),
	mediaType: z.enum(["image", "video", "audio"]).optional(),
	durationSeconds: z.number().finite().positive().optional(),
	thumbnailUrl: z.string().url().optional(),
});

const addClipSchema = z.object({
	mediaId: z.string().min(1),
	startTime: z.number().finite().min(0).default(0),
	trackId: z.string().optional(),
	duration: z.number().finite().positive().optional(),
});

const addTextSchema = z.object({
	content: z.string(),
	startTime: z.number().finite().min(0).default(0),
	duration: z.number().finite().positive().optional(),
	name: z.string().optional(),
	fontSize: z.number().finite().positive().optional(),
	fontFamily: z.string().optional(),
	color: z.string().optional(),
	backgroundColor: z.string().optional(),
	textAlign: z.enum(["left", "center", "right"]).optional(),
	fontWeight: z.enum(["normal", "bold"]).optional(),
	fontStyle: z.enum(["normal", "italic"]).optional(),
	textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
	x: z.number().finite().optional(),
	y: z.number().finite().optional(),
	rotation: z.number().finite().optional(),
	opacity: z.number().finite().optional(),
});


const splitElementSchema = z.object({
	trackId: z.string().min(1),
	elementId: z.string().min(1),
	splitTime: z.number().finite().min(0),
});

const trimElementSchema = z.object({
	trackId: z.string().min(1),
	elementId: z.string().min(1),
	trimStart: z.number().finite().min(0),
	trimEnd: z.number().finite().min(0),
});

const moveElementSchema = z.object({
	trackId: z.string().min(1),
	elementId: z.string().min(1),
	startTime: z.number().finite().min(0),
	toTrackId: z.string().optional(),
});

const deleteElementSchema = z.object({
	trackId: z.string().min(1),
	elementId: z.string().min(1),
});

const addTrackSchema = z.object({
	type: z.enum(["media", "text", "audio", "sticker", "captions", "remotion", "markdown"]),
});

const setTextSchema = z.object({
	trackId: z.string().min(1),
	elementId: z.string().min(1),
	content: z.string(),
	fontSize: z.number().finite().positive().optional(),
	fontFamily: z.string().optional(),
	color: z.string().optional(),
	backgroundColor: z.string().optional(),
	textAlign: z.enum(["left", "center", "right"]).optional(),
	fontWeight: z.enum(["normal", "bold"]).optional(),
	fontStyle: z.enum(["normal", "italic"]).optional(),
	textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
	x: z.number().finite().optional(),
	y: z.number().finite().optional(),
	rotation: z.number().finite().optional(),
	opacity: z.number().finite().optional(),
});

const applyEffectSchema = z.object({
	elementId: z.string().min(1),
	presetName: z.string().optional(),
});

const addCaptionsFromTranscriptSchema = z.object({
	language: z.string().min(1).default("en"),
	segments: z
		.array(
			z.object({
				start: z.number().finite().min(0),
				end: z.number().finite().min(0),
				text: z.string(),
			})
		)
		.min(1),
});

const setPlayheadSchema = z.object({
	time: z.number().finite().min(0),
});

const selectElementsSchema = z.object({
	elements: z
		.array(
			z.object({
				trackId: z.string().min(1),
				elementId: z.string().min(1),
			})
		)
		.default([]),
});

const exportSchema = z.object({
	preset: z.enum(["1080p", "720p", "480p"]).default("720p"),
	format: z.enum(["mp4", "mov", "gif"]).default("mp4"),
	filename: z.string().optional(),
});

async function executeLogged(
	command: EditorCommandName,
	args: unknown,
	meta?: { source?: CommandSource }
): Promise<CommandResult> {
	const source: CommandSource = meta?.source ?? "renderer";
	const started = Date.now();
	const logId = generateUUID();
	try {
		checkRateLimitOrThrow();
		const result = await executeInternal(command, args);
		if (isCommandFailure(result)) {
			pushCommandLog({
				id: logId,
				ts: started,
				source,
				command,
				args,
				ok: false,
				code: result.code,
				error: result.error,
				durationMs: Date.now() - started,
			});
		} else {
			pushCommandLog({
				id: logId,
				ts: started,
				source,
				command,
				args,
				ok: true,
				durationMs: Date.now() - started,
			});
		}
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		pushCommandLog({
			id: logId,
			ts: started,
			source,
			command,
			args,
			ok: false,
			error: message,
			durationMs: Date.now() - started,
		});
		return err(message);
	}
}

async function executeInternal(command: EditorCommandName, args: unknown): Promise<CommandResult> {
	try {
		switch (command) {
			case "getProjectState": {
				const project = useProjectStore.getState().activeProject;
				const timeline = useTimelineStore.getState();
				const media = useMediaStore.getState();
				const playback = usePlaybackStore.getState();

				return ok({
					project: project
						? {
							id: project.id,
							name: project.name,
							canvasSize: project.canvasSize,
							fps: project.fps,
						}
						: null,
					timeline: {
						tracks: timeline.tracks,
						selectedElements: timeline.selectedElements,
						duration: timeline.getTotalDuration(),
					},
					media: {
						count: media.mediaItems.length,
						items: media.mediaItems.map((m) => ({
							id: m.id,
							name: m.name,
							type: m.type,
							url: m.url,
							localPath: (m as any).localPath,
							duration: m.duration,
						})),
					},
					playback: {
						isPlaying: playback.isPlaying,
						currentTime: playback.currentTime,
						duration: playback.duration,
					},
				});
			}

			case "listMedia": {
				const media = useMediaStore.getState();
				return ok(
					media.mediaItems.map((m) => ({
						id: m.id,
						name: m.name,
						type: m.type,
						url: m.url,
						thumbnailUrl: m.thumbnailUrl,
						duration: m.duration,
						width: m.width,
						height: m.height,
						fps: m.fps,
					}))
				);
			}

			case "importMediaByUrl": {
				const parsed = importMediaByUrlSchema.parse(args ?? {});
				const projectId = requireActiveProjectId();
				const mediaStore = useMediaStore.getState();

				const type = parsed.mediaType ?? guessMediaTypeFromUrl(parsed.url);
				const id = generateUUID();

				// Placeholder file (size 0). Playback/export paths use the URL.
				const file = new File([], parsed.name ?? "media", {
					type: type === "audio" ? "audio/*" : type === "image" ? "image/*" : "video/*",
				});

				await mediaStore.addMediaItem(projectId, {
					id,
					name: parsed.name ?? `Imported ${type}`,
					type,
					file,
					url: parsed.url,
					thumbnailUrl: parsed.thumbnailUrl,
					duration: parsed.durationSeconds,
					metadata: {
						source: "agent-import",
						originalUrl: parsed.url,
					},
				});

				return ok({ id, type });
			}

			case "addClip": {
				const parsed = addClipSchema.parse(args ?? {});
				requireActiveProjectId();

				const mediaStore = useMediaStore.getState();
				const timelineStore = useTimelineStore.getState();

				const item = mediaStore.mediaItems.find((m) => m.id === parsed.mediaId);
				if (!item) {
					return err(`Unknown mediaId: ${parsed.mediaId}`, "media_not_found");
				}

				const trackType: TrackType = item.type === "audio" ? "audio" : "media";
				const trackId = parsed.trackId ?? timelineStore.findOrCreateTrack(trackType);

				const duration =
					parsed.duration ??
					item.duration ??
					TIMELINE_CONSTANTS.DEFAULT_IMAGE_DURATION;

				const elementId = timelineStore.addElementToTrack(
					trackId,
					{
						type: "media",
						mediaId: item.id,
						name: item.name,
						duration,
						startTime: parsed.startTime,
						trimStart: 0,
						trimEnd: 0,
					},
					{ selectElement: true }
				);

				if (!elementId) {
					return err("Failed to add clip to timeline", "timeline_add_failed");
				}

				return ok({ trackId, elementId });
			}

			case "addText": {
				const parsed = addTextSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				const trackId = timelineStore.findOrCreateTrack("text");
				const duration = parsed.duration ?? TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION;
				const elementId = timelineStore.addElementToTrack(
					trackId,
					{
						type: "text",
						name: parsed.name ?? "Title",
						content: parsed.content,
						duration,
						startTime: parsed.startTime,
						trimStart: 0,
						trimEnd: 0,
						fontSize: parsed.fontSize ?? 48,
						fontFamily: parsed.fontFamily ?? "Arial",
						color: parsed.color ?? "#ffffff",
						backgroundColor: parsed.backgroundColor ?? "transparent",
						textAlign: parsed.textAlign ?? "center",
						fontWeight: parsed.fontWeight ?? "normal",
						fontStyle: parsed.fontStyle ?? "normal",
						textDecoration: parsed.textDecoration ?? "none",
						x: parsed.x ?? 0,
						y: parsed.y ?? 0,
						rotation: parsed.rotation ?? 0,
						opacity: parsed.opacity ?? 1,
					},
					{ selectElement: true }
				);
				if (!elementId) {
					return err("Failed to add text to timeline", "timeline_add_failed");
				}
				return ok({ trackId, elementId });
			}


			case "splitElement": {
				const parsed = splitElementSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				const secondId = timelineStore.splitElement(
					parsed.trackId,
					parsed.elementId,
					parsed.splitTime
				);
				if (!secondId) {
					return err("Split failed (out of range or element not found)", "split_failed");
				}
				return ok({ secondElementId: secondId });
			}

			case "trimElement": {
				const parsed = trimElementSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				timelineStore.updateElementTrim(
					parsed.trackId,
					parsed.elementId,
					parsed.trimStart,
					parsed.trimEnd,
					true
				);
				return ok({});
			}

			case "moveElement": {
				const parsed = moveElementSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();

				if (parsed.toTrackId && parsed.toTrackId !== parsed.trackId) {
					timelineStore.moveElementToTrack(
						parsed.trackId,
						parsed.toTrackId,
						parsed.elementId
					);
					timelineStore.updateElementStartTime(
						parsed.toTrackId,
						parsed.elementId,
						parsed.startTime,
						true
					);
					return ok({ trackId: parsed.toTrackId });
				}

				timelineStore.updateElementStartTime(
					parsed.trackId,
					parsed.elementId,
					parsed.startTime,
					true
				);
				return ok({ trackId: parsed.trackId });
			}

			case "deleteElement": {
				const parsed = deleteElementSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				timelineStore.removeElementFromTrack(
					parsed.trackId,
					parsed.elementId,
					true
				);
				return ok({});
			}

			case "addTrack": {
				const parsed = addTrackSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				const trackId = timelineStore.addTrack(parsed.type as TrackType);
				return ok({ trackId });
			}

			case "setText": {
				const parsed = setTextSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				timelineStore.updateTextElement(
					parsed.trackId,
					parsed.elementId,
					{
						content: parsed.content,
						fontSize: parsed.fontSize,
						fontFamily: parsed.fontFamily,
						color: parsed.color,
						backgroundColor: parsed.backgroundColor,
						textAlign: parsed.textAlign,
						fontWeight: parsed.fontWeight,
						fontStyle: parsed.fontStyle,
						textDecoration: parsed.textDecoration,
						x: parsed.x,
						y: parsed.y,
						rotation: parsed.rotation,
						opacity: parsed.opacity,
					},
					true
				);
				return ok({});
			}

			case "applyEffect": {
				const parsed = applyEffectSchema.parse(args ?? {});
				requireActiveProjectId();
				const effectsStore = useEffectsStore.getState();
				const preset = parsed.presetName
					? effectsStore.presets.find((p) => p.name === parsed.presetName)
					: effectsStore.presets[0];

				if (!preset) {
					return err("No effect preset found", "effect_preset_not_found");
				}

				// NOTE: Effects store does not currently integrate with timeline undo history.
				effectsStore.applyEffect(parsed.elementId, preset);
				return ok({ effectName: preset.name });
			}

			case "addCaptionsFromTranscript": {
				const parsed = addCaptionsFromTranscriptSchema.parse(args ?? {});
				requireActiveProjectId();
				const timelineStore = useTimelineStore.getState();
				const captionsStore = useCaptionsStore.getState();

				const transcription = {
					language: parsed.language,
					segments: parsed.segments.map((seg, index) => ({
						id: String(index + 1),
						start: seg.start,
						end: seg.end,
						text: seg.text,
						no_speech_prob: 0,
						avg_logprob: 0,
					})),
				};

				const captionElements = captionsStore.createCaptionElements(
					transcription as any
				);

				const captionsTrackId = timelineStore.findOrCreateTrack("captions");
				timelineStore.pushHistory();
				let added = 0;
				for (const el of captionElements) {
					const id = timelineStore.addElementToTrack(captionsTrackId, el as any, {
						pushHistory: false,
						selectElement: false,
					});
					if (id) added++;
				}
				return ok({ trackId: captionsTrackId, added });
			}

			case "setPlayhead": {
				const parsed = setPlayheadSchema.parse(args ?? {});
				requireActiveProjectId();
				usePlaybackStore.getState().seek(parsed.time);
				return ok({});
			}

			case "selectElements": {
				const parsed = selectElementsSchema.parse(args ?? {});
				requireActiveProjectId();
				const elements: SelectedElement[] = parsed.elements.map((element) => ({
					trackId: element.trackId,
					elementId: element.elementId,
				}));
				useTimelineStore.getState().setSelectedElements(elements);
				return ok({ count: parsed.elements.length });
			}

			case "undo": {
				requireActiveProjectId();
				useTimelineStore.getState().undo();
				return ok({});
			}

			case "redo": {
				requireActiveProjectId();
				useTimelineStore.getState().redo();
				return ok({});
			}

			case "export": {
				const parsed = exportSchema.parse(args ?? {});
				requireActiveProjectId();

				const exportStore = useExportStore.getState();
				exportStore.setPanelView(PanelView.EXPORT);

				await waitFor({
					predicate: () => typeof (window as any).__exportActions?.export === "function",
					timeoutMs: 3000,
				});

				const filename =
					parsed.filename && parsed.filename.trim()
						? parsed.filename.trim()
						: `wzrd-export-${new Date().toISOString().replace(/[:.]/g, "-")}.${parsed.format}`;

				// Fire-and-forget; status can be tracked via getExportStatus.
				void (window as any).__exportActions.export({
					quality: parsed.preset,
					format: parsed.format,
					filename,
				});

				return ok({ started: true, filename });
			}

			case "getExportStatus": {
				const state = useExportStore.getState();
				return ok({
					progress: state.progress,
					error: state.error,
					history: state.exportHistory,
				});
			}

			default:
				return err(`Unsupported command: ${command}`, "unsupported");
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err(message);
	}
}

function getEditorApi() {
	return {
		version: "1.0.0",
		commands: {
			execute: async (command: EditorCommandName, args?: unknown) =>
				await executeLogged(command, args, { source: "renderer" }),
		},
		debug: {
			getCommandLog: () => [...commandLog],
			clearCommandLog: () => {
				commandLog.splice(0, commandLog.length);
			},
			getRateLimitState: () => {
				const now = Date.now();
				const currentCalls = recentCalls.filter(
					(ts) => ts >= now - RATE_LIMIT_WINDOW_MS
				).length;
				return { windowMs: RATE_LIMIT_WINDOW_MS, maxCalls: RATE_LIMIT_MAX_CALLS, currentCalls };
			},
		},
	};
}
let installed = false;
let cleanup: (() => void) | null = null;

/**
 * Installs the window-level agent API (`window.wzrd.editor`) and the main-process bridge handler
 * for MCP tool calls.
 */
export function installEditorAgentApi({ projectId }: { projectId: string }) {
	const api = getEditorApi();

	(window as any).wzrd = (window as any).wzrd || {};
	(window as any).wzrd.editor = api;

	const wzrdQcut = (window as any).wzrdQcut;

	if (!installed) {
		installed = true;

		// Notify main process that the editor is ready to accept agent commands.
		try {
			wzrdQcut?.agentCommand?.notifyReady?.({ projectId });
		} catch {
			// ignore
		}

		// Handle incoming requests from the Electron main process MCP server.
		let unsubscribe = null as null | (() => void);
		try {
			unsubscribe = wzrdQcut?.agentCommand?.onRequest?.(async (payload: any) => {
				const requestId = payload?.requestId;
				const command = payload?.command as EditorCommandName;
				const args = payload?.args;

				if (typeof requestId !== "string") return;
				if (typeof command !== "string") {
					wzrdQcut?.agentCommand?.respond?.({
						requestId,
						ok: false,
						error: "Invalid command",
					});
					return;
				}

				const result = await executeLogged(command, args, { source: "mcp" });
				if (isCommandFailure(result)) {
					wzrdQcut?.agentCommand?.respond?.({
						requestId,
						ok: false,
						error: result.error,
						code: result.code,
					});
				} else {
					wzrdQcut?.agentCommand?.respond?.({
						requestId,
						ok: true,
						result: result.result,
					});
				}
			});
		} catch {
			unsubscribe = null;
		}

		cleanup = () => {
			try {
				unsubscribe?.();
			} catch {
				// ignore
			}
		};
	} else {
		// Update main-process awareness of current project.
		try {
			wzrdQcut?.agentCommand?.notifyReady?.({ projectId });
		} catch {
			// ignore
		}
	}

	return () => {
		// Keep API installed across editor re-renders; only remove on full unmount.
		cleanup?.();
		cleanup = null;
		installed = false;
		try {
			delete (window as any).wzrd?.editor;
		} catch {
			// ignore
		}
	};
}
