import "./qcut-theme.css";

import React, { useEffect, useMemo, useRef } from "react";
import { initPlatform, platform, PlatformCapability } from "@qcut/platform-core";

import { createWzrdAdapter } from "./platform/wzrd";
import { createVercelAdapter } from "./platform/vercel";

import { EditorProvider } from "@qcut-app/components/editor-provider";
import { EditorHeader } from "@qcut-app/components/editor-header";
import { Onboarding } from "@qcut-app/components/onboarding";

import {
	DefaultLayout,
	InspectorLayout,
	MediaLayout,
	VerticalPreviewLayout,
} from "@qcut-app/components/editor/panel-layouts";

import { usePanelStore } from "@qcut-app/stores/editor/panel-store";
import {
	useProjectStore,
	NotFoundError,
	createMainScene,
	DEFAULT_CANVAS_SIZE,
	DEFAULT_FPS,
} from "@qcut-app/stores/project-store";
import { useMediaStore } from "@qcut-app/stores/media/media-store";
import { storageService } from "@qcut-app/lib/storage/storage-service";
import type { TProject } from "@qcut-app/types/project";

import { usePlaybackControls } from "@qcut-app/hooks/timeline/use-playback-controls";
import { useSaveOnVisibilityChange } from "@qcut-app/hooks/use-save-on-visibility-change";
import { useProjectJsonSync } from "@qcut-app/hooks/use-project-json-sync";
import { useGapGeneration } from "@qcut-app/hooks/timeline/use-gap-generation";
import { usePtyTerminalStore } from "@qcut-app/stores/pty-terminal-store";

import { debugError, debugLog } from "@qcut-app/lib/debug/debug-config";

import { projectService } from "@/services/supabaseService";
import { assetService } from "@/services/assetService";
import { setWzrdProjectContext } from "./bridge/wzrd-project-context";
import { installEditorAgentApi } from "./bridge/agent-api";
import { maybeImportLegacyTimeline } from "./bridge/legacy-importer";
import { readPublicFlag } from "@/lib/env";

import { useRegisterVoiceActions } from "@/voice/VoiceAgentProvider";
import type { VoiceActionRegistration, VoiceActionResult } from "@/voice/actions/registry";

// ---------------------------------------------------------------------------
// Platform init (must happen before any QCut platform usage)
// ---------------------------------------------------------------------------

let __platformInitialized = false;
function isNextAppRouterRuntime(): boolean {
	return (
		typeof window !== "undefined" &&
		((window as any).__WZRD_NEXT_APP_ROUTER === true ||
			typeof (window as any).__NEXT_DATA__ !== "undefined")
	);
}

function ensurePlatformInitialized() {
	if (__platformInitialized) return;
	initPlatform(isNextAppRouterRuntime() ? createVercelAdapter() : createWzrdAdapter());
	__platformInitialized = true;
}

ensurePlatformInitialized();

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shouldUseLocalProjectData(projectId: string): boolean {
	return !isUuid(projectId) && readPublicFlag("BYPASS_AUTH_FOR_TESTS", ["VITE_BYPASS_AUTH_FOR_TESTS"]);
}

