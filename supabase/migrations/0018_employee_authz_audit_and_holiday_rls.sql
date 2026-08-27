-- supabase/migrations/0018_employee_authz_audit_and_holiday_rls.sql
--
-- Plan 5. Two things the row-level policies cannot express:
--
-- 1. employees_update (0005) is `id = auth.uid() OR is_admin_role()`, and 0009
--    widened is_admin_role() to include `atasan`. So an `atasan` can UPDATE any
--    employee row, and the existing prevent_employee_self_privilege_escalation
--    trigger only fires when `auth.uid() = old.id` (self). Nothing stops an
--    atasan from raising a subordinate's salary or role. This migration adds a
--    BEFORE UPDATE trigger that blocks a non-hr_admin from changing ANY
--    protected field on ANY row. It overlaps the self-escalation trigger for
--    self-edits (same outcome) and closes the atasan-edits-others gap.
--
-- 2. audit_logs (0003) has no writer. This adds an AFTER INSERT/UPDATE/DELETE
--    trigger on employees. SECURITY DEFINER so it can write audit_logs (which
--    has no client insert policy). actor_id may be NULL when the mutation runs
--    under service-role (e.g. inviteEmployee's insert) -- that is correct and
--    marks "system/invite" actions.

-- --- 1: protected-field guard ---------------------------------------------
create or replace function prevent_protected_employee_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_hr_admin_role() = false then
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

drop trigger if exists trg_prevent_protected_employee_field_change on employees;
create trigger trg_prevent_protected_employee_field_change
  before update on employees for each row
  execute function prevent_protected_employee_field_change();

-- --- 2: audit trigger ----------------------------------------------------
create or replace function audit_employee_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target uuid := coalesce(new.id, old.id);
  v_aksi text;
begin
  if tg_op = 'INSERT' then
    v_aksi := 'employee_created';
  elsif tg_op = 'DELETE' then
    v_aksi := 'employee_deleted';
  elsif new.status is distinct from old.status then
    v_aksi := case when new.status = 'nonaktif'
                   then 'employee_deactivated' else 'employee_reactivated' end;
  else
    v_aksi := 'employee_updated';
  end if;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_target, v_aksi,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
    auth.uid() is not null and auth.uid() = v_target
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_employee_changes on employees;
create trigger trg_audit_employee_changes
  after insert or update or delete on employees for each row
  execute function audit_employee_changes();

-- --- 3: holidays writes are hr_admin only (consistency with /payroll,
-- /karyawan). holidays_select stays `authenticated`.
drop policy if exists holidays_write on holidays;
create policy holidays_write on holidays
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());
