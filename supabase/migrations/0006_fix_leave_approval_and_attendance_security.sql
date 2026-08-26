-- supabase/migrations/0006_fix_leave_approval_and_attendance_security.sql
--
-- Security fixes on top of 0005_rls_and_triggers.sql.
--
-- Bypass 1 (leave_requests): trg_prevent_leave_self_approval was BEFORE UPDATE
--   only, so a client could INSERT a row that was already
--   status='approved', approver_id = employee_id = auth.uid(). The INSERT policy
--   only pinned employee_id, so nothing stopped it.
-- Bypass 2 (leave_requests): the `old.status = 'pending'` guard meant that once a
--   row left 'pending' the trigger body was skipped entirely. An approver could
--   approve legitimately, then UPDATE the row again to set employee_id to
--   themselves, ending with employee_id = approver_id (a self-approved row) with
--   no check ever re-running.
-- Service-role bug: `new.approver_id is distinct from auth.uid() and
--   is_admin_role() = false` always raised for the service role, where
--   auth.uid() is NULL. That made every server-side approval flow impossible.

-- ---------------------------------------------------------------------------
-- Fix 1: rewrite prevent_leave_self_approval + fire it on INSERT as well.
-- ---------------------------------------------------------------------------
-- NOTE on plpgsql semantics: in a trigger registered for INSERT OR UPDATE, OLD
-- is an *unassigned* record during an INSERT. Reading old.<field> there raises
-- `record "old" is not assigned yet`, it does NOT evaluate to NULL. Every read
-- of OLD below is therefore guarded by an explicit `tg_op = 'UPDATE'` branch and
-- the old status is captured into a local variable that stays NULL on INSERT.

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

  -- Authorization check for the pending -> approved/rejected transition
  -- (old_status is null on INSERT, i.e. a row created already decided).
  -- Gated on auth.uid() is not null so the service role (auth.uid() = NULL) can
  -- process approvals on behalf of the system. The service role is NOT exempt
  -- from the self-approval check above, only from this identity check.
  if new.status in ('approved','rejected')
     and (old_status is null or old_status = 'pending') then
    if auth.uid() is not null
       and new.approver_id is distinct from auth.uid()
       and is_admin_role() = false then
      raise exception 'only the assigned approver may act on this request';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_leave_self_approval on leave_requests;
create trigger trg_prevent_leave_self_approval
before insert or update on leave_requests
for each row execute function prevent_leave_self_approval();

-- ---------------------------------------------------------------------------
-- Fix 3: tighten leave_requests_insert so a client cannot insert a pre-decided
-- row at all (belt-and-suspenders with the trigger above).
-- ---------------------------------------------------------------------------
drop policy if exists leave_requests_insert on leave_requests;
create policy leave_requests_insert on leave_requests for insert with check (
  employee_id = auth.uid() and status = 'pending'
);

-- ---------------------------------------------------------------------------
-- Fix 4: block retroactive attendance status tampering by the employee.
-- Allows the clock-in INSERT and the single legitimate clock-out UPDATE
-- (which sets jam_pulang + status), but refuses any later status rewrite by the
-- employee once the day's record is closed (jam_pulang is set).
--
-- This is a stopgap. Full anti-fraud closure for attendances -- server-computed
-- status from geofencing + photo verification instead of client-supplied values
-- -- is Plan 2's scope, not this Foundation plan's.
-- ---------------------------------------------------------------------------
create or replace function prevent_attendance_status_backdating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin_role() = false and auth.uid() = old.employee_id then
    if old.jam_pulang is not null and new.status is distinct from old.status then
      raise exception 'not allowed to change status after clock-out is recorded';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_attendance_status_backdating on attendances;
create trigger trg_prevent_attendance_status_backdating
before update on attendances
for each row execute function prevent_attendance_status_backdating();
