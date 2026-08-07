-- ============================================================================
-- WZRD Image Editor mini-app — Phase 1 schema
--
-- The parent spec's table names (profiles, jobs, credits) already exist in this
-- database for the desktop app, so the mini-app's copies carry a `mini_` prefix
-- and stay separate from the kanvas/canvas surface. Everything is keyed on
-- `wzrd_uid`, the claim minted by the session exchange, rather than auth.uid().
-- ============================================================================

create extension if not exists pgcrypto;

-- Identity claim carried by the session-exchange JWT (guest wallets included).
create or replace function public.mini_current_wzrd_uid()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'wzrd_uid', '');
$$;

create or replace function public.mini_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.mini_profiles (
  wzrd_uid text primary key,
  wallet_address text null,
  identity_kind text not null default 'guest'
    check (identity_kind in ('guest', 'apple', 'passkey', 'phone', 'email')),
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mini_profiles_wallet_uniq
  on public.mini_profiles (wallet_address) where wallet_address is not null;

-- ----------------------------------------------------------------------------
-- artifacts — every image the user chose to keep or share
-- ----------------------------------------------------------------------------
create table if not exists public.mini_artifacts (
  id uuid primary key default gen_random_uuid(),
  wzrd_uid text null references public.mini_profiles (wzrd_uid) on delete set null,
  -- Anonymous device attribution used before the session exchange ships.
  device_id text null,
  storage_path text not null,
  mime_type text not null default 'image/png',
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size bigint null,
  source text not null default 'local'
    check (source in ('local', 'generate', 'edit', 'stylize')),
  visibility text not null default 'unlisted'
    check (visibility in ('unlisted', 'private')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mini_artifacts_owner_idx on public.mini_artifacts (wzrd_uid, created_at desc);
create index if not exists mini_artifacts_device_idx on public.mini_artifacts (device_id, created_at desc);

-- ----------------------------------------------------------------------------
-- jobs — one row per GMI request
-- ----------------------------------------------------------------------------
create table if not exists public.mini_jobs (
  id uuid primary key default gen_random_uuid(),
  wzrd_uid text null references public.mini_profiles (wzrd_uid) on delete set null,
  intent text not null,
  intent_version integer not null default 1,
  model_id text null,
  provider_request_id text null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  artifact_id uuid null references public.mini_artifacts (id) on delete set null,
  error text null,
  credits_charged integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists mini_jobs_owner_idx on public.mini_jobs (wzrd_uid, created_at desc);
create index if not exists mini_jobs_status_idx on public.mini_jobs (status) where status in ('queued', 'running');

-- ----------------------------------------------------------------------------
-- edits — the command stack, one row per applied operation
-- ----------------------------------------------------------------------------
create table if not exists public.mini_edits (
  id uuid primary key default gen_random_uuid(),
  wzrd_uid text null references public.mini_profiles (wzrd_uid) on delete set null,
  artifact_id uuid null references public.mini_artifacts (id) on delete cascade,
  parent_artifact_id uuid null references public.mini_artifacts (id) on delete set null,
  job_id uuid null references public.mini_jobs (id) on delete set null,
  operation text not null,
  params jsonb not null default '{}'::jsonb,
  applied_locally boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists mini_edits_artifact_idx on public.mini_edits (artifact_id, created_at);

-- ----------------------------------------------------------------------------
-- credits — append-only ledger
-- ----------------------------------------------------------------------------
create table if not exists public.mini_credits (
  id uuid primary key default gen_random_uuid(),
  wzrd_uid text not null references public.mini_profiles (wzrd_uid) on delete cascade,
  delta integer not null,
  reason text not null,
  job_id uuid null references public.mini_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mini_credits_owner_idx on public.mini_credits (wzrd_uid, created_at desc);

create or replace function public.mini_credit_balance(target_wzrd_uid text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer from public.mini_credits where wzrd_uid = target_wzrd_uid;
$$;

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at_mini_profiles on public.mini_profiles;
create trigger set_updated_at_mini_profiles
before update on public.mini_profiles
for each row execute function public.mini_set_updated_at();

drop trigger if exists set_updated_at_mini_artifacts on public.mini_artifacts;
create trigger set_updated_at_mini_artifacts
before update on public.mini_artifacts
for each row execute function public.mini_set_updated_at();

drop trigger if exists set_updated_at_mini_jobs on public.mini_jobs;
create trigger set_updated_at_mini_jobs
before update on public.mini_jobs
for each row execute function public.mini_set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — owners are matched on the wzrd_uid claim; the service role bypasses.
-- ----------------------------------------------------------------------------
alter table public.mini_profiles enable row level security;
alter table public.mini_artifacts enable row level security;
alter table public.mini_jobs enable row level security;
alter table public.mini_edits enable row level security;
alter table public.mini_credits enable row level security;

drop policy if exists mini_profiles_owner on public.mini_profiles;
create policy mini_profiles_owner on public.mini_profiles
  for all using (wzrd_uid = public.mini_current_wzrd_uid())
  with check (wzrd_uid = public.mini_current_wzrd_uid());

drop policy if exists mini_artifacts_owner on public.mini_artifacts;
create policy mini_artifacts_owner on public.mini_artifacts
  for all using (wzrd_uid is not null and wzrd_uid = public.mini_current_wzrd_uid())
  with check (wzrd_uid is not null and wzrd_uid = public.mini_current_wzrd_uid());

drop policy if exists mini_jobs_owner on public.mini_jobs;
create policy mini_jobs_owner on public.mini_jobs
  for all using (wzrd_uid is not null and wzrd_uid = public.mini_current_wzrd_uid())
  with check (wzrd_uid is not null and wzrd_uid = public.mini_current_wzrd_uid());

drop policy if exists mini_edits_owner on public.mini_edits;
create policy mini_edits_owner on public.mini_edits
  for all using (wzrd_uid is not null and wzrd_uid = public.mini_current_wzrd_uid())
  with check (wzrd_uid is not null and wzrd_uid = public.mini_current_wzrd_uid());

drop policy if exists mini_credits_owner_read on public.mini_credits;
create policy mini_credits_owner_read on public.mini_credits
  for select using (wzrd_uid = public.mini_current_wzrd_uid());

-- ----------------------------------------------------------------------------
-- Storage buckets
--   uploads   — private scratch space, swept after 24h
--   artifacts — private, served through signed URLs only
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  33554432, -- 32MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artifacts',
  'artifacts',
  false,
  33554432,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects are written and read by edge functions using the service role, which
-- bypasses RLS; no anon/authenticated storage policy is granted on purpose.

-- 24h lifecycle on `uploads`.
create or replace function public.mini_sweep_expired_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  with expired as (
    delete from storage.objects
    where bucket_id = 'uploads' and created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::integer into removed from expired;
  return removed;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'mini-sweep-expired-uploads') then
      perform cron.unschedule('mini-sweep-expired-uploads');
    end if;

    perform cron.schedule(
      'mini-sweep-expired-uploads',
      '17 * * * *',
      $cron$select public.mini_sweep_expired_uploads();$cron$
    );
  end if;
end;
$$;
