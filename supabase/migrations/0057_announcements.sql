-- Pengumuman: HR admin / super admin post a notice to everyone, one branch or
-- one department. Each target employee also gets a bell notification (0048),
-- which reaches their phone through Web Push (0055).
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  judul text not null check (btrim(judul) <> '' and length(judul) <= 150),
  isi text not null check (btrim(isi) <> '' and length(isi) <= 5000),
  sasaran text not null default 'semua' check (sasaran in ('semua', 'cabang', 'departemen')),
  branch_id uuid references public.branches(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcements_target_check check (
    (sasaran = 'semua' and branch_id is null and department_id is null)
    or (sasaran = 'cabang' and branch_id is not null and department_id is null)
    or (sasaran = 'departemen' and department_id is not null)
  )
);

create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists announcements_branch_idx on public.announcements (branch_id);
create index if not exists announcements_department_idx on public.announcements (department_id);
create index if not exists announcements_created_by_idx on public.announcements (created_by);

alter table public.announcements enable row level security;

-- Read: HR sees all; everyone else what is addressed to them.
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select using (
  public.is_hr_admin_role()
  or sasaran = 'semua'
  or (sasaran = 'cabang' and branch_id = (select e.branch_id from public.employees e where e.id = auth.uid()))
  or (sasaran = 'departemen' and department_id = (select e.department_id from public.employees e where e.id = auth.uid()))
);

drop policy if exists announcements_hr_write on public.announcements;
create policy announcements_hr_write on public.announcements
  for all using (public.is_hr_admin_role()) with check (public.is_hr_admin_role());

-- Bell notifications for announcements and for request decisions (0058).
alter table public.notifications drop constraint if exists notifications_jenis_check;
alter table public.notifications
  add constraint notifications_jenis_check
  check (jenis in ('lupa_absen', 'slip_gaji', 'kontrak', 'pengumuman', 'pengajuan'));
