-- supabase/migrations/0036_pph21_withholding.sql
--
-- PPh 21 withheld from every payslip at a flat company rate (default 1%).
--
--   app_settings.tarif_pph21_persen   rate in percent, set by a super admin
--   payslips.tarif_pph21              rate applied to this payslip (snapshot,
--                                     so a later rate change never rewrites
--                                     history)
--   payslips.potongan_pph21           amount withheld
--
-- Base = gaji pokok − potongan absensi (the wage actually earned that month);
-- gaji_akhir = base − potongan_pph21. Math in src/lib/payroll/pph21.ts.

alter table app_settings
  add column if not exists tarif_pph21_persen numeric(5,2) not null default 1
    check (tarif_pph21_persen >= 0 and tarif_pph21_persen <= 100);

alter table payslips
  add column if not exists tarif_pph21 numeric(5,2) not null default 0,
  add column if not exists potongan_pph21 numeric(14,2) not null default 0;

-- Same body as 0017, plus the two PPh 21 columns (coalesced so an older caller
-- that omits them still writes 0 rather than failing).
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
    gaji_harian, total_potongan_absensi, tarif_pph21, potongan_pph21,
    gaji_akhir, rincian_harian
  )
  select
    p_period_id, x.employee_id, x.gaji_pokok, x.hari_kerja_efektif,
    x.gaji_harian, x.total_potongan_absensi, coalesce(x.tarif_pph21, 0),
    coalesce(x.potongan_pph21, 0), x.gaji_akhir, x.rincian_harian
  from jsonb_to_recordset(p_rows) as x(
    employee_id uuid, gaji_pokok numeric, hari_kerja_efektif integer,
    gaji_harian numeric, total_potongan_absensi numeric, tarif_pph21 numeric,
    potongan_pph21 numeric, gaji_akhir numeric, rincian_harian jsonb
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function generate_payroll(uuid, jsonb) from public, anon;
grant execute on function generate_payroll(uuid, jsonb) to authenticated, service_role;
