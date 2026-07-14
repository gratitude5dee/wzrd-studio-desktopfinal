import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDesktopAdapter } from "./index";

describe("createDesktopAdapter desktop namespace compatibility", () => {
	let electronAPI: Record<string, unknown>;

	beforeEach(() => {
		electronAPI = {
			claude: { search: { loadTranscriptions: vi.fn() } },
			geminiChat: { suggestGapPrompt: vi.fn() },
			videoSearch: { search: vi.fn() },
			wallpapers: {
				list: vi.fn().mockResolvedValue([]),
				upload: vi.fn(),
				delete: vi.fn(),
				pick: vi.fn(),
			},
		};
		(globalThis as typeof globalThis & { electronAPI?: unknown }).electronAPI =
			electronAPI;
	});

	afterEach(() => {
		delete (globalThis as typeof globalThis & { electronAPI?: unknown })
			.electronAPI;
	});

	it("forwards legacy desktop namespaces through the platform adapter", async () => {
		const adapter = createDesktopAdapter();

		expect(adapter.isElectron).toBe(true);
		expect(adapter.geminiChat).toBe(electronAPI.geminiChat);
		expect(adapter.videoSearch).toBe(electronAPI.videoSearch);
		expect(adapter.claude).toBe(electronAPI.claude);
		expect(adapter.wallpapers.isAvailable()).toBe(true);
		await expect(adapter.wallpapers.list()).resolves.toEqual([]);
	});
});
