-- Web Push: one row per browser/device an employee turned notifications on
-- for. Every in-app notification (0048) is also pushed to these, so it shows
-- on the phone even with the app closed. Endpoints that the push service
-- reports as gone (404/410) are deleted by the sender.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_employee_idx on public.push_subscriptions (employee_id);

alter table public.push_subscriptions enable row level security;

-- An employee manages only their own devices; sending uses the service role.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (employee_id = auth.uid()) with check (employee_id = auth.uid());
