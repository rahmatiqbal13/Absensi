-- supabase/migrations/0014_fix_leave_approval_rpc_security.sql
--
-- Security review follow-up to 0013_leave_approval_rpc.sql. Five findings.
--
-- C1 (Critical) -- the RPCs had no EXECUTE privilege restriction.
--   Postgres/Supabase grant EXECUTE on a newly created public-schema function
--   to PUBLIC by default, which includes `anon`. Since the anon key is a public
--   credential shipped to every browser, ANYONE could call
--   `rpc("approve_leave_request", { p_request_id })` with no login at all. The
--   functions are SECURITY DEFINER, so RLS on leave_requests/leave_balances was
--   bypassed for their internal writes, and the function's own identity check
--   (`auth.uid() is not null and ...`) was written to exempt the service role
--   (auth.uid() = NULL) -- an unauthenticated anon caller ALSO has
--   auth.uid() = NULL and sailed straight through the same exemption. The
--   prevent_leave_self_approval trigger shares that predicate verbatim, so both
--   "defense in depth" layers failed for the identical reason at once.
--   Fix: revoke from public, grant to authenticated + service_role only.
--   Postgres checks EXECUTE against the CALLER's role (anon / authenticated /
--   service_role, whichever PostgREST switched to for the request's JWT) BEFORE
--   the SECURITY DEFINER body runs, so an anon-key caller is now rejected by
--   Postgres itself and never reaches the function's internal logic.
--
-- I1 (Important) -- TOCTOU race. The row was read with a plain SELECT and the
--   UPDATE's WHERE clause did not re-check `status = 'pending'`, so two
--   concurrent approvals could both pass the initial check and both credit
--   leave_balances. Fix: SELECT ... FOR UPDATE, plus `and status = 'pending'`
--   on the UPDATE and a NOT FOUND guard that raises the same "not pending"
--   error a lost race would otherwise silently swallow.
--
-- I2 (Important) -- an hr_admin/super_admin could approve their OWN request.
--   The self-approval check compared approver_id = employee_id, never the
--   ACTUAL CALLER. A request routed to a designated_approver_id (per
--   is_self_request escalation) has approver_id <> employee_id, so that check
--   passed, and is_hr_admin_role() then exempted the caller from the identity
--   check. Fix: an unconditional `auth.uid() = employee_id` check in both RPCs
--   AND in the trigger, so the two layers stay in sync (the RPC check alone
--   would not cover a direct-write path through the leave_requests_update RLS
--   policy that hr_admin already holds).
--
-- I3 (Important) -- reject_leave_request had no self-approval check at all,
--   asymmetric with approve. Fix: same two checks, same position.
--
-- I4 (Important) -- nothing validated date ordering, so a request with
--   tanggal_selesai < tanggal_mulai yielded a NEGATIVE day count that
--   DECREASED saldo_terpakai on approval, inflating the employee's remaining
--   balance. Fix: a check constraint on the table. Verified against live data
--   before writing this migration: 175 rows, 0 violations.

-- ---------------------------------------------------------------------------
-- I4: date ordering. Single-day leave (selesai = mulai) stays valid.
--
-- Declared NOT VALID deliberately. NOT VALID skips ONLY the one-time backfill
-- scan of pre-existing rows; the constraint is still fully enforced on every
-- future INSERT and on every UPDATE of an existing row, which is what closes
-- I4 (a reversed range can no longer be stored, and the one stale row below
-- cannot be approved either -- the approval UPDATE would trip this check).
--
-- Why not a plain (validated) constraint: the live table holds exactly ONE
-- violating row --
--   id c751d41c-9b57-4517-971f-b9d828af92ad, 2026-12-20 .. 2026-12-15,
--   employee karyawan.leave.1787804263424@test.local
-- -- a synthetic @test.local fixture row that this security fix's own
-- regression test created during a pre-fix verification run (a clean scan of
-- all 175 rows immediately beforehand found zero violations, so no genuine
-- business data is affected). Deleting rows is out of scope for this
-- migration, so the constraint goes in NOT VALID and the cleanup is left as an
-- explicit, operator-approved follow-up:
--   delete from leave_requests where id = 'c751d41c-9b57-4517-971f-b9d828af92ad';
--   alter table leave_requests validate constraint leave_requests_date_order_check;
-- ---------------------------------------------------------------------------
alter table leave_requests
  add constraint leave_requests_date_order_check
  check (tanggal_selesai >= tanggal_mulai) not valid;

