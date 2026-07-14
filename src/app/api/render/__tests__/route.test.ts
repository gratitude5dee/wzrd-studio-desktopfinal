import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WebRenderJobRecord } from "../_lib/jobs";
import {
	BATCH_ID,
	JOB_ID,
	OTHER_USER_ID,
	PROJECT_ID,
	USER_ID,
	makeClipperManifest,
} from "../_lib/__tests__/fixtures";

const supabaseMocks = vi.hoisted(() => ({
	createAdminClient: vi.fn(),
	createServerClient: vi.fn(),
	getUser: vi.fn(),
	from: vi.fn(),
	info: vi.fn(),
	createSignedUrl: vi.fn(),
	rpc: vi.fn(),
	inserted: [] as Record<string, unknown>[],
	missingRenderContract: false,
	projects: [] as Record<string, unknown>[],
	jobs: [] as WebRenderJobRecord[],
	signedUrlCounter: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
	createClient: supabaseMocks.createAdminClient,
}));

vi.mock("@/integrations/supabase/server", () => ({
	createSupabaseServerClient: supabaseMocks.createServerClient,
}));

import { POST as enqueueRender } from "../route";
import { POST as cancelRender } from "../cancel/route";
import { POST as retryRender } from "../retry/route";
import { GET as getRenderStatus } from "../status/route";

const IDEMPOTENCY_HASH = "a".repeat(64);

interface QueryState {
	table: string;
	filters: Array<[string, unknown]>;
	inFilters: Array<[string, readonly unknown[]]>;
	gteFilters: Array<[string, string]>;
	insertValue: Record<string, unknown> | null;
	limit: number | null;
	order: { column: string; ascending: boolean } | null;
}

type QueryResult = {
	data: unknown;
	error: { code?: string; message?: string } | null;
};

function readJson(response: Response) {
	return response.json() as Promise<Record<string, unknown>>;
}

function makeJob(
	overrides: Partial<WebRenderJobRecord> = {}
): WebRenderJobRecord {
	return {
		id: JOB_ID,
		idempotency_hash: IDEMPOTENCY_HASH,
		user_id: USER_ID,
		project_id: PROJECT_ID,
		status: "queued",
		storage_path: null,
		error: null,
		request: makeClipperManifest(),
		result: {},
		kind: "clipper_vertical",
		manifest_schema_version: 1,
		batch_id: null,
		batch_index: null,
		batch_total: null,
		progress: 0,
		stage: null,
		progress_message: null,
		attempts: 0,
		max_attempts: 3,
		retry_at: null,
		generation: 0,
		started_at: null,
		completed_at: null,
		cancel_requested: false,
		output_storage_path: null,
		output_bytes: null,
		output_duration_seconds: null,
		output_width: null,
		output_height: null,
		output_sha256: null,
		error_code: null,
		error_message: null,
		created_at: "2026-07-14T22:00:00.000Z",
		updated_at: "2026-07-14T22:00:00.000Z",
		...overrides,
	};
}

function missingContractResult(): QueryResult {
	return {
		data: null,
		error: {
			code: "PGRST204",
			message: "Could not find the 'generation' column of web_render_jobs",
		},
	};
}

function matchesFilters(
	row: object,
	state: QueryState
): boolean {
	const record = row as unknown as Record<string, unknown>;
	return (
		state.filters.every(([column, value]) => record[column] === value) &&
		state.inFilters.every(([column, values]) => values.includes(record[column])) &&
		state.gteFilters.every(
			([column, value]) => String(record[column] ?? "") >= value
		)
	);
}

function resolveRows(state: QueryState): QueryResult {
	if (state.table === "web_render_jobs" && supabaseMocks.missingRenderContract) {
		return missingContractResult();
	}
	const source =
		state.table === "projects"
			? supabaseMocks.projects
			: state.table === "web_render_jobs"
				? supabaseMocks.jobs
				: [];
	let rows = source.filter((row) => matchesFilters(row, state));
	if (state.order) {
		const { column, ascending } = state.order;
		rows = [...rows].sort((left, right) => {
			const leftRecord = left as unknown as Record<string, unknown>;
			const rightRecord = right as unknown as Record<string, unknown>;
			const comparison =
				Number(leftRecord[column] ?? 0) - Number(rightRecord[column] ?? 0);
			return ascending ? comparison : -comparison;
		});
	}
	if (state.limit !== null) rows = rows.slice(0, state.limit);
	return { data: rows, error: null };
}

