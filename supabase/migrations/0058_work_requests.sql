-- Pengajuan lembur & dinas luar, approved by the employee's approver (same
-- routing as leave) or HR.
--
-- lembur:     one day, jam_mulai–jam_selesai (WIB). Only approved lembur is
--             paid, capped by the real clock-out (src/lib/payroll/overtime.ts).
-- dinas_luar: a date range + tujuan. On approved days the employee still
--             clocks in/out (selfie + GPS from anywhere) but is not marked
--             "di luar lokasi" and needs no reason.
--
-- All writes go through server actions with the service role, authorised in
-- the app (like attendance corrections, 0041).
create table if not exists public.work_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  jenis text not null check (jenis in ('lembur', 'dinas_luar')),
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  jam_mulai time,
  jam_selesai time,
  tujuan text,
  alasan text not null check (btrim(alasan) <> '' and length(alasan) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'dibatalkan')),
  approver_id uuid references public.employees(id) on delete set null,
  catatan_approval text,
  decided_by uuid references public.employees(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint work_requests_range_check check (tanggal_selesai >= tanggal_mulai),
  constraint work_requests_lembur_check check (
    jenis <> 'lembur'
    or (tanggal_selesai = tanggal_mulai and jam_mulai is not null and jam_selesai is not null and jam_selesai > jam_mulai)
  ),
  constraint work_requests_dinas_check check (jenis <> 'dinas_luar' or (tujuan is not null and btrim(tujuan) <> ''))
);

create index if not exists work_requests_employee_idx on public.work_requests (employee_id, tanggal_mulai);
create index if not exists work_requests_pending_approver_idx on public.work_requests (approver_id) where status = 'pending';
create index if not exists work_requests_decided_by_idx on public.work_requests (decided_by);

alter table public.work_requests enable row level security;

drop policy if exists work_requests_select on public.work_requests;
create policy work_requests_select on public.work_requests for select using (
  employee_id = auth.uid() or approver_id = auth.uid() or public.is_hr_admin_role()
);

-- No client write policies: the server inserts requests (approver resolved
-- there, so an employee can't pick their own approver) and records decisions.
