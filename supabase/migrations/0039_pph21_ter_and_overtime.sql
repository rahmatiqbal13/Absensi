-- supabase/migrations/0039_pph21_ter_and_overtime.sql
--
-- PRD §6 payroll "sampai PPh21", using the monthly TER method (PP 58/2023,
-- PMK 168/2023) that employers have used for monthly withholding since 2024.
--
--   employees.status_ptkp       TK/0 … K/3 — drives the TER category
--   pph21_ptkp_kategori         status_ptkp → TER category A/B/C (editable)
--   pph21_ter_rates             TER brackets per category (editable, no deploy)
--   app_settings.metode_pph21   'ter' (default) or 'tarif_tetap' (flat rate
--                               from 0036's tarif_pph21_persen)
--   work_schedules.hitung_lembur  pay overtime past jam_pulang (default OFF:
--                               overtime needs a written order, PP 35/2021)
--   payslips: kategori_ter, menit_lembur, upah_lembur, penghasilan_bruto
--
-- !! The seeded TER brackets MUST be checked against the official lampiran of
-- PP 58/2023 before being used for real pay (PRD §6 risk note: parallel-run
-- the first 1–2 payroll periods against a manual calculation). They are data,
-- editable in Pengaturan → Potongan gaji.
--
-- Not covered (by design, flag to HR): the December / final-period annual
-- recalculation under Pasal 17, THR/bonus, and non-permanent employees.

alter table employees
  add column if not exists status_ptkp text not null default 'TK/0';
alter table employees drop constraint if exists employees_status_ptkp_check;
alter table employees add constraint employees_status_ptkp_check
  check (status_ptkp in ('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3'));

create table if not exists pph21_ptkp_kategori (
  status_ptkp text primary key,
  kategori text not null check (kategori in ('A','B','C'))
);
insert into pph21_ptkp_kategori (status_ptkp, kategori) values
  ('TK/0','A'),('TK/1','A'),('K/0','A'),
  ('TK/2','B'),('TK/3','B'),('K/1','B'),('K/2','B'),
  ('K/3','C')
on conflict (status_ptkp) do nothing;

-- One row per bracket: applies from batas_bawah (inclusive, rupiah of monthly
-- gross) up to the next row's batas_bawah in the same category.
create table if not exists pph21_ter_rates (
  kategori text not null check (kategori in ('A','B','C')),
  batas_bawah numeric(16,0) not null check (batas_bawah >= 0),
  tarif_persen numeric(5,2) not null check (tarif_persen >= 0 and tarif_persen <= 100),
  primary key (kategori, batas_bawah)
);
insert into pph21_ter_rates (kategori, batas_bawah, tarif_persen) values
  ('A', 0, 0),
  ('A', 5400001, 0.25),
  ('A', 5650001, 0.5),
  ('A', 5950001, 0.75),
  ('A', 6300001, 1),
  ('A', 6750001, 1.25),
  ('A', 7500001, 1.5),
  ('A', 8550001, 1.75),
  ('A', 9650001, 2),
  ('A', 10050001, 2.25),
  ('A', 10350001, 2.5),
  ('A', 10700001, 3),
  ('A', 11050001, 3.5),
  ('A', 11600001, 4),
  ('A', 12500001, 5),
  ('A', 13750001, 6),
  ('A', 15100001, 7),
  ('A', 16950001, 8),
  ('A', 19750001, 9),
  ('A', 24150001, 10),
  ('A', 26450001, 11),
  ('A', 28000001, 12),
  ('A', 30050001, 13),
  ('A', 32400001, 14),
  ('A', 35400001, 15),
  ('A', 39100001, 16),
  ('A', 43850001, 17),
  ('A', 47800001, 18),
  ('A', 51400001, 19),
  ('A', 56300001, 20),
  ('A', 62200001, 21),
  ('A', 68600001, 22),
  ('A', 77500001, 23),
  ('A', 89000001, 24),
  ('A', 103000001, 25),
  ('A', 125000001, 26),
  ('A', 157000001, 27),
  ('A', 206000001, 28),
  ('A', 337000001, 29),
  ('A', 454000001, 30),
  ('A', 550000001, 31),
  ('A', 695000001, 32),
  ('A', 910000001, 33),
  ('A', 1400000001, 34),
  ('B', 0, 0),
  ('B', 6200001, 0.25),
  ('B', 6500001, 0.5),
  ('B', 6850001, 0.75),
  ('B', 7300001, 1),
  ('B', 9200001, 1.5),
  ('B', 10750001, 2),
  ('B', 11250001, 2.5),
  ('B', 11600001, 3),
  ('B', 12600001, 4),
  ('B', 13600001, 5),
  ('B', 14950001, 6),
  ('B', 16400001, 7),
  ('B', 18450001, 8),
  ('B', 21850001, 9),
  ('B', 26000001, 10),
  ('B', 27700001, 11),
  ('B', 29350001, 12),
  ('B', 31450001, 13),
  ('B', 33950001, 14),
  ('B', 37100001, 15),
  ('B', 41100001, 16),
  ('B', 45800001, 17),
  ('B', 49500001, 18),
  ('B', 53800001, 19),
  ('B', 58500001, 20),
  ('B', 64000001, 21),
  ('B', 71000001, 22),
  ('B', 80000001, 23),
  ('B', 93000001, 24),
  ('B', 109000001, 25),
  ('B', 129000001, 26),
  ('B', 163000001, 27),
  ('B', 211000001, 28),
  ('B', 374000001, 29),
  ('B', 459000001, 30),
  ('B', 555000001, 31),
  ('B', 704000001, 32),
  ('B', 957000001, 33),
  ('B', 1405000001, 34),
  ('C', 0, 0),
  ('C', 6600001, 0.25),
  ('C', 6950001, 0.5),
  ('C', 7350001, 0.75),
  ('C', 7800001, 1),
  ('C', 8850001, 1.25),
  ('C', 9800001, 1.5),
  ('C', 10950001, 1.75),
  ('C', 11200001, 2),
  ('C', 12050001, 3),
  ('C', 12950001, 4),
  ('C', 14150001, 5),
  ('C', 15550001, 6),
  ('C', 17050001, 7),
  ('C', 19500001, 8),
  ('C', 22700001, 9),
  ('C', 26600001, 10),
  ('C', 28100001, 11),
  ('C', 30100001, 12),
  ('C', 32600001, 13),
  ('C', 35400001, 14),
  ('C', 38900001, 15),
  ('C', 43000001, 16),
  ('C', 47400001, 17),
  ('C', 51200001, 18),
  ('C', 55800001, 19),
  ('C', 60400001, 20),
  ('C', 66700001, 21),
  ('C', 74500001, 22),
  ('C', 83200001, 23),
  ('C', 95600001, 24),
  ('C', 110000001, 25),
  ('C', 134000001, 26),
  ('C', 169000001, 27),
  ('C', 221000001, 28),
  ('C', 390000001, 29),
  ('C', 463000001, 30),
  ('C', 561000001, 31),
  ('C', 709000001, 32),
  ('C', 965000001, 33),
  ('C', 1419000001, 34)
on conflict (kategori, batas_bawah) do nothing;

alter table pph21_ptkp_kategori enable row level security;
alter table pph21_ter_rates enable row level security;
drop policy if exists pph21_ptkp_kategori_select on pph21_ptkp_kategori;
create policy pph21_ptkp_kategori_select on pph21_ptkp_kategori for select using (auth.role() = 'authenticated');
drop policy if exists pph21_ptkp_kategori_write on pph21_ptkp_kategori;
create policy pph21_ptkp_kategori_write on pph21_ptkp_kategori
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());
drop policy if exists pph21_ter_rates_select on pph21_ter_rates;
create policy pph21_ter_rates_select on pph21_ter_rates for select using (auth.role() = 'authenticated');
drop policy if exists pph21_ter_rates_write on pph21_ter_rates;
create policy pph21_ter_rates_write on pph21_ter_rates
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

