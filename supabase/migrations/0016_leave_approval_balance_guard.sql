-- supabase/migrations/0016_leave_approval_balance_guard.sql
--
-- Review finding I2 (Plan 3 final review): leave balance can be overdrawn.
--
-- submitLeaveRequest checks saldo_sisa at SUBMISSION time, but nothing
-- re-checks at APPROVAL time. Two pending `tahunan` requests that each fit the
-- balance individually can both be approved and together drive
-- saldo_terpakai past saldo_awal (saldo_sisa is a generated column:
-- saldo_awal - saldo_terpakai, so it silently goes negative). The 0014 I4 fix
-- closed the negative-duration direction of balance corruption; this closes
-- the positive-direction overdraw.
--
-- Decision (human): RPC guard only, no CHECK constraint on leave_balances.
--
-- This migration is `create or replace function approve_leave_request(...)`
-- with the byte-identical signature from 0014, so the existing ACL
-- (revoked from public/anon, granted to authenticated/service_role) persists;
-- it is re-asserted at the end anyway. `reject_leave_request` and the
-- prevent_leave_self_approval trigger are unchanged.
--
-- The whole body of the added check below is:
--   1. `select ... for update` on leave_requests (unchanged from 0014) — this
--      serializes concurrent approvals of the SAME request.
--   2. NEW: `select ... for update` on the leave_balances row for
--      (employee_id, year) — this serializes concurrent approvals of
--      DIFFERENT requests for the SAME employee against the SAME balance row,
--      which would otherwise race (each reads the pre-other-approval
--      saldo_terpakai and both pass).
--   3. NEW: raise if coalesce(saldo_terpakai,0) + v_days > coalesce(saldo_awal,12).
--      Missing row => treated as saldo_awal 12 / saldo_terpakai 0, matching the
--      fabrication default already baked into the `insert ... values (...,
--      v_days)` / `on conflict do update` below and into 0002's column
--      defaults.
--   If the check raises, the whole RPC transaction rolls back, so the
--   `update leave_requests set status='approved'` above it is undone too and
--   the request stays `pending`.
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
  v_saldo_awal numeric;
  v_saldo_terpakai numeric;
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

    -- Plan 3 I2: approval-time balance guard. Lock the balance row first so
    -- concurrent approvals of different requests for the same employee cannot
    -- both read a pre-credit saldo_terpakai and both pass.
    select saldo_awal, saldo_terpakai
      into v_saldo_awal, v_saldo_terpakai
      from leave_balances
      where employee_id = v_request.employee_id and tahun = v_year
      for update;

    if coalesce(v_saldo_terpakai, 0) + v_days > coalesce(v_saldo_awal, 12) then
      raise exception 'insufficient leave balance to approve this request';
    end if;

    insert into leave_balances (employee_id, tahun, saldo_terpakai)
    values (v_request.employee_id, v_year, v_days)
    on conflict (employee_id, tahun)
    do update set saldo_terpakai = leave_balances.saldo_terpakai + v_days;
  end if;

  return v_request;
end;
$$;

-- Re-assert the C1 ACL posture from 0014. `create or replace` with an
-- identical signature preserves the existing grants, so these are redundant
-- when replayed against the live DB — but harmless, and they keep the
-- migration self-contained if replayed against a fresh DB.
revoke execute on function approve_leave_request(uuid, text) from public, anon;
grant execute on function approve_leave_request(uuid, text) to authenticated, service_role;
