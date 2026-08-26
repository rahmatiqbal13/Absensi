-- supabase/migrations/0009_atasan_is_admin_and_self_update_allowlist.sql
--
-- Two review fixes on top of 0005/0006/0007. Both are `create or replace
-- function` on functions that already exist; the triggers and policies that
-- reference them by name are unchanged and keep pointing at the new bodies.
--
-- Fix I3 (role model): `is_admin_role()` used to be role in
--   ('hr_admin','super_admin'), while the route layer
--   (src/lib/auth/route-access.ts ADMIN_PATH_PREFIXES) already let `atasan`
--   into /dashboard, /karyawan, /payroll, /pengaturan, ... The two halves
--   disagreed, so an `atasan` reached admin pages and every RLS-gated read came
--   back empty and every write silently failed. Decision: `atasan` IS a full
--   admin at the DB layer too. The role list is the only thing that changes --
--   language, volatility, security and search_path are identical to 0005.
--
-- Fix I5 (self-update guard): prevent_employee_self_privilege_escalation()
--   enumerated a DENYLIST of seven columns (role, gaji_pokok, branch_id,
--   department_id, atasan_id, designated_approver_id, status). Columns added
--   later were therefore self-writable by default, and five already were:
--   tanggal_mulai_kerja and status_kontrak (direct inputs to the gaji-harian
--   calculation -- an employee could backdate their own start date), email
--   (desyncs employees.email from auth.users.email, which scripts/seed.ts and
--   every admin lookup match on), nama and jabatan. This inverts the guard into
--   an ALLOWLIST: a non-admin may change exactly `no_telp` and
--   `foto_profil_url` on their own row; any other column difference is
--   rejected. Fail-closed survives the next added column.

-- ---------------------------------------------------------------------------
-- Fix I3: atasan counts as an admin.
-- ---------------------------------------------------------------------------
create or replace function is_admin_role()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(current_employee_role() in ('atasan','hr_admin','super_admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- Fix I5: denylist -> allowlist on self-update of employees.
--
-- Implementation note: plpgsql has no way to enumerate "every column except
-- these two" as a field list, so the whole row is compared as jsonb with the
-- two writable keys deleted. jsonb equality is structural, not textual --
-- key order is normalised by the jsonb type itself -- so this cannot produce a
-- false positive from column ordering. `employees`
-- (0001_core_entities.sql:20-37) has no updated_at / bookkeeping column that
-- would change on every UPDATE and trip the comparison; created_at is set once
-- by its default and is itself protected by this guard, which is intended.
--
-- The early-exit condition is unchanged from 0005: admins and updates to
-- somebody else's row are untouched by this trigger (the base
-- `employees_update` policy is what gates those).
-- ---------------------------------------------------------------------------
create or replace function prevent_employee_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin_role() = false and auth.uid() = old.id then
    if (to_jsonb(new) - 'no_telp' - 'foto_profil_url')
       is distinct from (to_jsonb(old) - 'no_telp' - 'foto_profil_url')
    then
      raise exception 'not allowed to change protected fields on own employee record';
    end if;
  end if;
  return new;
end;
$$;
