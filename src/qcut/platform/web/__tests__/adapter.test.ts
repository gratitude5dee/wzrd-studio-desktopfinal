import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { createWebAdapter } from "../index";
import {
	PlatformCapability,
	PlatformUnsupportedError,
} from "@qcut/platform-core";

describe("createWebAdapter", () => {
	let adapter: ReturnType<typeof createWebAdapter>;

	beforeEach(() => {
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			value: new IDBFactory(),
		});
		Object.defineProperty(window, "open", {
			configurable: true,
			value: vi.fn(),
		});
		localStorage.clear();
		adapter = createWebAdapter();
	});

	it("reports platform as web", () => {
		expect(adapter.platform).toBe("web");
		expect(adapter.isElectron).toBe(false);
	});

	it("has storage capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Storage)).toBe(true);
	});

	it("has theme capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Theme)).toBe(true);
	});

	it("has shell capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Shell)).toBe(true);
	});

	it("has license capability", () => {
		expect(adapter.hasCapability(PlatformCapability.License)).toBe(true);
	});

	it("does not have PTY capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Pty)).toBe(false);
	});

	it("does not have Claude capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Claude)).toBe(false);
		expect(adapter.claude).toBeUndefined();
	});

	it("does not have Updates capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Updates)).toBe(false);
	});

	it("does not have Skills capability", () => {
		expect(adapter.hasCapability(PlatformCapability.Skills)).toBe(false);
	});

	describe("storage interface", () => {
		it("persists values in IndexedDB", async () => {
			await expect(adapter.storage.save("test", { data: true })).resolves.toBe(true);
			await expect(adapter.storage.load("test")).resolves.toEqual({ data: true });
			await expect(adapter.storage.list()).resolves.toContain("test");
		});

		it("removes and clears persisted values", async () => {
			await adapter.storage.save("first", 1);
			await adapter.storage.save("second", 2);

			await expect(adapter.storage.remove("first")).resolves.toBe(true);
			await expect(adapter.storage.load("first")).resolves.toBeNull();
			await expect(adapter.storage.clear()).resolves.toBe(true);
			await expect(adapter.storage.list()).resolves.toEqual([]);
		});

		it("migrates legacy storage and API keys once", async () => {
			localStorage.setItem("qcut:project", JSON.stringify({ id: "project-1" }));
			localStorage.setItem("qcut:plain", "legacy-value");
			localStorage.setItem(
				"qcut:api-keys",
				JSON.stringify({ fal: "fal-key", gemini: "gemini-key" })
			);
			localStorage.setItem("qcut:theme", "dark");

			await expect(adapter.storage.load("project")).resolves.toEqual({
				id: "project-1",
			});
			await expect(adapter.storage.load("plain")).resolves.toBe("legacy-value");
			await expect(adapter.apiKeys.get()).resolves.toEqual({
				fal: "fal-key",
				gemini: "gemini-key",
			});
			await expect(adapter.apiKeys.status()).resolves.toEqual({
				fal: { set: true, source: "indexedDB", shadowedBy: [] },
				gemini: { set: true, source: "indexedDB", shadowedBy: [] },
			});

			expect(localStorage.getItem("qcut:project")).toBeNull();
			expect(localStorage.getItem("qcut:plain")).toBeNull();
			expect(localStorage.getItem("qcut:api-keys")).toBeNull();
			expect(localStorage.getItem("qcut:theme")).toBe("dark");
		});

		it("does not repeat the localStorage migration", async () => {
			localStorage.setItem("qcut:first", JSON.stringify(1));
			await expect(adapter.storage.load("first")).resolves.toBe(1);

			localStorage.setItem("qcut:late", JSON.stringify(2));
			const secondAdapter = createWebAdapter();

			await expect(secondAdapter.storage.load("late")).resolves.toBeNull();
			expect(localStorage.getItem("qcut:late")).toBe("2");
		});
	});

	describe("theme interface", () => {
		it("get returns a theme source", async () => {
			const theme = await adapter.theme.get();
			expect(["system", "light", "dark"]).toContain(theme);
		});

		it("isDark returns boolean", async () => {
			const result = await adapter.theme.isDark();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("shell", () => {
		it("openExternal does not throw", async () => {
			await expect(
				adapter.shell.openExternal("https://example.com")
			).resolves.not.toThrow();
		});

		it("showItemInFolder does not throw (no-op)", async () => {
			await expect(
				adapter.shell.showItemInFolder("/some/path")
			).resolves.not.toThrow();
		});
	});

	describe("files interface", () => {
		it("readFile returns null for web", async () => {
			const result = await adapter.files.readFile("/any/path");
			expect(result).toBeNull();
		});

		it("writeFile returns false for web", async () => {
			const result = await adapter.files.writeFile("/path", "data");
			expect(result).toBe(false);
		});

		it("getFileInfo returns null for web", async () => {
			const result = await adapter.files.getFileInfo("/path");
			expect(result).toBeNull();
		});
	});

	describe("license interface", () => {
		it("check returns free plan", async () => {
			const info = await adapter.license.check();
			expect(info.plan).toBe("free");
			expect(info.status).toBe("active");
		});

		it("activate returns false", async () => {
			const result = await adapter.license.activate("token");
			expect(result).toBe(false);
		});

		it("emailLogin returns error", async () => {
			const result = await adapter.license.emailLogin("a@b.c", "pass");
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("onActivationToken is undefined", () => {
			expect(adapter.license.onActivationToken).toBeUndefined();
		});
	});

	describe("github interface", () => {
		it("fetchStars returns a number", async () => {
			const result = await adapter.github.fetchStars();
			expect(typeof result.stars).toBe("number");
		});
	});

	describe("aiPipeline interface", () => {
		it("check returns unavailable", async () => {
			const result = await adapter.aiPipeline.check();
			expect(result.available).toBe(false);
		});

		it("status returns unavailable source", async () => {
			const result = await adapter.aiPipeline.status();
			expect(result.source).toBe("unavailable");
		});

		it("onProgress returns cleanup function", () => {
			const cleanup = adapter.aiPipeline.onProgress(() => {});
			expect(typeof cleanup).toBe("function");
		});
	});

	describe("graceful stubs (web-capable, not yet implemented)", () => {
		it("sounds methods return null instead of throwing", async () => {
			const result = await adapter.sounds.search({ query: "test" });
			expect(result).toBeNull();
		});

		it("ffmpeg methods return null instead of throwing", async () => {
			const result = await adapter.ffmpeg.createExportSession();
			expect(result).toBeNull();
		});

		it("geminiChat event listeners are no-ops", () => {
			expect(() => {
				adapter.geminiChat.onStreamChunk(() => {});
			}).not.toThrow();
		});

		it("geminiChat removeListeners is no-op", () => {
			expect(() => {
				adapter.geminiChat.removeListeners();
			}).not.toThrow();
		});

		it("returns graceful unavailable results for migrated desktop namespaces", async () => {
			await expect(
				adapter.videoSearch.search("project-1", "opening shot")
			).resolves.toMatchObject({ results: [], error: expect.any(String) });
			await expect(adapter.videoSearch.providerStatus()).resolves.toEqual({
				name: "unavailable",
				available: false,
			});
			expect(adapter.wallpapers.isAvailable()).toBe(false);
			await expect(adapter.wallpapers.list()).resolves.toEqual([]);
			await expect(
				adapter.geminiChat.suggestGapPrompt({
					gapDuration: 2,
					mode: "text-to-video",
				})
			).resolves.toBeNull();
		});

		it("video methods return null", async () => {
			const result = await adapter.video.verifyFile("/path");
			expect(result).toBeNull();
		});

		it("transcription methods return null", async () => {
			const result = await adapter.transcription.cancel("id");
			expect(result).toBeNull();
		});

		it("mediaImport methods return null", async () => {
			const result = await adapter.mediaImport.checkSymlinkSupport();
			expect(result).toBeNull();
		});
	});

	describe("desktop-only stubs", () => {
		it("pty.spawn throws PlatformUnsupportedError", () => {
			expect(() => adapter.pty.spawn()).toThrow(PlatformUnsupportedError);
		});

		it("skills.list throws PlatformUnsupportedError", () => {
			expect(() => adapter.skills.list("proj")).toThrow(
				PlatformUnsupportedError
			);
		});

		it("updates.checkForUpdates throws PlatformUnsupportedError", () => {
			expect(() => adapter.updates.checkForUpdates()).toThrow(
				PlatformUnsupportedError
			);
		});

		it("moyin.parseScript throws PlatformUnsupportedError", () => {
			expect(() => adapter.moyin.parseScript({})).toThrow(
				PlatformUnsupportedError
			);
		});

		it("remotionFolder.select throws PlatformUnsupportedError", () => {
			expect(() => adapter.remotionFolder.select()).toThrow(
				PlatformUnsupportedError
			);
		});
	});

	describe("getPathForFile", () => {
		it("returns a blob URL for a File object", () => {
			const file = new File(["test"], "test.txt", { type: "text/plain" });
			const url = adapter.getPathForFile(file);
			expect(url).toContain("blob:");
		});
	});

	describe("analyzeFillers", () => {
		it("returns empty filteredWordIds", async () => {
			const result = await adapter.analyzeFillers({
				words: [],
				languageCode: "en",
			} as any);
			expect(result).toEqual({ filteredWordIds: [] });
		});
	});
});
