-- Perintah ke mesin absensi lewat jembatan LAN (scripts/mesin-bridge), dan
-- daftar pengguna yang terdaftar di mesin.
--
-- * mesin_commands — antrian perintah dari aplikasi ke mesin. HR menekan
--   "Tarik data pegawai dari mesin" → baris 'menunggu'. Jembatan mengambilnya
--   ('diambil'), menyerahkannya ke mesin saat mesin menanyakan perintah
--   (receive_cmd), lalu mengirim balik hasilnya ('selesai' / 'gagal').
-- * mesin_users — PIN + nama seperti tersimpan di mesin, untuk membantu HR
--   memasangkan PIN ke pegawai. Data sidik jari tidak pernah disimpan.
--
-- Tulis hanya lewat service role (server action / API jembatan).

create table if not exists public.mesin_commands (
  id uuid primary key default gen_random_uuid(),
  cmd_code text not null check (cmd_code ~ '^[A-Z_]{3,40}$'),
  params jsonb not null default '{}'::jsonb,
  status text not null default 'menunggu'
    check (status in ('menunggu', 'diambil', 'selesai', 'gagal')),
  -- cmd_return_code dari mesin (OK, ERROR, NOT SUPPORT CMD, …).
  kode_balasan text,
  -- Balasan mentah mesin (JSON), dipangkas; untuk diagnosis.
  hasil jsonb,
  percobaan int not null default 0,
  -- Perintah lanjutan (GET_USER_INFO per PIN) menunjuk ke permintaan awalnya.
  induk_id uuid references public.mesin_commands(id) on delete cascade,
  diminta_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  diambil_at timestamptz,
  selesai_at timestamptz
);

create index if not exists mesin_commands_status_idx on public.mesin_commands (status, created_at);
create index if not exists mesin_commands_induk_id_idx on public.mesin_commands (induk_id);
create index if not exists mesin_commands_diminta_oleh_idx on public.mesin_commands (diminta_oleh);

alter table public.mesin_commands enable row level security;
drop policy if exists mesin_commands_select on public.mesin_commands;
create policy mesin_commands_select on public.mesin_commands for select using (is_hr_admin_role());

create table if not exists public.mesin_users (
  pin text primary key check (pin ~ '^[0-9A-Za-z]{1,20}$'),
  nama text,
  sn text,
  diperbarui_at timestamptz not null default now()
);

alter table public.mesin_users enable row level security;
drop policy if exists mesin_users_select on public.mesin_users;
create policy mesin_users_select on public.mesin_users for select using (is_hr_admin_role());
