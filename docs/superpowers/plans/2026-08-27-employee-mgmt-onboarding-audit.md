# Manajemen Karyawan + Onboarding + Audit + Libur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR admins recruit employees invite-only (a set-password link shown on screen for HR to send by chat — no email infra), manage/deactivate them, cannot have their `atasan` role tamper with anyone's salary or role, and every employee mutation plus every leave approve/reject lands in an audit trail viewable at `/pengaturan/audit`; national holidays get a management screen and a 2026 seed so payroll can subtract them.

**Architecture:** Two new Postgres `SECURITY DEFINER` triggers on `employees` — one blocks any non-`hr_admin` from changing protected fields on *any* row (closing the lateral-escalation hole the row-level `employees_update` policy leaves open), one writes an `audit_logs` row on every INSERT/UPDATE/DELETE. The existing leave-approval RPCs are `create or replace`d to also insert an `audit_logs` row. All `/karyawan` mutations go through a **user-scoped** Supabase client so RLS + triggers evaluate the real caller; only `inviteEmployee` uses service-role (it needs `auth.admin.*`). Onboarding uses `auth.admin.generateLink` and returns the link to the HR UI; a public `/set-password` page exchanges the token and sets the password. `getCurrentEmployee` returns `null` for a non-`aktif` employee, so every existing guard rejects a deactivated user with no further changes.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, Route Handlers) · React 19.2 · TypeScript strict · `@supabase/supabase-js` / `@supabase/ssr` · Vitest + Testing Library · no new dependencies.

This is **Plan 5 of a 6-plan sequence** derived from `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` (§3, §8) and refined in `docs/superpowers/specs/2026-08-27-employee-mgmt-onboarding-audit-design.md`. Plans 1–4 are complete (see `.superpowers/sdd/progress.md`). Plan 6 = departments/work_schedules management + `/laporan` + Realtime dashboard + Excel/PDF export.

## Global Constraints

