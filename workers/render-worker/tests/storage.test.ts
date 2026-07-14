import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadAsset, verifyAsset } from "../src/storage.js";
import type { WorkerSupabaseClient } from "../src/supabase.js";
import { PROJECT_ID, USER_ID, makeConfig } from "./fixtures.js";

const directories: string[] = [];

afterEach(async () => {
	vi.unstubAllGlobals();
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("owner-scoped storage transfer", () => {
	it("streams from the authenticated private object endpoint", async () => {
		const directory = await mkdtemp(join(tmpdir(), "wzrd-storage-test-"));
		directories.push(directory);
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { "content-length": "3" },
			})
		);
		vi.stubGlobal("fetch", fetchMock);
		const asset = {
			bucket: "project-assets" as const,
			path: `${USER_ID}/projects/${PROJECT_ID}/source file.mp4`,
		};

		const result = await downloadAsset(
			makeConfig(),
			asset,
			3,
			0,
			directory,
			new AbortController().signal
		);
		expect(fetchMock).toHaveBeenCalledWith(
			`https://project.supabase.co/storage/v1/object/project-assets/${USER_ID}/projects/${PROJECT_ID}/source%20file.mp4`,
			expect.objectContaining({ redirect: "error" })
		);
		expect([...await readFile(result.filePath)]).toEqual([1, 2, 3]);
	});

	it("rejects foreign owner paths before storage metadata lookup", async () => {
		const info = vi.fn();
		const client = {
			storage: { from: vi.fn(() => ({ info })) },
		} as unknown as WorkerSupabaseClient;

		await expect(
			verifyAsset(
				client,
				{
					bucket: "project-assets",
					path: `99999999-9999-4999-8999-999999999999/projects/${PROJECT_ID}/source.mp4`,
				},
				USER_ID
			)
		).rejects.toMatchObject({ code: "asset_not_owned", retryable: false });
		expect(info).not.toHaveBeenCalled();
	});
});
