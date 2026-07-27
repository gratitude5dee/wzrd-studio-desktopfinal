import { useRef, useState } from "react";
import { useExportStore } from "@qcut-app/stores/export-store";
import { useTimelineStore } from "@qcut-app/stores/timeline/timeline-store";
import { useAsyncMediaItems } from "@qcut-app/hooks/media/use-async-media-store";
// Export engine factory and engine types will be imported dynamically when needed
import type {
	ExportFormat,
	ExportQuality,
	AudioCodec,
	ExportSettingsWithAudio,
	GifExportConfig,
} from "@qcut-app/types/export";
import type { ExportEngine } from "@qcut-app/lib/export/export-engine";
import type {
	ExportEngineFactory,
	ExportEngineType,
} from "@qcut-app/lib/export/export-engine-factory";
import { toast } from "sonner";
import { useElectron } from "@qcut-app/hooks/useElectron";
import { debugLog, debugError, debugWarn } from "@qcut-app/lib/debug/debug-config";
import { lockForExport, unlockFromExport } from "@qcut-app/lib/media/blob-manager";
import { saveExportedVideo } from "@qcut-app/lib/export/export-output";
import { registerProjectExport } from "@qcut-app/lib/export/project-export-registration";
import { useProjectStore } from "@qcut-app/stores/project-store";
import { useMediaStore } from "@qcut-app/stores/media/media-store";
import { getWzrdProjectContext } from "@/qcut/bridge/wzrd-project-context";

