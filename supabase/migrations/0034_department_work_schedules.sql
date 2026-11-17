-- supabase/migrations/0034_department_work_schedules.sql
--
-- A branch (office) can hold several departments, and a department may work
-- different hours / days from the rest of the office.
--
--   department_id null      = the branch's default schedule (one per branch)
--   department_id not null  = that department's own schedule (one per dept);
--                             employees of the department use it instead of
--                             the branch default. No row = follow the branch.
--
-- Resolution lives in src/lib/schedule/resolve.ts.

alter table work_schedules
  add column if not exists department_id uuid references departments(id) on delete cascade;

-- 0024's unique (branch_id) would forbid a department row next to the branch
-- default. Replace it with one-default-per-branch + one-row-per-department.
alter table work_schedules drop constraint if exists work_schedules_branch_id_key;

create unique index if not exists work_schedules_branch_default_key
  on work_schedules (branch_id) where department_id is null;
create unique index if not exists work_schedules_department_key
  on work_schedules (department_id) where department_id is not null;

-- A department schedule always sits in its department's branch, whatever the
-- client sends — the app filters schedules by branch_id first.
create or replace function work_schedules_pin_department_branch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.department_id is not null then
    select d.branch_id into strict new.branch_id
      from departments d where d.id = new.department_id;
  end if;
  return new;
end;
$$;

drop trigger if exists work_schedules_pin_department_branch on work_schedules;
create trigger work_schedules_pin_department_branch
  before insert or update of department_id, branch_id on work_schedules
  for each row execute function work_schedules_pin_department_branch();