alter table app_settings
  add column if not exists metode_pph21 text not null default 'ter'
    check (metode_pph21 in ('ter', 'tarif_tetap'));

alter table work_schedules
  add column if not exists hitung_lembur boolean not null default false;

alter table payslips
  add column if not exists kategori_ter text,
  add column if not exists menit_lembur integer not null default 0,
  add column if not exists upah_lembur numeric(14,2) not null default 0,
  add column if not exists penghasilan_bruto numeric(14,2) not null default 0;

create or replace function generate_payroll(p_period_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count integer;
begin
  if auth.uid() is null or is_hr_admin_role() = false then
    raise exception 'only hr admin may run payroll';
  end if;

  select status into v_status from payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'payroll period not found';
  end if;
  if v_status = 'final' then
    raise exception 'payroll period is finalized';
  end if;

  delete from payslips where payroll_period_id = p_period_id;

  insert into payslips (
    payroll_period_id, employee_id, gaji_pokok, hari_kerja_efektif,
    gaji_harian, total_potongan_absensi, menit_lembur, upah_lembur,
    penghasilan_bruto, tarif_pph21, kategori_ter, potongan_pph21,
    gaji_akhir, rincian_harian
  )
  select
    p_period_id, x.employee_id, x.gaji_pokok, x.hari_kerja_efektif,
    x.gaji_harian, x.total_potongan_absensi, coalesce(x.menit_lembur, 0),
    coalesce(x.upah_lembur, 0), coalesce(x.penghasilan_bruto, 0),
    coalesce(x.tarif_pph21, 0), x.kategori_ter, coalesce(x.potongan_pph21, 0),
    x.gaji_akhir, x.rincian_harian
  from jsonb_to_recordset(p_rows) as x(
    employee_id uuid, gaji_pokok numeric, hari_kerja_efektif integer,
    gaji_harian numeric, total_potongan_absensi numeric, menit_lembur integer,
    upah_lembur numeric, penghasilan_bruto numeric, tarif_pph21 numeric,
    kategori_ter text, potongan_pph21 numeric, gaji_akhir numeric,
    rincian_harian jsonb
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function generate_payroll(uuid, jsonb) from public, anon;
grant execute on function generate_payroll(uuid, jsonb) to authenticated, service_role;
