-- supabase/migrations/0044_branches_slug_grant.sql
--
-- branches is readable per column only (0031 hides qr_secret / kiosk_key), so
-- the slug added in 0043 was invisible to signed-in users and every query that
-- selected branches(slug) — the payroll list, period and slip pages — failed
-- with "permission denied". The slug is just the URL form of the name.
grant select (slug) on branches to authenticated;
