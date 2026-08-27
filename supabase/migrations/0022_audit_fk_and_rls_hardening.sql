-- supabase/migrations/0022_audit_fk_and_rls_hardening.sql
--
-- Plan 5 final review. Three tightenings, all pure (no function-body logic
-- change beyond adding department_id to a field list):
--   I1: audit_logs FKs had no ON DELETE, so the audit trigger's own AFTER
--       DELETE insert (referencing the just-deleted employee) raised an FK
--       violation and rolled every employees DELETE back. ON DELETE SET NULL
--       keeps the audit history (the point) while letting the row go.
--   I2: audit_logs_select was is_admin_role() (includes atasan since 0009).
--       An audit log the policed role can read through PostgREST undercuts the
--       whole plan. Tighten to is_hr_admin_role().
--   M3: department_id was in the pre-Plan-5 protected set (0005/0009) and was
--       dropped from 0018/0021's list by accident. Restore it.

-- I1
alter table audit_logs drop constraint audit_logs_actor_id_fkey;
alter table audit_logs add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references employees(id) on delete set null;
alter table audit_logs drop constraint audit_logs_target_employee_id_fkey;
alter table audit_logs add constraint audit_logs_target_employee_id_fkey
  foreign key (target_employee_id) references employees(id) on delete set null;

-- I2
drop policy audit_logs_select on audit_logs;
create policy audit_logs_select on audit_logs
  for select using (is_hr_admin_role());

-- M3
create or replace function prevent_protected_employee_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from old.id
     and is_hr_admin_role() = false then
    if new.role is distinct from old.role
       or new.gaji_pokok is distinct from old.gaji_pokok
       or new.branch_id is distinct from old.branch_id
       or new.department_id is distinct from old.department_id
       or new.atasan_id is distinct from old.atasan_id
       or new.designated_approver_id is distinct from old.designated_approver_id
       or new.status_kontrak is distinct from old.status_kontrak
       or new.status is distinct from old.status
       or new.tanggal_mulai_kerja is distinct from old.tanggal_mulai_kerja
       or new.email is distinct from old.email
    then
      raise exception 'not allowed to change protected employee fields';
    end if;
  end if;
  return new;
end;
$$;