function makeQueryBuilder(table: string) {
	const state: QueryState = {
		table,
		filters: [],
		inFilters: [],
		gteFilters: [],
		insertValue: null,
		limit: null,
		order: null,
	};
	const builder = {
		select: vi.fn(() => builder),
		eq: vi.fn((column: string, value: unknown) => {
			state.filters.push([column, value]);
			return builder;
		}),
		in: vi.fn((column: string, values: readonly unknown[]) => {
			state.inFilters.push([column, values]);
			return builder;
		}),
		gte: vi.fn((column: string, value: string) => {
			state.gteFilters.push([column, value]);
			return builder;
		}),
		order: vi.fn(
			(column: string, options?: { ascending?: boolean }) => {
				state.order = { column, ascending: options?.ascending !== false };
				return builder;
			}
		),
		limit: vi.fn((limit: number) => {
			state.limit = limit;
			return builder;
		}),
		insert: vi.fn((value: Record<string, unknown>) => {
			state.insertValue = value;
			supabaseMocks.inserted.push(value);
			return builder;
		}),
		maybeSingle: vi.fn(async () => {
			const result = resolveRows(state);
			return result.error
				? result
				: {
						data: (result.data as Record<string, unknown>[])[0] ?? null,
						error: null,
					};
		}),
		single: vi.fn(async () => {
			if (state.table === "web_render_jobs" && supabaseMocks.missingRenderContract) {
				return missingContractResult();
			}
			if (state.table === "web_render_jobs" && state.insertValue) {
				const row = makeJob({
					...(state.insertValue as Partial<WebRenderJobRecord>),
					id: JOB_ID,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				});
				supabaseMocks.jobs.push(row);
				return { data: row, error: null };
			}
			const result = resolveRows(state);
			return result.error
				? result
				: {
						data: (result.data as Record<string, unknown>[])[0] ?? null,
						error: null,
					};
		}),
		then: (
			onFulfilled?: (value: QueryResult) => unknown,
			onRejected?: (reason: unknown) => unknown
		) => Promise.resolve(resolveRows(state)).then(onFulfilled, onRejected),
	};
	return builder;
}

function createAdminMock() {
	return {
		from: supabaseMocks.from,
		rpc: supabaseMocks.rpc,
		storage: {
			from: vi.fn(() => ({
				info: supabaseMocks.info,
				createSignedUrl: supabaseMocks.createSignedUrl,
			})),
		},
	};
}

function makePostRequest(path: string, body: Record<string, unknown>) {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: {
			Authorization: "Bearer access-token",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	}) as NextRequest;
}

