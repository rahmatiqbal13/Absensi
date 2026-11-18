-- "Lupa absen" email reminders (src/lib/attendance/send-reminders.ts).
--
-- attendance_reminders records who was reminded on which day, so each
-- employee gets at most one reminder per day even when runs overlap (the app
-- inserts first and emails only the rows it inserted). Service role only.
create table if not exists public.attendance_reminders (
  employee_id uuid not null references public.employees(id) on delete cascade,
  tanggal date not null,
  sent_at timestamptz not null default now(),
  primary key (employee_id, tanggal)
);

alter table public.attendance_reminders enable row level security;
-- No policies: only the service role reads and writes this table.

-- Every 15 minutes, call the app's reminder endpoint. It decides per employee
-- (own schedule + tolerance, working day, holiday, leave), so running it all
-- day is cheap and correct for every shift. URL and bearer secret come from
-- Vault (synced from config.toml on `supabase db push`), never from git:
--   app_url     = NEXT_PUBLIC_APP_URL, e.g. https://tapabsen.vercel.app
--   cron_secret = CRON_SECRET, the same value as in Vercel
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'absen-reminder',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'app_url')
      || '/api/cron/absen-reminder',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  )
  $$
);

-- Reminder rows are only needed for the current day; keep two months for
-- reference and sweep the rest daily (03:30 WIB).
select cron.schedule(
  'purge-attendance-reminders',
  '30 20 * * *',
  $$delete from public.attendance_reminders where tanggal < current_date - 60$$
);
