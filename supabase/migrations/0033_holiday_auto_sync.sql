-- supabase/migrations/0033_holiday_auto_sync.sql
--
-- National holidays (incl. cuti bersama) are synced automatically from
-- Google's public "Hari libur di Indonesia" calendar by
-- src/lib/holidays/national-sync.ts (weekly cron + a manual button).
--
--   sumber        'manual'   = typed in by HR (never touched by the sync)
--                 'otomatis' = written by the sync; replaced/removed when the
--                              feed changes (e.g. a tentative date is moved)
--   external_uid  the feed's VEVENT UID, the upsert key for 'otomatis' rows
--   disinkron_at  last time the sync wrote this row

alter table holidays
  add column if not exists sumber text not null default 'manual'
    check (sumber in ('manual', 'otomatis')),
  add column if not exists external_uid text,
  add column if not exists disinkron_at timestamptz;

-- Plain (non-partial) unique index so PostgREST upsert can target it;
-- NULLs (manual rows) never collide.
create unique index if not exists holidays_external_uid_key on holidays (external_uid);
