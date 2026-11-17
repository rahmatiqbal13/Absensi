-- supabase/migrations/0038_leave_attachments_bucket.sql
--
-- Private bucket for leave attachments (surat dokter etc., PRD §6 Cuti).
-- No storage policies on purpose: objects are written and read only by the
-- server with the service-role key, after the app has checked who is asking
-- (the employee on submit; the approver / HR when reviewing, via short-lived
-- signed URLs). leave_requests.lampiran_url stores the object path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-attachments',
  'leave-attachments',
  false,
  3145728,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
