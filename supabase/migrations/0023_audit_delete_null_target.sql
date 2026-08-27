-- supabase/migrations/0023_audit_delete_null_target.sql
--
-- Completes I1 (Plan 5 final review). 0022 set the two audit_logs FKs to
-- ON DELETE SET NULL, but an `employees` DELETE still failed: the
-- audit_employee_changes AFTER DELETE trigger inserts a brand-new audit_logs
-- row with target_employee_id = old.id, and the RI SET NULL cascade for the
-- FK fires *before* that user trigger (constraint triggers sort ahead of
-- `trg_*` by name), so the freshly inserted row references an employee that no
-- longer exists -> 23503 -> the whole DELETE rolls back.
--
-- Fix: on DELETE, write target_employee_id = NULL. The deleted employee's full
-- record is still preserved in detail->'before'. (The SET NULL cascade from
-- 0022 nulls target_employee_id on every pre-existing row for that employee
-- anyway, so an `employee_deleted` row could never have kept a non-null
-- target_employee_id regardless.)
create or replace function audit_employee_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_subject uuid := coalesce(new.id, old.id);
  v_target uuid := coalesce(new.id, old.id);
  v_aksi text;
begin
  if tg_op = 'INSERT' then
    v_aksi := 'employee_created';
  elsif tg_op = 'DELETE' then
    v_aksi := 'employee_deleted';
    v_target := null;
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
    auth.uid() is not null and auth.uid() = v_subject
  );
  return coalesce(new, old);
end;
$$;