- TypeScript strict. Package manager **npm**. `npm test` = fast unit suite; `npm run test:integration` = live-cloud suite.
- **Never return raw Postgres/PostgREST error text to the user.** Every Server Action / library function that touches the DB must `console.error` the raw error and return a fixed Indonesian message. Map pattern: `src/app/(admin)/persetujuan-cuti/actions.ts` (`RPC_ERROR_MESSAGES` + `mapRpcError`).
- **`/karyawan` mutations use the user-scoped client** (`createServerSupabaseClient()`) so RLS + triggers see the real `auth.uid()`. **`inviteEmployee` is the sole service-role path** (`createServiceRoleSupabaseClient()`) — it needs `auth.admin.*`, and there is no `employees_insert` RLS policy for clients (RLS bypass here is deliberate).
- **New `SECURITY DEFINER` functions/triggers**: `language plpgsql`, `set search_path = public`.
- **Migrations that `create or replace` an existing RPC** (`0019`): copy the entire body of the last version verbatim (from `supabase/migrations/0016_leave_approval_balance_guard.sql`), add only the new lines, then re-run `revoke execute ... from public, anon;` and `grant execute ... to authenticated, service_role;` for that function **in the same migration** — `create or replace` does not reset the ACL but re-asserting is the established pattern, and `anon` must be named explicitly (see the C1 comment block in `0014_fix_leave_approval_rpc_security.sql`).
- **`employees` protected fields** (the trigger's list, and the fields a non-hr-admin edit form must treat as read-only): `role`, `gaji_pokok`, `branch_id`, `atasan_id`, `designated_approver_id`, `status_kontrak`, `status`, `tanggal_mulai_kerja`, `email`.
- Date-only values may parse as UTC midnight; **never** `date.toISOString().slice(...)`, bare `.getHours()`/`.getMinutes()`, or `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` without an explicit `timeZone: "Asia/Jakarta"` — for any timestamp display use the `Intl.DateTimeFormat({ timeZone: "Asia/Jakarta" })` pattern in `src/lib/attendance/jakarta-date.ts`.
- `Role` type: import from `@/lib/auth/route-access` — never redefine.
- Icons: inline stroke-based SVG, never emoji. Badges follow `src/components/leave-status-badge.tsx` (`<svg role="img" aria-hidden="true" …>` + `<span>` label, distinct `bg-*`/`text-*` per value). Admin pages follow `src/app/(admin)/dashboard/page.tsx` / `persetujuan-cuti/page.tsx` / `payroll/page.tsx` conventions (result-union rendering `{x.ok ? … : <p className="text-sm text-red-600">{x.error}</p>}`, `getCurrentEmployee` + `redirect("/login")`, in-page role gate `if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard")`).
- To-one PostgREST embeds (`branches(nama)`, `actor:employees!fk(nama)`) are mis-inferred as arrays by the generated types — use the `as unknown as { … } | null` double-cast, consistent with Plan 4.
- Supabase is a linked **cloud** project. Migrations apply via `npx supabase db push`, **never** `supabase db reset` / `truncate` / `delete from` on live data (a scoped `delete` inside a one-shot seed script for a single year's rows is fine). Export the token first: `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. Last migration: `0017_payroll_generate_finalize_rpc.sql`. This plan: `0018`, `0019`.
- `Role` values: `karyawan | atasan | hr_admin | super_admin`. `is_hr_admin_role()` (SQL, migration `0010`) = `('hr_admin','super_admin')`. `is_admin_role()` = the above plus `atasan`.

---

## Task 1: Migration 0018 — protected-field trigger, audit trigger, holidays RLS

**Files:**
- Create: `supabase/migrations/0018_employee_authz_audit_and_holiday_rls.sql`
- Create: `tests/integration/employee-authz-audit.test.ts`

**Interfaces:**
- Produces: trigger `trg_prevent_protected_employee_field_change` on `employees` BEFORE UPDATE — raises `not allowed to change protected employee fields` when `is_hr_admin_role() = false` and any protected field changed.
- Produces: trigger `trg_audit_employee_changes` on `employees` AFTER INSERT/UPDATE/DELETE — inserts an `audit_logs` row (`aksi` ∈ `employee_created | employee_updated | employee_deactivated | employee_reactivated | employee_deleted`).
- Produces: `holidays_write` policy now `is_hr_admin_role()`.
- Consumed by: Task 5 (`inviteEmployee` — insert fires the audit trigger), Task 11 (`updateEmployee`), Task 12 (audit viewer reads what these write), Task 13 (holidays writes).

**Prerequisite:** `npx supabase link` already configured. Apply via `npx supabase db push`. **Never** `db reset`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0018_employee_authz_audit_and_holiday_rls.sql
--
-- Plan 5. Two things the row-level policies cannot express:
--
-- 1. employees_update (0005) is `id = auth.uid() OR is_admin_role()`, and 0009
--    widened is_admin_role() to include `atasan`. So an `atasan` can UPDATE any
--    employee row, and the existing prevent_employee_self_privilege_escalation
--    trigger only fires when `auth.uid() = old.id` (self). Nothing stops an
--    atasan from raising a subordinate's salary or role. This migration adds a
--    BEFORE UPDATE trigger that blocks a non-hr_admin from changing ANY
--    protected field on ANY row. It overlaps the self-escalation trigger for
--    self-edits (same outcome) and closes the atasan-edits-others gap.
--
-- 2. audit_logs (0003) has no writer. This adds an AFTER INSERT/UPDATE/DELETE
--    trigger on employees. SECURITY DEFINER so it can write audit_logs (which
--    has no client insert policy). actor_id may be NULL when the mutation runs
--    under service-role (e.g. inviteEmployee's insert) -- that is correct and
--    marks "system/invite" actions.

-- --- 1: protected-field guard ---------------------------------------------
create or replace function prevent_protected_employee_field_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_hr_admin_role() = false then
    if new.role is distinct from old.role
       or new.gaji_pokok is distinct from old.gaji_pokok
       or new.branch_id is distinct from old.branch_id
       or new.atasan_id is distinct from old.atasan_id
       or new.designated_approver_id is distinct from old.designated_approver_id
       or new.status_kontrak is distinct from old.status_kontrak
       or new.status is distinct from old.status
       or new.tanggal_mulai_kerja is distinct from old.tanggal_mulai_kerja
       or new.email is distinct from old.email
    then
      raise exception 'not allowed to change protected employee fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_protected_employee_field_change on employees;
create trigger trg_prevent_protected_employee_field_change
  before update on employees for each row
  execute function prevent_protected_employee_field_change();

-- --- 2: audit trigger ----------------------------------------------------
create or replace function audit_employee_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target uuid := coalesce(new.id, old.id);
  v_aksi text;
begin
  if tg_op = 'INSERT' then
    v_aksi := 'employee_created';
  elsif tg_op = 'DELETE' then
    v_aksi := 'employee_deleted';
  elsif new.status is distinct from old.status then
    v_aksi := case when new.status = 'nonaktif'
                   then 'employee_deactivated' else 'employee_reactivated' end;
  else
    v_aksi := 'employee_updated';
  end if;

  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_target, v_aksi,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
    auth.uid() is not null and auth.uid() = v_target
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_employee_changes on employees;
create trigger trg_audit_employee_changes
  after insert or update or delete on employees for each row
  execute function audit_employee_changes();

-- --- 3: holidays writes are hr_admin only (consistency with /payroll,
-- /karyawan). holidays_select stays `authenticated`.
drop policy if exists holidays_write on holidays;
create policy holidays_write on holidays
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/employee-authz-audit.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

async function signInAs(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  return client;
}

describe("employee authz + audit triggers (0018)", () => {
  let branchId: string;
  let atasan: { id: string; email: string };
  let hrAdmin: { id: string; email: string };
  let worker: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: `Cabang AuthzAudit ${suffix}`, lat: -6.2, long: 106.8 })
      .select().single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.aa.${suffix}@test.local`, role: "atasan" },
      { key: "hrAdmin", email: `hradmin.aa.${suffix}@test.local`, role: "hr_admin" },
      { key: "worker", email: `worker.aa.${suffix}@test.local`, role: "karyawan" },
    ] as const;
    const ids: Record<string, string> = {};
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      ids[s.key] = u!.user!.id;
      await db.from("employees").insert({
        id: ids[s.key], nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
        atasan_id: s.key === "worker" ? ids.atasan : null,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    hrAdmin = { id: ids.hrAdmin, email: seeds[1].email };
    worker = { id: ids.worker, email: seeds[2].email };
  });

  it("blocks an atasan from changing another employee's gaji_pokok", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("employees")
      .update({ gaji_pokok: 99_000_000 }).eq("id", worker.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("not allowed to change protected employee fields");
  });

  it("blocks an atasan from changing another employee's role", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("employees")
      .update({ role: "hr_admin" }).eq("id", worker.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("not allowed to change protected employee fields");
  });

  it("lets an hr_admin change a protected field, and audits it", async () => {
    const client = await signInAs(hrAdmin.email);
    const { error } = await client.from("employees")
      .update({ gaji_pokok: 12_000_000 }).eq("id", worker.id);
    expect(error).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: logs } = await db.from("audit_logs")
      .select("aksi, actor_id, target_employee_id, is_self_action")
      .eq("target_employee_id", worker.id).order("waktu", { ascending: false }).limit(1);
    expect(logs![0].aksi).toBe("employee_updated");
    expect(logs![0].actor_id).toBe(hrAdmin.id);
    expect(logs![0].is_self_action).toBe(false);
  });

  it("audits a deactivation as employee_deactivated with is_self_action false", async () => {
    const client = await signInAs(hrAdmin.email);
    await client.from("employees").update({ status: "nonaktif" }).eq("id", worker.id);

    const db = createServiceRoleSupabaseClient();
    const { data: logs } = await db.from("audit_logs")
      .select("aksi, is_self_action").eq("target_employee_id", worker.id)
      .order("waktu", { ascending: false }).limit(1);
    expect(logs![0].aksi).toBe("employee_deactivated");
    expect(logs![0].is_self_action).toBe(false);
  });

  it("records employee_created + is_self_action true when hr_admin edits their own row", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: created } = await db.from("audit_logs")
      .select("aksi").eq("target_employee_id", hrAdmin.id).eq("aksi", "employee_created");
    expect(created!.length).toBeGreaterThanOrEqual(1);

    const client = await signInAs(hrAdmin.email);
    await client.from("employees").update({ jabatan: "Manajer HR" }).eq("id", hrAdmin.id);
    const { data: logs } = await db.from("audit_logs")
      .select("aksi, is_self_action").eq("target_employee_id", hrAdmin.id)
      .order("waktu", { ascending: false }).limit(1);
    expect(logs![0].aksi).toBe("employee_updated");
    expect(logs![0].is_self_action).toBe(true);
  });

  it("blocks an atasan from changing holidays now that holidays_write is hr_admin only", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("holidays")
      .insert({ tanggal: "2026-12-31", nama: `sneaky ${suffix}` });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:integration -- employee-authz-audit.test.ts
```

Expected: FAIL — the atasan update succeeds (no trigger yet) / no audit rows.

- [ ] **Step 4: Apply the migration and re-run**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
npm run test:integration -- employee-authz-audit.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_employee_authz_audit_and_holiday_rls.sql tests/integration/employee-authz-audit.test.ts
git commit -m "feat(db): protected-field guard + employee audit trigger + holidays hr_admin RLS"
```

---

## Task 2: Seed 2026 national holidays

**Files:**
- Create: `scripts/seed-holidays-2026.ts`

**Interfaces:**
- Consumed by: nothing in code; run once to populate `holidays` so payroll can subtract them and `/pengaturan/libur` (Task 13) has data.

- [ ] **Step 1: Write the script**

```typescript
// scripts/seed-holidays-2026.ts
import { config } from "dotenv";
import { createServiceRoleSupabaseClient } from "../src/lib/supabase/server";

if (require.main === module) {
  config({ path: ".env.local" });
}

// Best-effort Indonesian national holidays for 2026 (branch_id = null = nasional).
// !! HR MUST verify these against the official 2026 SKB 3 Menteri before the
// first real payroll period — the Islamic-calendar dates (Isra Mikraj, Idul
// Fitri, Idul Adha, Tahun Baru Hijriah, Maulid) depend on hisab/rukyat and
// commonly shift by a day.
const HOLIDAYS_2026: { tanggal: string; nama: string }[] = [
  { tanggal: "2026-01-01", nama: "Tahun Baru Masehi" },
  { tanggal: "2026-01-16", nama: "Isra Mikraj Nabi Muhammad SAW" },
  { tanggal: "2026-02-17", nama: "Tahun Baru Imlek 2577" },
  { tanggal: "2026-03-19", nama: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
  { tanggal: "2026-03-20", nama: "Idul Fitri 1447 H" },
  { tanggal: "2026-03-21", nama: "Idul Fitri 1447 H" },
  { tanggal: "2026-04-03", nama: "Wafat Isa Al Masih" },
  { tanggal: "2026-05-01", nama: "Hari Buruh Internasional" },
  { tanggal: "2026-05-14", nama: "Kenaikan Isa Al Masih" },
  { tanggal: "2026-05-27", nama: "Idul Adha 1447 H" },
  { tanggal: "2026-05-31", nama: "Hari Raya Waisak 2570" },
  { tanggal: "2026-06-01", nama: "Hari Lahir Pancasila" },
  { tanggal: "2026-06-16", nama: "Tahun Baru Islam 1448 H" },
  { tanggal: "2026-08-17", nama: "Hari Kemerdekaan Republik Indonesia" },
  { tanggal: "2026-08-25", nama: "Maulid Nabi Muhammad SAW" },
  { tanggal: "2026-12-25", nama: "Hari Raya Natal" },
];

export async function seedHolidays2026() {
  const db = createServiceRoleSupabaseClient();
  // Idempotent: clear this year's national rows, then reinsert. Per-branch
  // holidays (branch_id not null) are untouched.
  const { error: delErr } = await db
    .from("holidays")
    .delete()
    .is("branch_id", null)
    .gte("tanggal", "2026-01-01")
    .lte("tanggal", "2026-12-31");
  if (delErr) throw new Error(`clear 2026 holidays failed: ${delErr.message}`);

  const { error: insErr } = await db
    .from("holidays")
    .insert(HOLIDAYS_2026.map((h) => ({ ...h, branch_id: null })));
  if (insErr) throw new Error(`insert 2026 holidays failed: ${insErr.message}`);

  return HOLIDAYS_2026.length;
}

if (require.main === module) {
  seedHolidays2026()
    .then((n) => {
      console.log(`Seeded ${n} national holidays for 2026.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Run it**

```bash
npx tsx scripts/seed-holidays-2026.ts
```

Expected: `Seeded 16 national holidays for 2026.`

- [ ] **Step 3: Verify + re-run (idempotence)**

```bash
npx tsx scripts/seed-holidays-2026.ts
```

Expected: same output, still 16 rows (a `select count(*)` via `psql`/Supabase dashboard confirms no duplication).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-holidays-2026.ts
git commit -m "feat: idempotent 2026 national-holiday seed"
```

---

## Task 3: Migration 0019 — audit leave approve/reject

**Files:**
- Create: `supabase/migrations/0019_audit_leave_approval.sql`
- Modify: `tests/integration/leave-approval-rpc.test.ts` (add 2 audit assertions)

**Interfaces:**
- Consumes: `audit_logs` schema (0003).
- Produces: `approve_leave_request` / `reject_leave_request` now also insert an `audit_logs` row (`aksi` = `leave_approved` / `leave_rejected`).
- Consumed by: Task 12 (viewer displays these).

- [ ] **Step 1: Sanity-check the source bodies**

```bash
sed -n '/create or replace function approve_leave_request/,/^\$\$;/p' supabase/migrations/0016_leave_approval_balance_guard.sql
sed -n '/create or replace function reject_leave_request/,/^\$\$;/p' supabase/migrations/0014_fix_leave_approval_rpc_security.sql
```

These are the live versions (`approve` last touched in `0016`, `reject` in `0014`). The migration below reproduces them **verbatim** and adds one `insert into audit_logs` before each `return v_request;`. Diff the pasted bodies against that `sed` output before applying — a paraphrase here silently breaks balance guarding or self-approval blocking.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/0019_audit_leave_approval.sql
--
-- Plan 5, spec §8: leave approve/reject must land in audit_logs. This
-- create-or-replace reproduces the live bodies (approve: 0016, reject: 0014)
-- byte-for-byte and adds one `insert into audit_logs` before each RETURN.
-- EXECUTE grants re-asserted (anon named) per the 0014 C1 pattern.

create or replace function approve_leave_request(p_request_id uuid, p_catatan text default null)
returns leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request leave_requests;
  v_days numeric;
  v_year integer;
  v_saldo_awal numeric;
  v_saldo_terpakai numeric;
begin
  select * into v_request from leave_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if v_request.approver_id = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'approved', catatan_approval = p_catatan
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'leave request is not pending';
  end if;

  if v_request.jenis = 'tahunan' then
    v_days := (v_request.tanggal_selesai - v_request.tanggal_mulai + 1);
    v_year := extract(year from v_request.tanggal_mulai)::integer;

    select saldo_awal, saldo_terpakai
      into v_saldo_awal, v_saldo_terpakai
      from leave_balances
      where employee_id = v_request.employee_id and tahun = v_year
      for update;

    if coalesce(v_saldo_terpakai, 0) + v_days > coalesce(v_saldo_awal, 12) then
      raise exception 'insufficient leave balance to approve this request';
    end if;

    insert into leave_balances (employee_id, tahun, saldo_terpakai)
    values (v_request.employee_id, v_year, v_days)
    on conflict (employee_id, tahun)
    do update set saldo_terpakai = leave_balances.saldo_terpakai + v_days;
  end if;

  -- Plan 5, spec §8: audit trail.
  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_request.employee_id, 'leave_approved',
    jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
      'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
      'catatan', p_catatan),
    auth.uid() is not null and auth.uid() = v_request.employee_id
  );

  return v_request;
end;
$$;

create or replace function reject_leave_request(p_request_id uuid, p_catatan text)
returns leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request leave_requests;
begin
  if p_catatan is null or btrim(p_catatan) = '' then
    raise exception 'catatan_approval is required to reject a leave request';
  end if;

  select * into v_request from leave_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if v_request.approver_id = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'rejected', catatan_approval = p_catatan
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'leave request is not pending';
  end if;

  -- Plan 5, spec §8: audit trail.
  insert into audit_logs (actor_id, target_employee_id, aksi, detail, is_self_action)
  values (
    auth.uid(), v_request.employee_id, 'leave_rejected',
    jsonb_build_object('request_id', v_request.id, 'jenis', v_request.jenis,
      'tanggal_mulai', v_request.tanggal_mulai, 'tanggal_selesai', v_request.tanggal_selesai,
      'catatan', p_catatan),
    auth.uid() is not null and auth.uid() = v_request.employee_id
  );

  return v_request;
end;
$$;

revoke execute on function approve_leave_request(uuid, text) from public, anon;
revoke execute on function reject_leave_request(uuid, text) from public, anon;
grant execute on function approve_leave_request(uuid, text) to authenticated, service_role;
grant execute on function reject_leave_request(uuid, text) to authenticated, service_role;
```

- [ ] **Step 3: Add the failing audit assertions to the existing RPC test**

In `tests/integration/leave-approval-rpc.test.ts`, inside the existing "lets the assigned approver approve" test, after the approve succeeds add:

```typescript
    const { data: auditRows } = await db
      .from("audit_logs")
      .select("aksi, target_employee_id, is_self_action")
      .eq("aksi", "leave_approved")
      .eq("target_employee_id", karyawan.id)
      .order("waktu", { ascending: false })
      .limit(1);
    expect(auditRows![0].aksi).toBe("leave_approved");
    expect(auditRows![0].is_self_action).toBe(false);
```

And add a new test near the reject tests:

```typescript
  it("writes a leave_rejected audit row on reject", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db.from("leave_requests").insert({
      employee_id: karyawan.id, jenis: "sakit",
      tanggal_mulai: "2026-11-25", tanggal_selesai: "2026-11-25", approver_id: atasan.id,
    }).select().single();

    const atasanClient = await signInAs(atasan.email);
    await atasanClient.rpc("reject_leave_request", { p_request_id: leave!.id, p_catatan: "Tidak lengkap" });

    const { data: rows } = await db.from("audit_logs")
      .select("aksi").eq("aksi", "leave_rejected").eq("target_employee_id", karyawan.id)
      .order("waktu", { ascending: false }).limit(1);
    expect(rows![0].aksi).toBe("leave_rejected");
  });
```

- [ ] **Step 4: Run to verify it fails**

```bash
npm run test:integration -- leave-approval-rpc.test.ts
```

Expected: FAIL — no `leave_approved` / `leave_rejected` audit rows.

- [ ] **Step 5: Apply and re-run**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
npm run test:integration -- leave-approval-rpc.test.ts
```

Expected: PASS (all prior tests + 2 audit assertions).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0019_audit_leave_approval.sql tests/integration/leave-approval-rpc.test.ts
git commit -m "feat(db): audit_logs entry on leave approve/reject"
```

---

## Task 4: `validateEmployeeInput`

**Files:**
- Create: `src/lib/employees/employee-form.ts`
- Create: `src/lib/employees/employee-form.test.ts`

**Interfaces:**
- Produces: `type EmployeeFormInput = { nama: string; email: string; jabatan: string; statusKontrak: string; tanggalMulaiKerja: string; gajiPokok: number; role: Role; branchId: string; departmentId: string | null; atasanId: string | null; designatedApproverId: string | null }`.
- Produces: `validateEmployeeInput(raw: Record<string, FormDataEntryValue | null>): { ok: true; value: EmployeeFormInput } | { ok: false; error: string }`.
- Consumed by: Task 11 (`createEmployee`, `updateEmployee`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/employees/employee-form.test.ts
import { describe, it, expect } from "vitest";
import { validateEmployeeInput } from "./employee-form";

const base = {
  nama: "Budi Santoso",
  email: "budi@contoh.co.id",
  jabatan: "Staff",
  statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-02-01",
  gajiPokok: "8000000",
  role: "karyawan",
  branchId: "11111111-1111-1111-1111-111111111111",
  departmentId: "",
  atasanId: "",
  designatedApproverId: "",
};

describe("validateEmployeeInput", () => {
  it("accepts a valid karyawan payload and coerces types", () => {
    const result = validateEmployeeInput(base);
    expect(result).toEqual({
      ok: true,
      value: {
        nama: "Budi Santoso",
        email: "budi@contoh.co.id",
        jabatan: "Staff",
        statusKontrak: "tetap",
        tanggalMulaiKerja: "2026-02-01",
        gajiPokok: 8_000_000,
        role: "karyawan",
        branchId: "11111111-1111-1111-1111-111111111111",
        departmentId: null,
        atasanId: null,
        designatedApproverId: null,
      },
    });
  });

  it("rejects a missing required field", () => {
    const result = validateEmployeeInput({ ...base, nama: "" });
    expect(result).toEqual({ ok: false, error: "Nama, email, jabatan, tanggal mulai kerja, dan cabang wajib diisi." });
  });

  it("rejects an invalid email", () => {
    const result = validateEmployeeInput({ ...base, email: "budi-at-contoh" });
    expect(result).toEqual({ ok: false, error: "Format email tidak valid." });
  });

  it("rejects an unknown role", () => {
    const result = validateEmployeeInput({ ...base, role: "boss" });
    expect(result).toEqual({ ok: false, error: "Role tidak valid." });
  });

  it("rejects a negative or non-numeric gaji pokok", () => {
    expect(validateEmployeeInput({ ...base, gajiPokok: "-1" })).toEqual({ ok: false, error: "Gaji pokok harus angka >= 0." });
    expect(validateEmployeeInput({ ...base, gajiPokok: "abc" })).toEqual({ ok: false, error: "Gaji pokok harus angka >= 0." });
  });

  it("requires designatedApproverId for hr_admin and super_admin", () => {
    const result = validateEmployeeInput({ ...base, role: "hr_admin", designatedApproverId: "" });
    expect(result).toEqual({ ok: false, error: "Approver pengganti wajib untuk role HR Admin / Super Admin." });
  });

  it("accepts hr_admin when a designatedApproverId is present", () => {
    const result = validateEmployeeInput({
      ...base, role: "hr_admin", designatedApproverId: "22222222-2222-2222-2222-222222222222",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-ISO tanggalMulaiKerja", () => {
    const result = validateEmployeeInput({ ...base, tanggalMulaiKerja: "01/02/2026" });
    expect(result).toEqual({ ok: false, error: "Tanggal mulai kerja harus format YYYY-MM-DD." });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- employee-form.test.ts
```

Expected: FAIL — `Cannot find module './employee-form'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/employees/employee-form.ts
import type { Role } from "@/lib/auth/route-access";

export type EmployeeFormInput = {
  nama: string;
  email: string;
  jabatan: string;
  statusKontrak: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: Role;
  branchId: string;
  departmentId: string | null;
  atasanId: string | null;
  designatedApproverId: string | null;
};

const ROLES: Role[] = ["karyawan", "atasan", "hr_admin", "super_admin"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

export function validateEmployeeInput(
  raw: Record<string, FormDataEntryValue | null>,
): { ok: true; value: EmployeeFormInput } | { ok: false; error: string } {
  const nama = str(raw.nama);
  const email = str(raw.email);
  const jabatan = str(raw.jabatan);
  const statusKontrak = str(raw.statusKontrak);
  const tanggalMulaiKerja = str(raw.tanggalMulaiKerja);
  const branchId = str(raw.branchId);
  const role = str(raw.role);
  const designatedApproverId = orNull(raw.designatedApproverId);

  if (!nama || !email || !jabatan || !tanggalMulaiKerja || !branchId) {
    return { ok: false, error: "Nama, email, jabatan, tanggal mulai kerja, dan cabang wajib diisi." };
  }
  if (!EMAIL.test(email)) {
    return { ok: false, error: "Format email tidak valid." };
  }
  if (!ISO_DATE.test(tanggalMulaiKerja)) {
    return { ok: false, error: "Tanggal mulai kerja harus format YYYY-MM-DD." };
  }
  if (!ROLES.includes(role as Role)) {
    return { ok: false, error: "Role tidak valid." };
  }
  const gajiPokok = Number(str(raw.gajiPokok) || "0");
  if (!Number.isFinite(gajiPokok) || gajiPokok < 0) {
    return { ok: false, error: "Gaji pokok harus angka >= 0." };
  }
  if ((role === "hr_admin" || role === "super_admin") && !designatedApproverId) {
    return { ok: false, error: "Approver pengganti wajib untuk role HR Admin / Super Admin." };
  }

  return {
    ok: true,
    value: {
      nama, email, jabatan, statusKontrak: statusKontrak || "tetap",
      tanggalMulaiKerja, gajiPokok, role: role as Role, branchId,
      departmentId: orNull(raw.departmentId),
      atasanId: orNull(raw.atasanId),
      designatedApproverId,
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- employee-form.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/employees/employee-form.ts src/lib/employees/employee-form.test.ts
git commit -m "feat: employee form validation (shared by create + edit)"
```

---

## Task 5: `inviteEmployee` rework — generateLink + setPasswordUrl

**Files:**
- Modify: `src/lib/employees/invite.ts` (rewrite the body)
- Modify: `src/lib/employees/invite.test.ts` (adjust to the new return shape + mock `auth.admin.generateLink`)
- Create: `tests/integration/invite-employee.test.ts`
- Modify: `.env.local` (add `NEXT_PUBLIC_APP_URL` if absent) — and document the Supabase redirect-URL allowlist step

**Interfaces:**
- Consumes: `EmployeeFormInput` shape (Task 4) — `inviteEmployee` takes the pre-validated fields.
- Produces: `type InviteEmployeeResult = { ok: true; employeeId: string; setPasswordUrl: string } | { ok: false; error: string }`.
- Produces: `inviteEmployee(input: InviteEmployeeInput, db: SupabaseClient): Promise<InviteEmployeeResult>` — `db` MUST be a service-role client.
- Consumed by: Task 11 (`createEmployee` server action).

- [ ] **Step 1: Determine the real generateLink behavior**

```bash
node -e "const s=require('@supabase/supabase-js/package.json'); console.log(s.version)"
grep -rn "generateLink" node_modules/@supabase/supabase-js/dist/main/lib/*.d.ts node_modules/@supabase/gotrue-js/dist/main/**/*.d.ts 2>/dev/null | head
```

Confirm whether `generateLink({ type: "invite", email })` creates the auth user (it does in `@supabase/supabase-js` v2 for `type: "invite"` when the user doesn't exist) and what `data.properties.action_link` looks like. If `type: "invite"` errors for any reason, use the fallback: `auth.admin.createUser({ email, email_confirm: true })` then `auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } })`. Record which path you took in the report.

- [ ] **Step 2: Write the failing unit test**

```typescript
// src/lib/employees/invite.test.ts  (replace the file)
import { describe, it, expect, vi } from "vitest";
import { inviteEmployee } from "./invite";

const APP_URL = "https://app.example.test";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const baseInput = {
  nama: "Sari",
  email: "sari@contoh.co.id",
  jabatan: "Staff",
  statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-02-01",
  gajiPokok: 8_000_000,
  role: "karyawan" as const,
  branchId: "11111111-1111-1111-1111-111111111111",
  departmentId: null,
  atasanId: null,
  designatedApproverId: null,
};

function makeDb(opts: { linkError?: string; insertError?: string; deleteError?: string } = {}) {
  const generateLink = vi.fn(async () =>
    opts.linkError
      ? { data: { user: null, properties: null }, error: { message: opts.linkError } }
      : {
          data: {
            user: { id: "auth-user-1" },
            properties: { action_link: `${APP_URL}/set-password#access_token=xyz` },
          },
          error: null,
        },
  );
  const deleteUser = vi.fn(async () =>
    opts.deleteError ? { data: null, error: { message: opts.deleteError } } : { data: {}, error: null },
  );
  const single = vi.fn(async () =>
    opts.insertError
      ? { data: null, error: { message: opts.insertError } }
      : { data: { id: "auth-user-1" }, error: null },
  );
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  return {
    _generateLink: generateLink,
    _deleteUser: deleteUser,
    _insert: insert,
    auth: { admin: { generateLink, deleteUser } },
    from: vi.fn(() => ({ insert })),
  };
}

describe("inviteEmployee", () => {
  it("creates the auth user + employees row and returns a set-password link", async () => {
    const db = makeDb();
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({
      ok: true,
      employeeId: "auth-user-1",
      setPasswordUrl: `${APP_URL}/set-password#access_token=xyz`,
    });
    expect(db._generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invite", email: "sari@contoh.co.id" }),
    );
    expect(db._insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "auth-user-1", email: "sari@contoh.co.id", role: "karyawan" }),
    );
  });

  it("rejects hr_admin without a designated approver before touching auth", async () => {
    const db = makeDb();
    const result = await inviteEmployee({ ...baseInput, role: "hr_admin" }, db as any);
    expect(result).toEqual({ ok: false, error: "designatedApproverId is required for hr_admin and super_admin roles" });
    expect(db._generateLink).not.toHaveBeenCalled();
  });

  it("returns a fixed error and does not insert when generateLink fails", async () => {
    const db = makeDb({ linkError: "boom" });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "Gagal membuat akun karyawan." });
    expect(db._insert).not.toHaveBeenCalled();
  });

  it("rolls back the auth user when the employees insert fails", async () => {
    const db = makeDb({ insertError: "duplicate key" });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "Gagal menyimpan data karyawan." });
    expect(db._deleteUser).toHaveBeenCalledWith("auth-user-1");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test -- invite.test.ts