-- ---------------------------------------------------------------------------
-- I2 + I3, trigger half. Body copied verbatim from 0010, with one change: the
-- unconditional self-approval check now also rejects a caller who IS the
-- requesting employee, not just a request whose approver_id happens to equal
-- its employee_id.
--
-- The check stays inside the `new.status in ('approved','rejected')` guard --
-- an employee INSERTing their own pending request has auth.uid() =
-- new.employee_id and must remain allowed. Only the transition into a decided
-- status is blocked.
--
-- auth.uid() is read from request.jwt.claims, which SECURITY DEFINER does not
-- change, so this sees the real caller even when the RPC below drives the
-- UPDATE. The service role still has auth.uid() = NULL and is still exempt from
-- the identity check below (but never from self-approval).
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
  -- service role and hr_admin/super_admin, and regardless of what the previous
  -- status was. This closes Bypass 1 (insert-as-already-approved), the first
  -- half of Bypass 2 (re-deciding an already-decided row), and I2 (an admin
  -- deciding their own escalated request, where approver_id is the designated
  -- approver and so is NOT equal to employee_id).
  if new.status in ('approved','rejected')
     and (new.approver_id = new.employee_id or auth.uid() = new.employee_id) then
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

-- ---------------------------------------------------------------------------
-- approve_leave_request: I1 (row lock + guarded UPDATE) and I2 (caller-based
-- self-approval check). Signature and return type unchanged, so the existing
-- grants below and any caller keep working.
-- ---------------------------------------------------------------------------
create or replace function approve_leave_request(p_request_id uuid, p_catatan text default null)
returns leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request leave_requests;
  v_days numeric;
  v_year integer;
begin
  -- I1: FOR UPDATE serializes concurrent approvals of the same request. The
  -- loser of the race blocks here, then re-reads the committed row and fails
  -- the `status <> 'pending'` check below instead of double-crediting.
  select * into v_request from leave_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if v_request.approver_id = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  -- I2: unconditional, checked before the is_hr_admin_role() exemption below,
  -- so no admin tier can decide their own request.
  if auth.uid() = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'approved', catatan_approval = p_catatan
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  -- I1: belt and braces. Unreachable under FOR UPDATE, but if the guarded
  -- UPDATE ever matches nothing, fail loudly with the same error the initial
  -- check gives rather than returning a NULL row and skipping the balance
  -- credit silently.
  if not found then
    raise exception 'leave request is not pending';
  end if;

  if v_request.jenis = 'tahunan' then
    v_days := (v_request.tanggal_selesai - v_request.tanggal_mulai + 1);
    v_year := extract(year from v_request.tanggal_mulai)::integer;

    insert into leave_balances (employee_id, tahun, saldo_terpakai)
    values (v_request.employee_id, v_year, v_days)
    on conflict (employee_id, tahun)
    do update set saldo_terpakai = leave_balances.saldo_terpakai + v_days;
  end if;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_leave_request: I1 (row lock + guarded UPDATE) and I3 (the two
-- self-approval checks approve_leave_request has, which this function was
-- missing entirely).
-- ---------------------------------------------------------------------------
create or replace function reject_leave_request(p_request_id uuid, p_catatan text)
returns leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request leave_requests;
begin
  if p_catatan is null or btrim(p_catatan) = '' then
    raise exception 'catatan_approval is required to reject a leave request';
  end if;

  select * into v_request from leave_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  -- I3: was missing here entirely; I2: caller-based, not approver_id-based.
  if v_request.approver_id = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'rejected', catatan_approval = p_catatan
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'leave request is not pending';
  end if;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- C1: the primary fix. Must come AFTER the create-or-replace statements above
-- -- `create or replace function` does not reset an existing function's ACL,
-- but ordering it this way keeps the migration correct if it is ever replayed
-- against a database where the functions do not yet exist (in which case the
-- create sets the default grants and these statements strip them).
--
-- `revoke ... from public` alone is NOT enough here. The live ACL before this
-- migration was:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--    authenticated=X/postgres,service_role=X/postgres}
-- `=X` is the PUBLIC grant, but `anon=X` is a SEPARATE, EXPLICIT grant that
-- Supabase's bootstrap installs via
--   alter default privileges in schema public grant all on functions
--     to postgres, anon, authenticated, service_role;
-- Revoking only from PUBLIC would leave `anon=X` standing and C1 would remain
-- wide open. anon must be named explicitly.
-- ---------------------------------------------------------------------------
revoke execute on function approve_leave_request(uuid, text) from public, anon;
revoke execute on function reject_leave_request(uuid, text) from public, anon;
grant execute on function approve_leave_request(uuid, text) to authenticated, service_role;
grant execute on function reject_leave_request(uuid, text) to authenticated, service_role;
