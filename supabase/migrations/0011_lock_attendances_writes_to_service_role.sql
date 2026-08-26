-- supabase/migrations/0011_lock_attendances_writes_to_service_role.sql
--
-- C1 (Critical, Plan 2 final whole-branch review): `attendances` was still
-- directly writable by any authenticated employee.
--
-- 0005 shipped:
--   attendances_insert  WITH CHECK (employee_id = auth.uid())
--   attendances_update  USING/WITH CHECK (employee_id = auth.uid() or is_admin_role())
--
-- The browser holds NEXT_PUBLIC_SUPABASE_ANON_KEY plus the employee's session
-- JWT, so any `karyawan` could call PostgREST directly and INSERT a fabricated
-- attendance row -- self-chosen `status`, self-chosen `jam_masuk`, no geofence
-- check, no selfie, no mobile-lock, no consent -- bypassing every control the
-- attendance module exists to enforce. `attendances_update` likewise let an
-- employee rewrite `status` at will on an OPEN record: the
-- prevent_attendance_status_backdating trigger only fires once
-- `old.jam_pulang is not null`, so the whole pre-clock-out window was unguarded.
--
-- Fix: remove the client write path entirely.
--
-- Safe because no application code path writes `attendances` with a user-scoped
-- client. Every legitimate write goes through clockIn()/clockOut()
-- (src/lib/attendance/clock-in.ts, clock-out.ts), which are only ever called
-- from the Server Actions in src/app/(employee)/absen/actions.ts with
-- createServiceRoleSupabaseClient(). The service role bypasses RLS entirely, so
-- these policies are invisible to that path. The user-scoped client is used for
-- SELECT only (absen/page.tsx, riwayat/page.tsx), and attendances_select is
-- untouched.
--
-- Tier choice: is_hr_admin_role() ('hr_admin','super_admin'), NOT
-- is_admin_role() (which since 0009 also includes `atasan`). Direct attendance
-- writes are exactly the anti-fraud-sensitive class 0010 established should be
-- HR-only; an `atasan` must not be able to hand-write attendance rows for
-- themselves or their reports. HR keeps a direct-write path for manual
-- corrections, matching employees_update and the other admin-writable tables.
--
-- Consequence worth recording: with the client write path gone, the
-- prevent_attendance_status_backdating trigger (0007 body, 0010 tier) becomes
-- unreachable in practice -- its guard requires
-- `is_hr_admin_role() = false and auth.uid() = old.employee_id`, and after this
-- migration any UPDATE that passes RLS has is_hr_admin_role() = true (or is the
-- service role, where auth.uid() is NULL). It is deliberately left in place as
-- defense in depth should these policies ever be loosened again.

drop policy if exists attendances_insert on attendances;
create policy attendances_insert on attendances for insert with check (
  is_hr_admin_role()
);

drop policy if exists attendances_update on attendances;
create policy attendances_update on attendances for update using (
  is_hr_admin_role()
) with check (
  is_hr_admin_role()
);