```

Expected: FAIL — new return shape / `generateLink` not called.

- [ ] **Step 4: Rewrite `invite.ts`**

```typescript
// src/lib/employees/invite.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/route-access";

export type InviteEmployeeInput = {
  nama: string;
  email: string;
  jabatan: string;
  statusKontrak: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: Role;
  branchId: string;
  departmentId: string | null;
  atasanId: string | null;
  designatedApproverId: string | null;
};

export type InviteEmployeeResult =
  | { ok: true; employeeId: string; setPasswordUrl: string }
  | { ok: false; error: string };

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function inviteEmployee(
  input: InviteEmployeeInput,
  db: SupabaseClient, // service-role
): Promise<InviteEmployeeResult> {
  if (
    (input.role === "hr_admin" || input.role === "super_admin") &&
    !input.designatedApproverId
  ) {
    return { ok: false, error: "designatedApproverId is required for hr_admin and super_admin roles" };
  }

  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { redirectTo: `${appUrl()}/set-password` },
  });
  const authUserId = linkData?.user?.id;
  const actionLink = linkData?.properties?.action_link;
  if (linkErr || !authUserId || !actionLink) {
    console.error("inviteEmployee: generateLink failed", linkErr);
    return { ok: false, error: "Gagal membuat akun karyawan." };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .insert({
      id: authUserId,
      nama: input.nama,
      email: input.email,
      branch_id: input.branchId,
      department_id: input.departmentId,
      atasan_id: input.atasanId,
      designated_approver_id: input.designatedApproverId,
      jabatan: input.jabatan,
      status_kontrak: input.statusKontrak,
      tanggal_mulai_kerja: input.tanggalMulaiKerja,
      gaji_pokok: input.gajiPokok,
      role: input.role,
    })
    .select()
    .single();

  if (employeeErr || !employee) {
    console.error("inviteEmployee: employees insert failed", employeeErr);
    const { error: delErr } = await db.auth.admin.deleteUser(authUserId);
    if (delErr) {
      console.error(
        `inviteEmployee: failed to roll back auth user ${authUserId} after employees insert failed:`,
        delErr.message,
      );
    }
    return { ok: false, error: "Gagal menyimpan data karyawan." };
  }

  return { ok: true, employeeId: employee.id, setPasswordUrl: actionLink };
}
```

- [ ] **Step 5: Run the unit test**

```bash
npm test -- invite.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Write the integration test**

