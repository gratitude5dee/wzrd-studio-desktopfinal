import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	file: null as File | null,
	metadata: null as Record<string, unknown> | null,
	metadataSet: vi.fn(),
	platform: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: mocks.platform,
}));

vi.mock("@qcut-app/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
	debugWarn: vi.fn(),
}));

vi.mock("./indexeddb-adapter", () => ({
	IndexedDBAdapter: class {
		constructor(
			private readonly _dbName: string,
			private readonly storeName: string
		) {}

		async list() {
			return [];
		}

		async get() {
			return this.storeName === "media-metadata" ? mocks.metadata : null;
		}

		async set(_key: string, value: unknown) {
			if (this.storeName === "media-metadata") mocks.metadataSet(value);
		}

		async remove() {}
		async clear() {}
	},
}));

vi.mock("./opfs-adapter", () => ({
	OPFSAdapter: class {
		static isSupported() {
			return true;
		}

		async get() {
			return mocks.file;
		}

		async set() {}
		async remove() {}
		async clear() {}
	},
}));

vi.mock("./localstorage-adapter", () => ({
	LocalStorageAdapter: class {
		async list() {
			return [];
		}
		async get() {
			return null;
		}
		async set() {}
		async remove() {}
		async clear() {}
	},
}));

import { StorageService } from "./storage-service";

describe("StorageService platform boundaries", () => {
	beforeEach(() => {
		mocks.file = {
			name: "clip.mp4",
			type: "video/mp4",
			size: 5,
			lastModified: 1,
			arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
		} as unknown as File;
		mocks.metadata = {
			id: "media-1",
			name: "clip.mp4",
			type: "video",
			size: 5,
			lastModified: 1,
			localPath: "/missing/clip.mp4",
		};
	});

	it("uses platform video methods to restore desktop temp files", async () => {
		const verifyFile = vi.fn().mockResolvedValue(false);
		const saveTemp = vi.fn().mockResolvedValue("/restored/clip.mp4");
		mocks.platform.mockReturnValue({
			isElectron: true,
			video: { verifyFile, saveTemp },
		});

		const service = new StorageService();
		const media = await service.loadMediaItem("project-1", "media-1");

		expect(verifyFile).toHaveBeenCalledWith("/missing/clip.mp4");
		expect(saveTemp).toHaveBeenCalledWith(expect.any(Uint8Array), "clip.mp4");
		expect(media?.localPath).toBe("/restored/clip.mp4");
		expect(mocks.metadataSet).toHaveBeenCalledWith(
			expect.objectContaining({ localPath: "/restored/clip.mp4" })
		);
	});
});
