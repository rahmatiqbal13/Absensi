-- supabase/migrations/0029_profile_photos_bucket.sql
--
-- Private bucket for employee profile photos. Path-RLS mirrors attendance-
-- photos (0012): path is <employeeId>/avatar.jpg, an employee reads/writes
-- only their own prefix, hr_admin/super_admin read any (for the /karyawan
-- list + the topbar avatar). Unlike attendance-photos, uploads here go
-- through the USER-SCOPED client, so these write policies are enforced.

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

drop policy if exists "profile photos read" on storage.objects;
create policy "profile photos read" on storage.objects for select using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_hr_admin_role()
  )
);

drop policy if exists "profile photos insert" on storage.objects;
create policy "profile photos insert" on storage.objects for insert with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile photos update" on storage.objects;
create policy "profile photos update" on storage.objects for update using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile photos delete" on storage.objects;
create policy "profile photos delete" on storage.objects for delete using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
