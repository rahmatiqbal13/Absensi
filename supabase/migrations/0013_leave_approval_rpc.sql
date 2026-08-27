-- supabase/migrations/0013_leave_approval_rpc.sql

-- Approve a pending leave request and credit its days against the
-- employee's leave_balances.saldo_terpakai, atomically in one transaction.
--
-- SECURITY DEFINER is required to write leave_balances (no client role has a
-- direct write policy on that table — it's read-only for clients, written
-- only by service-role/admin paths per Foundation). Because the function
-- owner typically has BYPASSRLS, the leave_requests_update RLS policy is NOT
-- guaranteed to be evaluated here — so this function explicitly re-implements
-- the same authorization the prevent_leave_self_approval trigger enforces
-- (only the assigned approver or an hr_admin/super_admin may act; self-approval
-- is always rejected) as its own first line of defense. The trigger still
-- fires on the internal UPDATE below regardless of RLS bypass — triggers are
-- not affected by RLS — so this is genuine defense in depth, not a
-- replacement for the trigger.
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
  select * into v_request from leave_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if v_request.approver_id = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'approved', catatan_approval = p_catatan
  where id = p_request_id
  returning * into v_request;

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

-- Reject a pending leave request. catatan_approval is required by the
-- caller-facing contract (enforced in application code, Task 7) — this
-- function accepts a NOT NULL text so a caller cannot pass an empty reject.
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

  select * into v_request from leave_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'rejected', catatan_approval = p_catatan
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;
