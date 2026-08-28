-- supabase/migrations/0025_schedule_photo_purge.sql
--
-- Plan 6 / spec-induk §10: attendance photos past 90 days must be physically
-- deleted, not just flagged. The purge-expired-photos Edge Function does the
-- work; this schedules it nightly at 02:00 WIB (19:00 UTC).
--
-- The function URL and service key are project-specific. Preferred: store the
-- service key in Supabase Vault and reference it. If pg_cron / pg_net turn out
-- to be unavailable or awkward on this project, DELETE the cron.schedule call
-- below, keep only the `create extension` lines, and schedule the function
-- from the Supabase dashboard instead (Edge Functions -> the function ->
-- Schedules, cron `0 19 * * *`). Document whichever path was taken in the
-- task report.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- IMPLEMENTER: replace <PROJECT_REF> with the real project ref (from
-- NEXT_PUBLIC_SUPABASE_URL) and <SERVICE_KEY_EXPR> with either a Vault lookup
-- (`(select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')`)
-- or, if Vault is not set up, the literal key. Verify the call once by hand
-- (`select ...net.http_post(...)`) before relying on the schedule.
select cron.schedule(
  'purge-expired-photos',
  '0 19 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-expired-photos',
    headers := jsonb_build_object('Authorization', 'Bearer ' || <SERVICE_KEY_EXPR>)
  )
  $$
);
