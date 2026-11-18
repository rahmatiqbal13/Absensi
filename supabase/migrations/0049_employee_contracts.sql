-- Employment contracts (PKWT / PKWTT / magang) with start and end dates, so HR
-- can see "kontrak ke-N", how often it was extended, and get reminded before
-- it ends (src/lib/employees/contracts.ts). employees.status_kontrak stays as
-- the display label and is synced from the latest contract by the app.
create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  jenis text not null check (jenis in ('pkwt', 'pkwtt', 'magang')),
  tanggal_mulai date not null,
  -- Null only for a permanent (PKWTT) contract.
  tanggal_selesai date,
  catatan text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_contracts_end_required check (jenis = 'pkwtt' or tanggal_selesai is not null),
  constraint employee_contracts_end_after_start check (tanggal_selesai is null or tanggal_selesai >= tanggal_mulai)
);

create index if not exists employee_contracts_employee_idx
  on public.employee_contracts (employee_id, tanggal_mulai desc);

alter table public.employee_contracts enable row level security;

-- HR admin / super admin only: contract terms are HR data.
drop policy if exists employee_contracts_hr_all on public.employee_contracts;
create policy employee_contracts_hr_all on public.employee_contracts
  for all using (public.is_hr_admin_role()) with check (public.is_hr_admin_role());

-- Contract-ending reminders for HR go through the bell (0048).
alter table public.notifications drop constraint if exists notifications_jenis_check;
alter table public.notifications
  add constraint notifications_jenis_check check (jenis in ('lupa_absen', 'slip_gaji', 'kontrak'));

-- Daily at 07:00 WIB: notify HR of contracts ending in 30 / 7 days or already
-- ended. Same Vault secrets as the absen reminder (0047).
select cron.schedule(
  'kontrak-reminder',
  '0 0 * * *',
  $$
  select net.http_get(
    url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'app_url')
      || '/api/cron/kontrak-reminder',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  )
  $$
);
