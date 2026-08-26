-- Fix payroll_periods.branch_id: enforce NOT NULL and update FK constraint to ON DELETE RESTRICT
-- Also rename audit_logs index to match naming convention

-- First, verify no NULL branch_id rows exist (this will fail if any exist)
-- We select them just to document the state
do $$
declare
  null_count integer;
begin
  select count(*) into null_count from payroll_periods where branch_id is null;
  if null_count > 0 then
    raise exception 'Found % rows with NULL branch_id in payroll_periods. These must be fixed before altering the column to NOT NULL.', null_count;
  end if;
end $$;

-- Make branch_id NOT NULL
alter table payroll_periods alter column branch_id set not null;

-- Drop the existing FK constraint and recreate it with ON DELETE RESTRICT
alter table payroll_periods drop constraint payroll_periods_branch_id_fkey;
alter table payroll_periods add constraint payroll_periods_branch_id_fkey foreign key (branch_id) references branches(id) on delete restrict;

-- Rename the audit_logs index to follow naming convention {table}_{column}_idx
alter index audit_logs_target_idx rename to audit_logs_target_employee_id_idx;
