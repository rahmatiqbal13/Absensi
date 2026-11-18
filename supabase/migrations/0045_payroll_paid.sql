-- supabase/migrations/0045_payroll_paid.sql
--
-- "Dibayar": HR records that a finalized payroll has been transferred.
--
-- Deliberately NOT a third value of payroll_periods.status: generate_payroll,
-- finalize_payroll, the PPh21 RPCs and apply_attendance_correction all lock on
-- `status = 'final'`, and a new status would slip past every one of them. A
-- paid period stays 'final' (still locked) and carries the payment date.

alter table payroll_periods
  add column dibayar_pada date,
  add column dibayar_oleh uuid references employees(id) on delete set null,
  add constraint payroll_periods_paid_requires_final
    check (dibayar_pada is null or status = 'final');

-- p_tanggal = payment date, or null to undo a mistaken "dibayar".
create or replace function set_payroll_paid(p_period_id uuid, p_tanggal date)
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
    raise exception 'payroll period is not finalized';
  end if;
  if p_tanggal is not null and p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'payment date is in the future';
  end if;

  update payroll_periods
  set dibayar_pada = p_tanggal,
      dibayar_oleh = case when p_tanggal is null then null else auth.uid() end
  where id = p_period_id;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (auth.uid(), null,
    case when p_tanggal is null then 'payroll_paid_undone' else 'payroll_paid' end,
    jsonb_build_object(
      'payroll_period_id', v_period.id,
      'branch_id', v_period.branch_id,
      'bulan', v_period.bulan,
      'tahun', v_period.tahun,
      'dibayar_pada', p_tanggal,
      'sebelumnya', v_period.dibayar_pada),
    false);
end;
$$;

revoke execute on function set_payroll_paid(uuid, date) from public, anon;
grant execute on function set_payroll_paid(uuid, date) to authenticated, service_role;
