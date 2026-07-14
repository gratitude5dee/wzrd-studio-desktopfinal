/**
 * Web (browser) platform adapter — QCut Lite.
 *
 * Implements cross-platform capabilities using browser APIs.
 * Web-capable APIs not yet fully implemented return graceful defaults.
 * Desktop-only capabilities throw PlatformUnsupportedError.
 *
 * @module @qcut/platform-web
 */

import {
	PlatformCapability,
	PlatformUnsupportedError,
	isPlatformCapable,
	type PlatformAPI,
	type PlatformFilesAPI,
	type PlatformStorageAPI,
	type PlatformThemeAPI,
	type PlatformShellAPI,
	type PlatformApiKeysAPI,
	type PlatformApiKeysStatus,
	type PlatformLicenseAPI,
	type PlatformSoundsAPI,
	type PlatformAudioAPI,
	type PlatformVideoAPI,
	type PlatformScreenshotAPI,
	type PlatformScreenRecordingAPI,
	type PlatformFFmpegAPI,
	type PlatformTranscriptionAPI,
	type PlatformFalAPI,
	type PlatformGeminiChatAPI,
	type PlatformPiAgentAPI,
	type PlatformGitHubAPI,
	type PlatformYouTubeAPI,
	type PlatformPtyAPI,
	type PlatformMcpAPI,
	type PlatformSkillsAPI,
	type PlatformAIPipelineAPI,
	type PlatformMediaImportAPI,
	type PlatformProjectFolderAPI,
	type PlatformProjectJsonAPI,
	type PlatformRemotionFolderAPI,
	type PlatformMoyinAPI,
	type PlatformUpdatesAPI,
	type PlatformVideoSearchAPI,
	type PlatformWallpapersAPI,
	type ThemeSource,
	type LicenseInfo,
} from "@qcut/platform-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEGACY_STORAGE_PREFIX = "qcut:";
const LEGACY_API_KEYS_KEY = "qcut:api-keys";
const LEGACY_THEME_KEY = "qcut:theme";
const PLATFORM_DB_NAME = "wzrd-platform";
const PLATFORM_DB_VERSION = 1;
const PLATFORM_KV_STORE = "kv";
const PLATFORM_API_KEYS_STORE = "apiKeys";
const PLATFORM_API_KEYS_RECORD = "keys";
const LOCAL_STORAGE_MIGRATION_KEY = "__migration:local-storage:v1";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
		transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
	});
}

function parseLegacyValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function isRecord(value: unknown): value is Record<string, string> {
	return (
		!!value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === "string")
	);
}

