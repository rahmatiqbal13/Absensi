-- supabase/migrations/0041_attendance_corrections.sql
--
-- Attendance corrections: an employee asks for a day's jam masuk / jam pulang
-- to be fixed (forgot to clock out, GPS failed, phone dead); their approver or
-- HR decides. HR can also correct a day directly, which is recorded as a
-- correction they created and approved in one step.
--
-- Write path mirrors attendances (0011): no client INSERT/UPDATE policy. The
-- server actions authenticate the caller, decide who may act, compute the new
-- attendance status with the same TypeScript rules as clock-in, then call
-- apply_attendance_correction() with the service role. That RPC is the single
-- atomic write: it re-checks the invariants that must hold no matter who calls
-- it (pending, no self-approval, payroll not finalized), upserts the
-- attendance row, closes the correction and writes the audit entry.

create table attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  tanggal date not null,
  jam_masuk timestamptz not null,
  jam_pulang timestamptz,
  alasan text not null check (btrim(alasan) <> ''),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'dibatalkan')),
  approver_id uuid references employees(id) on delete set null,
  -- true when HR corrected the day directly (created + approved in one step).
  langsung boolean not null default false,
  catatan_approval text,
  decided_by uuid references employees(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_corrections_jam_order_check
    check (jam_pulang is null or jam_pulang > jam_masuk)
);

create index attendance_corrections_employee_idx on attendance_corrections(employee_id, tanggal);
create index attendance_corrections_pending_approver_idx
  on attendance_corrections(approver_id) where status = 'pending';
-- One open request per employee per day.
create unique index attendance_corrections_one_pending_per_day
  on attendance_corrections(employee_id, tanggal) where status = 'pending';

alter table attendance_corrections enable row level security;

-- Read: the employee, their assigned approver, and HR. No write policies.
create policy attendance_corrections_select on attendance_corrections for select using (
  employee_id = auth.uid() or approver_id = auth.uid() or is_hr_admin_role()
);

-- A corrected half of the day is marked as such (alongside gps / qr).
alter table attendances drop constraint if exists attendances_metode_masuk_check;
alter table attendances add constraint attendances_metode_masuk_check
  check (metode_masuk in ('gps', 'qr', 'koreksi'));
alter table attendances drop constraint if exists attendances_metode_pulang_check;
alter table attendances add constraint attendances_metode_pulang_check
  check (metode_pulang in ('gps', 'qr', 'koreksi'));

create or replace function apply_attendance_correction(
  p_correction_id uuid,
  p_decider_id uuid,
  p_approve boolean,
  p_status text,      -- recomputed attendance status; required when approving
  p_catatan text
)
returns attendance_corrections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corr attendance_corrections;
  v_branch uuid;
  v_before attendances;
  v_after attendances;
begin
  select * into v_corr from attendance_corrections where id = p_correction_id for update;
  if v_corr.id is null then
    raise exception 'correction not found';
  end if;
  if v_corr.status <> 'pending' then
    raise exception 'correction is not pending';
  end if;
  if p_decider_id is null or p_decider_id = v_corr.employee_id then
    raise exception 'self-approval is not allowed';
  end if;

  if not p_approve then
    if p_catatan is null or btrim(p_catatan) = '' then
      raise exception 'catatan is required to reject a correction';
    end if;
    update attendance_corrections
    set status = 'rejected', catatan_approval = p_catatan, decided_by = p_decider_id, decided_at = now()
    where id = p_correction_id
    returning * into v_corr;

    insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
    values (p_decider_id, v_corr.employee_id, 'attendance_correction_rejected',
      jsonb_build_object('correction_id', v_corr.id, 'tanggal', v_corr.tanggal, 'catatan', p_catatan), false);
    return v_corr;
  end if;

  if p_status is null or p_status not in ('tepat_waktu', 'terlambat', 'pulang_cepat', 'di_luar_lokasi') then
    raise exception 'invalid attendance status';
  end if;

  -- Never rewrite a day that already went into a finalized payroll.
  select branch_id into v_branch from employees where id = v_corr.employee_id;
  if exists (
    select 1 from payroll_periods
    where branch_id = v_branch
      and bulan = extract(month from v_corr.tanggal)::int
      and tahun = extract(year from v_corr.tanggal)::int
      and status = 'final'
  ) then
    raise exception 'payroll period is finalized';
  end if;

  select * into v_before from attendances
  where employee_id = v_corr.employee_id and tanggal = v_corr.tanggal
  for update;

  if v_before.id is null then
    insert into attendances (employee_id, tanggal, jam_masuk, jam_pulang, status, metode_masuk, metode_pulang)
    values (v_corr.employee_id, v_corr.tanggal, v_corr.jam_masuk, v_corr.jam_pulang, p_status,
      'koreksi', case when v_corr.jam_pulang is not null then 'koreksi' end)
    returning * into v_after;
  else
    update attendances
    set jam_masuk = v_corr.jam_masuk,
        jam_pulang = v_corr.jam_pulang,
        status = p_status,
        metode_masuk = case when v_before.jam_masuk is distinct from v_corr.jam_masuk
                            then 'koreksi' else v_before.metode_masuk end,
        metode_pulang = case when v_before.jam_pulang is distinct from v_corr.jam_pulang
                             then (case when v_corr.jam_pulang is not null then 'koreksi' end)
                             else v_before.metode_pulang end
    where id = v_before.id
    returning * into v_after;
  end if;

  update attendance_corrections
  set status = 'approved', catatan_approval = p_catatan, decided_by = p_decider_id, decided_at = now()
  where id = p_correction_id
  returning * into v_corr;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (p_decider_id, v_corr.employee_id, 'attendance_correction_approved',
    jsonb_build_object(
      'correction_id', v_corr.id,
      'tanggal', v_corr.tanggal,
      'langsung', v_corr.langsung,
      'alasan', v_corr.alasan,
      'before', case when v_before.id is null then null else jsonb_build_object(
        'jam_masuk', v_before.jam_masuk, 'jam_pulang', v_before.jam_pulang, 'status', v_before.status) end,
      'after', jsonb_build_object(
        'jam_masuk', v_after.jam_masuk, 'jam_pulang', v_after.jam_pulang, 'status', v_after.status),
      'catatan', p_catatan),
    false);

  return v_corr;
end;
$$;

-- Service role only: authorization (who may decide) is enforced by the server
-- action before it calls this; an end user can never reach it via PostgREST.
revoke execute on function apply_attendance_correction(uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function apply_attendance_correction(uuid, uuid, boolean, text, text) to service_role;
