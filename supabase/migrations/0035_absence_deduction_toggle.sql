-- supabase/migrations/0035_absence_deduction_toggle.sql
--
-- Whether an unexcused absent day (alpa) is deducted from salary. For now the
-- company pays full salary regardless, so the default is OFF. A super admin can
-- switch it on for everyone, or for/against specific employees.
--
--   app_settings.potong_alpa   company-wide default (false = paid in full)
--   employees.potong_alpa      null  = follow the company setting
--                              true  = always deduct alpa for this employee
--                              false = never deduct alpa for this employee
--
-- Resolution: src/lib/payroll/absence-deduction.ts.

alter table app_settings
  add column if not exists potong_alpa boolean not null default false;

alter table employees
  add column if not exists potong_alpa boolean;

-- Only a super admin may change an employee's alpa-deduction choice. HR admins
-- can otherwise edit employees; the service role (auth.uid() null) is exempt.
-- Self-edits by non-admins are already blocked by
-- prevent_employee_self_privilege_escalation (0009).
create or replace function prevent_potong_alpa_change_by_non_super_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.potong_alpa is distinct from (case when tg_op = 'UPDATE' then old.potong_alpa end)
     and is_super_admin() = false then
    raise exception 'only super admin may change potong_alpa';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_potong_alpa_change on employees;
create trigger trg_prevent_potong_alpa_change
  before insert or update of potong_alpa on employees
  for each row execute function prevent_potong_alpa_change_by_non_super_admin();
