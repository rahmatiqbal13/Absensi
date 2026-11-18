-- Indexes for foreign keys that had none (audit 2026-11-18). Tables are still
-- small, so these build instantly; they keep joins, RLS subqueries and
-- ON DELETE checks fast as data grows. payslips(payroll_period_id) matters
-- most: the employee read policy on payroll_periods (0051) probes it.
create index if not exists payslips_payroll_period_id_idx on public.payslips (payroll_period_id, employee_id);
create index if not exists employees_department_id_idx on public.employees (department_id);
create index if not exists employees_designated_approver_id_idx on public.employees (designated_approver_id);
create index if not exists departments_branch_id_idx on public.departments (branch_id);
create index if not exists holidays_branch_id_idx on public.holidays (branch_id);
create index if not exists consents_employee_id_idx on public.consents (employee_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists attendance_corrections_decided_by_idx on public.attendance_corrections (decided_by);
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
create index if not exists employee_contracts_created_by_idx on public.employee_contracts (created_by);
create index if not exists payroll_periods_dibayar_oleh_idx on public.payroll_periods (dibayar_oleh);
