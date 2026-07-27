import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockRemove = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
		},
		storage: {
			from: vi.fn(() => ({
				upload: mockUpload,
				getPublicUrl: mockGetPublicUrl,
				remove: mockRemove,
			})),
		},
		from: (...args: unknown[]) => mockFrom(...args),
	},
}));

function insertBuilder(data: unknown, error: unknown = null) {
	return {
		insert: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data, error }),
	};
}

describe("registerProjectExport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockUpload.mockResolvedValue({ error: null });
		mockGetPublicUrl.mockReturnValue({
			data: { publicUrl: "https://cdn.example.com/export.mp4" },
		});
		mockRemove.mockResolvedValue({ error: null });
		mockFrom.mockImplementation((table: string) => {
			if (table === "export_jobs") {
				return insertBuilder({ id: "job-1" });
			}
			if (table === "final_project_assets") {
				return insertBuilder({ id: "asset-1" });
			}
			return insertBuilder(null);
		});
	});

	it("uploads the export blob and records completed export rows", async () => {
		const { registerProjectExport } = await import("../project-export-registration");
		const blob = new Blob(["video"], { type: "video/mp4" });

		const result = await registerProjectExport({
			projectId: "project-1",
			qcutProjectId: "wzrd:project-1",
			blob,
			filename: "../Final Export!.mp4",
			format: "mp4",
			engineType: "muxer",
			durationSeconds: 12.25,
			settings: { width: 1920, height: 1080 },
		});

		expect(result.assetId).toBe("asset-1");
		expect(result.publicUrl).toBe("https://cdn.example.com/export.mp4");
		expect(result.storageBucket).toBe("final-exports");
		expect(result.storagePath).toMatch(/^user-1\/project-1\/.+\/.+Final_Export\.mp4$/);

		expect(mockUpload).toHaveBeenCalledWith(
			result.storagePath,
			blob,
			expect.objectContaining({
				contentType: "video/mp4",
				upsert: false,
			})
		);

		const exportJobInsert = mockFrom.mock.results[0].value.insert;
		expect(exportJobInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				project_id: "project-1",
				user_id: "user-1",
				status: "completed",
				progress: 100,
				output_url: "https://cdn.example.com/export.mp4",
				provider: "browser_muxer",
			})
		);

		const finalAssetInsert = mockFrom.mock.results[1].value.insert;
		expect(finalAssetInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				project_id: "project-1",
				user_id: "user-1",
				asset_type: "video",
				file_url: "https://cdn.example.com/export.mp4",
				file_size: blob.size,
				duration_ms: 12250,
				storage_bucket: "final-exports",
				storage_path: result.storagePath,
			})
		);
	});

	it("requires an authenticated user", async () => {
		const { registerProjectExport } = await import("../project-export-registration");
		mockGetUser.mockResolvedValue({
			data: { user: null },
			error: null,
		});

		await expect(
			registerProjectExport({
				projectId: "project-1",
				blob: new Blob(["video"], { type: "video/mp4" }),
				filename: "export.mp4",
			})
		).rejects.toThrow("Not authenticated");

		expect(mockUpload).not.toHaveBeenCalled();
	});

	it("removes uploaded storage when the export job insert fails", async () => {
		const { registerProjectExport } = await import("../project-export-registration");
		mockFrom.mockImplementation((table: string) => {
			if (table === "export_jobs") {
				return insertBuilder(null, { message: "insert failed" });
			}
			return insertBuilder({ id: "asset-1" });
		});

		await expect(
			registerProjectExport({
				projectId: "project-1",
				blob: new Blob(["video"], { type: "video/mp4" }),
				filename: "export.mp4",
			})
		).rejects.toMatchObject({ message: "insert failed" });

		expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^user-1\/project-1\//)]);
	});
});
