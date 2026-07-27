-- WZRDOS run logs for plan approval, dry runs, and future live executions.

create extension if not exists pgcrypto;

create table if not exists public.wzrdos_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  status text not null default 'planned'
    check (status in ('planned', 'approved', 'running', 'succeeded', 'failed', 'cancelled', 'paused')),
  mode text not null default 'dry_run'
    check (mode in ('dry_run', 'live')),
  prompt text not null default '',
  summary text not null default '',
  plan jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wzrdos_runs_user_created_idx
  on public.wzrdos_runs (user_id, created_at desc);

create index if not exists wzrdos_runs_user_status_idx
  on public.wzrdos_runs (user_id, status, created_at desc);

drop trigger if exists set_updated_at_wzrdos_runs on public.wzrdos_runs;
create trigger set_updated_at_wzrdos_runs
before update on public.wzrdos_runs
for each row
execute function public.set_updated_at();

alter table public.wzrdos_runs enable row level security;

drop policy if exists wzrdos_runs_select on public.wzrdos_runs;
create policy wzrdos_runs_select
on public.wzrdos_runs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists wzrdos_runs_insert on public.wzrdos_runs;
create policy wzrdos_runs_insert
on public.wzrdos_runs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists wzrdos_runs_update on public.wzrdos_runs;
create policy wzrdos_runs_update
on public.wzrdos_runs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wzrdos_runs;
  end if;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