describe("secure render API routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.SUPABASE_URL = "https://project.supabase.co";
		process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
		supabaseMocks.inserted = [];
		supabaseMocks.missingRenderContract = false;
		supabaseMocks.projects = [{ id: PROJECT_ID, user_id: USER_ID }];
		supabaseMocks.jobs = [];
		supabaseMocks.signedUrlCounter = 0;
		supabaseMocks.getUser.mockResolvedValue({
			data: { user: { id: USER_ID, email: "user@example.com" } },
			error: null,
		});
		supabaseMocks.createServerClient.mockReturnValue({
			auth: { getUser: supabaseMocks.getUser },
		});
		supabaseMocks.from.mockImplementation((table: string) =>
			makeQueryBuilder(table)
		);
		supabaseMocks.info.mockResolvedValue({ data: { size: 1024 }, error: null });
		supabaseMocks.createSignedUrl.mockImplementation(
			async (_path: string, _ttl: number, options?: { cacheNonce?: string }) => ({
				data: {
					signedUrl: `https://signed.example/${++supabaseMocks.signedUrlCounter}?nonce=${options?.cacheNonce}`,
				},
				error: null,
			})
		);
		supabaseMocks.rpc.mockImplementation(
			async (functionName: string, args: Record<string, unknown>) => {
				if (functionName === "enqueue_web_render_job") {
					if (supabaseMocks.missingRenderContract) {
						return { data: null, error: { code: "PGRST202", message: "function not found" } };
					}
					const queued = supabaseMocks.jobs.filter((row) => row.status === "queued").length;
					const running = supabaseMocks.jobs.filter((row) => row.status === "running").length;
					const hourly = supabaseMocks.jobs.filter(
						(row) => Date.now() - new Date(row.created_at).getTime() <= 60 * 60 * 1_000
					).length;
					if (queued >= 10 || running >= 2) {
						return { data: null, error: { code: "P0001", message: "render_active_quota_exceeded" } };
					}
					if (hourly >= 25) {
						return { data: null, error: { code: "P0001", message: "render_hourly_quota_exceeded" } };
					}
					const created = makeJob({
						idempotency_hash: String(args.p_idempotency_hash),
						request: args.p_manifest,
						kind: String(args.p_kind),
						manifest_schema_version: Number(args.p_manifest_schema_version),
					});
					supabaseMocks.jobs.push(created);
					supabaseMocks.inserted.push({
						user_id: USER_ID,
						project_id: PROJECT_ID,
						idempotency_hash: args.p_idempotency_hash,
						request: args.p_manifest,
						kind: args.p_kind,
						manifest_schema_version: args.p_manifest_schema_version,
					});
					return { data: [created], error: null };
				}
				const job = supabaseMocks.jobs.find(
					(row) => row.id === args.p_job_id && row.user_id === args.p_user_id
				);
				if (!job) return { data: [], error: null };
				if (functionName === "cancel_web_render_job") {
					if (job.status === "queued") {
						job.status = "cancelled";
						job.completed_at = new Date().toISOString();
						job.stage = "cancelled";
					} else if (job.status === "running") {
						job.cancel_requested = true;
						job.stage = "cancelling";
					}
					return { data: [job], error: null };
				}
				if (functionName === "retry_web_render_job") {
					job.status = "queued";
					job.attempts = 0;
					job.generation += 1;
					job.cancel_requested = false;
					job.error_code = null;
					job.error_message = null;
					return { data: [job], error: null };
				}
				return { data: [], error: null };
			}
		);
		supabaseMocks.createAdminClient.mockReturnValue(createAdminMock());
	});

	it("queues through the admin client with an owned manifest and server hash", async () => {
		const response = await enqueueRender(
			makePostRequest("/api/render", {
				projectId: PROJECT_ID,
				manifest: makeClipperManifest(),
				idempotencyHash: "f".repeat(64),
			})
		);
		const body = await readJson(response);

		expect(response.status).toBe(202);
		expect(body).toMatchObject({
			idempotent: false,
			job: { id: JOB_ID, projectId: PROJECT_ID, status: "queued" },
		});
		expect(supabaseMocks.info).toHaveBeenCalledWith(
			`${USER_ID}/projects/${PROJECT_ID}/source.mp4`
		);
		expect(supabaseMocks.inserted).toEqual([
			expect.objectContaining({
				user_id: USER_ID,
				project_id: PROJECT_ID,
				kind: "clipper_vertical",
				manifest_schema_version: 1,
				request: makeClipperManifest(),
			}),
		]);
		expect(supabaseMocks.inserted[0]?.idempotency_hash).not.toBe("f".repeat(64));
	});

	it("fails closed at the route when the service role is missing", async () => {
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		const response = await enqueueRender(
			makePostRequest("/api/render", { manifest: makeClipperManifest() })
		);

		expect(response.status).toBe(500);
		await expect(readJson(response)).resolves.toMatchObject({
			error: "server_misconfigured",
		});
		expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
		expect(supabaseMocks.inserted).toEqual([]);
	});

	it("returns an idempotent job before consuming quota", async () => {
		const requestBody = { manifest: makeClipperManifest() };
		const first = await enqueueRender(makePostRequest("/api/render", requestBody));
		expect(first.status).toBe(202);

		supabaseMocks.jobs.push(
			...Array.from({ length: 10 }, (_, index) =>
				makeJob({
					id: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
					idempotency_hash: String(index).padStart(64, "0"),
				})
			)
		);
		const second = await enqueueRender(makePostRequest("/api/render", requestBody));
		const body = await readJson(second);

		expect(second.status).toBe(200);
		expect(body).toMatchObject({ idempotent: true, job: { id: JOB_ID } });
	});

	it("enforces active and hourly per-user quotas", async () => {
		supabaseMocks.jobs = Array.from({ length: 10 }, (_, index) =>
			makeJob({
				id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
				idempotency_hash: `${index}`.padStart(64, "0"),
			})
		);
		const active = await enqueueRender(
			makePostRequest("/api/render", { manifest: makeClipperManifest() })
		);
		expect(active.status).toBe(429);
		await expect(readJson(active)).resolves.toMatchObject({ error: "quota_exceeded" });

		supabaseMocks.jobs = Array.from({ length: 25 }, (_, index) =>
			makeJob({
				id: `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
				idempotency_hash: `${index + 100}`.padStart(64, "0"),
				status: "succeeded",
				created_at: new Date().toISOString(),
			})
		);
		const hourly = await enqueueRender(
			makePostRequest("/api/render", { manifest: makeClipperManifest() })
		);
		expect(hourly.status).toBe(429);
		await expect(readJson(hourly)).resolves.toMatchObject({ error: "quota_exceeded" });
	});

	it("rejects foreign asset paths before storage lookup", async () => {
		const response = await enqueueRender(
			makePostRequest("/api/render", {
				manifest: makeClipperManifest(OTHER_USER_ID),
			})
		);

		expect(response.status).toBe(403);
		await expect(readJson(response)).resolves.toMatchObject({
			error: "asset_not_owned",
		});
		expect(supabaseMocks.info).not.toHaveBeenCalled();
	});

	it("preserves render_jobs_unavailable for an unapplied contract migration", async () => {
		supabaseMocks.missingRenderContract = true;
		const response = await enqueueRender(
			makePostRequest("/api/render", { manifest: makeClipperManifest() })
		);

		expect(response.status).toBe(503);
		await expect(readJson(response)).resolves.toMatchObject({
			error: "render_jobs_unavailable",
		});
	});

	it("mints a different five-minute signed URL on every succeeded status read", async () => {
		const outputPath = `${USER_ID}/${PROJECT_ID}/${IDEMPOTENCY_HASH}/attempts/3-0.mp4`;
		supabaseMocks.jobs = [
			makeJob({
				status: "succeeded",
				attempts: 3,
				output_storage_path: outputPath,
				output_bytes: 2048,
				output_duration_seconds: 5,
				output_width: 1080,
				output_height: 1920,
				output_sha256: "e".repeat(64),
			}),
		];

		const first = await getRenderStatus(
			new NextRequest(`http://localhost/api/render/status?jobId=${JOB_ID}`, {
				headers: { Authorization: "Bearer access-token" },
			})
		);
		const second = await getRenderStatus(
			new NextRequest(`http://localhost/api/render/status?jobId=${JOB_ID}`, {
				headers: { Authorization: "Bearer access-token" },
			})
		);
		const firstBody = await readJson(first);
		const secondBody = await readJson(second);
		const firstUrl = (firstBody.job as { signedUrl: string }).signedUrl;
		const secondUrl = (secondBody.job as { signedUrl: string }).signedUrl;

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(firstUrl).not.toBe(secondUrl);
		expect(supabaseMocks.createSignedUrl).toHaveBeenNthCalledWith(
			1,
			outputPath,
			300,
			expect.objectContaining({ cacheNonce: expect.any(String) })
		);
		expect(supabaseMocks.jobs[0]).not.toHaveProperty("signed_url");
	});

	it("returns only owned jobs in batch order with aggregate progress", async () => {
		supabaseMocks.jobs = [
			makeJob({
				id: "80000000-0000-4000-8000-000000000002",
				batch_id: BATCH_ID,
				batch_index: 1,
				batch_total: 2,
				progress: 50,
				status: "running",
			}),
			makeJob({
				id: "80000000-0000-4000-8000-000000000001",
				batch_id: BATCH_ID,
				batch_index: 0,
				batch_total: 2,
				progress: 100,
				status: "failed",
			}),
			makeJob({
				id: "80000000-0000-4000-8000-000000000003",
				user_id: OTHER_USER_ID,
				batch_id: BATCH_ID,
				batch_index: 0,
				batch_total: 1,
			}),
		];

		const response = await getRenderStatus(
			new NextRequest(`http://localhost/api/render/status?batchId=${BATCH_ID}`, {
				headers: { Authorization: "Bearer access-token" },
			})
		);
		const body = await readJson(response);
		const jobs = body.jobs as Array<{ id: string; userId: string }>;

		expect(response.status).toBe(200);
		expect(jobs.map((job) => job.id)).toEqual([
			"80000000-0000-4000-8000-000000000001",
			"80000000-0000-4000-8000-000000000002",
		]);
		expect(jobs.every((job) => job.userId === USER_ID)).toBe(true);
		expect(body.batch).toMatchObject({ status: "running", progress: 75, total: 2 });
	});

	it("cancels queued/running jobs and retries only owner terminal jobs", async () => {
		supabaseMocks.jobs = [makeJob()];
		const cancelled = await cancelRender(
			makePostRequest("/api/render/cancel", { jobId: JOB_ID })
		);
		expect(cancelled.status).toBe(200);
		await expect(readJson(cancelled)).resolves.toMatchObject({
			job: { status: "cancelled" },
		});

		const retried = await retryRender(
			makePostRequest("/api/render/retry", { jobId: JOB_ID })
		);
		expect(retried.status).toBe(200);
		await expect(readJson(retried)).resolves.toMatchObject({
			job: { status: "queued", attempts: 0, generation: 1 },
		});
		expect(supabaseMocks.rpc).toHaveBeenCalledWith("cancel_web_render_job", {
			p_job_id: JOB_ID,
			p_user_id: USER_ID,
		});
		expect(supabaseMocks.rpc).toHaveBeenCalledWith("retry_web_render_job", {
			p_job_id: JOB_ID,
			p_user_id: USER_ID,
		});
	});
});
