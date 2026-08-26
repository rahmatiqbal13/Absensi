-- supabase/migrations/0012_fix_attendance_photos_path_based_rls.sql
--
-- I5 (Important, Plan 2 final whole-branch review): the attendance-photos
-- storage policies key off `storage.objects.owner`, a column that is never
-- populated for these objects.
--
-- 0008 shipped:
--   attendance_photos_owner_read   USING (bucket_id = ... and (owner = auth.uid() or is_admin_role()))
--   attendance_photos_owner_write  WITH CHECK (bucket_id = ... and owner = auth.uid())
--
-- Every upload goes through uploadAttendancePhoto()
-- (src/lib/attendance/photo-upload.ts), which is only ever called with
-- createServiceRoleSupabaseClient(). Under the service role auth.uid() is NULL,
-- so `owner` is never set to the employee's id -- `owner = auth.uid()` can never
-- be true for an employee reading their own selfie. The owner-read policy is
-- therefore dead, and only is_admin_role() holders can read anything.
--
-- Meanwhile photo-upload.ts already writes to `${employeeId}/${kind}-${ts}.jpg`,
-- so the ownership fact the code actually guarantees lives in the object PATH,
-- not in the `owner` column. Switch the policies to the standard Supabase
-- Storage path-prefix pattern: storage.foldername(name) splits the object name
-- on '/' and returns a text[], so element 1 is the first path segment -- the
-- employee id.
--
-- Tier choice: the admin read exemption moves from is_admin_role() (which since
-- 0009 includes `atasan`) to is_hr_admin_role() ('hr_admin','super_admin'),
-- matching 0010's tiering. Attendance selfies are anti-fraud evidence and
-- biometric personal data in the same category as the attendance triggers; an
-- `atasan` should not automatically be able to read every employee's selfies
-- just because 0009 widened the route-access tier.
--
-- The write policy is defense in depth only: the service role bypasses RLS
-- entirely, so today nothing evaluates it. It is kept (path-scoped instead of
-- owner-scoped) so that IF a direct user-client upload were ever introduced by
-- accident, it could still only write under the caller's own employee id.
--
-- Functions are schema-qualified so resolution does not depend on the
-- search_path in effect when a policy is evaluated on the storage schema.

drop policy if exists attendance_photos_owner_read on storage.objects;
create policy attendance_photos_owner_read on storage.objects for select using (
  bucket_id = 'attendance-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_hr_admin_role()
  )
);

drop policy if exists attendance_photos_owner_write on storage.objects;
create policy attendance_photos_owner_write on storage.objects for insert with check (
  bucket_id = 'attendance-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
