-- Supabase default privileges can expose new public tables more broadly than the
-- Data API surface needs. Keep web render jobs private to authenticated owners
-- and service workers.

revoke all on table public.web_render_jobs from public;
revoke all on table public.web_render_jobs from anon;
revoke all on table public.web_render_jobs from authenticated;
revoke all on table public.web_render_jobs from service_role;

grant select, insert, update on table public.web_render_jobs to authenticated;
grant select, insert, update, delete on table public.web_render_jobs to service_role;