function createIndexedDbNamespaces(): {
	storage: PlatformStorageAPI;
	apiKeys: PlatformApiKeysAPI;
} {
	let databasePromise: Promise<IDBDatabase> | null = null;
	let migrationPromise: Promise<void> | null = null;

	const openDatabase = () => {
		if (databasePromise) return databasePromise;

		databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
			if (typeof indexedDB === "undefined") {
				reject(new Error("IndexedDB is unavailable"));
				return;
			}

			const request = indexedDB.open(PLATFORM_DB_NAME, PLATFORM_DB_VERSION);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(PLATFORM_KV_STORE)) {
					database.createObjectStore(PLATFORM_KV_STORE);
				}
				if (!database.objectStoreNames.contains(PLATFORM_API_KEYS_STORE)) {
					database.createObjectStore(PLATFORM_API_KEYS_STORE);
				}
			};
			request.onsuccess = () => {
				const database = request.result;
				database.onversionchange = () => {
					database.close();
					databasePromise = null;
					migrationPromise = null;
				};
				resolve(database);
			};
			request.onerror = () => {
				databasePromise = null;
				reject(request.error ?? new Error("Unable to open IndexedDB"));
			};
		});

		return databasePromise;
	};

	const migrateLocalStorage = async () => {
		const database = await openDatabase();
		const checkTransaction = database.transaction(PLATFORM_KV_STORE, "readonly");
		const checkDone = transactionDone(checkTransaction);
		const migrated = await requestResult(
			checkTransaction.objectStore(PLATFORM_KV_STORE).get(LOCAL_STORAGE_MIGRATION_KEY)
		);
		await checkDone;
		if (migrated === true) return;

		const legacyEntries: Array<[string, unknown]> = [];
		let legacyApiKeys: Record<string, string> | null = null;
		const migratedLocalStorageKeys: string[] = [];

		if (typeof localStorage !== "undefined") {
			for (let index = 0; index < localStorage.length; index += 1) {
				const key = localStorage.key(index);
				if (
					!key?.startsWith(LEGACY_STORAGE_PREFIX) ||
					key === LEGACY_API_KEYS_KEY ||
					key === LEGACY_THEME_KEY
				) {
					continue;
				}

				const raw = localStorage.getItem(key);
				if (raw === null) continue;
				legacyEntries.push([key.slice(LEGACY_STORAGE_PREFIX.length), parseLegacyValue(raw)]);
				migratedLocalStorageKeys.push(key);
			}

			const rawApiKeys = localStorage.getItem(LEGACY_API_KEYS_KEY);
			if (rawApiKeys !== null) {
				const parsed = parseLegacyValue(rawApiKeys);
				legacyApiKeys = isRecord(parsed) ? parsed : {};
			}
		}

		const transaction = database.transaction(
			[PLATFORM_KV_STORE, PLATFORM_API_KEYS_STORE],
			"readwrite"
		);
		const kvStore = transaction.objectStore(PLATFORM_KV_STORE);
		for (const [key, value] of legacyEntries) {
			kvStore.put(value, key);
		}
		kvStore.put(true, LOCAL_STORAGE_MIGRATION_KEY);
		if (legacyApiKeys) {
			transaction
				.objectStore(PLATFORM_API_KEYS_STORE)
				.put(legacyApiKeys, PLATFORM_API_KEYS_RECORD);
		}
		await transactionDone(transaction);

		if (typeof localStorage !== "undefined") {
			for (const key of migratedLocalStorageKeys) localStorage.removeItem(key);
			if (legacyApiKeys) localStorage.removeItem(LEGACY_API_KEYS_KEY);
		}
	};

	const ensureMigrated = () => {
		migrationPromise ??= migrateLocalStorage().catch((error) => {
			migrationPromise = null;
			throw error;
		});
		return migrationPromise;
	};

	const storage: PlatformStorageAPI = {
		async save(key, data) {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_KV_STORE, "readwrite");
				transaction.objectStore(PLATFORM_KV_STORE).put(data, key);
				await transactionDone(transaction);
				return true;
			} catch {
				return false;
			}
		},
		async load(key) {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_KV_STORE, "readonly");
				const done = transactionDone(transaction);
				const value = await requestResult(transaction.objectStore(PLATFORM_KV_STORE).get(key));
				await done;
				return value ?? null;
			} catch {
				return null;
			}
		},
		async remove(key) {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_KV_STORE, "readwrite");
				transaction.objectStore(PLATFORM_KV_STORE).delete(key);
				await transactionDone(transaction);
				return true;
			} catch {
				return false;
			}
		},
		async list() {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_KV_STORE, "readonly");
				const done = transactionDone(transaction);
				const keys = await requestResult(transaction.objectStore(PLATFORM_KV_STORE).getAllKeys());
				await done;
				return keys.filter(
					(key): key is string =>
						typeof key === "string" && key !== LOCAL_STORAGE_MIGRATION_KEY
				);
			} catch {
				return [];
			}
		},
		async clear() {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_KV_STORE, "readwrite");
				const done = transactionDone(transaction);
				const store = transaction.objectStore(PLATFORM_KV_STORE);
				const keys = await requestResult(store.getAllKeys());
				for (const key of keys) {
					if (key !== LOCAL_STORAGE_MIGRATION_KEY) store.delete(key);
				}
				await done;
				return true;
			} catch {
				return false;
			}
		},
	};

	const apiKeys: PlatformApiKeysAPI = {
		async get() {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_API_KEYS_STORE, "readonly");
				const done = transactionDone(transaction);
				const value = await requestResult(
					transaction.objectStore(PLATFORM_API_KEYS_STORE).get(PLATFORM_API_KEYS_RECORD)
				);
				await done;
				return isRecord(value) ? value : {};
			} catch {
				return {};
			}
		},
		async set(keys) {
			try {
				const current = await apiKeys.get();
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_API_KEYS_STORE, "readwrite");
				transaction
					.objectStore(PLATFORM_API_KEYS_STORE)
					.put({ ...current, ...keys }, PLATFORM_API_KEYS_RECORD);
				await transactionDone(transaction);
				return true;
			} catch {
				return false;
			}
		},
		async clear() {
			try {
				await ensureMigrated();
				const database = await openDatabase();
				const transaction = database.transaction(PLATFORM_API_KEYS_STORE, "readwrite");
				transaction.objectStore(PLATFORM_API_KEYS_STORE).delete(PLATFORM_API_KEYS_RECORD);
				await transactionDone(transaction);
				return true;
			} catch {
				return false;
			}
		},
		async status() {
			const keys = await apiKeys.get();
			const result: PlatformApiKeysStatus = {};
			for (const [key, value] of Object.entries(keys)) {
				result[key] = { set: !!value, source: "indexedDB", shadowedBy: [] };
			}
			return result;
		},
	};

	return { storage, apiKeys };
}

