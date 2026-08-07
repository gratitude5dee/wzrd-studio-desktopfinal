/**
 * @qcut/platform-desktop — WZRD compatibility shim
 *
 * WZRD-EDIT: We do not vendor QCut's real Electron adapter. In WZRD Studio Desktop,
 * we will provide `platform-wzrd` (Phase 2+) that maps onto WZRD's Electron IPC.
 *
 * However, several vendored QCut unit tests assume `createDesktopAdapter()` exists
 * and wires through to `window.electronAPI.*`.
 *
 * This shim:
 * - starts from QCut's web adapter,
 * - marks itself as "desktop" / Electron when `window.electronAPI` is present,
 * - implements a small subset of desktop namespaces used by tests.
 */

import {
	PlatformCapability,
	PlatformUnsupportedError,
	isPlatformCapable,
	type PlatformAPI,
	type PlatformAIPipelineAPI,
	type PlatformProjectFolderAPI,
	type PlatformSkillsAPI,
	type PlatformMediaImportAPI,
} from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";

function getElectronAPI(): any {
	return (globalThis as any).electronAPI;
}

function createAIPipelineNamespace(): PlatformAIPipelineAPI {
	return {
		check: async () => {
			const api = getElectronAPI();
			return api?.aiPipeline?.check?.() ?? { available: false };
		},
		status: async () => {
			const api = getElectronAPI();
			return api?.aiPipeline?.status?.() ?? { available: false };
		},
		generate: async (...args: any[]) => {
			const api = getElectronAPI();
			if (!api?.aiPipeline?.generate) {
				throw new PlatformUnsupportedError(PlatformCapability.AiPipeline, "web");
			}
			return api.aiPipeline.generate(...args);
		},
		listModels: async () => {
			const api = getElectronAPI();
			return api?.aiPipeline?.listModels?.() ?? { success: false, models: [] };
		},
		estimateCost: async (...args: any[]) => {
			const api = getElectronAPI();
			return api?.aiPipeline?.estimateCost?.(...args) ?? { success: false };
		},
		cancel: async (...args: any[]) => {
			const api = getElectronAPI();
			return api?.aiPipeline?.cancel?.(...args) ?? { success: false };
		},
		refresh: async () => {
			const api = getElectronAPI();
			return api?.aiPipeline?.refresh?.() ?? { available: false };
		},
		onProgress: (cb: any) => {
			const api = getElectronAPI();
			return api?.aiPipeline?.onProgress?.(cb) ?? (() => {});
		},
	};
}


function createSkillsNamespace(): PlatformSkillsAPI {
	return {
		list: async (projectId) => {
			const api = getElectronAPI();
			return api?.skills?.list?.(projectId) ?? [];
		},
		import: async (projectId, sourcePath) => {
			const api = getElectronAPI();
			return api?.skills?.import?.(projectId, sourcePath) ?? null;
		},
		delete: async (projectId, skillId) => {
			const api = getElectronAPI();
			return api?.skills?.delete?.(projectId, skillId) ?? false;
		},
		getContent: async (projectId, skillId, filename) => {
			const api = getElectronAPI();
			return api?.skills?.getContent?.(projectId, skillId, filename) ?? null;
		},
		browse: async () => {
			const api = getElectronAPI();
			return api?.skills?.browse?.() ?? null;
		},
		getPath: async (projectId) => {
			const api = getElectronAPI();
			return api?.skills?.getPath?.(projectId) ?? "";
		},
		scanGlobal: async () => {
			const api = getElectronAPI();
			return api?.skills?.scanGlobal?.() ?? [];
		},
		syncForClaude: async (projectId) => {
			const api = getElectronAPI();
			return (
				api?.skills?.syncForClaude?.(projectId) ?? {
					synced: false,
					copied: 0,
					skipped: 0,
					removed: 0,
					warnings: ["skills.syncForClaude unsupported"],
				}
			);
		},
	};
}


function createMediaImportNamespace(): PlatformMediaImportAPI {
	return {
		import: async (options) => {
			const api = getElectronAPI();
			if (!api?.mediaImport?.import) {
				throw new PlatformUnsupportedError(PlatformCapability.MediaImport, "web");
			}
			return api.mediaImport.import(options);
		},
		validateSymlink: async (path) => {
			const api = getElectronAPI();
			return api?.mediaImport?.validateSymlink?.(path) ?? { valid: false };
		},
		locateOriginal: async (mediaPath) => {
			const api = getElectronAPI();
			return api?.mediaImport?.locateOriginal?.(mediaPath) ?? null;
		},
		relinkMedia: async (projectId, mediaId, newSourcePath) => {
			const api = getElectronAPI();
			return api?.mediaImport?.relinkMedia?.(projectId, mediaId, newSourcePath) ?? false;
		},
		remove: async (projectId, mediaId) => {
			const api = getElectronAPI();
			return api?.mediaImport?.remove?.(projectId, mediaId) ?? false;
		},
		checkSymlinkSupport: async () => {
			const api = getElectronAPI();
			return api?.mediaImport?.checkSymlinkSupport?.() ?? false;
		},
		getMediaPath: async (projectId) => {
			const api = getElectronAPI();
			return api?.mediaImport?.getMediaPath?.(projectId) ?? "";
		},
	};
}
function createProjectFolderNamespace(): PlatformProjectFolderAPI {
	return {
		getRoot: async (projectId) => {
			const api = getElectronAPI();
			if (!api?.projectFolder?.getRoot) {
				throw new PlatformUnsupportedError(PlatformCapability.ProjectFolder, "web");
			}
			return api.projectFolder.getRoot(projectId);
		},
		scan: async (projectId, subPath, options) => {
			const api = getElectronAPI();
			if (!api?.projectFolder?.scan) {
				throw new PlatformUnsupportedError(PlatformCapability.ProjectFolder, "web");
			}
			return api.projectFolder.scan(projectId, subPath, options);
		},
		list: async (projectId, subPath) => {
			const api = getElectronAPI();
			return api?.projectFolder?.list?.(projectId, subPath) ?? [];
		},
		ensureStructure: async (projectId) => {
			const api = getElectronAPI();
			return api?.projectFolder?.ensureStructure?.(projectId);
		},
	};
}
export function createDesktopAdapter(): PlatformAPI {
	const web = createWebAdapter();
	const electronAPI = getElectronAPI();
	const isElectron = Boolean(electronAPI);

	const adapter: PlatformAPI = {
		...web,
		platform: "desktop",
		isElectron,
		hasCapability: (cap) => isPlatformCapable(isElectron ? "desktop" : "web", cap),
		// Only implement namespaces needed by tests for now.
		aiPipeline: createAIPipelineNamespace(),
		mediaImport: createMediaImportNamespace(),
		skills: createSkillsNamespace(),
		projectFolder: createProjectFolderNamespace(),
		analyzeFillers: async (options) => {
			const api = getElectronAPI();
			if (!api?.analyzeFillers) {
				return { filteredWordIds: [], provider: "pattern" as const };
			}
			return api.analyzeFillers(options);
		},
	};

	return adapter;
}
