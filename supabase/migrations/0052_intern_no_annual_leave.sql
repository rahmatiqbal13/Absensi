-- Interns (status_kontrak magang) get no annual leave: while an employee is
-- magang their allowance is 0, whatever leave_balances holds; once their
-- status changes the normal allowance (row value, default 12) applies again.
-- Sick leave and izin khusus are unaffected.
--
-- Unused annual leave already lapses at year end: balances are one row per
-- (employee, tahun) and a new year starts a fresh row, nothing carried over.
--
-- approve_leave_request below is the 0020 body byte-for-byte except the
-- balance guard (one extra variable). No CASE expression in the body: the
-- Supabase CLI statement splitter misreads "case ... end then" and cuts the
-- function short. Keep src/lib/leave/balance-lookup.ts in step.

create or replace function employee_is_magang(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status_kontrak ilike '%magang%' from employees where id = p_employee_id), false)
$$;

revoke execute on function employee_is_magang(uuid) from public, anon;
grant execute on function employee_is_magang(uuid) to authenticated, service_role;

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
  v_allowance numeric;
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

    -- 0052: interns have no annual allowance.
    v_allowance := coalesce(v_saldo_awal, 12);
    if employee_is_magang(v_request.employee_id) then
      v_allowance := 0;
    end if;

    if coalesce(v_saldo_terpakai, 0) + v_days > v_allowance then
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

revoke execute on function approve_leave_request(uuid, text) from public, anon;
grant execute on function approve_leave_request(uuid, text) to authenticated, service_role;
