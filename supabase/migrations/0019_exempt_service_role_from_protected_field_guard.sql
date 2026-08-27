-- supabase/migrations/0019_exempt_service_role_from_protected_field_guard.sql
--
-- 0018's prevent_protected_employee_field_change() fired for a NULL auth.uid()
-- (service-role), blocking legitimate backend writes (scripts/seed.ts approver
-- wiring) and diverging from prevent_employee_self_privilege_escalation, which
-- already implicitly exempts service-role. Add the `auth.uid() is not null`
-- guard so the trigger only constrains AUTHENTICATED non-hr-admin callers
-- (i.e. an `atasan` acting through the app) -- which is its whole purpose.
create or replace function prevent_protected_employee_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and is_hr_admin_role() = false then
    if new.role is distinct from old.role
       or new.gaji_pokok is distinct from old.gaji_pokok
       or new.branch_id is distinct from old.branch_id
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
