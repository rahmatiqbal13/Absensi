-- supabase/migrations/0028_app_settings_hide_audit_cols.sql
--
-- app_settings_select is public (login/landing read branding before auth), but
-- the audit columns updated_by (a super-admin's auth.uid) / updated_at should
-- not be readable by anon. Column-level privileges compose with RLS: the row is
-- still visible, these two columns are not.
--
-- A bare `revoke select (col) ... from anon` is a no-op while anon still holds
-- Supabase's default table-level SELECT grant (that grant covers every column).
-- So: drop the table-level grant and re-grant SELECT on only the branding
-- columns, leaving updated_by / updated_at ungranted for anon.

revoke select on app_settings from anon;

grant select (
  id, nama_instansi, nama_singkat, tagline, logo_url,
  alamat, telepon, email, warna_aksen
) on app_settings to anon;
