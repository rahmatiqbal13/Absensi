-- supabase/migrations/0017_payroll_generate_finalize_rpc.sql
--
-- Payroll persistence layer. The per-day deduction math (holidays,
-- approved-leave overlap, Asia/Jakarta minute extraction, mid-month
-- proration) lives in unit-tested TypeScript under src/lib/payroll/ — see
-- docs/superpowers/specs/2026-08-27-payroll-payslips-design.md §4-5. This
-- migration only provides ATOMICITY: generate_payroll takes the already
-- computed payslip rows as jsonb and writes them + guards the period status
-- in one transaction. Same shape as 0014's leave-approval RPCs.
--
-- SECURITY DEFINER because `payslips` has NO client write policy (0005 only
-- created payslips_select) — like leave_balances, it is written only by the
-- definer. The caller is a user-scoped client, and the function re-checks
-- is_hr_admin_role() against the real auth.uid() as its first line.

-- --- RLS: payroll_periods write becomes hr_admin only. 0005 set it to
-- is_admin_role(); 0009 widened is_admin_role() to include `atasan`. Spec §1:
-- /payroll is hr_admin/super_admin only. (payslips is already definer-only.)
drop policy if exists payroll_periods_write on payroll_periods;
create policy payroll_periods_write on payroll_periods
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

-- --- generate_payroll -------------------------------------------------------
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
    gaji_harian, total_potongan_absensi, gaji_akhir, rincian_harian
  )
  select
    p_period_id, x.employee_id, x.gaji_pokok, x.hari_kerja_efektif,
    x.gaji_harian, x.total_potongan_absensi, x.gaji_akhir, x.rincian_harian
  from jsonb_to_recordset(p_rows) as x(
    employee_id uuid, gaji_pokok numeric, hari_kerja_efektif integer,
    gaji_harian numeric, total_potongan_absensi numeric, gaji_akhir numeric,
    rincian_harian jsonb
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --- finalize_payroll ------------------------------------------------------
create or replace function finalize_payroll(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_payslips integer;
begin
  if auth.uid() is null or is_hr_admin_role() = false then
    raise exception 'only hr admin may run payroll';
  end if;

  select status into v_status from payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'payroll period not found';
  end if;
  if v_status = 'final' then
    raise exception 'payroll period is already finalized';
  end if;

  select count(*) into v_payslips from payslips where payroll_period_id = p_period_id;
  if v_payslips = 0 then
    raise exception 'cannot finalize a payroll period with no payslips';
  end if;

  update payroll_periods set status = 'final' where id = p_period_id;
end;
$$;

-- --- EXECUTE grants. Same reasoning as 0014's C1: `revoke from public` alone
-- leaves Supabase's explicit per-role `anon=X` grant standing; anon must be
-- named. Postgres checks EXECUTE against the caller's role BEFORE the
-- SECURITY DEFINER body runs, so an anon-key caller is rejected by Postgres.
revoke execute on function generate_payroll(uuid, jsonb) from public, anon;
revoke execute on function finalize_payroll(uuid) from public, anon;
grant execute on function generate_payroll(uuid, jsonb) to authenticated, service_role;
grant execute on function finalize_payroll(uuid) to authenticated, service_role;