/**
 * Desktop-only stub — throws PlatformUnsupportedError on any method call.
 * Used for features that should never be reached on web (PTY, MCP, etc.).
 * Calling code must gate on `isElectron` or `hasCapability()`.
 */
function createUnsupportedNamespace<T extends object>(
	cap: PlatformCapability
): T {
	return new Proxy({} as T, {
		get(_, prop) {
			if (typeof prop === "string") {
				return () => {
					throw new PlatformUnsupportedError(cap, "web");
				};
			}
			return undefined;
		},
	});
}

/**
 * Graceful stub — returns safe defaults instead of throwing.
 * Used for web-capable APIs not yet fully implemented.
 * Event listeners (on*, remove*) are no-ops; other methods return null/empty.
 */
function createGracefulNamespace<T extends object>(): T {
	const noop = () => {};
	return new Proxy({} as T, {
		get(_, prop) {
			if (typeof prop === "string") {
				if (prop.startsWith("on") || prop.startsWith("remove")) {
					return (..._args: unknown[]) => noop;
				}
				return (..._args: unknown[]) => Promise.resolve(null);
			}
			return undefined;
		},
	});
}

// ---------------------------------------------------------------------------
// Storage — IndexedDB with one-time localStorage migration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Theme — CSS media queries + localStorage
// ---------------------------------------------------------------------------

const THEME_KEY = "qcut:theme";

const themeAdapter: PlatformThemeAPI = {
	async get() {
		return (localStorage.getItem(THEME_KEY) as ThemeSource) || "system";
	},
	async set(theme) {
		localStorage.setItem(THEME_KEY, theme);
		applyTheme(theme);
		return theme;
	},
	async toggle() {
		const current = await themeAdapter.isDark();
		const next: ThemeSource = current ? "light" : "dark";
		return themeAdapter.set(next);
	},
	async isDark() {
		const theme = await themeAdapter.get();
		if (theme === "system") {
			return window.matchMedia("(prefers-color-scheme: dark)").matches;
		}
		return theme === "dark";
	},
};

function applyTheme(theme: ThemeSource) {
	const isDark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", isDark);
}

// ---------------------------------------------------------------------------
// Shell — window.open for external links
// ---------------------------------------------------------------------------

const shellAdapter: PlatformShellAPI = {
	async showItemInFolder() {
		// No-op on web — can't show native file explorer
	},
	async openExternal(url) {
		window.open(url, "_blank", "noopener,noreferrer");
	},
};

// ---------------------------------------------------------------------------
// Files — File System Access API where available
// ---------------------------------------------------------------------------

const filesAdapter: PlatformFilesAPI = {
	async openFileDialog() {
		if ("showOpenFilePicker" in window) {
			try {
				const [handle] = await (window as any).showOpenFilePicker();
				const file = await handle.getFile();
				return file.name;
			} catch {
				return null;
			}
		}
		return null;
	},
	async openMultipleFilesDialog() {
		if ("showOpenFilePicker" in window) {
			try {
				const handles = await (window as any).showOpenFilePicker({
					multiple: true,
				});
				return Promise.all(
					handles.map(async (h: any) => {
						const f = await h.getFile();
						return f.name;
					})
				);
			} catch {
				return [];
			}
		}
		return [];
	},
	async saveFileDialog() {
		return null; // File System Access API save handled by saveBlob
	},
	async readFile() {
		return null; // Web can't read arbitrary file paths
	},
	async writeFile() {
		return false; // Web can't write to arbitrary file paths
	},
	async saveBlob(data, defaultFilename) {
		try {
			const blobData = data instanceof Uint8Array ? new Uint8Array(data) : data;
			const blob = new Blob([blobData as BlobPart]);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = defaultFilename || "download";
			a.click();
			URL.revokeObjectURL(url);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : "Save failed",
			};
		}
	},
	async getFileInfo() {
		return null; // Can't access file system info on web
	},
};