export function useExportProgress() {
	const { progress, updateProgress, setError, resetExport, addToHistory } =
		useExportStore();

	const { tracks } = useTimelineStore();
	const { mediaItems } = useAsyncMediaItems();
	const { activeProject } = useProjectStore();
	const { isElectron } = useElectron();

	const currentEngineRef = useRef<ExportEngine | null>(null);
	const [exportStartTime, setExportStartTime] = useState<Date | null>(null);

	const handleCancel = () => {
		if (currentEngineRef.current && progress.isExporting) {
			currentEngineRef.current.cancel();
			currentEngineRef.current = null;

			// NOTE: Do NOT call unlockFromExport() here.
			// The finally block in handleExport() will handle the unlock.
			// Calling it here would cause a double-unlock race condition when
			// overlapping exports occur (user cancels #1 and starts #2).

			updateProgress({
				progress: 0,
				status: "Export cancelled",
				isExporting: false,
			});

			toast.info("Export cancelled by user");

			setTimeout(() => {
				resetExport();
			}, 1000);
		}
	};

	type EngineSelection = "auto" | "cli" | "ffmpeg" | "standard";

	const handleExport = async (
		canvas: HTMLCanvasElement,
		totalDuration: number,
		exportSettings: {
			quality: ExportQuality;
			format: ExportFormat;
			filename: string;
			engineType: EngineSelection;
			resolution: { width: number; height: number };
			includeAudio?: boolean;
			audioCodec?: AudioCodec;
			audioBitrate?: number;
			gifConfig?: GifExportConfig;
		}
	) => {
		// Reset any previous errors
		setError(null);
		resetExport();

		// Record export start time
		const startTime = new Date();
		setExportStartTime(startTime);

		// Lock blob URLs from auto-cleanup during export
		// This prevents ERR_FILE_NOT_FOUND errors when export takes longer than 10 minutes
		lockForExport();

		try {
			if (totalDuration === 0) {
				debugWarn("[ExportPanel] ❌ cannot export: timeline duration is 0");
				throw new Error(
					"Timeline is empty - add some content before exporting"
				);
			}

			// Create export engine using factory for optimal performance
			// Dynamically import export engine factory
			const { ExportEngineFactory, ExportEngineType } = await import(
				"@qcut-app/lib/export/export-engine-factory"
			);
			const factory = ExportEngineFactory.getInstance();

			// Let factory auto-recommend for Electron, otherwise use manual selection
			let selectedEngineType: ExportEngineType | undefined;

			console.log("🎬 EXPORT HOOK - Selecting engine type:");
			console.log("  - isElectron():", isElectron());
			console.log("  - User selected engine:", exportSettings.engineType);

			if (isElectron()) {
				debugLog(
					"[ExportPanel] 🖥️  Electron detected - letting factory auto-recommend engine"
				);
				console.log(
					"  ✅ Electron detected - letting factory auto-select FFmpeg CLI"
				);
				selectedEngineType = undefined; // Let factory decide
			} else {
				console.log("  🌐 Browser mode - using user selection");
				if (exportSettings.engineType === "auto") {
					console.log("    - Auto mode: letting factory decide");
					selectedEngineType = undefined;
				} else if (exportSettings.engineType === "cli") {
					console.log("    - CLI mode selected");
					selectedEngineType = ExportEngineType.CLI;
				} else if (exportSettings.engineType === "ffmpeg") {
					console.log("    - FFmpeg WASM mode selected");
					selectedEngineType = ExportEngineType.FFMPEG;
				} else {
					console.log("    - Standard Canvas mode selected");
					selectedEngineType = ExportEngineType.STANDARD;
				}
			}

			debugLog("[ExportPanel] 🎬 Creating export engine with settings:", {
				quality: exportSettings.quality,
				format: exportSettings.format,
				filename: exportSettings.filename,
				engineType: selectedEngineType || "auto-recommend",
				resolution: exportSettings.resolution,
				duration: totalDuration,
			});

			const exportEngine = await factory.createEngine(
				canvas,
				{
					quality: exportSettings.quality,
					format: exportSettings.format,
					width: exportSettings.resolution.width,
					height: exportSettings.resolution.height,
					filename: exportSettings.filename,
					includeAudio: exportSettings.includeAudio,
					audioCodec: exportSettings.audioCodec,
					audioBitrate: exportSettings.audioBitrate,
					gifConfig: exportSettings.gifConfig,
				},
				tracks,
				mediaItems,
				totalDuration,
				selectedEngineType
			);

			// Store engine reference for cancellation
			currentEngineRef.current = exportEngine;

			debugLog(
				"[ExportPanel] 🚀 Starting export with engine:",
				exportEngine.constructor.name
			);

			// Start export with progress callback
			updateProgress({
				progress: 0,
				status: "Initializing export...",
				isExporting: true,
			});

			// Check if this is a RemotionExportEngine and use its specialized export method
			let blob: Blob;
			if (
				"exportWithRemotion" in exportEngine &&
				typeof (exportEngine as Record<string, unknown>).exportWithRemotion ===
					"function"
			) {
				debugLog("[ExportPanel] 🎬 Using Remotion export pipeline");
				const remotionEngine = exportEngine as ExportEngine & {
					exportWithRemotion: (
						onProgress: (p: {
							overallProgress: number;
							statusMessage: string;
						}) => void
					) => Promise<Blob>;
				};
				blob = await remotionEngine.exportWithRemotion((remotionProgress) => {
					updateProgress({
						progress: remotionProgress.overallProgress,
						status: remotionProgress.statusMessage,
						isExporting: true,
					});
				});
			} else {
				blob = await exportEngine.export((progress, status) => {
					updateProgress({
						progress,
						status,
						isExporting: true,
					});
				});
			}

			debugLog("[ExportPanel] ✅ Export completed successfully");

			// Calculate export duration
			const exportDuration = Date.now() - startTime.getTime();

			// Add to history
			addToHistory({
				filename: exportSettings.filename,
				settings: {
					quality: exportSettings.quality,
					format: exportSettings.format,
					filename: exportSettings.filename,
					width: exportSettings.resolution.width,
					height: exportSettings.resolution.height,
				},
				duration: exportDuration,
				fileSize: blob.size,
				success: true,
			});

			// Reset timing state
			setExportStartTime(null);

			// Save/download via platform-aware output
			const saveResult = await saveExportedVideo(blob, exportSettings.filename);
			if (!saveResult.success) {
				debugWarn("[ExportPanel] Save issue:", saveResult.error);
			}

			const qcutProjectId = activeProject?.id;
			const wzrdContext = qcutProjectId
				? getWzrdProjectContext(qcutProjectId)
				: null;
			if (qcutProjectId && wzrdContext?.wzrdProjectId) {
				try {
					updateProgress({
						progress: 100,
						status: "Registering export in project assets...",
						isExporting: true,
					});

					const registration = await registerProjectExport({
						projectId: wzrdContext.wzrdProjectId,
						qcutProjectId,
						blob,
						filename: exportSettings.filename,
						format: exportSettings.format,
						engineType: selectedEngineType || "auto",
						durationSeconds: totalDuration,
						settings: {
							quality: exportSettings.quality,
							format: exportSettings.format,
							width: exportSettings.resolution.width,
							height: exportSettings.resolution.height,
							includeAudio: exportSettings.includeAudio,
							audioCodec: exportSettings.audioCodec,
							audioBitrate: exportSettings.audioBitrate,
						},
					});

					const mediaStore = useMediaStore.getState();
					const alreadyVisible = mediaStore.mediaItems.some(
						(item) => item.id === registration.assetId
					);
					if (!alreadyVisible) {
						await mediaStore.addMediaItem(qcutProjectId, {
							id: registration.assetId,
							name: exportSettings.filename,
							type: "video",
							file: new File([], exportSettings.filename, {
								type: blob.type || "video/mp4",
							}),
							url: registration.publicUrl,
							originalUrl: registration.publicUrl,
							duration: totalDuration,
							metadata: {
								source: "qcut-export",
								assetId: registration.assetId,
								exportJobId: registration.exportJobId,
								storageBucket: registration.storageBucket,
								storagePath: registration.storagePath,
							},
						});
					}
				} catch (registrationError) {
					debugWarn("[ExportPanel] Project asset registration failed:", registrationError);
					toast.warning("Export saved locally, but project asset registration failed", {
						description:
							registrationError instanceof Error
								? registrationError.message
								: "Please try saving it to project assets again.",
					});
				}
			}

			// Show success message
			toast.success("Export completed successfully!", {
				description: `${exportSettings.filename} has been downloaded`,
			});

			// Reset export state
			updateProgress({
				progress: 100,
				status: "Export completed",
				isExporting: false,
			});

			// Clean up engine reference
			currentEngineRef.current = null;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			debugError("[ExportPanel] Export failed:", message);

			// Calculate partial export duration
			const exportDuration = Date.now() - startTime.getTime();

			// Add failed attempt to history
			addToHistory({
				filename: exportSettings.filename,
				settings: {
					quality: exportSettings.quality,
					format: exportSettings.format,
					filename: exportSettings.filename,
					width: exportSettings.resolution.width,
					height: exportSettings.resolution.height,
				},
				duration: exportDuration,
				fileSize: 0,
				success: false,
				error: message,
			});

			setError(message);

			updateProgress({
				progress: 0,
				status: `Export failed: ${message}`,
				isExporting: false,
			});

			// Reset timing state
			setExportStartTime(null);

			// Clean up engine reference
			currentEngineRef.current = null;

			// Show error toast
			toast.error("Export failed", {
				description: message,
			});
		} finally {
			// ALWAYS release the export lock, even on error
			// This ensures blob URLs can be cleaned up after export completes/fails
			unlockFromExport();
		}
	};

	return {
		progress,
		exportStartTime,
		currentEngineRef,
		handleCancel,
		handleExport,
	};
}
