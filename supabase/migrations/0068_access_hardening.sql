-- supabase/migrations/0068_access_hardening.sql
--
-- Access hardening from the system audit. Rules only — no existing row is
-- changed.
--
-- K1. 0009 made `atasan` a full admin at the database layer (is_admin_role()
--     includes atasan). The app only shows an atasan their own team, but with
--     their own session and the public anon key they could read every
--     employee's salary, payslips, personal data, attendance and leave across
--     all branches, edit any employee's unprotected fields (status PTKP,
--     potong_alpa, personal data) and rewrite branches (office point, radius,
--     qr_secret). Every trigger/function already moved to is_hr_admin_role()
--     (0010+); only RLS policies still used is_admin_role(). It now means HR /
--     super admin again, and an atasan keeps exactly what their work needs:
--     their own team, plus the people whose requests they were made approver
--     of (designated approver of an HR / super admin, etc.).
--
-- K2. current_employee_role() ignored employees.status, so a deactivated HR /
--     atasan kept their database privileges for as long as their session could
--     be refreshed. Only active employees have a role now. (The app also bans
--     the auth user on deactivation, see karyawan/actions.ts.)
--
-- K3. HR could grant the super_admin role or edit a super admin's account,
--     defeating the super-admin-only settings (potongan gaji / PPh21,
--     instansi). Only a super admin may do that now.

-- K2 ---------------------------------------------------------------------------
create or replace function current_employee_role()
returns text language sql security definer set search_path = public stable as $$
  select role from employees where id = auth.uid() and status = 'aktif';
$$;

-- K1 ---------------------------------------------------------------------------
create or replace function is_admin_role()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(current_employee_role() in ('hr_admin', 'super_admin'), false);
$$;

-- True when the caller supervises `p_employee`: their direct atasan, or the
-- approver of any of that employee's leave / correction / work requests.
-- security definer so policies on these tables can use it without recursing
-- into each other's RLS.
create or replace function can_supervise(p_employee uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select current_employee_role() is not null and (
    exists (select 1 from employees where id = p_employee and atasan_id = auth.uid())
    or exists (select 1 from leave_requests where employee_id = p_employee and approver_id = auth.uid())
    or exists (select 1 from attendance_corrections where employee_id = p_employee and approver_id = auth.uid())
    or exists (select 1 from work_requests where employee_id = p_employee and approver_id = auth.uid())
  );
$$;
revoke execute on function can_supervise(uuid) from public, anon;
grant execute on function can_supervise(uuid) to authenticated, service_role;

drop policy if exists employees_select on employees;
create policy employees_select on employees for select using (
  id = auth.uid() or is_hr_admin_role() or can_supervise(id)
);
drop policy if exists employees_update on employees;
create policy employees_update on employees for update using (
  id = auth.uid() or is_hr_admin_role()
) with check (
  id = auth.uid() or is_hr_admin_role()
);

drop policy if exists attendances_select on attendances;
create policy attendances_select on attendances for select using (
  employee_id = auth.uid() or is_hr_admin_role() or can_supervise(employee_id)
);

drop policy if exists leave_balances_select on leave_balances;
create policy leave_balances_select on leave_balances for select using (
  employee_id = auth.uid() or is_hr_admin_role() or can_supervise(employee_id)
);

drop policy if exists leave_requests_select on leave_requests;
create policy leave_requests_select on leave_requests for select using (
  employee_id = auth.uid() or approver_id = auth.uid() or is_hr_admin_role() or can_supervise(employee_id)
);
-- Decisions go through approve/reject/cancel RPCs (security definer), which
-- also move the leave balance. A direct UPDATE by the approver could approve
-- without charging the balance, so only HR keeps it (for repairs).
drop policy if exists leave_requests_update on leave_requests;
create policy leave_requests_update on leave_requests for update using (is_hr_admin_role()) with check (is_hr_admin_role());

drop policy if exists shift_assignments_select on public.shift_assignments;
create policy shift_assignments_select on public.shift_assignments for select using (
  employee_id = auth.uid() or public.is_hr_admin_role() or public.can_supervise(employee_id)
);

drop policy if exists consents_select on consents;
create policy consents_select on consents for select using (employee_id = auth.uid() or is_hr_admin_role());

drop policy if exists payroll_periods_select on payroll_periods;
create policy payroll_periods_select on payroll_periods for select using (is_hr_admin_role());

drop policy if exists payslips_select on payslips;
create policy payslips_select on payslips for select using (employee_id = auth.uid() or is_hr_admin_role());

drop policy if exists branches_write on branches;
create policy branches_write on branches for all using (is_hr_admin_role()) with check (is_hr_admin_role());

-- K3 ---------------------------------------------------------------------------
create or replace function guard_super_admin_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Service role (auth.uid() null) and super admins are not restricted.
  if auth.uid() is null or current_employee_role() = 'super_admin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role = 'super_admin' then
      raise exception 'only a super admin may grant the super_admin role';
    end if;
    return new;
  end if;
  if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
    raise exception 'only a super admin may grant the super_admin role';
  end if;
  -- A super admin's own row: their self-service fields stay governed by the
  -- self-update allowlist (0009); anyone else must be a super admin.
  if old.role = 'super_admin' and auth.uid() is distinct from old.id then
    raise exception 'only a super admin may change a super admin account';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_guard_super_admin on employees;
create trigger employees_guard_super_admin
  before insert or update on employees
  for each row execute function guard_super_admin_accounts();