// ---------------------------------------------------------------------------
// API Keys — IndexedDB-backed
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// License — Free tier (no server auth on web)
// ---------------------------------------------------------------------------

const FREE_LICENSE: LicenseInfo = {
	plan: "free",
	status: "active",
	credits: {
		planCredits: 0,
		topUpCredits: 0,
		totalCredits: 0,
		planCreditsResetAt: "",
	},
	user: null,
};

const licenseAdapter: PlatformLicenseAPI = {
	async check() {
		return FREE_LICENSE;
	},
	async activate() {
		return false;
	},
	async deactivate() {
		return false;
	},
	async trackUsage() {
		return true;
	},
	async deductCredits() {
		return false;
	},
	async setAuthToken() {
		return false;
	},
	async clearAuthToken() {
		return true;
	},
	async getAuthToken() {
		return "";
	},
	async emailLogin() {
		return { success: false, error: "Authentication not available in browser" };
	},
	async emailSignup() {
		return { success: false, error: "Authentication not available in browser" };
	},
	async getGoogleLoginUrl() {
		return "";
	},
	onActivationToken: undefined,
};

// ---------------------------------------------------------------------------
// AI Pipeline — graceful stub (web-capable via direct API)
// ---------------------------------------------------------------------------

const aiPipelineAdapter: PlatformAIPipelineAPI = {
	async check() {
		return { available: false, error: "AI pipeline not available in browser" };
	},
	async status() {
		return {
			available: false,
			version: null,
			source: "unavailable" as const,
			compatible: false,
			features: {},
			error: "AI pipeline not available in browser",
		};
	},
	async generate() {
		return { success: false, error: "AI pipeline not available in browser" };
	},
	async listModels() {
		return [];
	},
	async estimateCost() {
		return null;
	},
	async cancel() {
		return false;
	},
	async refresh() {
		return {
			available: false,
			version: null,
			source: "unavailable" as const,
			compatible: false,
			features: {},
		};
	},
	onProgress() {
		return () => {};
	},
};

// ---------------------------------------------------------------------------
// GitHub — graceful stub (web-capable via direct API)
// ---------------------------------------------------------------------------

const githubAdapter: PlatformGitHubAPI = {
	async fetchStars() {
		try {
			const res = await fetch(
				"https://api.github.com/repos/Quriosity-agent/qcut"
			);
			if (!res.ok) return { stars: 0 };
			const data = await res.json();
			return {
				stars: data.stargazers_count ?? 0,
				url: data.html_url,
			};
		} catch {
			return { stars: 0 };
		}
	},
};

// ---------------------------------------------------------------------------
// Graceful stubs for web-capable APIs not yet fully implemented
// These return safe defaults instead of throwing.
// ---------------------------------------------------------------------------

const soundsGraceful = createGracefulNamespace<PlatformSoundsAPI>();
const audioGraceful = createGracefulNamespace<PlatformAudioAPI>();
const videoGraceful = createGracefulNamespace<PlatformVideoAPI>();
const screenshotGraceful = createGracefulNamespace<PlatformScreenshotAPI>();
const screenRecordingGraceful =
	createGracefulNamespace<PlatformScreenRecordingAPI>();
const ffmpegGraceful = createGracefulNamespace<PlatformFFmpegAPI>();
const transcriptionGraceful =
	createGracefulNamespace<PlatformTranscriptionAPI>();
