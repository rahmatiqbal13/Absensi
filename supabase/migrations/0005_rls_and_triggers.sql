-- supabase/migrations/0005_rls_and_triggers.sql

-- Helper functions (SECURITY DEFINER: bypass RLS on `employees` themselves
-- to avoid infinite recursion when policies check the caller's role)
create or replace function current_employee_role()
returns text language sql security definer set search_path = public stable as $$
  select role from employees where id = auth.uid();
$$;

create or replace function is_admin_role()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(current_employee_role() in ('hr_admin','super_admin'), false);
$$;

-- Anti-fraud trigger: block non-admins from changing protected fields on
-- their own employee row, even though the base UPDATE policy allows self-update
-- (self-update is needed for no_telp/foto_profil_url).
create or replace function prevent_employee_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin_role() = false and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.gaji_pokok is distinct from old.gaji_pokok
       or new.branch_id is distinct from old.branch_id
       or new.department_id is distinct from old.department_id
       or new.atasan_id is distinct from old.atasan_id
       or new.designated_approver_id is distinct from old.designated_approver_id
       or new.status is distinct from old.status
    then
      raise exception 'not allowed to change protected fields on own employee record';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_privilege_escalation
before update on employees
for each row execute function prevent_employee_self_privilege_escalation();

-- Anti-fraud trigger: block self-approval on leave_requests at the DB level.
create or replace function prevent_leave_self_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved','rejected') and old.status = 'pending' then
    if new.approver_id = new.employee_id then
      raise exception 'self-approval is not allowed';
    end if;
    if new.approver_id is distinct from auth.uid() and is_admin_role() = false then
      raise exception 'only the assigned approver may act on this request';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_leave_self_approval
before update on leave_requests
for each row execute function prevent_leave_self_approval();

-- Enable RLS
alter table branches enable row level security;
alter table departments enable row level security;
alter table employees enable row level security;
alter table work_schedules enable row level security;
alter table holidays enable row level security;
alter table attendances enable row level security;
alter table leave_requests enable row level security;
alter table leave_balances enable row level security;
alter table consents enable row level security;
alter table payroll_periods enable row level security;
alter table payslips enable row level security;
alter table audit_logs enable row level security;

-- Reference/config tables: read for any authenticated user, write for admin only
create policy branches_select on branches for select using (auth.role() = 'authenticated');
create policy branches_write on branches for all using (is_admin_role()) with check (is_admin_role());

create policy departments_select on departments for select using (auth.role() = 'authenticated');
create policy departments_write on departments for all using (is_admin_role()) with check (is_admin_role());

create policy work_schedules_select on work_schedules for select using (auth.role() = 'authenticated');
create policy work_schedules_write on work_schedules for all using (is_admin_role()) with check (is_admin_role());

create policy holidays_select on holidays for select using (auth.role() = 'authenticated');
create policy holidays_write on holidays for all using (is_admin_role()) with check (is_admin_role());

-- employees
create policy employees_select on employees for select using (
  id = auth.uid() or atasan_id = auth.uid() or is_admin_role()
);
create policy employees_update on employees for update using (
  id = auth.uid() or is_admin_role()
) with check (
  id = auth.uid() or is_admin_role()
);

-- attendances
create policy attendances_select on attendances for select using (
  employee_id = auth.uid()
  or is_admin_role()
  or employee_id in (select id from employees where atasan_id = auth.uid())
);
create policy attendances_insert on attendances for insert with check (
  employee_id = auth.uid()
);
create policy attendances_update on attendances for update using (
  employee_id = auth.uid() or is_admin_role()
) with check (
  employee_id = auth.uid() or is_admin_role()
);

-- leave_requests
create policy leave_requests_select on leave_requests for select using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or is_admin_role()
  or employee_id in (select id from employees where atasan_id = auth.uid())
);
create policy leave_requests_insert on leave_requests for insert with check (
  employee_id = auth.uid()
);
create policy leave_requests_update on leave_requests for update using (
  approver_id = auth.uid() or is_admin_role()
) with check (
  approver_id = auth.uid() or is_admin_role()
);

-- leave_balances: read-only for clients; writes happen via service role only
create policy leave_balances_select on leave_balances for select using (
  employee_id = auth.uid()
  or is_admin_role()
  or employee_id in (select id from employees where atasan_id = auth.uid())
);

-- consents
create policy consents_select on consents for select using (employee_id = auth.uid() or is_admin_role());
create policy consents_insert on consents for insert with check (employee_id = auth.uid());

-- payroll_periods / payslips: admin only for periods; own payslip for employees
create policy payroll_periods_select on payroll_periods for select using (is_admin_role());
create policy payroll_periods_write on payroll_periods for all using (is_admin_role()) with check (is_admin_role());

create policy payslips_select on payslips for select using (
  employee_id = auth.uid() or is_admin_role()
);

-- audit_logs: admin read-only, no client insert (system-only via service role)
create policy audit_logs_select on audit_logs for select using (is_admin_role());
