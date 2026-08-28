-- supabase/migrations/0027_branding_bucket.sql
--
-- Public bucket for the org logo. Mirrors the attendance-photos policy
-- conventions (0008/0012): policies named as strings, functions schema-
-- qualified (public.is_super_admin) so they resolve on the storage schema.

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists "branding super admin insert" on storage.objects;
create policy "branding super admin insert" on storage.objects
  for insert with check (bucket_id = 'branding' and public.is_super_admin());

drop policy if exists "branding super admin update" on storage.objects;
create policy "branding super admin update" on storage.objects
  for update using (bucket_id = 'branding' and public.is_super_admin());

drop policy if exists "branding super admin delete" on storage.objects;
create policy "branding super admin delete" on storage.objects
  for delete using (bucket_id = 'branding' and public.is_super_admin());
