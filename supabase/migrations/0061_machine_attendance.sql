-- Mesin absensi (fingerprint, e.g. Fingerspot Revo W-231N).
--
-- * employees.pin_mesin — the employee's PIN / EnNo on the machine, so a scan
--   can be matched to a person.
-- * mesin_scans — every raw scan ever imported (from a USB log file or pushed
--   by the office LAN bridge), deduplicated on (pin, waktu). Kept for audit
--   and so a day can be rebuilt from its scans.
-- * attendances.metode_masuk / metode_pulang gain 'mesin'.
--
-- Writes go through the service role only (server actions / the bridge API).

alter table public.employees
  add column if not exists pin_mesin text
    check (pin_mesin is null or pin_mesin ~ '^[0-9A-Za-z]{1,20}$');

create unique index if not exists employees_pin_mesin_key
  on public.employees (pin_mesin) where pin_mesin is not null;

-- Whoever owns a PIN owns its scans, so only HR / super admin (or the service
-- role, auth.uid() null) may set it. An atasan can update other employees'
-- rows (0018) and karyawan their own (0009 allowlist), so guard it explicitly.
create or replace function prevent_pin_mesin_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and is_hr_admin_role() = false
     and new.pin_mesin is distinct from old.pin_mesin then
    raise exception 'not allowed to change pin_mesin';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_pin_mesin_guard on public.employees;
create trigger employees_pin_mesin_guard
  before update on public.employees
  for each row execute function prevent_pin_mesin_change();

create table if not exists public.mesin_scans (
  id uuid primary key default gen_random_uuid(),
  pin text not null,
  waktu timestamptz not null,
  -- Machine serial number, when known (the LAN bridge sends it).
  sn text,
  sumber text not null check (sumber in ('file', 'jaringan')),
  employee_id uuid references public.employees(id) on delete set null,
  diimpor_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pin, waktu)
);

create index if not exists mesin_scans_employee_id_idx on public.mesin_scans (employee_id);
create index if not exists mesin_scans_diimpor_oleh_idx on public.mesin_scans (diimpor_oleh);
create index if not exists mesin_scans_waktu_idx on public.mesin_scans (waktu);

alter table public.mesin_scans enable row level security;

-- HR / super admin may read the raw log; nobody writes through PostgREST.
drop policy if exists mesin_scans_select on public.mesin_scans;
create policy mesin_scans_select on public.mesin_scans for select using (is_hr_admin_role());

alter table public.attendances drop constraint if exists attendances_metode_masuk_check;
alter table public.attendances add constraint attendances_metode_masuk_check
  check (metode_masuk in ('gps', 'qr', 'koreksi', 'mesin'));
alter table public.attendances drop constraint if exists attendances_metode_pulang_check;
alter table public.attendances add constraint attendances_metode_pulang_check
  check (metode_pulang in ('gps', 'qr', 'koreksi', 'mesin'));
