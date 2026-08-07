-- Browser render-offload job metadata for the Next/Vercel web target.
-- Rendering itself remains browser-first; this table only persists bounded queue
-- state for jobs that need async/offloaded handling.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.web_render_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  storage_path text,
  error text,
  request jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists web_render_jobs_user_idempotency_uniq
  on public.web_render_jobs (user_id, idempotency_hash);

create index if not exists web_render_jobs_user_project_created_idx
  on public.web_render_jobs (user_id, project_id, created_at desc);

create index if not exists web_render_jobs_status_created_idx
  on public.web_render_jobs (status, created_at desc);

drop trigger if exists set_updated_at_web_render_jobs on public.web_render_jobs;
create trigger set_updated_at_web_render_jobs
before update on public.web_render_jobs
for each row
execute function public.set_updated_at();

alter table public.web_render_jobs enable row level security;

drop policy if exists web_render_jobs_select on public.web_render_jobs;
create policy web_render_jobs_select
on public.web_render_jobs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists web_render_jobs_insert on public.web_render_jobs;
create policy web_render_jobs_insert
on public.web_render_jobs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists web_render_jobs_update on public.web_render_jobs;
create policy web_render_jobs_update
on public.web_render_jobs
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

grant select, insert, update on public.web_render_jobs to authenticated;
grant select, insert, update, delete on public.web_render_jobs to service_role;
