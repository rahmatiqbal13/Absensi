-- Employees could read their own payslips (payslips_select) but not the
-- payroll period they belong to (payroll_periods_select = admins only), so
-- every employee-side query that joins the period (menu Slip Gaji, slip
-- detail, PDF) came back empty. Let an employee read a period only when it is
-- final and holds a payslip of theirs. Drafts stay admin-only.
-- No recursion: payslips' own policy does not reference payroll_periods.
drop policy if exists payroll_periods_select_own_final on public.payroll_periods;
create policy payroll_periods_select_own_final on public.payroll_periods
  for select using (
    status = 'final'
    and exists (
      select 1 from public.payslips s
      where s.payroll_period_id = payroll_periods.id
        and s.employee_id = auth.uid()
    )
  );
