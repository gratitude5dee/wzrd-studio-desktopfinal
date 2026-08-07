import { createWebAdapter } from "@qcut/platform-web";
import type { PlatformAPI, PlatformCapability, FileInfo } from "@qcut/platform-core";

import { writeQcutSnapshotToSupabase } from "../../bridge/qcut-project-json-supabase";

function isDesktopRenderer(): boolean {
	return (
		typeof window !== "undefined" &&
		!!(window as any).wzrdDesktop &&
		(window as any).wzrdDesktop.isDesktop === true
	);
}

/**
 * createWzrdAdapter
 *
 * Phase 2: Web-adapter mode.
 * Phase 3+: When running inside Electron, override platform namespaces
 *           to use privileged ipcMain handlers.
 */
export function createWzrdAdapter(): PlatformAPI {
	const base = createWebAdapter();

	if (!isDesktopRenderer()) {
		return base;
	}

	const wzrdDesktop = (window as any).wzrdDesktop as any;
	const wzrdQcut = (window as any).wzrdQcut as any;

	const hasCapability = (cap: PlatformCapability) => {
		// Declare the minimal set of capabilities we actually provide in desktop mode.
		if (
			cap === "ffmpeg" ||
			cap === "video-temp" ||
			cap === "audio-temp" ||
			cap === "project-json" ||
			cap === "filesystem" ||
			cap === "pty" ||
			cap === "skills" ||
			cap === "project-folder"
		) {
			return true;
		}
		return base.hasCapability(cap);
	};

	return {
		...base,
		platform: "desktop",
		isElectron: true,
		hasCapability,

		files: {
			...base.files,
			async getFileInfo(filePath: string): Promise<FileInfo | null> {
				try {
					const info = await wzrdQcut?.files?.getFileInfo?.(filePath);
					return info ?? null;
				} catch {
					return null;
				}
			},
		},

		mediaImport: {
			...base.mediaImport,
			async cacheRemoteMedia(options) {
				if (typeof wzrdDesktop?.cacheRemoteMedia !== "function") {
					return base.mediaImport.cacheRemoteMedia?.(options) ?? null;
				}
				return await wzrdDesktop.cacheRemoteMedia(options);
			},
		},

		audio: {
			...base.audio,
			async saveTemp(audioData: Uint8Array, filename: string): Promise<string> {
				if (typeof wzrdQcut?.audio?.saveTemp !== "function") {
					throw new Error("wzrdQcut.audio.saveTemp unavailable");
				}
				return await wzrdQcut.audio.saveTemp({ audioData, filename });
			},
		},

		video: {
			...base.video,
			async saveTemp(
				videoData: Uint8Array,
				filename: string,
				sessionId?: string
			): Promise<string> {
				if (typeof wzrdQcut?.video?.saveTemp !== "function") {
					throw new Error("wzrdQcut.video.saveTemp unavailable");
				}
				return await wzrdQcut.video.saveTemp({ videoData, filename, sessionId });
			},
			async verifyFile(filePath: string): Promise<boolean> {
				try {
					return (await wzrdQcut?.video?.verifyFile?.(filePath)) === true;
				} catch {
					return false;
				}
			},
		},

		ffmpeg: {
			...base.ffmpeg,
			async getPath() {
				return await wzrdQcut?.ffmpeg?.getPath?.();
			},
			async checkHealth() {
				return await wzrdQcut?.ffmpeg?.checkHealth?.();
			},
			async createExportSession() {
				return await wzrdQcut?.ffmpeg?.createExportSession?.();
			},
			async saveFrame(data) {
				return await wzrdQcut?.ffmpeg?.saveFrame?.(data);
			},
			async exportVideoCLI(options: Record<string, unknown>) {
				return await wzrdQcut?.ffmpeg?.exportVideoCLI?.(options);
			},
			async readOutputFile(filePath: string) {
				const buffer = await wzrdQcut?.ffmpeg?.readOutputFile?.(filePath);
				if (!buffer) return null;
				// Electron will marshal a Node Buffer; normalize to ArrayBuffer.
				if (buffer instanceof ArrayBuffer) return buffer;
				if (ArrayBuffer.isView(buffer)) {
					return buffer.buffer.slice(
						buffer.byteOffset,
						buffer.byteOffset + buffer.byteLength
					);
				}
				return buffer;
			},
			async cleanupExportSession(sessionId: string) {
				return await wzrdQcut?.ffmpeg?.cleanupExportSession?.(sessionId);
			},
			async openFramesFolder(sessionId: string) {
				return await wzrdQcut?.ffmpeg?.openFramesFolder?.(sessionId);
			},
			async extractAudio(options: { videoPath: string; format?: string }) {
				return await wzrdQcut?.ffmpeg?.extractAudio?.(options);
			},
			async saveStickerForExport(data) {
				return await wzrdQcut?.ffmpeg?.saveStickerForExport?.(data);
			},
		},

		projectJson: {
			async write(projectId: string) {
				await writeQcutSnapshotToSupabase(projectId);
			},
		},

		pty: {
			async spawn(options) {
				if (typeof wzrdQcut?.pty?.spawn !== "function") {
					throw new Error("wzrdQcut.pty.spawn unavailable");
				}
				return await wzrdQcut.pty.spawn(options);
			},
			async write(sessionId, data) {
				return await wzrdQcut.pty.write(sessionId, data);
			},
			async resize(sessionId, cols, rows) {
				return await wzrdQcut.pty.resize(sessionId, cols, rows);
			},
			async kill(sessionId) {
				return await wzrdQcut.pty.kill(sessionId);
			},
			async killAll() {
				return await wzrdQcut.pty.killAll();
			},
			onData(callback) {
				wzrdQcut.pty.onData(callback);
			},
			onExit(callback) {
				wzrdQcut.pty.onExit(callback);
			},
			removeListeners() {
				wzrdQcut.pty.removeListeners();
			},
		},

		skills: {
			async list(projectId: string) {
				return await wzrdQcut.skills.list(projectId);
			},
			async import(projectId: string, sourcePath: string) {
				return await wzrdQcut.skills.import(projectId, sourcePath);
			},
			async delete(projectId: string, skillId: string) {
				return await wzrdQcut.skills.delete(projectId, skillId);
			},
			async getContent(projectId: string, skillId: string, filename: string) {
				return await wzrdQcut.skills.getContent(projectId, skillId, filename);
			},
			async browse() {
				return await wzrdQcut.skills.browse();
			},
			async getPath(projectId: string) {
				return await wzrdQcut.skills.getPath(projectId);
			},
			async scanGlobal() {
				return await wzrdQcut.skills.scanGlobal();
			},
			async syncForClaude(projectId: string) {
				return await wzrdQcut.skills.syncForClaude(projectId);
			},
		},

		projectFolder: {
			async getRoot(projectId: string) {
				return await wzrdQcut.projectFolder.getRoot(projectId);
			},
			async scan(
				projectId: string,
				subPath?: string,
				options?: Record<string, unknown>
			) {
				return await wzrdQcut.projectFolder.scan(projectId, subPath, options);
			},
			async list(projectId: string, subPath?: string) {
				return await wzrdQcut.projectFolder.list(projectId, subPath);
			},
			async ensureStructure(projectId: string) {
				return await wzrdQcut.projectFolder.ensureStructure(projectId);
			},
		},
	};
}
