-- supabase/migrations/0026_app_settings.sql
--
-- Sub-project 1 (branding). Global, single-row organization identity + a
-- super-admin-only role helper. The write policy calls is_super_admin(), so
-- the function is defined first.

create or replace function is_super_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from employees
    where id = auth.uid() and role = 'super_admin' and status = 'aktif'
  );
$$;

create table if not exists app_settings (
  id            integer primary key default 1 check (id = 1),
  nama_instansi text not null default 'Absensi HR',
  nama_singkat  text not null default 'Absensi HR',
  tagline       text,
  logo_url      text,
  alamat        text,
  telepon       text,
  email         text,
  warna_aksen   text not null default '#2563EB'
                check (warna_aksen ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references employees(id) on delete set null
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select using (true);

drop policy if exists app_settings_write on app_settings;
create policy app_settings_write on app_settings
  for all using (is_super_admin()) with check (is_super_admin());
