-- supabase/migrations/0008_storage_bucket.sql
insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', false)
on conflict (id) do nothing;

create policy attendance_photos_owner_read on storage.objects for select using (
  bucket_id = 'attendance-photos'
  and (owner = auth.uid() or is_admin_role())
);

create policy attendance_photos_owner_write on storage.objects for insert with check (
  bucket_id = 'attendance-photos' and owner = auth.uid()
);
