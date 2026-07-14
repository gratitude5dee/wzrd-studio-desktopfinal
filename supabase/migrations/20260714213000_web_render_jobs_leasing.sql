-- Secure server-mediated render queue lifecycle.
-- Client sessions retain owner SELECT access, but all mutations are performed by
-- trusted API/worker processes through the service role.

revoke all on table public.web_render_jobs from public, anon, authenticated;

drop policy if exists web_render_jobs_insert on public.web_render_jobs;
drop policy if exists web_render_jobs_update on public.web_render_jobs;

grant select on table public.web_render_jobs to authenticated;
grant select, insert, update, delete on table public.web_render_jobs to service_role;

alter table public.web_render_jobs
  add column if not exists priority integer not null default 0,
  add column if not exists kind text not null default 'qcut_timeline',
  add column if not exists manifest_schema_version integer not null default 1,
  add column if not exists batch_id uuid,
  add column if not exists batch_index integer,
  add column if not exists batch_total integer,
  add column if not exists progress numeric not null default 0,
  add column if not exists stage text,
  add column if not exists progress_message text,
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists retry_at timestamptz,
  add column if not exists generation integer not null default 0,
  add column if not exists worker_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists output_storage_path text,
  add column if not exists output_bytes bigint,
  add column if not exists output_duration_seconds numeric,
  add column if not exists output_width integer,
  add column if not exists output_height integer,
  add column if not exists output_sha256 text,
  add column if not exists error_code text,
  add column if not exists error_message text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_kind_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_kind_check
      check (kind in ('qcut_timeline', 'clipper_vertical', 'media_ingest'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_manifest_version_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_manifest_version_check
      check (manifest_schema_version > 0);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_progress_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_progress_check
      check (progress >= 0 and progress <= 100);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_attempts_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_attempts_check
      check (attempts >= 0 and max_attempts = 3 and attempts <= max_attempts);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_generation_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_generation_check
      check (generation >= 0);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_batch_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_batch_check
      check (
        (batch_id is null and batch_index is null and batch_total is null)
        or (
          batch_id is not null
          and batch_index is not null
          and batch_total is not null
          and batch_index >= 0
          and batch_total > 0
          and batch_index < batch_total
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'web_render_jobs_output_metadata_check'
      and conrelid = 'public.web_render_jobs'::regclass
  ) then
    alter table public.web_render_jobs
      add constraint web_render_jobs_output_metadata_check
      check (
        (output_bytes is null or output_bytes between 0 and 2147483648)
        and (output_duration_seconds is null or output_duration_seconds between 0 and 1800)
        and (output_width is null or output_width between 1 and 3840)
        and (output_height is null or output_height between 1 and 2160)
        and (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$')
      );
  end if;
end
$$;

create index if not exists web_render_jobs_claim_idx
  on public.web_render_jobs (priority desc, created_at asc)
  where status in ('queued', 'running');

create index if not exists web_render_jobs_user_status_created_idx
  on public.web_render_jobs (user_id, status, created_at desc);

create index if not exists web_render_jobs_retry_idx
  on public.web_render_jobs (retry_at, created_at)
  where status = 'queued';

create index if not exists web_render_jobs_lease_idx
  on public.web_render_jobs (lease_expires_at)
  where status = 'running';

create index if not exists web_render_jobs_user_batch_idx
  on public.web_render_jobs (user_id, batch_id, batch_index)
  where batch_id is not null;

create unique index if not exists web_render_jobs_user_batch_position_uniq
  on public.web_render_jobs (user_id, batch_id, batch_index)
  where batch_id is not null;

create unique index if not exists web_render_jobs_output_storage_path_uniq
  on public.web_render_jobs (output_storage_path)
  where output_storage_path is not null;

-- Remove signatures from an earlier draft if it was applied during preview
-- development. Leaving them overloaded would preserve unfenced worker writes.
drop function if exists public.heartbeat_web_render_job(uuid, text, integer, numeric, text, text);
drop function if exists public.complete_web_render_job(uuid, text, text, bigint, numeric, integer, integer, text);
drop function if exists public.fail_web_render_job(uuid, text, text, text, boolean);
drop function if exists public.acknowledge_cancel_web_render_job(uuid, text);

create or replace function public.claim_web_render_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns setof public.web_render_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or pg_catalog.btrim(p_worker_id) = '' or pg_catalog.length(p_worker_id) > 200 then
    raise exception 'worker_id is required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'limit must be between 1 and 10';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 15 or p_lease_seconds > 900 then
    raise exception 'lease_seconds must be between 15 and 900';
  end if;

  -- A final-attempt worker can disappear without another claimant being eligible.
  -- Terminalize those rows transactionally on every worker poll.
  perform public.sweep_exhausted_web_render_job_leases(100);

  return query
  with candidates as materialized (
    select jobs.id
    from public.web_render_jobs as jobs
    where (
      jobs.status = 'queued'
      and (jobs.retry_at is null or jobs.retry_at <= pg_catalog.now())
      and jobs.attempts < jobs.max_attempts
      and jobs.cancel_requested = false
    ) or (
      jobs.status = 'running'
      and (jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now())
      and jobs.attempts < jobs.max_attempts
      and jobs.cancel_requested = false
    )
    order by jobs.priority desc, jobs.created_at asc
    for update of jobs skip locked
    limit p_limit
  )
  update public.web_render_jobs as jobs
  set status = 'running',
      worker_id = p_worker_id,
      started_at = coalesce(jobs.started_at, pg_catalog.now()),
      completed_at = null,
      heartbeat_at = pg_catalog.now(),
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      attempts = jobs.attempts + 1,
      retry_at = null,
      progress = 0,
      stage = 'claimed',
      progress_message = null,
      error = null,
      error_code = null,
      error_message = null
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create or replace function public.heartbeat_web_render_job(
  p_job_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_generation integer,
  p_lease_seconds integer,
  p_progress numeric,
  p_stage text,
  p_progress_message text
)
returns table(cancel_requested boolean, generation integer, attempt integer)
language sql
security definer
set search_path = ''
as $$
  update public.web_render_jobs as jobs
  set heartbeat_at = pg_catalog.now(),
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      progress = least(
        100::numeric,
        greatest(jobs.progress, coalesce(p_progress, jobs.progress), 0::numeric)
      ),
      stage = case when p_stage is null then jobs.stage else pg_catalog.left(p_stage, 100) end,
      progress_message = case
        when p_progress_message is null then jobs.progress_message
        else pg_catalog.left(p_progress_message, 1000)
      end
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.worker_id = p_worker_id
    and jobs.attempts = p_attempt
    and jobs.generation = p_generation
    and jobs.lease_expires_at > pg_catalog.now()
    and p_lease_seconds between 15 and 900
  returning jobs.cancel_requested, jobs.generation, jobs.attempts;
$$;

create or replace function public.complete_web_render_job(
  p_job_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_generation integer,
  p_output_storage_path text,
  p_output_bytes bigint,
  p_output_duration_seconds numeric,
  p_output_width integer,
  p_output_height integer,
  p_output_sha256 text
)
returns setof public.web_render_jobs
language sql
security definer
set search_path = ''
as $$
  update public.web_render_jobs as jobs
  set status = 'succeeded',
      progress = 100,
      stage = 'completed',
      progress_message = null,
      completed_at = pg_catalog.now(),
      output_storage_path = p_output_storage_path,
      output_bytes = p_output_bytes,
      output_duration_seconds = p_output_duration_seconds,
      output_width = p_output_width,
      output_height = p_output_height,
      output_sha256 = p_output_sha256,
      error = null,
      error_code = null,
      error_message = null,
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.worker_id = p_worker_id
    and jobs.attempts = p_attempt
    and jobs.generation = p_generation
    and jobs.lease_expires_at > pg_catalog.now()
    and jobs.cancel_requested = false
    -- The winning object is immutable and attempt-scoped. There is no mutable
    -- canonical copy for a stale worker to race with.
    and p_output_storage_path = (
      jobs.user_id::text || '/' || jobs.project_id::text || '/' ||
      jobs.idempotency_hash || '/attempts/' || jobs.attempts::text || '-' ||
      jobs.generation::text || '.mp4'
    )
    and p_output_bytes between 0 and 2147483648
    and p_output_duration_seconds between 0 and 1800
    and p_output_width between 1 and 3840
    and p_output_height between 1 and 2160
    and p_output_sha256 ~ '^[0-9a-f]{64}$'
  returning jobs.*;
$$;

create or replace function public.fail_web_render_job(
  p_job_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_generation integer,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns setof public.web_render_jobs
language sql
security definer
set search_path = ''
as $$
  update public.web_render_jobs as jobs
  set status = case
        when jobs.cancel_requested then 'cancelled'
        when p_retryable and jobs.attempts < jobs.max_attempts then 'queued'
        else 'failed'
      end,
      retry_at = case
        when not jobs.cancel_requested and p_retryable and jobs.attempts < jobs.max_attempts then
          pg_catalog.now() + case jobs.attempts
            when 1 then interval '30 seconds'
            when 2 then interval '60 seconds'
          end
        else null
      end,
      completed_at = case
        when not jobs.cancel_requested and p_retryable and jobs.attempts < jobs.max_attempts then null
        else pg_catalog.now()
      end,
      stage = case
        when jobs.cancel_requested then 'cancelled'
        when p_retryable and jobs.attempts < jobs.max_attempts then 'retry_wait'
        else 'failed'
      end,
      progress_message = case when jobs.cancel_requested then null else pg_catalog.left(p_error_message, 1000) end,
      error = case when jobs.cancel_requested then null else pg_catalog.left(p_error_message, 1000) end,
      error_code = case when jobs.cancel_requested then null else pg_catalog.left(p_error_code, 100) end,
      error_message = case when jobs.cancel_requested then null else pg_catalog.left(p_error_message, 1000) end,
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.worker_id = p_worker_id
    and jobs.attempts = p_attempt
    and jobs.generation = p_generation
    and jobs.lease_expires_at > pg_catalog.now()
  returning jobs.*;
$$;

create or replace function public.acknowledge_cancel_web_render_job(
  p_job_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_generation integer
)
returns setof public.web_render_jobs
language sql
security definer
set search_path = ''
as $$
  update public.web_render_jobs as jobs
  set status = 'cancelled',
      stage = 'cancelled',
      progress_message = null,
      completed_at = pg_catalog.now(),
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null
  where jobs.id = p_job_id
    and jobs.status = 'running'
    and jobs.worker_id = p_worker_id
    and jobs.attempts = p_attempt
    and jobs.generation = p_generation
    and jobs.lease_expires_at > pg_catalog.now()
    and jobs.cancel_requested = true
  returning jobs.*;
$$;

create or replace function public.cancel_web_render_job(
  p_job_id uuid,
  p_user_id uuid
)
returns setof public.web_render_jobs
language sql
security definer
set search_path = ''
as $$
  update public.web_render_jobs as jobs
  set status = case
        when jobs.status = 'queued' or jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now()
          then 'cancelled'
        else jobs.status
      end,
      cancel_requested = case
        when jobs.status = 'running' and jobs.lease_expires_at > pg_catalog.now() then true
        else jobs.cancel_requested
      end,
      completed_at = case
        when jobs.status = 'queued' or jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now()
          then pg_catalog.now()
        else jobs.completed_at
      end,
      stage = case
        when jobs.status = 'queued' or jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now()
          then 'cancelled'
        else 'cancelling'
      end,
      progress_message = case
        when jobs.status = 'running' and jobs.lease_expires_at > pg_catalog.now()
          then 'Cancellation requested'
        else null
      end,
      worker_id = case
        when jobs.status = 'queued' or jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now()
          then null
        else jobs.worker_id
      end,
      lease_expires_at = case
        when jobs.status = 'queued' or jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now()
          then null
        else jobs.lease_expires_at
      end,
      heartbeat_at = case
        when jobs.status = 'queued' or jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now()
          then null
        else jobs.heartbeat_at
      end
  where jobs.id = p_job_id
    and jobs.user_id = p_user_id
    and jobs.status in ('queued', 'running')
  returning jobs.*;
$$;

create or replace function public.retry_web_render_job(
  p_job_id uuid,
  p_user_id uuid
)
returns setof public.web_render_jobs
language sql
security definer
set search_path = ''
as $$
  update public.web_render_jobs as jobs
  set status = 'queued',
      progress = 0,
      stage = null,
      progress_message = null,
      attempts = 0,
      retry_at = null,
      generation = jobs.generation + 1,
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null,
      started_at = null,
      completed_at = null,
      cancel_requested = false,
      output_storage_path = null,
      output_bytes = null,
      output_duration_seconds = null,
      output_width = null,
      output_height = null,
      output_sha256 = null,
      storage_path = null,
      error = null,
      error_code = null,
      error_message = null,
      result = '{}'::jsonb
  where jobs.id = p_job_id
    and jobs.user_id = p_user_id
    and jobs.status in ('failed', 'cancelled')
  returning jobs.*;
$$;

create or replace function public.enqueue_web_render_job(
  p_user_id uuid,
  p_project_id uuid,
  p_idempotency_hash text,
  p_manifest jsonb,
  p_kind text,
  p_manifest_schema_version integer,
  p_batch_id uuid default null,
  p_batch_index integer default null,
  p_batch_total integer default null
)
returns setof public.web_render_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job public.web_render_jobs%rowtype;
  queued_count integer;
  running_count integer;
  hourly_count integer;
begin
  -- Serialize quota evaluation and insertion per user. This makes the limits
  -- authoritative even when several Vercel invocations enqueue concurrently.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select * into existing_job
  from public.web_render_jobs as jobs
  where jobs.user_id = p_user_id
    and jobs.idempotency_hash = p_idempotency_hash;
  if found then
    return next existing_job;
    return;
  end if;

  select
    count(*) filter (where jobs.status = 'queued'),
    count(*) filter (where jobs.status = 'running')
  into queued_count, running_count
  from public.web_render_jobs as jobs
  where jobs.user_id = p_user_id
    and jobs.status in ('queued', 'running');

  if queued_count >= 10 or running_count >= 2 then
    raise exception using errcode = 'P0001', message = 'render_active_quota_exceeded';
  end if;

  select count(*) into hourly_count
  from public.web_render_jobs as jobs
  where jobs.user_id = p_user_id
    and jobs.created_at >= pg_catalog.now() - interval '1 hour';
  if hourly_count >= 25 then
    raise exception using errcode = 'P0001', message = 'render_hourly_quota_exceeded';
  end if;

  return query
  insert into public.web_render_jobs (
    user_id, project_id, idempotency_hash, status, storage_path, request, result,
    kind, manifest_schema_version, batch_id, batch_index, batch_total
  ) values (
    p_user_id, p_project_id, p_idempotency_hash, 'queued', null, p_manifest, '{}'::jsonb,
    p_kind, p_manifest_schema_version, p_batch_id, p_batch_index, p_batch_total
  )
  returning *;
end;
$$;

create or replace function public.sweep_exhausted_web_render_job_leases(
  p_limit integer default 100
)
returns setof public.web_render_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'limit must be between 1 and 1000';
  end if;

  return query
  -- Also terminalize an abandoned cancellation after its worker lease expires;
  -- otherwise cancel_requested rows are intentionally unclaimable and can stick.
  with exhausted as materialized (
    select jobs.id
    from public.web_render_jobs as jobs
    where jobs.status = 'running'
      and (jobs.lease_expires_at is null or jobs.lease_expires_at <= pg_catalog.now())
      and (jobs.cancel_requested or jobs.attempts >= jobs.max_attempts)
    order by jobs.lease_expires_at asc nulls first, jobs.created_at asc
    for update of jobs skip locked
    limit p_limit
  )
  update public.web_render_jobs as jobs
  set status = case when jobs.cancel_requested then 'cancelled' else 'failed' end,
      stage = case when jobs.cancel_requested then 'cancelled' else 'failed' end,
      progress_message = case
        when jobs.cancel_requested then null
        else 'The final render attempt lost its worker lease.'
      end,
      completed_at = pg_catalog.now(),
      retry_at = null,
      error = case when jobs.cancel_requested then null else 'The final render attempt lost its worker lease.' end,
      error_code = case when jobs.cancel_requested then null else 'worker_lease_exhausted' end,
      error_message = case when jobs.cancel_requested then null else 'The final render attempt lost its worker lease.' end,
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null
  from exhausted
  where jobs.id = exhausted.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_web_render_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_web_render_job(uuid, text, integer, integer, integer, numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_web_render_job(uuid, text, integer, integer, text, bigint, numeric, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.fail_web_render_job(uuid, text, integer, integer, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.acknowledge_cancel_web_render_job(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.cancel_web_render_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.retry_web_render_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.sweep_exhausted_web_render_job_leases(integer)
  from public, anon, authenticated;
revoke all on function public.enqueue_web_render_job(uuid, uuid, text, jsonb, text, integer, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.claim_web_render_jobs(text, integer, integer) to service_role;
grant execute on function public.heartbeat_web_render_job(uuid, text, integer, integer, integer, numeric, text, text) to service_role;
grant execute on function public.complete_web_render_job(uuid, text, integer, integer, text, bigint, numeric, integer, integer, text) to service_role;
grant execute on function public.fail_web_render_job(uuid, text, integer, integer, text, text, boolean) to service_role;
grant execute on function public.acknowledge_cancel_web_render_job(uuid, text, integer, integer) to service_role;
grant execute on function public.cancel_web_render_job(uuid, uuid) to service_role;
grant execute on function public.retry_web_render_job(uuid, uuid) to service_role;
grant execute on function public.sweep_exhausted_web_render_job_leases(integer) to service_role;
grant execute on function public.enqueue_web_render_job(uuid, uuid, text, jsonb, text, integer, uuid, integer, integer) to service_role;

