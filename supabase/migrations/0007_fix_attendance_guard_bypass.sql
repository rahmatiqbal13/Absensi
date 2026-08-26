-- supabase/migrations/0007_fix_attendance_guard_bypass.sql
--
-- Follow-up security fixes on top of
-- 0006_fix_leave_approval_and_attendance_security.sql.
--
-- Bypass (attendances): prevent_attendance_status_backdating only raised when
--   `old.jam_pulang is not null AND new.status is distinct from old.status`.
--   A non-admin employee could therefore defeat it in two statements:
--     1. update attendances set jam_pulang = null where id = X;
--        -- old.jam_pulang is non-NULL but status is untouched, so the inner
--        -- condition is false and nothing raises. The record is "reopened".
--     2. update attendances set status = 'tepat_waktu',
--                                jam_pulang = '2026-01-01T17:00:00Z' where id = X;
--        -- old.jam_pulang is now NULL, so the guard is skipped entirely and the
--        -- retroactive status rewrite lands.
--   Fix: once a record is closed (old.jam_pulang is not null), a non-admin may
--   not change status, jam_pulang, OR jam_masuk on it at all -- so "reopening" a
--   closed record is itself blocked. The legitimate single-statement clock-out
--   (jam_pulang + lokasi_pulang + foto_pulang_url + status set together while
--   old.jam_pulang IS NULL) is unaffected: the record is not closed yet, so the
--   outer `old.jam_pulang is not null` test is false.
--
-- Defense in depth (leave_requests): the "only the assigned approver may act"
--   identity check in prevent_leave_self_approval was gated on
--   `old_status is null or old_status = 'pending'`, so a rejected -> approved
--   re-decision skipped the identity check. That gate is dropped here; the check
--   now runs on every transition into approved/rejected. Everything else in the
--   function is unchanged from 0006.

-- ---------------------------------------------------------------------------
-- Fix 1: widen the attendance anti-tampering guard to cover the timestamps.
-- The trigger trg_prevent_attendance_status_backdating already points at this
-- function name (created in 0006), so replacing the body is sufficient.
-- ---------------------------------------------------------------------------
create or replace function prevent_attendance_status_backdating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin_role() = false and auth.uid() = old.employee_id then
    if old.jam_pulang is not null and (
      new.status is distinct from old.status
      or new.jam_pulang is distinct from old.jam_pulang
      or new.jam_masuk is distinct from old.jam_masuk
    ) then
      raise exception 'not allowed to modify a closed attendance record';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix 2: run the approver identity check unconditionally on any transition into
-- approved/rejected, not just out of pending. Identical to 0006's version apart
-- from the removed `and (old_status is null or old_status = 'pending')` gate.
-- The trigger trg_prevent_leave_self_approval (before insert or update, created
-- in 0006) already points at this function name.
-- ---------------------------------------------------------------------------
create or replace function prevent_leave_self_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_status text := null;
begin
  if tg_op = 'UPDATE' then
    old_status := old.status;

    -- Closes the second half of Bypass 2: a request can never be re-pointed at
    -- another employee after the fact, so an approved row cannot be laundered
    -- into a self-approved one.
    if new.employee_id is distinct from old.employee_id then
      raise exception 'employee_id is immutable';
    end if;
  end if;

  -- Unconditional: applies to INSERT and UPDATE, to every caller including the
  -- service role, and regardless of what the previous status was. This closes
  -- Bypass 1 (insert-as-already-approved) and the first half of Bypass 2
  -- (re-deciding an already-decided row).
  if new.status in ('approved','rejected') and new.approver_id = new.employee_id then
    raise exception 'self-approval is not allowed';
  end if;

  -- Authorization check for ANY transition into approved/rejected, including a
  -- rejected -> approved re-decision (previously this was gated on the old
  -- status being null or 'pending', which skipped re-decisions).
  -- Gated on auth.uid() is not null so the service role (auth.uid() = NULL) can
  -- process approvals on behalf of the system. The service role is NOT exempt
  -- from the self-approval check above, only from this identity check.
  if new.status in ('approved','rejected') then
    if auth.uid() is not null
       and new.approver_id is distinct from auth.uid()
       and is_admin_role() = false then
      raise exception 'only the assigned approver may act on this request';
    end if;
  end if;

  return new;
end;
$$;
