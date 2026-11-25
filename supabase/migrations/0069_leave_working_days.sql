-- supabase/migrations/0069_leave_working_days.sql
--
-- Cuti tahunan dihitung per hari kerja, tidak tumpang-tindih, dan lintas tahun
-- dipotong dari saldo tahunnya masing-masing. From the system audit.
--
-- 1. Approval charged calendar days (tanggal_selesai - tanggal_mulai + 1): a
--    Fri–Mon leave cost 4 days of a Mon–Fri employee's balance, holidays too.
--    UU 13/2003 ps. 79 counts cuti tahunan in hari kerja. Now: the days in the
--    range that are working days of the employee's own schedule (jadwal khusus
--    > department > branch, as src/lib/schedule/resolve.ts) and not a holiday
--    of their branch.
-- 2. Nothing stopped two overlapping leave requests from both being approved,
--    charging the balance twice. Approval now refuses an overlap.
-- 3. A leave crossing new year was charged entirely to the start year. Each
--    year's part is now charged to that year's balance.
--
-- What was charged is stored on the request (saldo_dipotong, {"2026": 3}) so a
-- cancellation refunds exactly that. Requests approved before this migration
-- have it null and are refunded as they were charged (calendar days, start
-- year). No existing row or balance is changed here.

alter table public.leave_requests add column if not exists saldo_dipotong jsonb;

create or replace function leave_working_days(p_employee uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select branch_id, department_id, work_schedule_id from employees where id = p_employee
  ),
  sched as (
    select coalesce(
      (select ws.hari_kerja from work_schedules ws, emp
        where ws.id = emp.work_schedule_id and ws.branch_id = emp.branch_id),
      (select ws.hari_kerja from work_schedules ws, emp
        where emp.department_id is not null and ws.department_id = emp.department_id and ws.branch_id = emp.branch_id),
      (select ws.hari_kerja from work_schedules ws, emp
        where ws.branch_id = emp.branch_id and ws.department_id is null and ws.nama is null),
      array[1, 2, 3, 4, 5]
    ) as hari
  )
  select count(*)::integer
  from generate_series(p_from, p_to, interval '1 day') as d, sched, emp
  where extract(dow from d)::integer = any (sched.hari)
    and not exists (
      select 1 from holidays h
      where h.tanggal = d::date and (h.branch_id is null or h.branch_id = emp.branch_id)
    );
$$;
revoke execute on function leave_working_days(uuid, date, date) from public, anon;
grant execute on function leave_working_days(uuid, date, date) to authenticated, service_role;

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
  v_from date;
  v_to date;
  v_saldo_awal numeric;
  v_saldo_terpakai numeric;
  v_allowance numeric;
  v_charged jsonb := '{}'::jsonb;
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

  if exists (
    select 1 from leave_requests o
    where o.employee_id = v_request.employee_id
      and o.id <> v_request.id
      and o.status = 'approved'
      and o.tanggal_mulai <= v_request.tanggal_selesai
      and o.tanggal_selesai >= v_request.tanggal_mulai
  ) then
    raise exception 'leave overlaps an approved leave';
  end if;

  if v_request.jenis = 'tahunan' then
    for v_year in extract(year from v_request.tanggal_mulai)::integer .. extract(year from v_request.tanggal_selesai)::integer loop
      v_from := greatest(v_request.tanggal_mulai, make_date(v_year, 1, 1));
      v_to := least(v_request.tanggal_selesai, make_date(v_year, 12, 31));
      v_days := leave_working_days(v_request.employee_id, v_from, v_to);
      continue when v_days = 0;

      select saldo_awal, saldo_terpakai
        into v_saldo_awal, v_saldo_terpakai
        from leave_balances
        where employee_id = v_request.employee_id and tahun = v_year
        for update;

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

      v_charged := v_charged || jsonb_build_object(v_year::text, v_days);
    end loop;
  end if;

  update leave_requests
  set status = 'approved',
      catatan_approval = p_catatan,
      saldo_dipotong = case when v_request.jenis = 'tahunan' then v_charged else null end
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'leave request is not pending';
  end if;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_request.employee_id, 'leave_approved',
    jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
      'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
      'catatan', p_catatan, 'saldo_dipotong', v_request.saldo_dipotong),
    auth.uid() is not null and auth.uid() = v_request.employee_id
  );

  return v_request;
end;
$$;
revoke execute on function approve_leave_request(uuid, text) from public, anon;
grant execute on function approve_leave_request(uuid, text) to authenticated, service_role;

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
  v_part record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request from leave_requests where id = p_request_id for update;
  if v_request.id is null or v_request.employee_id <> auth.uid() then
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
    if v_request.saldo_dipotong is not null then
      -- Refund exactly what approval charged, per year (0069).
      for v_part in select key, value from jsonb_each_text(v_request.saldo_dipotong) loop
        update leave_balances
        set saldo_terpakai = greatest(saldo_terpakai - v_part.value::numeric, 0)
        where employee_id = v_request.employee_id and tahun = v_part.key::integer;
      end loop;
    else
      -- Approved before 0069: charged in calendar days to the start year.
      v_days := (v_request.tanggal_selesai - v_request.tanggal_mulai + 1);
      v_year := extract(year from v_request.tanggal_mulai)::integer;
      update leave_balances
      set saldo_terpakai = greatest(saldo_terpakai - v_days, 0)
      where employee_id = v_request.employee_id and tahun = v_year;
    end if;
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
