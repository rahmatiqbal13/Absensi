-- In-app notifications (bell icon), replacing the email channel for the
-- "lupa absen" reminder and the "slip gaji terbit" notice.
--
-- Written only by the service role (cron reminder, payroll finalize). An
-- employee can read their own and mark them read — nothing else.
-- (jenis, kunci) makes each notice idempotent per employee: kunci is the date
-- for a reminder and the payroll period id for a payslip, so overlapping
-- cron runs or a retried finalize never create a duplicate.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  jenis text not null check (jenis in ('lupa_absen', 'slip_gaji')),
  kunci text not null,
  judul text not null,
  isi text not null,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (employee_id, jenis, kunci)
);

create index if not exists notifications_employee_created_idx
  on public.notifications (employee_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (employee_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- Employees may only flip read_at; inserts/deletes stay with the service role.
revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- 0047's reminder log is superseded by the notification rows themselves.
select cron.unschedule('purge-attendance-reminders')
where exists (select 1 from cron.job where jobname = 'purge-attendance-reminders');
drop table if exists public.attendance_reminders;

-- Keep half a year of notifications; sweep daily (03:30 WIB).
select cron.schedule(
  'purge-notifications',
  '30 20 * * *',
  $$delete from public.notifications where created_at < now() - interval '180 days'$$
);
