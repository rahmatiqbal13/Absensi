-- supabase/migrations/0020_audit_leave_approval.sql
--
-- Plan 5, spec §8: leave approve/reject must land in audit_logs. This
-- create-or-replace reproduces the live bodies (approve: 0016, reject: 0014)
-- byte-for-byte and adds one `insert into audit_logs` before each RETURN.
-- EXECUTE grants re-asserted (anon named) per the 0014 C1 pattern.

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

  if not found then
    raise exception 'leave request is not pending';
  end if;

  if v_request.jenis = 'tahunan' then
    v_days := (v_request.tanggal_selesai - v_request.tanggal_mulai + 1);
    v_year := extract(year from v_request.tanggal_mulai)::integer;

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

  -- Plan 5, spec §8: audit trail.
  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_request.employee_id, 'leave_approved',
    jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
      'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
      'catatan', p_catatan),
    auth.uid() is not null and auth.uid() = v_request.employee_id
  );

  return v_request;
end;
$$;

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

  -- Plan 5, spec §8: audit trail.
  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_request.employee_id, 'leave_rejected',
    jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
      'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
      'catatan', p_catatan),
    auth.uid() is not null and auth.uid() = v_request.employee_id
  );

  return v_request;
end;
$$;

revoke execute on function approve_leave_request(uuid, text) from public, anon;
revoke execute on function reject_leave_request(uuid, text) from public, anon;
grant execute on function approve_leave_request(uuid, text) to authenticated, service_role;
grant execute on function reject_leave_request(uuid, text) to authenticated, service_role;