const falGraceful = createGracefulNamespace<PlatformFalAPI>();
const geminiChatGraceful: PlatformGeminiChatAPI = {
	async send() {
		return { success: false, error: "Gemini chat is unavailable in this browser." };
	},
	async suggestGapPrompt() {
		return null;
	},
	async describeFrame() {
		return null;
	},
	onStreamChunk() {},
	onStreamComplete() {},
	onStreamError() {},
	removeListeners() {},
};
const videoSearchGraceful: PlatformVideoSearchAPI = {
	async search() {
		return { results: [], error: "Video search is unavailable in this browser." };
	},
	async indexMedia(_projectId, mediaId) {
		return {
			status: "unavailable",
			mediaId,
			error: "Video search is unavailable in this browser.",
		};
	},
	async cancelIndexing() {},
	async indexStatus() {
		return { indexedMediaIds: [] };
	},
	async deleteIndex() {
		return { ok: false };
	},
	async providerStatus() {
		return { name: "unavailable", available: false };
	},
	onIndexProgress() {},
	removeListeners() {},
};
const wallpapersGraceful: PlatformWallpapersAPI = {
	isAvailable: () => false,
	list: async () => [],
	upload: async () => null,
	delete: async () => false,
	pick: async () => null,
};
const mediaImportGraceful: PlatformMediaImportAPI = {
	async import() {
		return null as any;
	},
	async validateSymlink() {
		return null as any;
	},
	async locateOriginal() {
		return null;
	},
	async relinkMedia() {
		return null as any;
	},
	async remove() {
		return null as any;
	},
	async checkSymlinkSupport() {
		return null as any;
	},
	async getMediaPath() {
		return null as any;
	},
	async cacheRemoteMedia(options: {
		url: string;
		operationId: string;
		name?: string;
	}) {
		try {
			const response = await fetch(options.url, { mode: "cors" });
			if (!response.ok) return null;
			const blob = await response.blob();
			const mediaUrl = URL.createObjectURL(blob);
			const urlName = new URL(options.url).pathname.split("/").pop();
			return {
				name: options.name || urlName || options.operationId,
				path: mediaUrl,
				size: blob.size,
				mimeType: blob.type || undefined,
				mediaUrl,
			};
		} catch {
			return null;
		}
	},
};

// ---------------------------------------------------------------------------
// Desktop-only stubs (throw PlatformUnsupportedError)
// These are truly desktop-only and calling code must gate on isElectron.
// ---------------------------------------------------------------------------

const youtubeStub = createUnsupportedNamespace<PlatformYouTubeAPI>(
	PlatformCapability.YouTube
);
const ptyStub = createUnsupportedNamespace<PlatformPtyAPI>(
	PlatformCapability.Pty
);
const mcpStub = createUnsupportedNamespace<PlatformMcpAPI>(
	PlatformCapability.Mcp
);
const skillsStub = createUnsupportedNamespace<PlatformSkillsAPI>(
	PlatformCapability.Skills
);
const projectFolderStub = createUnsupportedNamespace<PlatformProjectFolderAPI>(
	PlatformCapability.ProjectFolder
);
// projectJson uses graceful stub — called during project load, must not crash
const projectJsonGraceful = createGracefulNamespace<PlatformProjectJsonAPI>();
const remotionFolderStub =
	createUnsupportedNamespace<PlatformRemotionFolderAPI>(
		PlatformCapability.RemotionFolder
	);
const moyinStub = createUnsupportedNamespace<PlatformMoyinAPI>(
	PlatformCapability.Moyin
);
const updatesStub = createUnsupportedNamespace<PlatformUpdatesAPI>(
	PlatformCapability.Updates
);

// ---------------------------------------------------------------------------
// Exported adapter
// ---------------------------------------------------------------------------

export function createWebAdapter(): PlatformAPI {
	const { storage, apiKeys } = createIndexedDbNamespaces();

	return {
		platform: "web",
		isElectron: false,
		hasCapability: (cap: PlatformCapability) => isPlatformCapable("web", cap),
		getPathForFile: (file: File) => URL.createObjectURL(file),
		analyzeFillers: async () => ({ filteredWordIds: [] }),

		// Fully implemented for web
		files: filesAdapter,
		storage,
		theme: themeAdapter,
		shell: shellAdapter,
		apiKeys,
		license: licenseAdapter,
		github: githubAdapter,
		aiPipeline: aiPipelineAdapter,

		// Graceful stubs — web-capable but not yet fully implemented
		// Return safe defaults instead of throwing
		sounds: soundsGraceful,
		audio: audioGraceful,
		video: videoGraceful,
		screenshot: screenshotGraceful,
		screenRecording: screenRecordingGraceful,
		ffmpeg: ffmpegGraceful,
		transcription: transcriptionGraceful,
		fal: falGraceful,
		geminiChat: geminiChatGraceful,
		videoSearch: videoSearchGraceful,
		wallpapers: wallpapersGraceful,
		mediaImport: mediaImportGraceful,

		// Desktop-only stubs — throw PlatformUnsupportedError
		youtube: youtubeStub,
		pty: ptyStub,
		mcp: mcpStub,
		skills: skillsStub,
		projectFolder: projectFolderStub,
		projectJson: projectJsonGraceful,
		remotionFolder: remotionFolderStub,
		moyin: moyinStub,
		updates: updatesStub,
		piAgent: undefined,
		claude: undefined,
	};
}
