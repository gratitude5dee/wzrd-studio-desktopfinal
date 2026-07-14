import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const leasingSql = readFileSync(
	resolve(
		process.cwd(),
		"supabase/migrations/20260714213000_web_render_jobs_leasing.sql"
	),
	"utf8"
).toLowerCase();
const storageSql = readFileSync(
	resolve(
		process.cwd(),
		"supabase/migrations/20260714213100_storage_bucket_limits.sql"
	),
	"utf8"
).toLowerCase();

describe("secure render queue migration contract", () => {
	it("leaves authenticated clients with owner SELECT only", () => {
		expect(leasingSql).toContain(
			"revoke all on table public.web_render_jobs from public, anon, authenticated"
		);
		expect(leasingSql).toContain(
			"drop policy if exists web_render_jobs_insert on public.web_render_jobs"
		);
		expect(leasingSql).toContain(
			"drop policy if exists web_render_jobs_update on public.web_render_jobs"
		);
		expect(leasingSql).toContain(
			"grant select on table public.web_render_jobs to authenticated"
		);
		expect(leasingSql).not.toMatch(
			/grant\s+(?:select,\s*)?(?:insert|update|delete)[^;]*to authenticated/
		);
	});

	it("hardens every SECURITY DEFINER function and grants only service execution", () => {
		const functionCount = (
			leasingSql.match(/create or replace function public\./g) ?? []
		).length;
		const emptySearchPathCount = (
			leasingSql.match(/set search_path = ''/g) ?? []
		).length;

		expect(functionCount).toBe(9);
		expect(emptySearchPathCount).toBe(functionCount);
		expect(leasingSql).not.toMatch(/grant execute[^;]*to (?:public|anon|authenticated)/);
		expect(leasingSql.match(/grant execute[^;]*to service_role/g)).toHaveLength(
			functionCount
		);
	});

	it("claims atomically and fences every worker mutation by lease, attempt, and generation", () => {
		expect(leasingSql).toContain("for update of jobs skip locked");
		expect(leasingSql).toContain("jobs.attempts < jobs.max_attempts");
		expect(leasingSql).toContain("attempts = jobs.attempts + 1");
		expect(leasingSql).toContain("and jobs.worker_id = p_worker_id");
		expect(leasingSql.match(/and jobs\.attempts = p_attempt/g)).toHaveLength(4);
		expect(leasingSql.match(/and jobs\.generation = p_generation/g)).toHaveLength(
			4
		);
		expect(
			(leasingSql.match(/jobs\.lease_expires_at > pg_catalog\.now\(\)/g) ?? [])
				.length
		).toBeGreaterThanOrEqual(5);
	});

	it("uses exactly three attempts with 30/60 backoff and terminal stale sweeping", () => {
		expect(leasingSql).toContain("max_attempts integer not null default 3");
		expect(leasingSql).toContain("max_attempts = 3");
		expect(leasingSql).toContain("when 1 then interval '30 seconds'");
		expect(leasingSql).toContain("when 2 then interval '60 seconds'");
		expect(leasingSql).toContain(
			"create or replace function public.sweep_exhausted_web_render_job_leases"
		);
		expect(leasingSql).toContain("jobs.attempts >= jobs.max_attempts");
		expect(leasingSql).toContain("error_code = case when jobs.cancel_requested then null else 'worker_lease_exhausted' end");
	});

	it("accepts completion only at the immutable attempt-generation path", () => {
		expect(leasingSql).toContain(
			"jobs.idempotency_hash || '/attempts/' || jobs.attempts::text || '-'"
		);
		expect(leasingSql).toContain("jobs.generation::text || '.mp4'");
		expect(leasingSql).toContain(
			"create unique index if not exists web_render_jobs_output_storage_path_uniq"
		);
		expect(leasingSql).not.toContain("/output.mp4");
	});

	it("resets owner retries in place and increments generation", () => {
		expect(leasingSql).toContain(
			"create or replace function public.retry_web_render_job"
		);
		expect(leasingSql).toContain("attempts = 0");
		expect(leasingSql).toContain("generation = jobs.generation + 1");
		expect(leasingSql).toContain("jobs.status in ('failed', 'cancelled')");
	});
});

describe("render storage migration contract", () => {
	it("forces project assets private and removes anonymous reads", () => {
		expect(storageSql).toContain(
			"values ('project-assets', 'project-assets', false, 2147483648)"
		);
		expect(storageSql).toContain("public = false");
		expect(storageSql).toContain(
			'drop policy if exists "public read access for project assets" on storage.objects'
		);
	});

	it("creates a private 2 GB render-output bucket with owner read only", () => {
		expect(storageSql).toContain("'render-outputs'");
		expect(storageSql).toContain("array['video/mp4']");
		expect(storageSql).toContain("create policy render_outputs_owner_select");
		expect(storageSql).toContain(
			"and (storage.foldername(name))[1] = auth.uid()::text"
		);
		expect(storageSql).not.toMatch(
			/create policy render_outputs[^;]*(?:for insert|for update|for all)/
		);
	});
});
