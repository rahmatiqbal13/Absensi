-- Employees may read their own contracts (shown on their payslip: jenis,
-- kontrak ke-N, periode). Writing stays HR-only (0049).
drop policy if exists employee_contracts_select_own on public.employee_contracts;
create policy employee_contracts_select_own on public.employee_contracts
  for select using (employee_id = auth.uid());
