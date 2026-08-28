-- supabase/migrations/0025_schedule_photo_purge.sql
--
-- Plan 6 / spec-induk §10: attendance photos past 90 days must be physically
-- deleted, not just flagged. The purge-expired-photos Edge Function does the
-- work; this schedules it nightly at 02:00 WIB (19:00 UTC).
--
-- The shared secret is NOT in this file. It is synced to Vault from the
-- environment by `supabase db push` (see [db.vault].purge_shared_secret in
-- config.toml) and read back here by name. The Edge Function checks the same
-- value from its own secret (PURGE_SHARED_SECRET).
--
-- Fallback: if pg_cron / pg_net are unavailable on this project, this migration
-- fails at `create extension`. In that case reduce it to a no-op and schedule
-- the function from the Supabase dashboard instead (Edge Functions -> the
-- function -> Schedules, cron `0 19 * * *`, with an Authorization: Bearer
-- <service-role key> header).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'purge-expired-photos',
  '0 19 * * *',
  $$
  select net.http_post(
    url := 'https://usvkufbzvxlwacbomram.supabase.co/functions/v1/purge-expired-photos',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'purge_shared_secret'
      )
    )
  )
  $$
);
