-- Status jembatan LAN mesin absensi (scripts/mesin-bridge).
--
-- Jembatan melapor tiap menit lewat POST /api/mesin/perintah { status }:
--   bridge_at — kapan laporan terakhir diterima (jembatan hidup & ada internet)
--   mesin_at  — kapan mesin terakhir menghubungi jembatan
--   bridge_ip / port — alamat yang harus diisi sebagai Server IP / Port di mesin
--   mesin_ip  — alamat mesin seperti terlihat oleh jembatan
-- Halaman Pengaturan > Mesin absensi memakainya untuk memperingatkan HR saat
-- mesin terputus (mis. IP PC jembatan berganti) — scan saja tidak cukup, karena
-- jam sepi tanpa scan terlihat sama dengan mesin yang terputus.
--
-- Satu baris (satu jembatan per aplikasi). Tulis hanya lewat service role.

create table if not exists public.mesin_bridge_status (
  id text primary key default 'utama' check (id = 'utama'),
  bridge_at timestamptz not null,
  mesin_at timestamptz,
  bridge_ip text check (bridge_ip is null or length(bridge_ip) <= 45),
  port integer check (port is null or port between 1 and 65535),
  mesin_ip text check (mesin_ip is null or length(mesin_ip) <= 45),
  sn text check (sn is null or length(sn) <= 64)
);

alter table public.mesin_bridge_status enable row level security;
drop policy if exists mesin_bridge_status_select on public.mesin_bridge_status;
create policy mesin_bridge_status_select on public.mesin_bridge_status for select using (is_hr_admin_role());
