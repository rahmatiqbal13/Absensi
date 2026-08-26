create table attendances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  tanggal date not null,
  jam_masuk timestamptz,
  lokasi_masuk point,
  foto_masuk_url text,
  foto_masuk_expires_at timestamptz,
  jam_pulang timestamptz,
  lokasi_pulang point,
  foto_pulang_url text,
  foto_pulang_expires_at timestamptz,
  status text not null check (status in ('tepat_waktu','terlambat','pulang_cepat','alpa','di_luar_lokasi')),
  catatan text,
  created_at timestamptz not null default now(),
  unique (employee_id, tanggal)
);

create index attendances_employee_id_idx on attendances(employee_id);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  jenis text not null check (jenis in (
    'tahunan','sakit','melahirkan','keguguran','menikah',
    'menikahkan_anak','khitan_baptis_anak','istri_melahirkan_keguguran',
    'kematian_keluarga_inti','kematian_keluarga_serumah','lainnya'
  )),
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  alasan text,
  lampiran_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_id uuid references employees(id),
  catatan_approval text,
  is_self_request boolean not null default false,
  created_at timestamptz not null default now()
);

create index leave_requests_employee_id_idx on leave_requests(employee_id);
create index leave_requests_approver_id_idx on leave_requests(approver_id);

create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  tahun integer not null,
  saldo_awal numeric(5,2) not null default 12,
  saldo_terpakai numeric(5,2) not null default 0,
  saldo_sisa numeric(5,2) generated always as (saldo_awal - saldo_terpakai) stored,
  unique (employee_id, tahun)
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  jenis text not null default 'lokasi_foto_absensi',
  disetujui_at timestamptz not null default now(),
  versi_kebijakan text not null
);
