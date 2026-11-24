-- supabase/migrations/0065_employee_work_schedules.sql
--
-- Jadwal kerja khusus per pegawai.
--
-- Some people in a department work other hours than the rest. HR defines named
-- schedules ("jadwal khusus", e.g. "Pagi Lab 06:30–14:30") on the Jadwal page
-- and assigns one to each such employee. Resolution (src/lib/schedule/resolve.ts):
--
--   shift roster for that date (0059)
--     > the employee's jadwal khusus      (employees.work_schedule_id, this file)
--     > their department's schedule       (0034)
--     > the branch default
--
-- A jadwal khusus is a work_schedules row with a `nama` and no department.
-- The branch-default uniqueness (0034) must now ignore named rows.

alter table work_schedules
  add column if not exists nama text
    check (nama is null or (btrim(nama) <> '' and length(nama) <= 60));

-- Named rows have department_id null too: keep "one default per branch" for the
-- unnamed ones only, and names unique within a branch.
drop index if exists work_schedules_branch_default_key;
create unique index if not exists work_schedules_branch_default_key
  on work_schedules (branch_id) where department_id is null and nama is null;
create unique index if not exists work_schedules_branch_nama_key
  on work_schedules (branch_id, lower(nama)) where nama is not null;
-- A department schedule is never named.
alter table work_schedules drop constraint if exists work_schedules_named_has_no_department;
alter table work_schedules add constraint work_schedules_named_has_no_department
  check (nama is null or department_id is null);

alter table employees
  add column if not exists work_schedule_id uuid references work_schedules(id) on delete set null;
create index if not exists employees_work_schedule_id_idx on employees (work_schedule_id);

-- Which hours someone works decides late status and pay deductions, so only HR
-- / super admin (or the service role) may set it — not an atasan (0018 lets
-- them update other employees' rows) and not the employee (0009 allowlist).
create or replace function prevent_work_schedule_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and is_hr_admin_role() = false
     and new.work_schedule_id is distinct from old.work_schedule_id then
    raise exception 'not allowed to change work_schedule_id';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_work_schedule_guard on employees;
create trigger employees_work_schedule_guard
  before update on employees
  for each row execute function prevent_work_schedule_change();

-- Only a jadwal khusus of the employee's own branch can be assigned.
create or replace function check_employee_work_schedule()
returns trigger language plpgsql set search_path = public as $$
declare
  v_branch uuid;
  v_nama text;
begin
  if new.work_schedule_id is null then
    return new;
  end if;
  select branch_id, nama into v_branch, v_nama from work_schedules where id = new.work_schedule_id;
  if v_nama is null then
    raise exception 'work_schedule_id must reference a named jadwal khusus';
  end if;
  if v_branch is distinct from new.branch_id then
    -- Moved to another branch: the old branch's jadwal khusus no longer applies.
    if tg_op = 'UPDATE' and new.branch_id is distinct from old.branch_id
       and new.work_schedule_id is not distinct from old.work_schedule_id then
      new.work_schedule_id := null;
      return new;
    end if;
    raise exception 'jadwal khusus belongs to another branch';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_work_schedule_check on employees;
create trigger employees_work_schedule_check
  before insert or update of work_schedule_id, branch_id on employees
  for each row execute function check_employee_work_schedule();
