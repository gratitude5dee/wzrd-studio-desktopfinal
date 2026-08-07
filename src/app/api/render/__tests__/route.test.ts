import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
	createServerClient: vi.fn(),
	getUser: vi.fn(),
	from: vi.fn(),
	inserted: [] as Record<string, unknown>[],
	missingRenderJobsTable: false,
	projects: [] as Record<string, unknown>[],
	jobs: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/server", () => ({
	createSupabaseServerClient: supabaseMocks.createServerClient,
}));

import { POST } from "../route";
import { GET } from "../status/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_HASH = "a".repeat(64);

type QueryResult = {
	data: unknown;
	error: { code?: string; message?: string } | null;
};

interface QueryState {
	table: string;
	filters: Record<string, string>;
	insertValue: Record<string, unknown> | null;
}

function readJson(response: Response) {
	return response.json() as Promise<Record<string, unknown>>;
}

function missingTableResult(): QueryResult {
	return {
		data: null,
		error: {
			code: "42P01",
			message: 'relation "public.web_render_jobs" does not exist',
		},
	};
}

function findRow(
	rows: Record<string, unknown>[],
	filters: Record<string, string>
) {
	return (
		rows.find((row) =>
			Object.entries(filters).every(([key, value]) => row[key] === value)
		) ?? null
	);
}

function makeJob(overrides: Record<string, unknown> = {}) {
	return {
		id: JOB_ID,
		idempotency_hash: IDEMPOTENCY_HASH,
		user_id: USER_ID,
		project_id: PROJECT_ID,
		status: "queued",
		storage_path: null,
		error: null,
		request: { timelineHash: "abc" },
		result: {},
		created_at: "2026-06-20T00:00:00.000Z",
		updated_at: "2026-06-20T00:00:00.000Z",
		...overrides,
	};
}

function resolveMaybeSingle(state: QueryState): QueryResult {
	if (state.table === "web_render_jobs" && supabaseMocks.missingRenderJobsTable) {
		return missingTableResult();
	}

	if (state.table === "projects") {
		return {
			data: findRow(supabaseMocks.projects, state.filters),
			error: null,
		};
	}

	if (state.table === "web_render_jobs") {
		return {
			data: findRow(supabaseMocks.jobs, state.filters),
			error: null,
		};
	}

	return { data: null, error: null };
}

function resolveSingle(state: QueryState): QueryResult {
	if (state.table === "web_render_jobs" && supabaseMocks.missingRenderJobsTable) {
		return missingTableResult();
	}

	if (state.table === "web_render_jobs" && state.insertValue) {
		const job = makeJob(state.insertValue);
		supabaseMocks.jobs.push(job);
		return { data: job, error: null };
	}

	return { data: null, error: null };
}

function makeQueryBuilder(table: string) {
	const state: QueryState = {
		table,
		filters: {},
		insertValue: null,
	};
	const builder = {
		select: vi.fn(() => builder),
		eq: vi.fn((column: string, value: string) => {
			state.filters[column] = value;
			return builder;
		}),
		insert: vi.fn((value: Record<string, unknown>) => {
			state.insertValue = value;
			supabaseMocks.inserted.push(value);
			return builder;
		}),
		maybeSingle: vi.fn(async () => resolveMaybeSingle(state)),
		single: vi.fn(async () => resolveSingle(state)),
	};

	return builder;
}

function makePostRequest(body: Record<string, unknown>) {
	return new Request("http://localhost/api/render", {
		method: "POST",
		headers: {
			Authorization: "Bearer access-token",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	}) as NextRequest;
}

describe("render API routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		supabaseMocks.inserted = [];
		supabaseMocks.missingRenderJobsTable = false;
		supabaseMocks.projects = [{ id: PROJECT_ID, user_id: USER_ID }];
		supabaseMocks.jobs = [];
		supabaseMocks.getUser.mockResolvedValue({
			data: { user: { id: USER_ID, email: "user@example.com" } },
			error: null,
		});
		supabaseMocks.from.mockImplementation((table: string) =>
			makeQueryBuilder(table)
		);
		supabaseMocks.createServerClient.mockReturnValue({
			auth: { getUser: supabaseMocks.getUser },
			from: supabaseMocks.from,
		});
	});

	it("queues a bounded web render job for an owned project", async () => {
		const response = await POST(
			makePostRequest({
				projectId: PROJECT_ID,
				idempotencyHash: IDEMPOTENCY_HASH,
				request: { timelineHash: "abc" },
			})
		);
		const body = await readJson(response);

		expect(response.status).toBe(202);
		expect(body).toMatchObject({
			idempotent: false,
			job: { id: JOB_ID, projectId: PROJECT_ID, status: "queued" },
		});
		expect(supabaseMocks.inserted).toEqual([
			expect.objectContaining({
				user_id: USER_ID,
				project_id: PROJECT_ID,
				idempotency_hash: IDEMPOTENCY_HASH,
				request: { timelineHash: "abc" },
			}),
		]);
	});

	it("returns an existing idempotent render job without inserting", async () => {
		supabaseMocks.jobs = [makeJob()];

		const response = await POST(
			makePostRequest({
				projectId: PROJECT_ID,
				idempotencyHash: IDEMPOTENCY_HASH,
				request: { timelineHash: "abc" },
			})
		);
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			idempotent: true,
			job: { id: JOB_ID, idempotencyHash: IDEMPOTENCY_HASH },
		});
		expect(supabaseMocks.inserted).toEqual([]);
	});

	it("reports a missing render job migration as unavailable", async () => {
		supabaseMocks.missingRenderJobsTable = true;

		const response = await POST(
			makePostRequest({
				projectId: PROJECT_ID,
				idempotencyHash: IDEMPOTENCY_HASH,
				request: { timelineHash: "abc" },
			})
		);
		const body = await readJson(response);

		expect(response.status).toBe(503);
		expect(body).toMatchObject({ error: "render_jobs_unavailable" });
	});

	it("returns status for an authenticated user's render job", async () => {
		supabaseMocks.jobs = [makeJob({ status: "running" })];

		const response = await GET(
			new NextRequest(
				`http://localhost/api/render/status?jobId=${JOB_ID}`,
				{ headers: { Authorization: "Bearer access-token" } }
			)
		);
		const body = await readJson(response);

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			job: { id: JOB_ID, projectId: PROJECT_ID, status: "running" },
		});
	});
});