function guessMediaType(asset: {
	asset_type?: string;
	mime_type?: string;
}): "image" | "video" | "audio" {
	const mime = asset.mime_type ?? "";
	if (mime.startsWith("video/")) return "video";
	if (mime.startsWith("audio/")) return "audio";
	const kind = (asset.asset_type ?? "").toLowerCase();
	if (kind === "video" || kind === "audio" || kind === "image") return kind as any;
	return "image";
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

export function QCutEditor({ projectId }: { projectId: string }) {
	// Save timeline when page becomes hidden (tab switch, close, etc.)
	useSaveOnVisibilityChange();

	// Gap generation listener (fills timeline gaps with AI video)
	useGapGeneration();

	// Auto-sync project.json snapshot on any store change (debounced 1s)
	useProjectJsonSync();

	const { activeProject, loadProject } = useProjectStore();

	const qcutProjectId = useMemo(() => `wzrd:${projectId}`, [projectId]);

	useEffect(() => {
		return installEditorAgentApi({ projectId: qcutProjectId });
	}, [qcutProjectId]);

	const editorVoiceActions = useMemo<VoiceActionRegistration[]>(() => {
		const callEditor = async (
			command: string,
			args?: Record<string, unknown>
		): Promise<VoiceActionResult> => {
			const api = (window as any).wzrd?.editor;
			if (!api?.commands?.execute) {
				return {
					ok: false,
					status: "unavailable",
					message: "Editor command API is not available.",
					errorCode: "editor_api_unavailable",
				};
			}

			const result = await api.commands.execute(command, args ?? {});
			if (result?.ok) {
				return {
					ok: true,
					status: "completed",
					message: `${command} completed.`,
					data: result.result,
				};
			}

			return {
				ok: false,
				status: "failed",
				message: result?.error ?? `${command} failed.`,
				errorCode: result?.code ?? "editor_command_failed",
				data: result,
			};
		};

		return [
			{
				name: "editor_import_media_by_url",
				scope: "qcut-editor",
				description: "Import media into the QCut media panel by URL.",
				handler: async (input) => {
					return await callEditor("importMediaByUrl", input as any);
				},
			},
			{
				name: "editor_add_clip",
				scope: "qcut-editor",
				description: "Add a media clip to the timeline.",
				handler: async (input) => {
					return await callEditor("addClip", input as any);
				},
			},
			{
				name: "editor_split_element",
				scope: "qcut-editor",
				description: "Split a timeline element at a time (seconds).",
				handler: async (input) => {
					return await callEditor("splitElement", input as any);
				},
			},
			{
				name: "editor_delete_element",
				scope: "qcut-editor",
				description: "Delete a timeline element.",
				handler: async (input) => {
					return await callEditor("deleteElement", input as any);
				},
			},
			{
				name: "editor_add_title",
				scope: "qcut-editor",
				description: "Add a title text element to the timeline.",
				handler: async (input) => {
					const payload = (input ?? {}) as any;
					return await callEditor("addText", {
						content: payload.text ?? payload.content ?? "Title",
						startTime: payload.startTime,
						duration: payload.duration,
					});
				},
			},
			{
				name: "editor_export",
				scope: "qcut-editor",
				description: "Export the current timeline to a file.",
				handler: async (input) => {
					return await callEditor("export", input as any);
				},
			},
		];
	}, [qcutProjectId]);

	useRegisterVoiceActions(editorVoiceActions);



	// Track current load promise to handle concurrent loads properly
	const currentLoadPromiseRef = useRef<Promise<void> | null>(null);
	// Track which project_id is currently being loaded to avoid duplicate loads
	const inFlightProjectIdRef = useRef<string | null>(null);

	useEffect(() => {
		const abortController = new AbortController();

		const wzrdProjectId = projectId;
		const qcutProjectId = `wzrd:${projectId}`;
		const useLocalProjectData = shouldUseLocalProjectData(wzrdProjectId);

		const ensureProjectTerminalContext = async () => {
			try {
				if (!platform().hasCapability(PlatformCapability.ProjectFolder)) {
					return;
				}
				await platform().projectFolder.ensureStructure(qcutProjectId);
				const root = await platform().projectFolder.getRoot(qcutProjectId);
				usePtyTerminalStore.getState().setProjectContext({
					projectId: qcutProjectId,
					workingDirectory: root,
				});
			} catch (e) {
				debugLog("[WZRD/QCut] Failed to set PTY project context", e);
			}
		};

		const maybeImportRemoteTimeline = async () => {
			if (useLocalProjectData) return;
			await maybeImportLegacyTimeline({ wzrdProjectId, qcutProjectId });
		};

		const ensureProjectExists = async (name: string) => {
			const existing = await storageService.loadProject({ id: qcutProjectId });
			if (existing) {
				if (existing.name !== name) {
					await storageService.saveProject({ project: { ...existing, name } });
				}
				return;
			}

			const mainScene = createMainScene();
			const newProject: TProject = {
				id: qcutProjectId,
				name,
				thumbnail: "",
				createdAt: new Date(),
				updatedAt: new Date(),
				scenes: [mainScene],
				currentSceneId: mainScene.id,
				backgroundColor: "#000000",
				backgroundType: "color",
				blurIntensity: 8,
				bookmarks: [],
				fps: DEFAULT_FPS,
				canvasSize: DEFAULT_CANVAS_SIZE,
				canvasMode: "preset",
			};

			await storageService.saveProject({ project: newProject });
		};

		const syncAssetsIntoMediaStore = async () => {
			if (useLocalProjectData) return;

			try {
				const assets = await assetService.list({ projectId: wzrdProjectId });
				if (abortController.signal.aborted) return;

				const mediaStore = useMediaStore.getState();
				const existingIds = new Set(mediaStore.mediaItems.map((m) => m.id));

				for (const asset of assets) {
					if (abortController.signal.aborted) return;
					if (existingIds.has(asset.id)) continue;

					const type = guessMediaType(asset);

					const cdnUrl =
						asset.cdn_url || asset.preview_url || asset.thumbnail_url || null;
					if (!cdnUrl) continue;

					let url: string | undefined = cdnUrl;
					let localPath: string | undefined;

					// Prefer platform-managed caching for stable playback + export.
					// Images are typically small, so we avoid caching them eagerly.
					if (type !== "image" && platform().mediaImport?.cacheRemoteMedia) {
						try {
							const cached = await platform().mediaImport.cacheRemoteMedia({
								url: cdnUrl,
								operationId: `qcut-asset-${asset.id}`,
							});
							localPath = cached?.path;
							url = cached?.mediaUrl || url;
						} catch (e) {
							debugLog("[WZRD/QCut] cacheRemoteMedia failed", e);
						}
					}

					const meta = (asset.media_metadata ?? {}) as Record<string, unknown>;
					const duration = numberValue(meta.durationSeconds ?? meta.duration ?? meta.duration_ms);
					const width = numberValue(meta.width);
					const height = numberValue(meta.height);
					const fps = numberValue(meta.fps);

					// Placeholder file (size 0) — playback uses `url` (see media-source WZRD-EDIT).
					const file = new File([], asset.file_name || "asset", {
						type: asset.mime_type || undefined,
					});

					await mediaStore.addMediaItem(qcutProjectId, {
						id: asset.id,
						name: asset.original_file_name || asset.file_name,
						type,
						file,
						url,
						thumbnailUrl: asset.thumbnail_url ?? undefined,
						originalUrl: asset.cdn_url ?? undefined,
						localPath,
						duration,
						width,
						height,
						fps,
						metadata: {
							source: "wzrd-asset",
							assetId: asset.id,
							assetType: asset.asset_type,
						},
					});
				}
			} catch (error) {
				debugError("[WZRD/QCut] Failed to sync project assets", error);
			}
		};

		const init = async () => {
			debugLog(`[WZRD/QCutEditor] init called for project: ${wzrdProjectId}`);

			if (!wzrdProjectId || abortController.signal.aborted) {
				return;
			}

			if (activeProject?.id === qcutProjectId) {
				return;
			}

			// Prevent duplicate loads for the same project_id
			if (inFlightProjectIdRef.current === qcutProjectId) {
				return;
			}

			// Wait for any previous load to complete before starting a new one
			if (currentLoadPromiseRef.current) {
				try {
					await currentLoadPromiseRef.current;
				} catch {
					// Previous load handled its error path; continue.
				}
				if (abortController.signal.aborted) {
					return;
				}
				const latestActiveProjectId =
					useProjectStore.getState().activeProject?.id;
				if (
					latestActiveProjectId === qcutProjectId ||
					inFlightProjectIdRef.current === qcutProjectId
				) {
					return;
				}
			}

			inFlightProjectIdRef.current = qcutProjectId;
			const loadPromise = (async () => {
				try {
					const wzrdProject = useLocalProjectData
						? null
						: await projectService.find(wzrdProjectId);
					const desiredName = wzrdProject?.title || "Untitled Project";

					setWzrdProjectContext({
						wzrdProjectId,
						qcutProjectId,
						lastKnownUpdatedAt: (wzrdProject as any)?.updated_at ?? null,
					});

					await ensureProjectExists(desiredName);
					await loadProject(qcutProjectId);
					await syncAssetsIntoMediaStore();
					await maybeImportRemoteTimeline();
					await ensureProjectTerminalContext();
				} catch (error) {
					if (abortController.signal.aborted) return;

					// If the store still throws NotFoundError (should be rare), try one
					// more time after forcing the project into storage.
					if (error instanceof NotFoundError) {
						try {
							await ensureProjectExists("Untitled Project");
							await loadProject(qcutProjectId);
							await syncAssetsIntoMediaStore();
							await maybeImportRemoteTimeline();
							await ensureProjectTerminalContext();
							return;
						} catch (e) {
							debugError(
								"[WZRD/QCutEditor] loadProject failed after NotFoundError",
								e
							);
						}
					}

					debugError("[WZRD/QCutEditor] Failed to load project", error);
				} finally {
					if (inFlightProjectIdRef.current === qcutProjectId) {
						inFlightProjectIdRef.current = null;
					}
				}
			})();

			currentLoadPromiseRef.current = loadPromise;
			try {
				await loadPromise;
			} finally {
				if (currentLoadPromiseRef.current === loadPromise) {
					currentLoadPromiseRef.current = null;
				}
			}
		};

		init();

		return () => {
			abortController.abort();
		};
	}, [projectId, activeProject?.id, loadProject]);

	// Get active preset and reset counter for panel layouts
	const activePreset = usePanelStore((s) => s.activePreset) ?? "default";
	const resetCounter = usePanelStore((s) => s.resetCounter) ?? 0;

	usePlaybackControls();

	const layouts: Record<string, React.ReactNode> = {
		media: <MediaLayout resetCounter={resetCounter} />,
		inspector: <InspectorLayout resetCounter={resetCounter} />,
		"vertical-preview": <VerticalPreviewLayout resetCounter={resetCounter} />,
		default: <DefaultLayout resetCounter={resetCounter} />,
	};

	const selectedLayout = layouts[activePreset] || layouts.default;

	return (
		<div className="qcut-root h-full w-full overflow-hidden">
			<EditorProvider>
				<div className="h-full w-full flex flex-col bg-background overflow-hidden">
					<EditorHeader />
					<div className="flex-1 min-h-0 min-w-0">{selectedLayout}</div>
					<Onboarding />
				</div>
			</EditorProvider>
		</div>
	);
}
