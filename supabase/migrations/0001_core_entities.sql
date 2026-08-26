create extension if not exists pgcrypto;

create table branches (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  alamat text,
  lat double precision not null,
  long double precision not null,
  radius_geofencing_meter integer not null default 100,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete restrict,
  nama text not null,
  created_at timestamptz not null default now()
);

create table employees (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  email text not null unique,
  no_telp text,
  foto_profil_url text,
  branch_id uuid not null references branches(id) on delete restrict,
  department_id uuid references departments(id) on delete set null,
  atasan_id uuid references employees(id) on delete set null,
  designated_approver_id uuid references employees(id) on delete set null,
  jabatan text not null,
  status_kontrak text not null,
  tanggal_mulai_kerja date not null,
  gaji_pokok numeric(14,2) not null default 0,
  role text not null check (role in ('karyawan','atasan','hr_admin','super_admin')),
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  created_at timestamptz not null default now()
);

create index employees_branch_id_idx on employees(branch_id);
create index employees_atasan_id_idx on employees(atasan_id);

create table work_schedules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  jam_masuk time not null,
  jam_pulang time not null,
  hari_kerja integer[] not null,
  toleransi_terlambat_menit integer not null default 0,
  created_at timestamptz not null default now()
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  nama text not null,
  branch_id uuid references branches(id) on delete cascade,
  created_at timestamptz not null default now()
);
