-- Postz native scheduler v1
-- Adds web OAuth return support and schedules the Supabase-native drain job.

alter table public.postz_oauth_state
  add column if not exists app_return_url text null;

create index if not exists postz_posts_scheduler_due_idx
  on public.postz_posts (publish_date, attempts)
  where deleted_at is null
    and state in ('QUEUE', 'ERROR');

do $$
declare
  existing_job_id bigint;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron is not available; skipping Postz cron unschedule.';
    return;
  end if;

  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'postz-drain'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

do $$
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    raise notice 'pg_cron or pg_net is not available; skipping Postz cron schedule.';
    return;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Supabase Vault is not available; skipping Postz cron schedule.';
    return;
  end if;

  perform cron.schedule(
    'postz-drain',
    '* * * * *',
    $cron$
      with secrets as (
        select
          (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) as project_url,
          coalesce(
            (select decrypted_secret from vault.decrypted_secrets where name = 'postz_scheduler_secret' limit 1),
            (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
          ) as bearer
      ),
      request as (
        select net.http_post(
          url := project_url || '/functions/v1/postz-scheduler',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || bearer
          ),
          body := jsonb_build_object(
            'source', 'pg_cron',
            'scheduled_at', now()
          )
        ) as request_id
        from secrets
        where project_url is not null
          and bearer is not null
      )
      select coalesce((select request_id from request), 0) as request_id;
    $cron$
  );
end $$;

notify pgrst, 'reload schema';
