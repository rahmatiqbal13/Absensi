-- Pengingat absen yang bisa diatur HR / super admin (menu Pengumuman > Reminder).
-- One row per kind of reminder:
--   masuk     — `menit` minutes BEFORE the employee's jam masuk, not clocked in yet
--   terlambat — `menit` minutes AFTER jam masuk + toleransi, still not clocked in
--   pulang    — `menit` minutes AFTER jam pulang, clocked in but not out
-- judul / isi may use {nama} and {jam} (the employee's schedule time).
-- Without this table the app keeps its built-in defaults (same values as below).

create table if not exists public.reminder_settings (
  jenis text primary key check (jenis in ('masuk', 'terlambat', 'pulang')),
  aktif boolean not null default true,
  menit integer not null default 0 check (menit between 0 and 240),
  judul text not null check (btrim(judul) <> '' and length(judul) <= 100),
  isi text not null check (btrim(isi) <> '' and length(isi) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);

create index if not exists reminder_settings_updated_by_idx on public.reminder_settings (updated_by);

insert into public.reminder_settings (jenis, aktif, menit, judul, isi) values
  ('masuk', true, 15, 'Sebentar lagi jam masuk', 'Jadwal masuk Anda pukul {jam} WIB. Jangan lupa absen masuk.'),
  ('terlambat', true, 0, 'Anda belum absen masuk hari ini', 'Jadwal masuk Anda pukul {jam} WIB. Kalau hari ini izin atau sakit, ajukan cuti.'),
  ('pulang', true, 0, 'Sudah jam pulang', 'Jadwal pulang Anda pukul {jam} WIB. Jangan lupa absen pulang.')
on conflict (jenis) do nothing;

alter table public.reminder_settings enable row level security;

-- Only HR / super admin read or change them; the reminder cron uses the
-- service role.
drop policy if exists reminder_settings_hr on public.reminder_settings;
create policy reminder_settings_hr on public.reminder_settings
  for all using (public.is_hr_admin_role()) with check (public.is_hr_admin_role());

-- Run the reminder pass every 5 minutes (was 15, migration 0047) so a reminder
-- lands within 5 minutes of the time HR set. cron.schedule with an existing
-- job name updates that job.
select cron.schedule(
  'absen-reminder',
  '*/5 * * * *',
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
