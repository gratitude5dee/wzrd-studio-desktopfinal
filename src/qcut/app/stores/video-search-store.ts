/**
 * Video Semantic Search Store — manages state for visual/semantic search.
 *
 * Handles embedding-based search queries, indexing progress, and results.
 * Uses Gemini Embedding 2 via Electron IPC for video indexing and search.
 *
 * @module stores/video-search-store
 */

import { create } from "zustand";
import { platform } from "@qcut/platform-core";

// ── Types ────────────────────────────────────────────────────────────

export interface VideoSearchResult {
	mediaId: string;
	mediaName: string;
	chunkIndex: number;
	startTime: number;
	endTime: number;
	score: number;
	thumbnailPath?: string;
}

export interface IndexingProgress {
	phase: "chunking" | "embedding" | "saving";
	current: number;
	total: number;
	mediaId?: string;
	mediaName?: string;
}

interface VideoSearchState {
	query: string;
	results: VideoSearchResult[];
	isSearching: boolean;
	searchError: string | null;

	isIndexing: boolean;
	indexingProgress: IndexingProgress | null;
	indexedMediaIds: string[];

	providerAvailable: boolean | null;
}

interface VideoSearchActions {
	setQuery: (query: string) => void;
	search: (projectId: string) => Promise<void>;
	indexMedia: (
		projectId: string,
		mediaId: string,
		mediaPath: string,
		mediaName: string,
		totalDuration: number
	) => Promise<void>;
	cancelIndexing: (projectId: string) => Promise<void>;
	loadIndexedStatus: (projectId: string) => Promise<void>;
	checkProvider: () => Promise<void>;
	clearResults: () => void;
	setupListeners: () => void;
	cleanupListeners: () => void;
}

// ── Store ────────────────────────────────────────────────────────────

export const useVideoSearchStore = create<
	VideoSearchState & VideoSearchActions
>((set, get) => ({
	// State
	query: "",
	results: [],
	isSearching: false,
	searchError: null,
	isIndexing: false,
	indexingProgress: null,
	indexedMediaIds: [],
	providerAvailable: null,

	// Actions
	setQuery: (query) => set({ query }),

	search: async (projectId) => {
		const { query } = get();
		if (!query.trim()) {
			set({ results: [], searchError: null });
			return;
		}

		set({ isSearching: true, searchError: null });

		try {
			const response = await platform().videoSearch.search(
				projectId,
				query.trim()
			);

			if (response.error) {
				set({ results: [], searchError: response.error, isSearching: false });
				return;
			}

			set({ results: response.results, isSearching: false });
		} catch (err) {
			set({
				searchError: err instanceof Error ? err.message : "Search failed",
				isSearching: false,
			});
		}
	},

	indexMedia: async (
		projectId,
		mediaId,
		mediaPath,
		mediaName,
		totalDuration
	) => {
		set({ isIndexing: true, indexingProgress: null });

		try {
			const result = await platform().videoSearch.indexMedia(
				projectId,
				mediaId,
				mediaPath,
				mediaName,
				totalDuration
			);

			if (result.status === "indexed") {
				set((state) => ({
					indexedMediaIds: [...state.indexedMediaIds, mediaId],
				}));
			}
		} catch (err) {
			console.error("[VideoSearch] Index error:", err);
		} finally {
			set({ isIndexing: false, indexingProgress: null });
		}
	},

	cancelIndexing: async (projectId) => {
		await platform().videoSearch.cancelIndexing(projectId);
		set({ isIndexing: false, indexingProgress: null });
	},

	loadIndexedStatus: async (projectId) => {
		try {
			const { indexedMediaIds } = await platform().videoSearch.indexStatus(projectId);
			set({ indexedMediaIds });
		} catch {
			// Ignore
		}
	},

	checkProvider: async () => {
		try {
			const { available } = await platform().videoSearch.providerStatus();
			set({ providerAvailable: available });
		} catch {
			set({ providerAvailable: false });
		}
	},

	clearResults: () => set({ results: [], searchError: null, query: "" }),

	setupListeners: () => {
		platform().videoSearch.onIndexProgress((progress) => {
			set({ indexingProgress: progress as IndexingProgress });
		});
	},

	cleanupListeners: () => {
		platform().videoSearch.removeListeners();
	},
}));
