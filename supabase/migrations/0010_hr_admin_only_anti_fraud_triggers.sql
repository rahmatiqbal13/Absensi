-- supabase/migrations/0010_hr_admin_only_anti_fraud_triggers.sql
--
-- Follow-up to 0009_atasan_is_admin_and_self_update_allowlist.sql.
--
-- 0009 widened is_admin_role() to include `atasan`, so the route layer
-- (src/lib/auth/route-access.ts) and the DB layer agree on who may reach the
-- admin pages and read/manage the admin-scoped tables. That decision stands.
--
-- What it did NOT intend: three anti-fraud TRIGGER functions also gate on
-- `is_admin_role() = false`, so widening the function silently exempted every
-- `atasan` from them as well. An atasan could therefore:
--   * retroactively rewrite their own closed attendance records
--     (prevent_attendance_status_backdating),
--   * escalate their own role / gaji_pokok / branch / approver on their own
--     employee row (prevent_employee_self_privilege_escalation),
--   * override "only the assigned approver may decide" on any leave request
--     (prevent_leave_self_approval).
-- Route-level read access and exemption from anti-fraud guards are two
-- different powers; 0009 conflated them.
--
-- Fix: split the tiers.
--   * is_admin_role()    -- unchanged, still includes `atasan`. Keeps gating
--                           every RLS policy (employees_update,
--                           attendances_update, leave_requests_update,
--                           payroll_periods_*, ...) exactly as before.
--   * is_hr_admin_role() -- NEW, strictly ('hr_admin','super_admin'). Gates only
--                           the three anti-fraud trigger checks below, so an
--                           atasan is now subject to them like any other
--                           employee.
--
-- All three functions are replaced with `create or replace function`, which
-- preserves the function OID. The existing triggers
-- (trg_prevent_self_privilege_escalation, trg_prevent_attendance_status_backdating,
-- trg_prevent_leave_self_approval) already reference these functions and keep
-- pointing at the new bodies -- no `create trigger` statement is touched.
-- No RLS policy is touched.

-- ---------------------------------------------------------------------------
-- The stricter tier. Same language/volatility/security/search_path shape as
-- is_admin_role(); only the role list differs.
-- ---------------------------------------------------------------------------
create or replace function is_hr_admin_role()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(current_employee_role() in ('hr_admin','super_admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- 1/3: self privilege escalation. Body identical to 0009 apart from the
-- early-exit guard, which now uses the stricter tier.
-- ---------------------------------------------------------------------------
create or replace function prevent_employee_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_hr_admin_role() = false and auth.uid() = old.id then
    if (to_jsonb(new) - 'no_telp' - 'foto_profil_url')
       is distinct from (to_jsonb(old) - 'no_telp' - 'foto_profil_url')
    then
      raise exception 'not allowed to change protected fields on own employee record';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2/3: attendance backdating. Body identical to 0007 apart from the early-exit
-- guard.
-- ---------------------------------------------------------------------------
create or replace function prevent_attendance_status_backdating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_hr_admin_role() = false and auth.uid() = old.employee_id then
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
-- 3/3: leave approval. Body identical to 0007 apart from the admin exemption on
-- the "assigned approver" identity check, which now uses the stricter tier.
--
-- Deliberately unchanged:
--   * the UNCONDITIONAL self-approval check (new.approver_id = new.employee_id)
--     has no admin exemption today and keeps none -- nobody, at any tier, may
--     approve their own request;
--   * the `employee_id is immutable` check;
--   * the `auth.uid() is not null` gate that lets the service role act on
--     behalf of the system.
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
       and is_hr_admin_role() = false then
      raise exception 'only the assigned approver may act on this request';
    end if;
  end if;

  return new;
end;
$$;
