create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  bulan integer not null check (bulan between 1 and 12),
  tahun integer not null,
  status text not null default 'draft' check (status in ('draft','final')),
  created_at timestamptz not null default now(),
  unique (branch_id, bulan, tahun)
);

create table payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  gaji_pokok numeric(14,2) not null,
  hari_kerja_efektif integer not null,
  gaji_harian numeric(14,2) not null,
  total_potongan_absensi numeric(14,2) not null default 0,
  gaji_akhir numeric(14,2) not null,
  rincian_harian jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (employee_id, payroll_period_id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references employees(id),
  target_employee_id uuid references employees(id),
  aksi text not null,
  waktu timestamptz not null default now(),
  detail jsonb,
  is_self_action boolean not null default false
);

create index audit_logs_target_idx on audit_logs(target_employee_id);