```typescript
// tests/integration/invite-employee.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { inviteEmployee } from "../../src/lib/employees/invite";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const suffix = Date.now();

describe("inviteEmployee (live)", () => {
  let branchId: string;
  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches").insert({ nama: `Cabang Invite ${suffix}`, lat: -6.2, long: 106.8 })
      .select().single();
    branchId = branch!.id;
    process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  });

  it("creates an auth user + employees row and returns a usable link", async () => {
    const db = createServiceRoleSupabaseClient();
    const result = await inviteEmployee({
      nama: "Invite Test", email: `invite.${suffix}@test.local`, jabatan: "Staff",
      statusKontrak: "tetap", tanggalMulaiKerja: "2026-02-01", gajiPokok: 8_000_000,
      role: "karyawan", branchId, departmentId: null, atasanId: null, designatedApproverId: null,
    }, db);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.setPasswordUrl).toContain("set-password");

    const { data: emp } = await db.from("employees").select("id, email").eq("id", result.employeeId).single();
    expect(emp!.email).toBe(`invite.${suffix}@test.local`);
    const { data: authUser } = await db.auth.admin.getUserById(result.employeeId);
    expect(authUser.user?.email).toBe(`invite.${suffix}@test.local`);
  });

  it("rolls back the auth user when the employees insert fails (duplicate email)", async () => {
    const db = createServiceRoleSupabaseClient();
    const email = `invite.dup.${suffix}@test.local`;
    const first = await inviteEmployee({
      nama: "Dup A", email, jabatan: "Staff", statusKontrak: "tetap",
      tanggalMulaiKerja: "2026-02-01", gajiPokok: 0, role: "karyawan",
      branchId, departmentId: null, atasanId: null, designatedApproverId: null,
    }, db);
    expect(first.ok).toBe(true);

    // Second invite with the same email -> employees.email UNIQUE violation -> rollback.
    const second = await inviteEmployee({
      nama: "Dup B", email, jabatan: "Staff", statusKontrak: "tetap",
      tanggalMulaiKerja: "2026-02-01", gajiPokok: 0, role: "karyawan",
      branchId, departmentId: null, atasanId: null, designatedApproverId: null,
    }, db);
    expect(second).toEqual({ ok: false, error: "Gagal menyimpan data karyawan." });
  });
});
```

- [ ] **Step 7: Run the integration test**

```bash
npm run test:integration -- invite-employee.test.ts
```

Expected: PASS (2 tests). If `generateLink type:"invite"` rejected a re-used email in a way that skips the rollback path, adjust the second test to trigger the insert failure differently (e.g. a bad `branch_id`) and note it.

- [ ] **Step 8: Add the env var + document the manual step**

Add to `.env.local` (if not present): `NEXT_PUBLIC_APP_URL=http://localhost:3000`. In the report, note: **Supabase dashboard → Authentication → URL Configuration → Redirect URLs must include `<APP_URL>/set-password`** or the invite link will not redirect back.

- [ ] **Step 9: Commit**

```bash
git add src/lib/employees/invite.ts src/lib/employees/invite.test.ts tests/integration/invite-employee.test.ts .env.local
git commit -m "feat: invite employees via generateLink, return set-password link"
```

---

## Task 6: Reject deactivated employees at the session boundary

**Files:**
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/session.test.ts` (add a case — file exists from Foundation) OR create it if absent
- Modify: `src/proxy.ts`
- Modify: `src/app/(auth)/login/actions.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getCurrentEmployee` returns `null` when the employee's `status !== 'aktif'`.
- Produces: `src/proxy.ts` redirects a signed-in-but-deactivated user to `/login?reason=nonaktif`.
- Produces: `login` action signs a deactivated user back out and redirects to `/login?reason=nonaktif`.

- [ ] **Step 1: Write / update the failing test**

`src/lib/auth/session.test.ts` already has a `makeMockDb(session, employee)` helper. Add a new `describe` block using it (the existing "returns the employee record" tests pass an `employee` object without `status` — add `status: "aktif"` to those objects too so they still pass after the gate is added):

```typescript
describe("getCurrentEmployee — deactivated employees", () => {
  it("returns null when the employee status is nonaktif", async () => {
    const db = makeMockDb(
      { id: "u1" },
      { id: "u1", nama: "X", email: "x@y.z", role: "karyawan", branch_id: "b1", status: "nonaktif" },
    );
    expect(await getCurrentEmployee(db as any)).toBeNull();
  });

  it("returns the employee when status is aktif", async () => {
    const db = makeMockDb(
      { id: "u1" },
      { id: "u1", nama: "X", email: "x@y.z", role: "karyawan", branch_id: "b1", status: "aktif" },
    );
    expect((await getCurrentEmployee(db as any))?.id).toBe("u1");
  });
});
```

Also update the pre-existing "returns the employee record for the authenticated user" test's `employee` object to include `status: "aktif"`.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- session.test.ts
```

Expected: FAIL — nonaktif employee is currently returned.

- [ ] **Step 3: Update `session.ts`**

```typescript
// src/lib/auth/session.ts  — the select gains `status`, and a status gate is added.
// Keep the CurrentEmployee type as-is (a non-null return always means an active employee).
export async function getCurrentEmployee(
  db: SupabaseClient,
): Promise<CurrentEmployee | null> {
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return null;

  const { data: employee } = await db
    .from("employees")
    .select("id, nama, email, role, branch_id, status")
    .eq("id", userData.user.id)
    .single();
  if (!employee || employee.status !== "aktif") return null;

  return {
    id: employee.id,
    nama: employee.nama,
    email: employee.email,
    role: employee.role,
    branchId: employee.branch_id,
  };
}
```

- [ ] **Step 4: Update `proxy.ts`**

In `src/proxy.ts`, change the employee lookup to also select `status`, and short-circuit before `resolveRouteAccess`:

```typescript
  let role: Role | null = null;
  if (userData.user) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role, status")
      .eq("id", userData.user.id)
      .single();
    if (employee && employee.status !== "aktif") {
      // Signed in but deactivated -> bounce to login with a reason, unless already there.
      if (!request.nextUrl.pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/login?reason=nonaktif", request.url));
      }
    }
    role = employee && employee.status === "aktif" ? employee.role : null;
  }
```

- [ ] **Step 5: Update the login action + login page message**

`src/app/(auth)/login/actions.ts` — after `signInWithPassword` succeeds, before `getCurrentEmployee`:

```typescript
  const { data: userData } = await db.auth.getUser();
  if (userData.user) {
    const { data: emp } = await db
      .from("employees").select("status").eq("id", userData.user.id).maybeSingle();
    if (emp && emp.status !== "aktif") {
      await db.auth.signOut();
      redirect("/login?reason=nonaktif");
    }
  }
```

Also map the raw sign-in error instead of reflecting it (small hardening while this file is open):

```typescript
  if (error) {
    console.error("login: signInWithPassword failed", error);
    redirect("/login?error=Email%20atau%20kata%20sandi%20salah.");
  }
```

`src/app/(auth)/login/page.tsx` — extend `searchParams` to `{ error?: string; reason?: string }` and render, above the form:

```tsx
        {reason === "nonaktif" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Akun Anda nonaktif. Hubungi HR untuk mengaktifkan kembali.
          </p>
        )}
```

- [ ] **Step 6: Run unit tests + build**

```bash
npm test -- session.test.ts && npm run build
```

Expected: session tests pass; build compiles.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts src/proxy.ts "src/app/(auth)/login/actions.ts" "src/app/(auth)/login/page.tsx"
git commit -m "feat: reject deactivated employees at session + proxy + login"
```

---

## Task 7: `/set-password` page

**Files:**
- Create: `src/app/(auth)/set-password/page.tsx`
- Create: `src/app/(auth)/set-password/set-password-form.tsx`
- Create: `src/app/(auth)/set-password/set-password-form.test.tsx`

**Interfaces:**
- Consumes: `@supabase/ssr` browser client (`createBrowserClient`) — check `src/lib/supabase/` for an existing browser-client factory; if none, create `src/lib/supabase/client.ts` with `createBrowserSupabaseClient()` mirroring the server factory.
- Produces: a public route that establishes a session from an invite/recovery token and sets the password.

- [ ] **Step 1: Write the failing form test**

```typescript
// src/app/(auth)/set-password/set-password-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetPasswordForm } from "./set-password-form";

