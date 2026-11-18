-- Jadwal shift: HR defines shifts per branch (e.g. Pagi 07:00–15:00) and puts
-- employees on a shift per date (roster). A roster row with shift_id null is a
-- day off. Dates without a roster row keep the regular work schedule (0001,
-- 0034), so nothing changes for employees who are not on a roster.
-- Shifts must end on the day they start (no overnight shifts yet).
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  nama text not null check (btrim(nama) <> '' and length(nama) <= 40),
  jam_masuk time not null,
  jam_pulang time not null,
  toleransi_terlambat_menit integer not null default 0 check (toleransi_terlambat_menit between 0 and 180),
  created_at timestamptz not null default now(),
  constraint shifts_same_day check (jam_pulang > jam_masuk),
  unique (branch_id, nama)
);

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  tanggal date not null,
  -- null = libur on this date.
  shift_id uuid references public.shifts(id) on delete cascade,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, tanggal)
);

create index if not exists shift_assignments_tanggal_idx on public.shift_assignments (tanggal);
create index if not exists shift_assignments_shift_idx on public.shift_assignments (shift_id);
create index if not exists shift_assignments_created_by_idx on public.shift_assignments (created_by);

alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select using (auth.role() = 'authenticated');
drop policy if exists shifts_hr_write on public.shifts;
create policy shifts_hr_write on public.shifts
  for all using (public.is_hr_admin_role()) with check (public.is_hr_admin_role());

-- Own roster, and admins (atasan included, they see their team's days).
drop policy if exists shift_assignments_select on public.shift_assignments;
create policy shift_assignments_select on public.shift_assignments
  for select using (employee_id = auth.uid() or public.is_admin_role());
drop policy if exists shift_assignments_hr_write on public.shift_assignments;
create policy shift_assignments_hr_write on public.shift_assignments
  for all using (public.is_hr_admin_role()) with check (public.is_hr_admin_role());
