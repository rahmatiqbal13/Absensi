-- supabase/migrations/0064_reopen_payroll.sql
--
-- "Buka kembali payroll": HR returns a finalized period to draft, e.g. when
-- attendance for that month arrived late (machine scans pulled after the
-- period was finalized) and the payslips must be regenerated.
--
-- Refused once the period is marked paid (0045): money already went out, so
-- HR must first undo "dibayar" deliberately. Audited like every payroll step.
-- While draft, attendance for the month is writable again (corrections,
-- machine scans) and the period can be regenerated + finalized as usual.

create or replace function reopen_payroll(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period payroll_periods;
begin
  if auth.uid() is null or is_hr_admin_role() = false then
    raise exception 'only hr admin may run payroll';
  end if;

  select * into v_period from payroll_periods where id = p_period_id for update;
  if v_period.id is null then
    raise exception 'payroll period not found';
  end if;
  if v_period.status <> 'final' then
    raise exception 'payroll period is still draft';
  end if;
  if v_period.dibayar_pada is not null then
    raise exception 'payroll period is already paid';
  end if;

  update payroll_periods set status = 'draft' where id = p_period_id;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (auth.uid(), null, 'payroll_reopened',
    jsonb_build_object(
      'payroll_period_id', v_period.id,
      'branch_id', v_period.branch_id,
      'bulan', v_period.bulan,
      'tahun', v_period.tahun),
    false);
end;
$$;

revoke execute on function reopen_payroll(uuid) from public, anon;
grant execute on function reopen_payroll(uuid) to authenticated, service_role;