describe("SetPasswordForm", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText(/minimal 8 karakter/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation", async () => {
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "password2" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText(/tidak cocok/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with a valid matching password", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("password1"));
  });

  it("shows the error from a failed onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: "Token kedaluwarsa." });
    render(<SetPasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/kata sandi baru/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText(/konfirmasi/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText("Token kedaluwarsa.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- set-password-form.test.tsx
```

Expected: FAIL — `Cannot find module './set-password-form'`.

- [ ] **Step 3: Write the form component**

```tsx
// src/app/(auth)/set-password/set-password-form.tsx
"use client";

import { useState } from "react";

type SubmitResult = { ok: true } | { ok: false; error: string };

export function SetPasswordForm({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<SubmitResult>;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (pw !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(pw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } catch (err) {
      console.error("set-password submit failed", err);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="text-sm text-green-600">Kata sandi tersimpan. Mengalihkan…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="pw" className="text-sm font-medium text-neutral-700">Kata Sandi Baru</label>
        <input
          id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-neutral-700">Konfirmasi Kata Sandi</label>
        <input
          id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        Simpan
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- set-password-form.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Write the browser client factory (if missing) and the page**

If `src/lib/supabase/client.ts` does not exist, create it:

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

```tsx
// src/app/(auth)/set-password/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    async function establish() {
      // Implicit flow: tokens in the URL hash. PKCE flow: ?code= in the query.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      const code = search.get("code");
      try {
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Maybe a session already exists (link opened twice).
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error("no token");
        }
        setReady(true);
      } catch {
        setFatal("Link ini tidak valid atau sudah kedaluwarsa. Minta link baru ke HR.");
      }
    }
    establish();
  }, []);

  async function onSubmit(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      console.error("set-password: updateUser failed", error);
      return { ok: false, error: "Gagal menyimpan kata sandi. Coba minta link baru ke HR." };
    }
    setTimeout(() => router.replace("/absen"), 800);
    return { ok: true };
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">Buat Kata Sandi</h1>
        <p className="mb-6 text-sm text-neutral-500">Tetapkan kata sandi untuk akun Anda.</p>
        {fatal ? (
          <p className="text-sm text-red-600">{fatal}</p>
        ) : ready ? (
          <SetPasswordForm onSubmit={onSubmit} />
        ) : (
          <p className="text-sm text-neutral-500">Memeriksa link…</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Confirm `/set-password` is a public route**

`src/lib/auth/route-access.ts` — `PUBLIC_PATHS` currently `["/login"]`. Add `"/set-password"`:

```typescript
const PUBLIC_PATHS = ["/login", "/set-password"];
```

Add a `route-access.test.ts` case: `resolveRouteAccess("/set-password", null)` → `"allow"`.

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: compiles, `/set-password` listed.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(auth)/set-password" src/lib/supabase/client.ts src/lib/auth/route-access.ts src/lib/auth/route-access.test.ts
git commit -m "feat: /set-password page (token exchange + updateUser)"
```

---

## Task 8: Gate `/karyawan` to hr_admin

**Files:**
- Modify: `src/lib/auth/route-access.ts`
- Modify: `src/lib/auth/route-access.test.ts`
- Modify: `src/components/admin-shell.tsx`

**Interfaces:**
- Consumes: `HR_ADMIN_PATH_PREFIXES` + `redirect-admin-home` (added in Plan 4 Task 10).
- Produces: `/karyawan` restricted to `hr_admin`/`super_admin`; the nav item hidden for `atasan`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/route-access.test.ts — add
import { describe, it, expect } from "vitest";
import { resolveRouteAccess } from "./route-access";

describe("resolveRouteAccess — /karyawan is hr-admin only", () => {
  it("allows hr_admin and super_admin", () => {
    expect(resolveRouteAccess("/karyawan", "hr_admin")).toBe("allow");
    expect(resolveRouteAccess("/karyawan/abc", "super_admin")).toBe("allow");
  });
  it("redirects an atasan to the admin home", () => {
    expect(resolveRouteAccess("/karyawan", "atasan")).toBe("redirect-admin-home");
  });
  it("redirects a karyawan to the employee home", () => {
    expect(resolveRouteAccess("/karyawan", "karyawan")).toBe("redirect-employee-home");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- route-access.test.ts
```

Expected: FAIL — `/karyawan` + atasan returns `"allow"`.

- [ ] **Step 3: Add `/karyawan` to the hr-admin prefix list**

`src/lib/auth/route-access.ts`:

```typescript
const HR_ADMIN_PATH_PREFIXES = ["/payroll", "/karyawan"];
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- route-access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Mark the nav item hr-admin-only**

`src/components/admin-shell.tsx` — the `/karyawan` NAV_ITEM gains `hrAdminOnly: true` (the filter added in Plan 4 already excludes such items for non-hr-admins). Confirm the filter predicate covers it.

- [ ] **Step 6: Build + full suite**

```bash
npm run build && npm test
```

Expected: build compiles; unit suite green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/route-access.ts src/lib/auth/route-access.test.ts src/components/admin-shell.tsx
git commit -m "feat(karyawan): restrict /karyawan to hr_admin (route-access + nav)"
```

---

## Task 9: `/karyawan` list page

**Files:**
- Create: `src/app/(admin)/karyawan/page.tsx`
- Create: `src/app/(admin)/karyawan/employee-filters.tsx`
- Create: `src/app/(admin)/karyawan/employee-filters.test.tsx`
- Create: `src/components/role-badge.tsx`
- Create: `src/components/role-badge.test.tsx`

**Interfaces:**
- Consumes: `getCurrentEmployee` / `createServerSupabaseClient` (Foundation), `formatRupiah` not needed here.
- Produces: `<RoleBadge role={Role} />` — icon + color + Indonesian label.
- Produces: `<EmployeeFilters branches={{id,nama}[]} defaults={{ cabang?: string; role?: string; status: string; q: string }} />` — a client form that pushes filter state into the URL query (`useRouter().push`).
- Consumed by: Task 11 (`/karyawan/[id]` links back here), Task 12 (RoleBadge reused if useful).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/components/role-badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleBadge } from "./role-badge";

describe("RoleBadge", () => {
  it("renders an Indonesian label per role", () => {
    render(<RoleBadge role="karyawan" />);
    expect(screen.getByText("Karyawan")).toBeInTheDocument();
  });
  it("labels hr_admin and super_admin", () => {
    const { rerender } = render(<RoleBadge role="hr_admin" />);
    expect(screen.getByText("HR Admin")).toBeInTheDocument();
    rerender(<RoleBadge role="super_admin" />);
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });
  it("gives distinct classes to karyawan vs super_admin", () => {
    const { container: a } = render(<RoleBadge role="karyawan" />);
    const { container: b } = render(<RoleBadge role="super_admin" />);
    expect((a.firstChild as HTMLElement).className).not.toBe((b.firstChild as HTMLElement).className);
  });
});
```

```typescript
// src/app/(admin)/karyawan/employee-filters.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }));

import { EmployeeFilters } from "./employee-filters";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("EmployeeFilters", () => {
  it("pushes a query string when the status filter changes", () => {
    push.mockClear();
    render(<EmployeeFilters branches={BRANCHES} defaults={{ status: "aktif", q: "" }} />);
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "nonaktif" } });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("status=nonaktif"));
  });

  it("pushes the search text on submit", () => {
    push.mockClear();
    render(<EmployeeFilters branches={BRANCHES} defaults={{ status: "aktif", q: "" }} />);
    fireEvent.change(screen.getByLabelText(/cari nama/i), { target: { value: "budi" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("q=budi"));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- role-badge.test.tsx employee-filters.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write `role-badge.tsx`**

```tsx
// src/components/role-badge.tsx
import type { Role } from "@/lib/auth/route-access";

const CONFIG: Record<Role, { label: string; bg: string; fg: string }> = {
  karyawan: { label: "Karyawan", bg: "bg-neutral-100", fg: "text-neutral-700" },
  atasan: { label: "Atasan", bg: "bg-blue-50", fg: "text-blue-700" },
  hr_admin: { label: "HR Admin", bg: "bg-violet-50", fg: "text-violet-700" },
  super_admin: { label: "Super Admin", bg: "bg-amber-50", fg: "text-amber-700" },
};

export function RoleBadge({ role }: { role: Role }) {
  const c = CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium ${c.bg} ${c.fg}`}>
      <svg role="img" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c1.4-3.5 3.8-5.2 7.5-5.2s6.1 1.7 7.5 5.2" strokeLinecap="round" />
      </svg>
      <span>{c.label}</span>
    </span>
  );
}
```

- [ ] **Step 4: Write `employee-filters.tsx`**

```tsx
// src/app/(admin)/karyawan/employee-filters.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/auth/route-access";

type Defaults = { cabang?: string; role?: string; status: string; q: string };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Semua role" },
  { value: "karyawan", label: "Karyawan" },
  { value: "atasan", label: "Atasan" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export function EmployeeFilters({
  branches,
  defaults,
}: {
  branches: { id: string; nama: string }[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaults.q);

  function pushWith(overrides: Partial<Defaults & { q: string }>) {
    const next = { cabang: defaults.cabang ?? "", role: defaults.role ?? "", status: defaults.status, q, ...overrides };
    const params = new URLSearchParams();
    if (next.cabang) params.set("cabang", next.cabang);
    if (next.role) params.set("role", next.role);
    if (next.status) params.set("status", next.status);
    if (next.q) params.set("q", next.q);
    router.push(`/karyawan?${params.toString()}`);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); pushWith({ q }); }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-sm text-neutral-700">Cari nama</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="cabang" className="text-sm text-neutral-700">Cabang</label>
        <select id="cabang" defaultValue={defaults.cabang ?? ""} onChange={(e) => pushWith({ cabang: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Semua cabang</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="role" className="text-sm text-neutral-700">Role</label>
        <select id="role" defaultValue={defaults.role ?? ""} onChange={(e) => pushWith({ role: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm text-neutral-700">Status</label>
        <select id="status" defaultValue={defaults.status} onChange={(e) => pushWith({ status: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
          <option value="">Semua</option>
        </select>
      </div>
      <button type="submit" className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white">Cari</button>
    </form>
  );
}
```

- [ ] **Step 5: Run to verify the tests pass**

```bash
npm test -- role-badge.test.tsx employee-filters.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Write the page**

```tsx
// src/app/(admin)/karyawan/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { RoleBadge } from "@/components/role-badge";
import type { Role } from "@/lib/auth/route-access";
import { EmployeeFilters } from "./employee-filters";

export default async function KaryawanPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string; role?: string; status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const status = sp.status ?? "aktif";

  const { data: branches } = await db.from("branches").select("id, nama").order("nama");

  let query = db
    .from("employees")
    .select("id, nama, jabatan, role, status, branches(nama)")
    .order("nama");
  if (sp.cabang) query = query.eq("branch_id", sp.cabang);
  if (sp.role) query = query.eq("role", sp.role);
  if (status) query = query.eq("status", status);
  if (sp.q) query = query.ilike("nama", `%${sp.q}%`);

  const { data: rows, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Karyawan</h1>
          <p className="mt-1 text-sm text-neutral-500">Kelola data karyawan dan onboarding.</p>
        </div>
        <Link href="/karyawan/baru" className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Tambah Karyawan
        </Link>
      </div>

      <EmployeeFilters
        branches={branches ?? []}
        defaults={{ cabang: sp.cabang, role: sp.role, status, q: sp.q ?? "" }}
      />

      {error && <p className="text-sm text-red-600">Gagal memuat daftar karyawan.</p>}
      {!error && (!rows || rows.length === 0) && (
        <p className="text-sm text-neutral-500">Tidak ada karyawan yang cocok dengan filter.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Jabatan</th>
                <th className="px-4 py-2 font-medium">Cabang</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link href={`/karyawan/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.nama}</Link>
                  </td>
                  <td className="px-4 py-2">{r.jabatan}</td>
                  <td className="px-4 py-2">{(r.branches as unknown as { nama: string } | null)?.nama ?? "-"}</td>
                  <td className="px-4 py-2"><RoleBadge role={r.role as Role} /></td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${r.status === "aktif" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                      {r.status === "aktif" ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: compiles, `/karyawan` listed.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(admin)/karyawan/page.tsx" "src/app/(admin)/karyawan/employee-filters.tsx" "src/app/(admin)/karyawan/employee-filters.test.tsx" src/components/role-badge.tsx src/components/role-badge.test.tsx
git commit -m "feat(karyawan): employee list with branch/role/status filters"
```

---

## Task 10: Shared employee form component

**Files:**
- Create: `src/app/(admin)/karyawan/employee-form-fields.tsx`
- Create: `src/app/(admin)/karyawan/employee-form-fields.test.tsx`

**Interfaces:**
- Consumes: `Role` type.
- Produces: `<EmployeeFormFields branches={{id,nama}[]} departments={{id,nama}[]} approverOptions={{id,nama}[]} defaults?: Partial<EmployeeFieldValues> />` — renders labelled inputs whose `name` attributes match `validateEmployeeInput`'s keys (`nama`, `email`, `jabatan`, `statusKontrak`, `tanggalMulaiKerja`, `gajiPokok`, `role`, `branchId`, `departmentId`, `atasanId`, `designatedApproverId`).
- Consumed by: Task 11 (`/karyawan/baru`), Task 11 (`/karyawan/[id]` edit).

**Note:** no read-only/disabled-field mode — `/karyawan` is hr_admin-only (Task 8), so only users allowed to change every field ever see this form. The `prevent_protected_employee_field_change` trigger (Task 1) is the enforcement layer; the form does not need to replicate it.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/(admin)/karyawan/employee-form-fields.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeFormFields } from "./employee-form-fields";

const props = {
  branches: [{ id: "b1", nama: "Kantor Pusat" }],
  departments: [{ id: "d1", nama: "Operasional" }],
  approverOptions: [{ id: "a1", nama: "Super Admin" }],
};

describe("EmployeeFormFields", () => {
  it("renders every field validateEmployeeInput expects", () => {
    render(<EmployeeFormFields {...props} />);
    for (const label of [/nama/i, /email/i, /jabatan/i, /status kontrak/i, /tanggal mulai kerja/i, /gaji pokok/i, /^role/i, /cabang/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("prefills from defaults", () => {
    render(<EmployeeFormFields {...props} defaults={{ nama: "Budi", gajiPokok: "8000000", branchId: "b1" }} />);
    expect(screen.getByLabelText(/nama/i)).toHaveValue("Budi");
    expect(screen.getByLabelText(/gaji pokok/i)).toHaveValue(8000000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- employee-form-fields.test.tsx
```

Expected: FAIL — `Cannot find module './employee-form-fields'`.

- [ ] **Step 3: Write the component**

```tsx
// src/app/(admin)/karyawan/employee-form-fields.tsx
"use client";

export type EmployeeFieldValues = {
  nama: string; email: string; jabatan: string; statusKontrak: string;
  tanggalMulaiKerja: string; gajiPokok: string; role: string;
  branchId: string; departmentId: string; atasanId: string; designatedApproverId: string;
};

const ROLE_OPTIONS = [
  { value: "karyawan", label: "Karyawan" },
  { value: "atasan", label: "Atasan" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

const inputCls = "w-full rounded border border-neutral-300 px-3 py-2 text-base";

export function EmployeeFormFields({
  branches,
  departments,
  approverOptions,
  defaults = {},
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  defaults?: Partial<EmployeeFieldValues>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Nama
        <input name="nama" defaultValue={defaults.nama} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Email
        <input name="email" type="email" defaultValue={defaults.email} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Jabatan
        <input name="jabatan" defaultValue={defaults.jabatan} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Status Kontrak
        <input name="statusKontrak" defaultValue={defaults.statusKontrak ?? "tetap"} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Tanggal Mulai Kerja
        <input name="tanggalMulaiKerja" type="date" defaultValue={defaults.tanggalMulaiKerja} required className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Gaji Pokok
        <input name="gajiPokok" type="number" min="0" defaultValue={defaults.gajiPokok ?? "0"} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Role
        <select name="role" defaultValue={defaults.role ?? "karyawan"} className={inputCls}>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Cabang
        <select name="branchId" defaultValue={defaults.branchId ?? ""} required className={inputCls}>
          <option value="">Pilih cabang</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Departemen (opsional)
        <select name="departmentId" defaultValue={defaults.departmentId ?? ""} className={inputCls}>
          <option value="">—</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Atasan (opsional)
        <select name="atasanId" defaultValue={defaults.atasanId ?? ""} className={inputCls}>
          <option value="">—</option>
          {approverOptions.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Approver Pengganti (wajib utk HR/Super Admin)
        <select name="designatedApproverId" defaultValue={defaults.designatedApproverId ?? ""} className={inputCls}>
          <option value="">—</option>
          {approverOptions.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- employee-form-fields.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/karyawan/employee-form-fields.tsx" "src/app/(admin)/karyawan/employee-form-fields.test.tsx"
git commit -m "feat(karyawan): shared employee form fields (create + edit)"
```

---

## Task 11: `/karyawan/baru` create + `/karyawan/[id]` edit/deactivate

**Files:**
- Create: `src/app/(admin)/karyawan/actions.ts`
- Create: `src/app/(admin)/karyawan/actions.test.ts`
- Create: `src/app/(admin)/karyawan/baru/page.tsx`
- Create: `src/app/(admin)/karyawan/baru/create-employee-form.tsx`
- Create: `src/app/(admin)/karyawan/[id]/page.tsx`
- Create: `src/app/(admin)/karyawan/[id]/edit-employee-form.tsx`

**Interfaces:**
- Consumes: `validateEmployeeInput` (Task 4), `inviteEmployee` (Task 5), `EmployeeFormFields` (Task 10), `RoleBadge` (Task 9).
- Produces: `createEmployee(formData: FormData): Promise<{ ok: true; setPasswordUrl: string } | { ok: false; error: string }>`.
- Produces: `updateEmployee(id: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`.
- Produces: `setEmployeeStatus(id: string, status: "aktif" | "nonaktif"): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing action test**

```typescript
// src/app/(admin)/karyawan/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const from = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: "actor-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from, auth: { getUser } })),
  createServiceRoleSupabaseClient: vi.fn(() => ({ _service: true })),
}));
const inviteEmployee = vi.fn();
vi.mock("@/lib/employees/invite", () => ({ inviteEmployee: (...a: unknown[]) => inviteEmployee(...a) }));

import { createEmployee, updateEmployee, setEmployeeStatus } from "./actions";

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}
const validForm = {
  nama: "Budi", email: "budi@x.co", jabatan: "Staff", statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-02-01", gajiPokok: "8000000", role: "karyawan",
  branchId: "11111111-1111-1111-1111-111111111111", departmentId: "", atasanId: "", designatedApproverId: "",
};

beforeEach(() => { from.mockReset(); inviteEmployee.mockReset(); getUser.mockClear(); });

describe("createEmployee", () => {
  it("validates, invites with a service-role client, and returns the link", async () => {
    inviteEmployee.mockResolvedValue({ ok: true, employeeId: "e1", setPasswordUrl: "https://app/set-password#x" });
    const result = await createEmployee(fd(validForm));
    expect(result).toEqual({ ok: true, setPasswordUrl: "https://app/set-password#x" });
    expect(inviteEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ nama: "Budi", role: "karyawan", gajiPokok: 8_000_000 }),
      expect.objectContaining({ _service: true }),
    );
  });

  it("returns the validation error without inviting", async () => {
    const result = await createEmployee(fd({ ...validForm, email: "nope" }));
    expect(result).toEqual({ ok: false, error: "Format email tidak valid." });
    expect(inviteEmployee).not.toHaveBeenCalled();
  });

  it("maps an invite failure to a fixed message", async () => {
    inviteEmployee.mockResolvedValue({ ok: false, error: "Gagal menyimpan data karyawan." });
    const result = await createEmployee(fd(validForm));
    expect(result).toEqual({ ok: false, error: "Gagal menyimpan data karyawan." });
  });
});

describe("updateEmployee", () => {
  it("maps the protected-field trigger error", async () => {
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: { message: "not allowed to change protected employee fields" } }) }) });
    const result = await updateEmployee("e1", fd(validForm));
    expect(result).toEqual({ ok: false, error: "Anda tidak berhak mengubah data terproteksi karyawan." });
  });

  it("succeeds on a clean update", async () => {
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) });
    const result = await updateEmployee("e1", fd(validForm));
    expect(result).toEqual({ ok: true });
  });
});

describe("setEmployeeStatus", () => {
  it("refuses to deactivate yourself", async () => {
    const result = await setEmployeeStatus("actor-1", "nonaktif");
    expect(result).toEqual({ ok: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." });
  });

  it("updates status for another employee", async () => {
    from.mockReturnValue({ update: () => ({ eq: async () => ({ error: null }) }) });
    const result = await setEmployeeStatus("e2", "nonaktif");
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- "karyawan/actions.test.ts"
```

Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Write `actions.ts`**

```typescript
// src/app/(admin)/karyawan/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { validateEmployeeInput } from "@/lib/employees/employee-form";
import { inviteEmployee } from "@/lib/employees/invite";

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };

function formRecord(formData: FormData): Record<string, FormDataEntryValue | null> {
  const rec: Record<string, FormDataEntryValue | null> = {};
  for (const [k, v] of formData.entries()) rec[k] = v;
  return rec;
}

export async function createEmployee(
  formData: FormData,
): Promise<Result<{ setPasswordUrl: string }>> {
  const parsed = validateEmployeeInput(formRecord(formData));
  if (!parsed.ok) return parsed;

  const result = await inviteEmployee(
    {
      nama: parsed.value.nama,
      email: parsed.value.email,
      jabatan: parsed.value.jabatan,
      statusKontrak: parsed.value.statusKontrak,
      tanggalMulaiKerja: parsed.value.tanggalMulaiKerja,
      gajiPokok: parsed.value.gajiPokok,
      role: parsed.value.role,
      branchId: parsed.value.branchId,
      departmentId: parsed.value.departmentId,
      atasanId: parsed.value.atasanId,
      designatedApproverId: parsed.value.designatedApproverId,
    },
    createServiceRoleSupabaseClient(),
  );
  if (!result.ok) {
    return { ok: false, error: result.error === "designatedApproverId is required for hr_admin and super_admin roles"
      ? "Approver pengganti wajib untuk role HR Admin / Super Admin."
      : result.error };
  }
  revalidatePath("/karyawan");
  return { ok: true, setPasswordUrl: result.setPasswordUrl };
}

const UPDATE_ERROR_MESSAGES: Record<string, string> = {
  "not allowed to change protected employee fields": "Anda tidak berhak mengubah data terproteksi karyawan.",
};

export async function updateEmployee(id: string, formData: FormData): Promise<Result> {
  const parsed = validateEmployeeInput(formRecord(formData));
  if (!parsed.ok) return parsed;

  const db = await createServerSupabaseClient();
  const { error } = await db
    .from("employees")
    .update({
      nama: parsed.value.nama,
      email: parsed.value.email,
      jabatan: parsed.value.jabatan,
      status_kontrak: parsed.value.statusKontrak,
      tanggal_mulai_kerja: parsed.value.tanggalMulaiKerja,
      gaji_pokok: parsed.value.gajiPokok,
      role: parsed.value.role,
      branch_id: parsed.value.branchId,
      department_id: parsed.value.departmentId,
      atasan_id: parsed.value.atasanId,
      designated_approver_id: parsed.value.designatedApproverId,
    })
    .eq("id", id);

  if (error) {
    for (const [key, friendly] of Object.entries(UPDATE_ERROR_MESSAGES)) {
      if (error.message.includes(key)) return { ok: false, error: friendly };
    }
    console.error("updateEmployee: update failed", error);
    return { ok: false, error: "Gagal menyimpan perubahan karyawan." };
  }
  revalidatePath(`/karyawan/${id}`);
  revalidatePath("/karyawan");
  return { ok: true };
}

export async function setEmployeeStatus(
  id: string,
  status: "aktif" | "nonaktif",
): Promise<Result> {
  const db = await createServerSupabaseClient();
  const { data: userData } = await db.auth.getUser();
  if (status === "nonaktif" && userData.user?.id === id) {
    return { ok: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." };
  }
  const { error } = await db.from("employees").update({ status }).eq("id", id);
  if (error) {
    console.error("setEmployeeStatus: update failed", error);
    return { ok: false, error: "Gagal mengubah status karyawan." };
  }
  revalidatePath(`/karyawan/${id}`);
  revalidatePath("/karyawan");
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- "karyawan/actions.test.ts"
```

Expected: PASS (7 tests).

- [ ] **Step 5: Write the create page + form**

```tsx
// src/app/(admin)/karyawan/baru/create-employee-form.tsx
"use client";

import { useState } from "react";
import { EmployeeFormFields } from "../employee-form-fields";

type Result = { ok: true; setPasswordUrl: string } | { ok: false; error: string };

export function CreateEmployeeForm({
  branches, departments, approverOptions, createEmployee,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  createEmployee: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function action(formData: FormData) {
    setError(null); setLink(null); setBusy(true);
    try {
      const r = await createEmployee(formData);
      if (!r.ok) { setError(r.error); return; }
      setLink(r.setPasswordUrl);
    } catch (e) {
      console.error(e); setError("Terjadi kesalahan. Coba lagi.");
    } finally { setBusy(false); }
  }

  if (link) {
    return (
      <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-800">Karyawan dibuat. Kirim link berikut ke karyawan (berlaku terbatas):</p>
        <div className="flex items-center gap-2">
          <input readOnly value={link} className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-xs" />
          <button type="button" onClick={() => navigator.clipboard?.writeText(link)}
            className="min-h-10 rounded border border-neutral-300 bg-white px-3 py-2 text-sm">Salin</button>
        </div>
        <a href="/karyawan" className="inline-block text-sm text-blue-700 hover:underline">Kembali ke daftar karyawan</a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <EmployeeFormFields branches={branches} departments={departments} approverOptions={approverOptions} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-11 rounded bg-blue-600 px-5 py-2.5 text-base font-medium text-white disabled:opacity-60">
        Buat & Ambil Link
      </button>
    </form>
  );
}
```

```tsx
// src/app/(admin)/karyawan/baru/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { CreateEmployeeForm } from "./create-employee-form";
import { createEmployee } from "../actions";

export default async function KaryawanBaruPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const [{ data: branches }, { data: departments }, { data: approvers }] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("departments").select("id, nama").order("nama"),
    db.from("employees").select("id, nama").eq("status", "aktif").order("nama"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Tambah Karyawan</h1>
        <p className="mt-1 text-sm text-neutral-500">Buat akun, lalu kirim link set-password ke karyawan.</p>
      </div>
      <CreateEmployeeForm
        branches={branches ?? []}
        departments={departments ?? []}
        approverOptions={approvers ?? []}
        createEmployee={createEmployee}
      />
    </div>
  );
}
```

- [ ] **Step 6: Write the detail/edit page + form**

```tsx
// src/app/(admin)/karyawan/[id]/edit-employee-form.tsx
"use client";

import { useState } from "react";
import { EmployeeFormFields, type EmployeeFieldValues } from "../employee-form-fields";

type Result = { ok: true } | { ok: false; error: string };

export function EditEmployeeForm({
  employeeId, defaults, branches, departments, approverOptions,
  updateEmployee, setStatus, currentStatus, isSelf,
}: {
  employeeId: string;
  defaults: Partial<EmployeeFieldValues>;
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  updateEmployee: (id: string, fd: FormData) => Promise<Result>;
  setStatus: (id: string, status: "aktif" | "nonaktif") => Promise<Result>;
  currentStatus: "aktif" | "nonaktif";
  isSelf: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function run(fn: () => Promise<Result>, okMsg: string) {
    setError(null); setMsg(null); setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.error); return; }
      setMsg(okMsg);
    } catch (e) { console.error(e); setError("Terjadi kesalahan. Coba lagi."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <form action={(fd) => run(() => updateEmployee(employeeId, fd), "Perubahan tersimpan.")} className="space-y-6">
        <EmployeeFormFields
          branches={branches} departments={departments} approverOptions={approverOptions}
          defaults={defaults}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        <button type="submit" disabled={busy} className="min-h-11 rounded bg-blue-600 px-5 py-2.5 text-base font-medium text-white disabled:opacity-60">
          Simpan Perubahan
        </button>
      </form>

      {!isSelf && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          {currentStatus === "aktif" ? (
            !confirming ? (
              <button type="button" onClick={() => setConfirming(true)}
                className="min-h-11 rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700">Nonaktifkan Karyawan</button>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <span>Nonaktifkan karyawan ini? Mereka tak bisa login.</span>
                <button type="button" disabled={busy}
                  onClick={() => run(() => setStatus(employeeId, "nonaktif"), "Karyawan dinonaktifkan.").then(() => setConfirming(false))}
                  className="rounded bg-red-600 px-3 py-1.5 font-medium text-white">Ya, nonaktifkan</button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded border border-neutral-300 px-3 py-1.5">Batal</button>
              </span>
            )
          ) : (
            <button type="button" disabled={busy}
              onClick={() => run(() => setStatus(employeeId, "aktif"), "Karyawan diaktifkan kembali.")}
              className="min-h-11 rounded border border-green-300 px-4 py-2 text-sm font-medium text-green-700">Aktifkan Kembali</button>
          )}
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/app/(admin)/karyawan/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { RoleBadge } from "@/components/role-badge";
import type { Role } from "@/lib/auth/route-access";
import { EditEmployeeForm } from "./edit-employee-form";
import { updateEmployee, setEmployeeStatus } from "../actions";

export default async function KaryawanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");
  if (me.role !== "hr_admin" && me.role !== "super_admin") redirect("/dashboard");

  const { data: emp, error } = await db
    .from("employees")
    .select("id, nama, email, jabatan, status_kontrak, tanggal_mulai_kerja, gaji_pokok, role, status, branch_id, department_id, atasan_id, designated_approver_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return <p className="text-sm text-red-600">Gagal memuat data karyawan.</p>;
  if (!emp) notFound();

  const [{ data: branches }, { data: departments }, { data: approvers }, { data: audit }] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("departments").select("id, nama").order("nama"),
    db.from("employees").select("id, nama").eq("status", "aktif").order("nama"),
    db.from("audit_logs").select("waktu, aksi, actor:employees!audit_logs_actor_id_fkey(nama)")
      .eq("target_employee_id", id).order("waktu", { ascending: false }).limit(50),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{emp.nama}</h1>
          <p className="mt-1 text-sm text-neutral-500">{emp.email}</p>
        </div>
        <RoleBadge role={emp.role as Role} />
        <span className={`rounded px-2 py-1 text-xs font-medium ${emp.status === "aktif" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
          {emp.status === "aktif" ? "Aktif" : "Nonaktif"}
        </span>
      </div>

      <EditEmployeeForm
        employeeId={emp.id}
        defaults={{
          nama: emp.nama, email: emp.email, jabatan: emp.jabatan,
          statusKontrak: emp.status_kontrak, tanggalMulaiKerja: emp.tanggal_mulai_kerja,
          gajiPokok: String(emp.gaji_pokok), role: emp.role, branchId: emp.branch_id,
          departmentId: emp.department_id ?? "", atasanId: emp.atasan_id ?? "",
          designatedApproverId: emp.designated_approver_id ?? "",
        }}
        branches={branches ?? []}
        departments={departments ?? []}
        approverOptions={approvers ?? []}
        updateEmployee={updateEmployee}
        setStatus={setEmployeeStatus}
        currentStatus={emp.status as "aktif" | "nonaktif"}
        isSelf={me.id === emp.id}
      />

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-900">Riwayat Perubahan</h2>
        {(!audit || audit.length === 0) ? (
          <p className="text-sm text-neutral-500">Belum ada riwayat.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white text-sm">
            {audit.map((a, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2">
                <span>{a.aksi}</span>
                <span className="text-neutral-500">
                  {(a.actor as unknown as { nama: string } | null)?.nama ?? "Sistem"} ·{" "}
                  {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(a.waktu))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

Note: the `Intl.DateTimeFormat` with `timeZone: "Asia/Jakarta"` is the required pattern for rendering the `waktu` timestamp — do not use bare `.toLocaleString()`.

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: compiles, `/karyawan/baru` and `/karyawan/[id]` listed.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(admin)/karyawan/actions.ts" "src/app/(admin)/karyawan/actions.test.ts" "src/app/(admin)/karyawan/baru" "src/app/(admin)/karyawan/[id]"
git commit -m "feat(karyawan): create (invite) + edit + deactivate with audit history"
```

---

## Task 12: `/pengaturan/audit` viewer

**Files:**
- Create: `src/components/audit-aksi-badge.tsx`
- Create: `src/components/audit-aksi-badge.test.tsx`
- Create: `src/app/(admin)/pengaturan/audit/page.tsx`
- Create: `src/app/(admin)/pengaturan/audit/audit-filters.tsx`

**Interfaces:**
- Consumes: `audit_logs` (written by Task 1 + Task 3 triggers/RPCs).
- Produces: `<AuditAksiBadge aksi={string} />` — label + color per `aksi`, with a neutral fallback for an unknown value.
- Consumed by: nothing downstream.

- [ ] **Step 1: Write the failing badge test**

```typescript
// src/components/audit-aksi-badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuditAksiBadge } from "./audit-aksi-badge";

describe("AuditAksiBadge", () => {
  it("labels known actions in Indonesian", () => {
    render(<AuditAksiBadge aksi="employee_deactivated" />);
    expect(screen.getByText("Karyawan Dinonaktifkan")).toBeInTheDocument();
  });
  it("labels leave actions", () => {
    render(<AuditAksiBadge aksi="leave_approved" />);
    expect(screen.getByText("Cuti Disetujui")).toBeInTheDocument();
  });
  it("falls back to the raw value for an unknown action", () => {
    render(<AuditAksiBadge aksi="something_new" />);
    expect(screen.getByText("something_new")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- audit-aksi-badge.test.tsx
```

Expected: FAIL — `Cannot find module './audit-aksi-badge'`.

- [ ] **Step 3: Write the badge**

```tsx
// src/components/audit-aksi-badge.tsx
const CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  employee_created: { label: "Karyawan Dibuat", bg: "bg-green-50", fg: "text-green-700" },
  employee_updated: { label: "Karyawan Diubah", bg: "bg-blue-50", fg: "text-blue-700" },
  employee_deactivated: { label: "Karyawan Dinonaktifkan", bg: "bg-red-50", fg: "text-red-700" },
  employee_reactivated: { label: "Karyawan Diaktifkan", bg: "bg-green-50", fg: "text-green-700" },
  employee_deleted: { label: "Karyawan Dihapus", bg: "bg-red-50", fg: "text-red-700" },
  leave_approved: { label: "Cuti Disetujui", bg: "bg-green-50", fg: "text-green-700" },
  leave_rejected: { label: "Cuti Ditolak", bg: "bg-red-50", fg: "text-red-700" },
};

export function AuditAksiBadge({ aksi }: { aksi: string }) {
  const c = CONFIG[aksi] ?? { label: aksi, bg: "bg-neutral-100", fg: "text-neutral-700" };
  return (
    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${c.bg} ${c.fg}`}>
      {c.label}
    </span>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- audit-aksi-badge.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the filters + page**

```tsx
// src/app/(admin)/pengaturan/audit/audit-filters.tsx
"use client";

import { useRouter } from "next/navigation";

const AKSI_OPTIONS = [
  { value: "", label: "Semua aksi" },
  { value: "employee_created", label: "Karyawan Dibuat" },
  { value: "employee_updated", label: "Karyawan Diubah" },
  { value: "employee_deactivated", label: "Karyawan Dinonaktifkan" },
  { value: "employee_reactivated", label: "Karyawan Diaktifkan" },
  { value: "leave_approved", label: "Cuti Disetujui" },
  { value: "leave_rejected", label: "Cuti Ditolak" },
];

export function AuditFilters({
  employees, defaults,
}: {
  employees: { id: string; nama: string }[];
  defaults: { dari?: string; sampai?: string; target?: string; aksi?: string };
}) {
  const router = useRouter();
  function pushWith(overrides: Record<string, string>) {
    const next = { dari: defaults.dari ?? "", sampai: defaults.sampai ?? "", target: defaults.target ?? "", aksi: defaults.aksi ?? "", ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    router.push(`/pengaturan/audit?${params.toString()}`);
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Dari
        <input type="date" defaultValue={defaults.dari} onChange={(e) => pushWith({ dari: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Sampai
        <input type="date" defaultValue={defaults.sampai} onChange={(e) => pushWith({ sampai: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Karyawan
        <select defaultValue={defaults.target ?? ""} onChange={(e) => pushWith({ target: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Semua</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
        </select></label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Aksi
        <select defaultValue={defaults.aksi ?? ""} onChange={(e) => pushWith({ aksi: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {AKSI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></label>
    </div>
  );
}
```

```tsx
// src/app/(admin)/pengaturan/audit/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { AuditAksiBadge } from "@/components/audit-aksi-badge";
import { AuditFilters } from "./audit-filters";

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string; target?: string; aksi?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: employees } = await db.from("employees").select("id, nama").order("nama");

  let q = db
    .from("audit_logs")
    .select("id, waktu, aksi, detail, is_self_action, actor:employees!audit_logs_actor_id_fkey(nama), target:employees!audit_logs_target_employee_id_fkey(nama)")
    .order("waktu", { ascending: false })
    .limit(100);
  if (sp.dari) q = q.gte("waktu", `${sp.dari}T00:00:00Z`);
  if (sp.sampai) q = q.lte("waktu", `${sp.sampai}T23:59:59Z`);
  if (sp.target) q = q.eq("target_employee_id", sp.target);
  if (sp.aksi) q = q.eq("aksi", sp.aksi);

  const { data: rows, error } = await q;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Log Audit</h1>
        <p className="mt-1 text-sm text-neutral-500">Riwayat perubahan data karyawan dan persetujuan cuti.</p>
      </div>

      <AuditFilters employees={employees ?? []} defaults={sp} />

      {error && <p className="text-sm text-red-600">Gagal memuat log audit.</p>}
      {!error && (!rows || rows.length === 0) && <p className="text-sm text-neutral-500">Belum ada catatan audit.</p>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Waktu</th>
                <th className="px-4 py-2 font-medium">Aksi</th>
                <th className="px-4 py-2 font-medium">Aktor</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap">{fmt.format(new Date(r.waktu))}</td>
                  <td className="px-4 py-2"><AuditAksiBadge aksi={r.aksi} /></td>
                  <td className="px-4 py-2">{(r.actor as unknown as { nama: string } | null)?.nama ?? "Sistem"}</td>
                  <td className="px-4 py-2">{(r.target as unknown as { nama: string } | null)?.nama ?? "-"}</td>
                  <td className="px-4 py-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-blue-700">Lihat</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-neutral-50 p-2 text-[11px]">{JSON.stringify(r.detail, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Note: verify the FK constraint names `audit_logs_actor_id_fkey` / `audit_logs_target_employee_id_fkey` against `supabase/migrations/0003_payroll_audit.sql` (Postgres auto-names them `<table>_<column>_fkey`); adjust the embed hints if the actual names differ.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: compiles, `/pengaturan/audit` listed.

- [ ] **Step 7: Commit**

```bash
git add src/components/audit-aksi-badge.tsx src/components/audit-aksi-badge.test.tsx "src/app/(admin)/pengaturan/audit"
git commit -m "feat: /pengaturan/audit log viewer with filters"
```

---

## Task 13: `/pengaturan/libur` holiday CRUD

**Files:**
- Create: `src/app/(admin)/pengaturan/libur/page.tsx`
- Create: `src/app/(admin)/pengaturan/libur/actions.ts`
- Create: `src/app/(admin)/pengaturan/libur/holiday-form.tsx`
- Create: `src/app/(admin)/pengaturan/libur/holiday-form.test.tsx`

**Interfaces:**
- Consumes: `holidays` table, `holidays_write` RLS = `is_hr_admin_role()` (Task 1).
- Produces: `addHoliday(formData: FormData)` / `deleteHoliday(id: string)` server actions, both `{ ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing form test**

```typescript
// src/app/(admin)/pengaturan/libur/holiday-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HolidayForm } from "./holiday-form";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("HolidayForm", () => {
  it("submits tanggal, nama, and scope", async () => {
    const addHoliday = vi.fn().mockResolvedValue({ ok: true });
    render(<HolidayForm branches={BRANCHES} addHoliday={addHoliday} />);
    fireEvent.change(screen.getByLabelText(/tanggal/i), { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText(/nama/i), { target: { value: "Cuti Bersama" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(addHoliday).toHaveBeenCalled());
    const fd = addHoliday.mock.calls[0][0] as FormData;
    expect(fd.get("tanggal")).toBe("2026-12-31");
    expect(fd.get("nama")).toBe("Cuti Bersama");
    expect(fd.get("branchId")).toBe("");
  });

  it("shows an error from a failed add", async () => {
    const addHoliday = vi.fn().mockResolvedValue({ ok: false, error: "Gagal menambah libur." });
    render(<HolidayForm branches={BRANCHES} addHoliday={addHoliday} />);
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    expect(await screen.findByText("Gagal menambah libur.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- holiday-form.test.tsx
```

Expected: FAIL — `Cannot find module './holiday-form'`.

- [ ] **Step 3: Write the actions**

```typescript
// src/app/(admin)/pengaturan/libur/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addHoliday(formData: FormData): Promise<Result> {
  const tanggal = String(formData.get("tanggal") ?? "").trim();
  const nama = String(formData.get("nama") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim() || null;
  if (!ISO_DATE.test(tanggal) || !nama) {
    return { ok: false, error: "Tanggal (YYYY-MM-DD) dan nama libur wajib diisi." };
  }
  const db = await createServerSupabaseClient();
  const { error } = await db.from("holidays").insert({ tanggal, nama, branch_id: branchId });
  if (error) {
    console.error("addHoliday: insert failed", error);
    return { ok: false, error: "Gagal menambah libur." };
  }
  revalidatePath("/pengaturan/libur");
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<Result> {
  const db = await createServerSupabaseClient();
  const { error } = await db.from("holidays").delete().eq("id", id);
  if (error) {
    console.error("deleteHoliday: delete failed", error);
    return { ok: false, error: "Gagal menghapus libur." };
  }
  revalidatePath("/pengaturan/libur");
  return { ok: true };
}
```

- [ ] **Step 4: Write the form + page**

```tsx
// src/app/(admin)/pengaturan/libur/holiday-form.tsx
"use client";

import { useState } from "react";

type Result = { ok: true } | { ok: false; error: string };

export function HolidayForm({
  branches, addHoliday,
}: {
  branches: { id: string; nama: string }[];
  addHoliday: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function action(fd: FormData) {
    setError(null); setBusy(true);
    try {
      const r = await addHoliday(fd);
      if (!r.ok) setError(r.error);
    } catch (e) { console.error(e); setError("Terjadi kesalahan. Coba lagi."); }
    finally { setBusy(false); }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {/* No HTML `required` — jsdom/React 19 form-action tests submit these empty;
          addHoliday() validates server-side (ISO date + non-empty nama). */}
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Tanggal
        <input name="tanggal" type="date" className="rounded border border-neutral-300 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Nama Libur
        <input name="nama" className="rounded border border-neutral-300 px-3 py-2 text-sm" /></label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">Cakupan
        <select name="branchId" defaultValue="" className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Nasional</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select></label>
      <button type="submit" disabled={busy} className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Tambah</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

```tsx
// src/app/(admin)/pengaturan/libur/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { HolidayForm } from "./holiday-form";
import { addHoliday, deleteHoliday } from "./actions";

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" });

export default async function LiburPage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const tahun = sp.tahun ?? String(new Date().getFullYear());
  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const { data: holidays, error } = await db
    .from("holidays")
    .select("id, tanggal, nama, branches(nama)")
    .gte("tanggal", `${tahun}-01-01`)
    .lte("tanggal", `${tahun}-12-31`)
    .order("tanggal");

  async function remove(id: string) {
    "use server";
    return deleteHoliday(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Hari Libur {tahun}</h1>
        <p className="mt-1 text-sm text-neutral-500">Dipakai payroll untuk menghitung hari kerja efektif.</p>
      </div>

      <HolidayForm branches={branches ?? []} addHoliday={addHoliday} />

      {error && <p className="text-sm text-red-600">Gagal memuat daftar libur.</p>}
      {!error && (!holidays || holidays.length === 0) && (
        <p className="text-sm text-neutral-500">Belum ada libur tercatat untuk {tahun}.</p>
      )}

      {holidays && holidays.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white text-sm">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-4 py-2">
              <span>
                <span className="font-medium">{h.nama}</span>{" "}
                <span className="text-neutral-500">
                  · {fmt.format(new Date(`${h.tanggal}T00:00:00Z`))}
                  {(h.branches as unknown as { nama: string } | null)?.nama ? ` · ${(h.branches as unknown as { nama: string }).nama}` : " · Nasional"}
                </span>
              </span>
              <form action={remove.bind(null, h.id)}>
                <button type="submit" className="text-xs text-red-600 hover:underline">Hapus</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run form test + build**

```bash
npm test -- holiday-form.test.tsx && npm run build
```

Expected: form tests pass; build compiles, `/pengaturan/libur` listed.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/pengaturan/libur"
git commit -m "feat: /pengaturan/libur holiday management"
```

---

## Post-plan verification

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npm run test:integration -- employee-authz-audit.test.ts leave-approval-rpc.test.ts invite-employee.test.ts
```

Then the final whole-branch review (subagent-driven-development), then `finishing-a-development-branch`.

## Deferred to later plans

- `departments` / `work_schedules` management UI and their `is_hr_admin_role()` RLS tightening (Plan 6).
- Self-service password change in `/profil`; a "regenerate set-password link" button on `/karyawan/[id]` (nice-to-have).
- `attendances` manual-correction audit (spec §8 lists it; no correction UI exists yet).
- 2026 holiday dates must be verified by HR against the official SKB 3 Menteri before real payroll.
- Registering `<APP_URL>/set-password` in the Supabase project's Redirect URL allowlist (manual, one-time).
