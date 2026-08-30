-- 0029 created the profile-photos bucket with path-prefix RLS but no bucket-
-- level guards. This is the first bucket in the project where an ordinary
-- employee's browser session holds a Storage WRITE grant (uploads go through
-- the user-scoped client). Without a size/MIME cap and an exact-name check, a
-- caller can bypass the /profil Server Action and upload an arbitrary-size,
-- arbitrary-name blob under their own <uid>/ prefix, which removePhoto
-- (avatar.jpg only) never cleans up.
--
-- NOTE: employees.foto_profil_url stores a BARE STORAGE PATH ("<uid>/avatar.jpg"),
-- not a URL — signed on read via signProfilePhotoUrl. (Pre-0029 rows may hold a
-- full URL; those degrade gracefully to the initials fallback.)

update storage.buckets
set file_size_limit = 524288,               -- 512 KB; a 512²@q0.8 JPEG is ~40-80 KB
    allowed_mime_types = array['image/jpeg']
where id = 'profile-photos';

drop policy if exists "profile photos insert" on storage.objects;
create policy "profile photos insert" on storage.objects for insert with check (
  bucket_id = 'profile-photos'
  and name = auth.uid()::text || '/avatar.jpg'
);

drop policy if exists "profile photos update" on storage.objects;
create policy "profile photos update" on storage.objects for update using (
  bucket_id = 'profile-photos'
  and name = auth.uid()::text || '/avatar.jpg'
);

drop policy if exists "profile photos delete" on storage.objects;
create policy "profile photos delete" on storage.objects for delete using (
  bucket_id = 'profile-photos'
  and name = auth.uid()::text || '/avatar.jpg'
);
