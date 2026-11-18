-- GPS quality signals for HR review (see src/lib/attendance/location-flags.ts).
-- Flags never change the attendance status; they only mark a record whose
-- position may not be trustworthy. Written by the service-role clock-in/out
-- path only. The app tolerates these columns being absent (pre-0046), so the
-- code can deploy before this migration is pushed.
alter table public.attendances
  add column if not exists akurasi_masuk_meter real,
  add column if not exists akurasi_pulang_meter real,
  add column if not exists flag_lokasi_masuk text[] not null default '{}',
  add column if not exists flag_lokasi_pulang text[] not null default '{}';

alter table public.attendances
  drop constraint if exists attendances_flag_lokasi_valid;
alter table public.attendances
  add constraint attendances_flag_lokasi_valid check (
    flag_lokasi_masuk <@ array['akurasi_rendah', 'lokasi_basi', 'lompatan_lokasi']::text[]
    and flag_lokasi_pulang <@ array['akurasi_rendah', 'lokasi_basi', 'lompatan_lokasi']::text[]
  );
