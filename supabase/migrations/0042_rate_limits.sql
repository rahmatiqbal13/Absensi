-- supabase/migrations/0042_rate_limits.sql
--
-- Fixed-window rate limiter for the public, unauthenticated entry points
-- (login, lupa kata sandi). Kept in Postgres so it holds across serverless
-- instances without adding Redis.
--
-- Supabase Auth also rate-limits sign-ins, but per *IP of the caller* — and our
-- server action is the caller, so every employee shares one bucket there. This
-- limiter is keyed by the end user's IP / email instead, and stops a password
-- guessing run before it reaches Supabase Auth at all.

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);

alter table rate_limits enable row level security;
-- No policies: only the service role (via rate_limit_hit) touches this table.

-- Records one hit on `p_key` and returns true while the key is within
-- `p_max` hits per `p_window_seconds`. Atomic under concurrency (single upsert).
create or replace function rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case
          when r.window_start <= now() - make_interval(secs => p_window_seconds) then now()
          else r.window_start end,
        hits = case
          when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1
          else r.hits + 1 end
  returning hits <= p_max;
$$;

revoke execute on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;

-- Expired windows are dead weight; sweep them daily (03:15 WIB).
create extension if not exists pg_cron;
select cron.schedule(
  'purge-rate-limits',
  '15 20 * * *',
  $$delete from public.rate_limits where window_start < now() - interval '1 day'$$
);
