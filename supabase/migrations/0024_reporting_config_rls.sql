-- supabase/migrations/0024_reporting_config_rls.sql
--
-- Plan 6.
--   1. departments_write / work_schedules_write were is_admin_role() (0005),
--      which 0009 widened to include `atasan`. Tighten to is_hr_admin_role()
--      for consistency with holidays_write (0018), /karyawan, /payroll. The
--      SELECT policies stay `authenticated` — everyone needs to read the
--      schedule/departments for their own screens.
--   2. work_schedules has always been effectively one-row-per-branch (the app
--      reads it with .limit(1).maybeSingle()). The new /pengaturan/jadwal
--      screen upserts on branch_id, which needs a unique constraint. Verified
--      no live duplicates before writing this.
--
-- Written idempotently: an earlier partial apply (Supabase's non-transactional
-- "legacy" push path) left work_schedules_branch_id_key on the remote without
-- recording 0024, so drops use IF EXISTS and the constraint add is guarded.

drop policy if exists departments_write on departments;
create policy departments_write on departments
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

drop policy if exists work_schedules_write on work_schedules;
create policy work_schedules_write on work_schedules
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'work_schedules_branch_id_key'
  ) then
    alter table work_schedules add constraint work_schedules_branch_id_key unique (branch_id);
  end if;
end $$;
