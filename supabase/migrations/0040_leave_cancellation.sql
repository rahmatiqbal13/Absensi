-- supabase/migrations/0040_leave_cancellation.sql
--
-- Employees can cancel their own leave request:
--   * pending  -> dibatalkan, any time;
--   * approved -> dibatalkan, only while the leave has not started yet
--                 (tanggal_mulai after today in Asia/Jakarta). Annual leave
--                 (jenis = 'tahunan') returns the days to leave_balances, using
--                 the same calendar-day count approve_leave_request deducted.
-- Rejected or already-started leave cannot be cancelled.
--
-- Every query that matters already filters leave_requests by an explicit
-- status ('pending' / 'approved'), so a 'dibatalkan' row drops out of
-- approval queues, payroll, dashboards and reports with no further change.
-- approve/reject_leave_request require status = 'pending' under FOR UPDATE,
-- so a cancel racing an approval is serialized: whichever commits first wins.

alter table leave_requests drop constraint leave_requests_status_check;
alter table leave_requests add constraint leave_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'dibatalkan'));

create or replace function cancel_leave_request(p_request_id uuid)
returns leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request leave_requests;
  v_prev_status text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_days numeric;
  v_year integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request from leave_requests where id = p_request_id for update;
  if v_request.id is null or v_request.employee_id <> auth.uid() then
    -- Same message for "missing" and "someone else's": don't confirm ids.
    raise exception 'leave request not found';
  end if;

  v_prev_status := v_request.status;
  if v_prev_status = 'approved' then
    if v_request.tanggal_mulai <= v_today then
      raise exception 'leave has already started';
    end if;
  elsif v_prev_status <> 'pending' then
    raise exception 'leave request cannot be cancelled';
  end if;

  update leave_requests
  set status = 'dibatalkan'
  where id = p_request_id
  returning * into v_request;

  if v_prev_status = 'approved' and v_request.jenis = 'tahunan' then
    v_days := (v_request.tanggal_selesai - v_request.tanggal_mulai + 1);
    v_year := extract(year from v_request.tanggal_mulai)::integer;
    update leave_balances
    set saldo_terpakai = greatest(saldo_terpakai - v_days, 0)
    where employee_id = v_request.employee_id and tahun = v_year;
  end if;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_request.employee_id, 'leave_cancelled',
    jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
      'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
      'status_sebelumnya', v_prev_status),
    true
  );

  return v_request;
end;
$$;

revoke execute on function cancel_leave_request(uuid) from public, anon;
grant execute on function cancel_leave_request(uuid) to authenticated;
