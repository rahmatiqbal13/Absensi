-- supabase/migrations/0021_protected_field_guard_others_only.sql
--
-- prevent_protected_employee_field_change (0018, amended 0019) fires before
-- prevent_employee_self_privilege_escalation and shadowed its error message
-- for SELF-edits, breaking 3 assertions in rls-security.test.ts. The old
-- trigger already fully owns self-edits (jsonb allowlist). Scope the new
-- trigger to OTHER employees' rows only: its sole purpose is stopping an
-- `atasan` from tampering with a subordinate's role/salary/etc.
create or replace function prevent_protected_employee_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from old.id
     and is_hr_admin_role() = false then
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
