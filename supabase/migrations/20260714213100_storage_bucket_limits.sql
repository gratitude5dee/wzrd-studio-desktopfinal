-- Render inputs remain in the owner-scoped project-assets bucket. Render outputs
-- are private, immutable attempt objects written by the service role only.

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-assets', 'project-assets', false, 2147483648)
on conflict (id) do update set
	public = false,
  file_size_limit = excluded.file_size_limit;

-- A later historical migration recreated project-assets as public and granted
-- anonymous reads. Rendering inputs must remain owner-scoped private objects.
drop policy if exists "Public read access for project assets" on storage.objects;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'render-outputs',
  'render-outputs',
  false,
  2147483648,
  array['video/mp4']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists render_outputs_owner_select on storage.objects;
create policy render_outputs_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'render-outputs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

