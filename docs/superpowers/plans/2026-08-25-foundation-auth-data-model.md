# Foundation: Setup, Data Model, Auth & RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + Supabase project with the full core data model, Row Level Security, invite-only auth, and role-based route access — a working app where a Super Admin can log in and see role-appropriate (empty) admin/employee shells, with the database fully migrated and security-tested.

**Architecture:** Single Next.js App Router project with two route groups — `(employee)` (mobile-first self-service, open to every role) and `(admin)` (desktop dashboard, blocked for `karyawan` by middleware). Supabase provides Postgres, Auth, and Storage. RLS is the first line of defense on every table; two Postgres triggers (self-privilege-escalation on `employees`, self-approval on `leave_requests`) provide server-side guarantees that survive even if application code has a bug.

**Tech Stack:** Next.js 16 (App Router, TypeScript, `src/` dir) · Tailwind CSS 4 · shadcn/ui · `@supabase/ssr` + `@supabase/supabase-js` · Zod · Vitest + Testing Library · Supabase CLI (local Postgres via Docker) for migrations & integration tests.

This is **Plan 1 of a 4-plan sequence** derived from `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md`:
1. **Foundation** (this plan) — setup, schema, RLS, auth, RBAC, base shells.
2. Attendance module (clock in/out, geofencing, mobile-lock, photo upload).
3. Leave/cuti module + HR dashboard.
4. Gaji harian & slip gaji sederhana.

Each plan produces working, testable software on its own. Plans 2–4 will be written after this one is implemented and reviewed.

## Global Constraints

- TypeScript everywhere, strict mode on (`tsconfig.json` default from `create-next-app`).
- Every write that matters for security (role changes, leave approval) must be enforced **server-side**, not just hidden in the UI — RLS policies AND Postgres triggers, not just RLS alone (spec §2, §5).
- Attendance/consent photos live only in a **private** Supabase Storage bucket — never public URLs (spec §4, §8). This plan creates the bucket; upload logic is Plan 2.
- Minimum **2 `super_admin`** employees must exist so `designated_approver_id` escalation always resolves (spec §5) — enforced by the seed script in this plan and re-validated by the admin UI in a later plan.
- Package manager: npm. Local Supabase CLI (Docker) is required to run migrations and integration tests — install via `npm install -g supabase` or use `npx supabase`.
- Route groups: `(employee)` open to all authenticated roles, `(admin)` blocked for role `karyawan` by middleware (spec §1, §3).

---

## Task 1: Scaffold the Next.js Project

**Files:**
- Create: entire Next.js scaffold at repo root (`package.json`, `src/app/`, `tailwind.config.*`, etc.)

**Interfaces:**
- Produces: a buildable Next.js app at the repo root, alongside the existing `docs/` folder.

- [ ] **Step 1: Scaffold into a temp directory**

The repo root already contains `docs/` and `.git`, which `create-next-app` refuses to scaffold into directly. Scaffold into a temp dir instead:

```bash
cd /tmp
npx create-next-app@latest absensi-hr-scaffold \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --no-turbopack
```

- [ ] **Step 2: Move the scaffold into the repo root**

```bash
cd /tmp/absensi-hr-scaffold
rm -rf .git
shopt -s dotglob
mv * "/Volumes/File Home/File Web/absensi-hr/"
cd "/Volumes/File Home/File Web/absensi-hr"
rm -rf /tmp/absensi-hr-scaffold
```

- [ ] **Step 3: Verify the scaffold builds**

```bash
cd "/Volumes/File Home/File Web/absensi-hr"
npm run build
```

Expected: build completes with `Compiled successfully` and no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app (TypeScript, Tailwind, App Router)"
```

---

## Task 2: Testing Infrastructure (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/format.test.ts`
- Create: `src/lib/format.ts`
- Modify: `package.json` (add `test` script, devDependencies)

**Interfaces:**
- Produces: `formatRupiah(amount: number): string` — used later for payslip/report display (Plan 4), proves the test harness works now instead of a throwaway smoke test.
- Produces: `npm test` runs Vitest once; `npm run test:watch` runs watch mode.

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Write `vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Write the failing test**

```typescript
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("formats whole numbers as Indonesian Rupiah without decimals", () => {
    expect(formatRupiah(4500000)).toBe("Rp4.500.000");
  });

  it("rounds fractional amounts to the nearest Rupiah", () => {
    expect(formatRupiah(1000.6)).toBe("Rp1.001");
  });

  it("formats zero", () => {
    expect(formatRupiah(0)).toBe("Rp0");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm test -- format.test.ts
```

Expected: FAIL — `Cannot find module './format'` (file doesn't exist yet).

- [ ] **Step 7: Write minimal implementation**

```typescript
// src/lib/format.ts
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npm test -- format.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json src/lib/format.ts src/lib/format.test.ts
git commit -m "test: add Vitest harness with formatRupiah as first covered util"
```

---

## Task 3: Supabase Project Connection

**Files:**
- Create: `.env.local.example`
- Create: `.env.local` (not committed — add to `.gitignore` if not already there)
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.test.ts`
- Create: `supabase/config.toml` (via `supabase init`)

**Interfaces:**
- Produces: `createBrowserSupabaseClient(): SupabaseClient` — for client components.
- Produces: `createServerSupabaseClient(): Promise<SupabaseClient>` — for server components/actions, reads cookies via `next/headers`.
- Produces: `createServiceRoleSupabaseClient(): SupabaseClient` — server-only, bypasses RLS, used for admin actions like inviting employees (Task 8) and seeding (Task 12).

- [ ] **Step 1: Install Supabase packages and CLI**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Start local Supabase (requires Docker Desktop running)**

```bash
npx supabase start
```

Expected: output prints `API URL`, `anon key`, `service_role key` — copy these for the next step.

- [ ] **Step 3: Write `.env.local.example` and `.env.local`**

```bash
# .env.local.example
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Copy `.env.local.example` to `.env.local` and fill in the values printed by `supabase start`.

- [ ] **Step 4: Confirm `.env.local` is gitignored**

```bash
grep -q "^\.env\.local$" .gitignore || echo ".env.local" >> .gitignore
```

- [ ] **Step 5: Write the failing test**

```typescript
// src/lib/supabase/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("createBrowserSupabaseClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("returns a client with the configured URL", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    const client = createBrowserSupabaseClient();
    expect(client).toBeDefined();
    expect(client.supabaseUrl).toBe("http://localhost:54321");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm test -- client.test.ts
```

Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 7: Write minimal implementation**

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

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

export function createServiceRoleSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npm test -- client.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add .env.local.example .gitignore src/lib/supabase supabase/config.toml
git commit -m "feat: add Supabase client factories (browser, server, service role)"
```

---

## Task 4: Core Entity Migration (branches, departments, employees, work_schedules, holidays)

**Files:**
- Create: `supabase/migrations/0001_core_entities.sql`
- Create: `tests/integration/schema-core.test.ts`

**Interfaces:**
- Produces: tables `branches`, `departments`, `employees`, `work_schedules`, `holidays` — every later task's SQL and TypeScript types depend on these exact column names.
- Consumes: `auth.users` (built into Supabase).

**Prerequisite:** `npx supabase start` running (Task 3).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_core_entities.sql
create extension if not exists pgcrypto;

create table branches (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  alamat text,
  lat double precision not null,
  long double precision not null,
  radius_geofencing_meter integer not null default 100,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete restrict,
  nama text not null,
  created_at timestamptz not null default now()
);

create table employees (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  email text not null unique,
  no_telp text,
  foto_profil_url text,
  branch_id uuid not null references branches(id) on delete restrict,
  department_id uuid references departments(id) on delete set null,
  atasan_id uuid references employees(id) on delete set null,
  designated_approver_id uuid references employees(id) on delete set null,
  jabatan text not null,
  status_kontrak text not null,
  tanggal_mulai_kerja date not null,
  gaji_pokok numeric(14,2) not null default 0,
  role text not null check (role in ('karyawan','atasan','hr_admin','super_admin')),
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  created_at timestamptz not null default now()
);

create index employees_branch_id_idx on employees(branch_id);
create index employees_atasan_id_idx on employees(atasan_id);

create table work_schedules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  jam_masuk time not null,
  jam_pulang time not null,
  hari_kerja integer[] not null,
  toleransi_terlambat_menit integer not null default 0,
  created_at timestamptz not null default now()
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  nama text not null,
  branch_id uuid references branches(id) on delete cascade,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/schema-core.test.ts
import { describe, it, expect } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("core entity schema", () => {
  it("creates a branch, department, and work schedule with FK integrity", async () => {
    const db = createServiceRoleSupabaseClient();

    const { data: branch, error: branchErr } = await db
      .from("branches")
      .insert({ nama: "Kantor Pusat", lat: -6.2, long: 106.8 })
      .select()
      .single();
    expect(branchErr).toBeNull();
    expect(branch.radius_geofencing_meter).toBe(100);

    const { data: dept, error: deptErr } = await db
      .from("departments")
      .insert({ branch_id: branch.id, nama: "Engineering" })
      .select()
      .single();
    expect(deptErr).toBeNull();
    expect(dept.branch_id).toBe(branch.id);

    const { error: scheduleErr } = await db.from("work_schedules").insert({
      branch_id: branch.id,
      jam_masuk: "09:00",
      jam_pulang: "17:00",
      hari_kerja: [1, 2, 3, 4, 5],
      toleransi_terlambat_menit: 15,
    });
    expect(scheduleErr).toBeNull();

    const { error: fkErr } = await db
      .from("departments")
      .insert({ branch_id: "00000000-0000-0000-0000-000000000000", nama: "Ghost" });
    expect(fkErr).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx supabase db reset
npm test -- schema-core.test.ts
```

Expected: FAIL — relation `branches` does not exist (migration not applied yet — `db reset` at this point runs against an empty `migrations/` dir if Step 1's file wasn't saved, or the test fails because the client env isn't pointed at local Supabase; confirm `.env.local` is filled in from Task 3).

- [ ] **Step 4: Apply the migration and re-run**

```bash
npx supabase db reset
npm test -- schema-core.test.ts
```

Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_core_entities.sql tests/integration/schema-core.test.ts
git commit -m "feat(db): migrate core entities (branches, departments, employees, work_schedules, holidays)"
```

---

## Task 5: Attendance & Leave Migration

**Files:**
- Create: `supabase/migrations/0002_attendance_leave.sql`
- Create: `tests/integration/schema-attendance-leave.test.ts`

**Interfaces:**
- Produces: tables `attendances` (unique `(employee_id, tanggal)`), `leave_requests`, `leave_balances` (`saldo_sisa` generated column), `consents`.
- Consumes: `employees` from Task 4.

**Prerequisite:** Task 4 committed.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_attendance_leave.sql
create table attendances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  tanggal date not null,
  jam_masuk timestamptz,
  lokasi_masuk point,
  foto_masuk_url text,
  foto_masuk_expires_at timestamptz,
  jam_pulang timestamptz,
  lokasi_pulang point,
  foto_pulang_url text,
  foto_pulang_expires_at timestamptz,
  status text not null check (status in ('tepat_waktu','terlambat','pulang_cepat','alpa','di_luar_lokasi')),
  catatan text,
  created_at timestamptz not null default now(),
  unique (employee_id, tanggal)
);

create index attendances_employee_id_idx on attendances(employee_id);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  jenis text not null check (jenis in (
    'tahunan','sakit','melahirkan','keguguran','menikah',
    'menikahkan_anak','khitan_baptis_anak','istri_melahirkan_keguguran',
    'kematian_keluarga_inti','kematian_keluarga_serumah','lainnya'
  )),
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  alasan text,
  lampiran_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_id uuid references employees(id),
  catatan_approval text,
  is_self_request boolean not null default false,
  created_at timestamptz not null default now()
);

create index leave_requests_employee_id_idx on leave_requests(employee_id);
create index leave_requests_approver_id_idx on leave_requests(approver_id);

create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  tahun integer not null,
  saldo_awal numeric(5,2) not null default 12,
  saldo_terpakai numeric(5,2) not null default 0,
  saldo_sisa numeric(5,2) generated always as (saldo_awal - saldo_terpakai) stored,
  unique (employee_id, tahun)
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  jenis text not null default 'lokasi_foto_absensi',
  disetujui_at timestamptz not null default now(),
  versi_kebijakan text not null
);
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/schema-attendance-leave.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("attendance & leave schema", () => {
  let employeeId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang A", lat: -6.2, long: 106.8 })
      .select()
      .single();
    const { data: authUser } = await db.auth.admin.createUser({
      email: "karyawan.schema@test.local",
      password: "TestPassword123!",
      email_confirm: true,
    });
    const { data: employee } = await db
      .from("employees")
      .insert({
        id: authUser.user!.id,
        nama: "Test Karyawan",
        email: "karyawan.schema@test.local",
        branch_id: branch.id,
        jabatan: "Staff",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2026-01-01",
        role: "karyawan",
      })
      .select()
      .single();
    employeeId = employee!.id;
  });

  it("enforces one attendance row per employee per day", async () => {
    const db = createServiceRoleSupabaseClient();
    const { error: firstErr } = await db.from("attendances").insert({
      employee_id: employeeId,
      tanggal: "2026-09-01",
      status: "tepat_waktu",
    });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await db.from("attendances").insert({
      employee_id: employeeId,
      tanggal: "2026-09-01",
      status: "terlambat",
    });
    expect(dupErr).not.toBeNull();
  });

  it("computes saldo_sisa as a generated column", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db
      .from("leave_balances")
      .insert({ employee_id: employeeId, tahun: 2026, saldo_awal: 12, saldo_terpakai: 3 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(Number(data.saldo_sisa)).toBe(9);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx supabase db reset
npm test -- schema-attendance-leave.test.ts
```

Expected: FAIL — relation `attendances` does not exist.

- [ ] **Step 4: Apply migration and re-run**

```bash
npx supabase db reset
npm test -- schema-attendance-leave.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_attendance_leave.sql tests/integration/schema-attendance-leave.test.ts
git commit -m "feat(db): migrate attendance, leave_requests, leave_balances, consents"
```

---

## Task 6: Payroll & Audit Migration

**Files:**
- Create: `supabase/migrations/0003_payroll_audit.sql`
- Create: `tests/integration/schema-payroll-audit.test.ts`

**Interfaces:**
- Produces: tables `payroll_periods`, `payslips`, `audit_logs`.
- Consumes: `employees`, `branches` from Task 4.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_payroll_audit.sql
create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  bulan integer not null check (bulan between 1 and 12),
  tahun integer not null,
  status text not null default 'draft' check (status in ('draft','final')),
  created_at timestamptz not null default now(),
  unique (branch_id, bulan, tahun)
);

create table payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  gaji_pokok numeric(14,2) not null,
  hari_kerja_efektif integer not null,
  gaji_harian numeric(14,2) not null,
  total_potongan_absensi numeric(14,2) not null default 0,
  gaji_akhir numeric(14,2) not null,
  rincian_harian jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (employee_id, payroll_period_id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references employees(id),
  target_employee_id uuid references employees(id),
  aksi text not null,
  waktu timestamptz not null default now(),
  detail jsonb,
  is_self_action boolean not null default false
);

create index audit_logs_target_idx on audit_logs(target_employee_id);
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/schema-payroll-audit.test.ts
import { describe, it, expect } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("payroll & audit schema", () => {
  it("rejects a duplicate payroll period for the same branch/month/year", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang Payroll", lat: -6.2, long: 106.8 })
      .select()
      .single();

    const { error: firstErr } = await db
      .from("payroll_periods")
      .insert({ branch_id: branch.id, bulan: 9, tahun: 2026 });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await db
      .from("payroll_periods")
      .insert({ branch_id: branch.id, bulan: 9, tahun: 2026 });
    expect(dupErr).not.toBeNull();
  });

  it("stores audit log details as jsonb", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db
      .from("audit_logs")
      .insert({ aksi: "test.aksi", detail: { before: 1, after: 2 } })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.detail).toEqual({ before: 1, after: 2 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx supabase db reset
npm test -- schema-payroll-audit.test.ts
```

Expected: FAIL — relation `payroll_periods` does not exist.

- [ ] **Step 4: Apply migration and re-run**

```bash
npx supabase db reset
npm test -- schema-payroll-audit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_payroll_audit.sql tests/integration/schema-payroll-audit.test.ts
git commit -m "feat(db): migrate payroll_periods, payslips, audit_logs"
```

---

## Task 7: Row Level Security + Anti-Fraud Triggers

**Files:**
- Create: `supabase/migrations/0004_rls_and_triggers.sql`
- Create: `tests/integration/rls-security.test.ts`

**Interfaces:**
- Produces: SQL functions `current_employee_role()`, `is_admin_role()` — reusable in later migrations if needed.
- Produces: enforced invariants — a `karyawan` cannot read another employee's row; a non-admin cannot change their own `role`/`gaji_pokok`/`branch_id`/etc.; `leave_requests.approver_id` can never equal `employee_id` at approval time, at the database level, regardless of application code.

**Prerequisite:** Tasks 4–6 committed.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_rls_and_triggers.sql

-- Helper functions (SECURITY DEFINER: bypass RLS on `employees` themselves
-- to avoid infinite recursion when policies check the caller's role)
create or replace function current_employee_role()
returns text language sql security definer set search_path = public stable as $$
  select role from employees where id = auth.uid();
$$;

create or replace function is_admin_role()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(current_employee_role() in ('hr_admin','super_admin'), false);
$$;

-- Anti-fraud trigger: block non-admins from changing protected fields on
-- their own employee row, even though the base UPDATE policy allows self-update
-- (self-update is needed for no_telp/foto_profil_url).
create or replace function prevent_employee_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin_role() = false and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.gaji_pokok is distinct from old.gaji_pokok
       or new.branch_id is distinct from old.branch_id
       or new.department_id is distinct from old.department_id
       or new.atasan_id is distinct from old.atasan_id
       or new.designated_approver_id is distinct from old.designated_approver_id
       or new.status is distinct from old.status
    then
      raise exception 'not allowed to change protected fields on own employee record';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_privilege_escalation
before update on employees
for each row execute function prevent_employee_self_privilege_escalation();

-- Anti-fraud trigger: block self-approval on leave_requests at the DB level.
create or replace function prevent_leave_self_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved','rejected') and old.status = 'pending' then
    if new.approver_id = new.employee_id then
      raise exception 'self-approval is not allowed';
    end if;
    if new.approver_id is distinct from auth.uid() and is_admin_role() = false then
      raise exception 'only the assigned approver may act on this request';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_leave_self_approval
before update on leave_requests
for each row execute function prevent_leave_self_approval();

-- Enable RLS
alter table branches enable row level security;
alter table departments enable row level security;
alter table employees enable row level security;
alter table work_schedules enable row level security;
alter table holidays enable row level security;
alter table attendances enable row level security;
alter table leave_requests enable row level security;
alter table leave_balances enable row level security;
alter table consents enable row level security;
alter table payroll_periods enable row level security;
alter table payslips enable row level security;
alter table audit_logs enable row level security;

-- Reference/config tables: read for any authenticated user, write for admin only
create policy branches_select on branches for select using (auth.role() = 'authenticated');
create policy branches_write on branches for all using (is_admin_role()) with check (is_admin_role());

create policy departments_select on departments for select using (auth.role() = 'authenticated');
create policy departments_write on departments for all using (is_admin_role()) with check (is_admin_role());

create policy work_schedules_select on work_schedules for select using (auth.role() = 'authenticated');
create policy work_schedules_write on work_schedules for all using (is_admin_role()) with check (is_admin_role());

create policy holidays_select on holidays for select using (auth.role() = 'authenticated');
create policy holidays_write on holidays for all using (is_admin_role()) with check (is_admin_role());

-- employees
create policy employees_select on employees for select using (
  id = auth.uid() or atasan_id = auth.uid() or is_admin_role()
);
create policy employees_update on employees for update using (
  id = auth.uid() or is_admin_role()
) with check (
  id = auth.uid() or is_admin_role()
);

-- attendances
create policy attendances_select on attendances for select using (
  employee_id = auth.uid()
  or is_admin_role()
  or employee_id in (select id from employees where atasan_id = auth.uid())
);
create policy attendances_insert on attendances for insert with check (
  employee_id = auth.uid()
);
create policy attendances_update on attendances for update using (
  employee_id = auth.uid() or is_admin_role()
) with check (
  employee_id = auth.uid() or is_admin_role()
);

-- leave_requests
create policy leave_requests_select on leave_requests for select using (
  employee_id = auth.uid()
  or approver_id = auth.uid()
  or is_admin_role()
  or employee_id in (select id from employees where atasan_id = auth.uid())
);
create policy leave_requests_insert on leave_requests for insert with check (
  employee_id = auth.uid()
);
create policy leave_requests_update on leave_requests for update using (
  approver_id = auth.uid() or is_admin_role()
) with check (
  approver_id = auth.uid() or is_admin_role()
);

-- leave_balances: read-only for clients; writes happen via service role only
create policy leave_balances_select on leave_balances for select using (
  employee_id = auth.uid()
  or is_admin_role()
  or employee_id in (select id from employees where atasan_id = auth.uid())
);

-- consents
create policy consents_select on consents for select using (employee_id = auth.uid() or is_admin_role());
create policy consents_insert on consents for insert with check (employee_id = auth.uid());

-- payroll_periods / payslips: admin only for periods; own payslip for employees
create policy payroll_periods_select on payroll_periods for select using (is_admin_role());
create policy payroll_periods_write on payroll_periods for all using (is_admin_role()) with check (is_admin_role());

create policy payslips_select on payslips for select using (
  employee_id = auth.uid() or is_admin_role()
);

-- audit_logs: admin read-only, no client insert (system-only via service role)
create policy audit_logs_select on audit_logs for select using (is_admin_role());
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/rls-security.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signInAs(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  await client.auth.signInWithPassword({ email, password });
  return client;
}

describe("RLS & anti-fraud triggers", () => {
  let branchId: string;
  let karyawanA: { id: string; email: string };
  let karyawanB: { id: string; email: string };
  const password = "TestPassword123!";

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang RLS", lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch.id;

    for (const [key, email] of [
      ["A", "karyawan.a@test.local"],
      ["B", "karyawan.b@test.local"],
    ] as const) {
      const { data: authUser } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      const { data: employee } = await db
        .from("employees")
        .insert({
          id: authUser.user!.id,
          nama: `Karyawan ${key}`,
          email,
          branch_id: branchId,
          jabatan: "Staff",
          status_kontrak: "tetap",
          tanggal_mulai_kerja: "2026-01-01",
          role: "karyawan",
        })
        .select()
        .single();
      if (key === "A") karyawanA = { id: employee!.id, email };
      else karyawanB = { id: employee!.id, email };
    }
  });

  it("blocks a karyawan from reading another employee's row", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { data, error } = await clientA
      .from("employees")
      .select("*")
      .eq("id", karyawanB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("blocks a non-admin from changing their own role via UPDATE", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { error } = await clientA
      .from("employees")
      .update({ role: "hr_admin" })
      .eq("id", karyawanA.id);
    expect(error).not.toBeNull();
  });

  it("blocks self-approval on leave_requests at the trigger level", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-01",
        tanggal_selesai: "2026-10-02",
        approver_id: karyawanA.id,
        is_self_request: true,
      })
      .select()
      .single();

    const { error } = await db
      .from("leave_requests")
      .update({ status: "approved" })
      .eq("id", leave.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx supabase db reset
npm test -- rls-security.test.ts
```

Expected: FAIL — RLS not enabled yet, so the karyawan-reads-karyawan-B assertion fails (data is not empty).

- [ ] **Step 4: Apply migration and re-run**

```bash
npx supabase db reset
npm test -- rls-security.test.ts
```

Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_rls_and_triggers.sql tests/integration/rls-security.test.ts
git commit -m "feat(db): RLS policies + anti-fraud triggers for self-privilege-escalation and self-approval"
```

---

## Task 8: Private Storage Bucket for Attendance Photos

**Files:**
- Create: `supabase/migrations/0005_storage_bucket.sql`
- Create: `tests/integration/storage-bucket.test.ts`

**Interfaces:**
- Produces: private Supabase Storage bucket `attendance-photos`, readable/writable only by the owning employee or admin roles. Upload logic itself is Plan 2 (attendance module) — this task only provisions the bucket and its policies.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_storage_bucket.sql
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
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/integration/storage-bucket.test.ts
import { describe, it, expect } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("attendance-photos storage bucket", () => {
  it("exists and is private", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db.storage.getBucket("attendance-photos");
    expect(error).toBeNull();
    expect(data!.public).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx supabase db reset
npm test -- storage-bucket.test.ts
```

Expected: FAIL — bucket not found.

- [ ] **Step 4: Apply migration and re-run**

```bash
npx supabase db reset
npm test -- storage-bucket.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_storage_bucket.sql tests/integration/storage-bucket.test.ts
git commit -m "feat(storage): private attendance-photos bucket with owner/admin RLS"
```

---

## Task 9: Invite-Only Employee Creation

**Files:**
- Create: `src/lib/employees/invite.ts`
- Create: `src/lib/employees/invite.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleSupabaseClient()` (Task 3).
- Produces: `inviteEmployee(input: InviteEmployeeInput): Promise<InviteEmployeeResult>` where:
  ```typescript
  type InviteEmployeeInput = {
    nama: string;
    email: string;
    branchId: string;
    departmentId?: string;
    atasanId?: string;
    designatedApproverId?: string;
    jabatan: string;
    statusKontrak: string;
    tanggalMulaiKerja: string; // YYYY-MM-DD
    gajiPokok: number;
    role: "karyawan" | "atasan" | "hr_admin" | "super_admin";
  };
  type InviteEmployeeResult =
    | { ok: true; employeeId: string }
    | { ok: false; error: string };
  ```
  Used directly by the `(admin)/karyawan/baru` form in a later plan.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/employees/invite.test.ts
import { describe, it, expect, vi } from "vitest";
import { inviteEmployee } from "./invite";

function makeMockDb(overrides: Partial<any> = {}) {
  return {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: "new-user-id" } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "new-user-id" },
            error: null,
          }),
        }),
      }),
    }),
    ...overrides,
  };
}

const baseInput = {
  nama: "Budi",
  email: "budi@test.local",
  branchId: "branch-1",
  jabatan: "Staff",
  statusKontrak: "tetap",
  tanggalMulaiKerja: "2026-01-01",
  gajiPokok: 5_000_000,
  role: "karyawan" as const,
};

describe("inviteEmployee", () => {
  it("creates an auth user and an employees row, returning the new id", async () => {
    const db = makeMockDb();
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: true, employeeId: "new-user-id" });
    expect(db.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "budi@test.local" }),
    );
  });

  it("rejects hr_admin/super_admin invites without a designatedApproverId", async () => {
    const db = makeMockDb();
    const result = await inviteEmployee(
      { ...baseInput, role: "hr_admin" },
      db as any,
    );
    expect(result).toEqual({
      ok: false,
      error: "designatedApproverId is required for hr_admin and super_admin roles",
    });
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rolls back the auth user if the employees insert fails", async () => {
    const db = makeMockDb({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "duplicate email" },
            }),
          }),
        }),
      }),
    });
    const result = await inviteEmployee(baseInput, db as any);
    expect(result).toEqual({ ok: false, error: "duplicate email" });
    expect(db.auth.admin.deleteUser).toHaveBeenCalledWith("new-user-id");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- invite.test.ts
```

Expected: FAIL — `Cannot find module './invite'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/employees/invite.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type InviteEmployeeInput = {
  nama: string;
  email: string;
  branchId: string;
  departmentId?: string;
  atasanId?: string;
  designatedApproverId?: string;
  jabatan: string;
  statusKontrak: string;
  tanggalMulaiKerja: string;
  gajiPokok: number;
  role: "karyawan" | "atasan" | "hr_admin" | "super_admin";
};

export type InviteEmployeeResult =
  | { ok: true; employeeId: string }
  | { ok: false; error: string };

export async function inviteEmployee(
  input: InviteEmployeeInput,
  db: SupabaseClient,
): Promise<InviteEmployeeResult> {
  if (
    (input.role === "hr_admin" || input.role === "super_admin") &&
    !input.designatedApproverId
  ) {
    return {
      ok: false,
      error: "designatedApproverId is required for hr_admin and super_admin roles",
    };
  }

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
  });
  if (authErr || !authUser.user) {
    return { ok: false, error: authErr?.message ?? "failed to create auth user" };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .insert({
      id: authUser.user.id,
      nama: input.nama,
      email: input.email,
      branch_id: input.branchId,
      department_id: input.departmentId ?? null,
      atasan_id: input.atasanId ?? null,
      designated_approver_id: input.designatedApproverId ?? null,
      jabatan: input.jabatan,
      status_kontrak: input.statusKontrak,
      tanggal_mulai_kerja: input.tanggalMulaiKerja,
      gaji_pokok: input.gajiPokok,
      role: input.role,
    })
    .select()
    .single();

  if (employeeErr || !employee) {
    await db.auth.admin.deleteUser(authUser.user.id);
    return { ok: false, error: employeeErr?.message ?? "failed to create employee record" };
  }

  return { ok: true, employeeId: employee.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- invite.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/employees/invite.ts src/lib/employees/invite.test.ts
git commit -m "feat: invite-only employee creation with rollback on partial failure"
```

---

## Task 10: Login & Session Helpers

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/session.test.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/actions.ts`

**Interfaces:**
- Produces: `getCurrentEmployee(db: SupabaseClient): Promise<CurrentEmployee | null>` where:
  ```typescript
  type CurrentEmployee = {
    id: string;
    nama: string;
    email: string;
    role: "karyawan" | "atasan" | "hr_admin" | "super_admin";
    branchId: string;
  };
  ```
- Consumed by: middleware (Task 11) and every server component/action in later plans that needs "who is logged in and what's their role."

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/session.test.ts
import { describe, it, expect, vi } from "vitest";
import { getCurrentEmployee } from "./session";

function makeMockDb(session: any, employee: any) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: session }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: employee, error: null }),
        }),
      }),
    }),
  };
}

describe("getCurrentEmployee", () => {
  it("returns null when there is no authenticated user", async () => {
    const db = makeMockDb(null, null);
    const result = await getCurrentEmployee(db as any);
    expect(result).toBeNull();
  });

  it("returns the employee record for the authenticated user", async () => {
    const db = makeMockDb(
      { id: "user-1" },
      {
        id: "user-1",
        nama: "Budi",
        email: "budi@test.local",
        role: "hr_admin",
        branch_id: "branch-1",
      },
    );
    const result = await getCurrentEmployee(db as any);
    expect(result).toEqual({
      id: "user-1",
      nama: "Budi",
      email: "budi@test.local",
      role: "hr_admin",
      branchId: "branch-1",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- session.test.ts
```

Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/auth/session.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentEmployee = {
  id: string;
  nama: string;
  email: string;
  role: "karyawan" | "atasan" | "hr_admin" | "super_admin";
  branchId: string;
};

export async function getCurrentEmployee(
  db: SupabaseClient,
): Promise<CurrentEmployee | null> {
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return null;

  const { data: employee } = await db
    .from("employees")
    .select("id, nama, email, role, branch_id")
    .eq("id", userData.user.id)
    .single();
  if (!employee) return null;

  return {
    id: employee.id,
    nama: employee.nama,
    email: employee.email,
    role: employee.role,
    branchId: employee.branch_id,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- session.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the login server action**

```typescript
// src/app/(auth)/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const db = await createServerSupabaseClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login?error=Akun%20tidak%20terhubung%20ke%20data%20karyawan");
  }

  redirect("/absen");
}
```

- [ ] **Step 6: Write the login page**

```typescript
// src/app/(auth)/login/page.tsx
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={login} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Masuk</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded border px-3 py-2 text-base"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm">Kata Sandi</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded border px-3 py-2 text-base"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white"
        >
          Masuk
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth src/app/\(auth\)
git commit -m "feat: login page, server action, and getCurrentEmployee session helper"
```

---

## Task 11: RBAC Middleware

**Files:**
- Create: `src/lib/auth/route-access.ts`
- Create: `src/lib/auth/route-access.test.ts`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `CurrentEmployee["role"]` type from Task 10.
- Produces: `resolveRouteAccess(pathname: string, role: Role | null): "allow" | "redirect-login" | "redirect-employee-home"` — pure function, fully unit-testable without a real request.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/route-access.test.ts
import { describe, it, expect } from "vitest";
import { resolveRouteAccess } from "./route-access";

describe("resolveRouteAccess", () => {
  it("redirects to login when there is no role and the path is protected", () => {
    expect(resolveRouteAccess("/absen", null)).toBe("redirect-login");
    expect(resolveRouteAccess("/dashboard", null)).toBe("redirect-login");
  });

  it("allows /login itself regardless of role", () => {
    expect(resolveRouteAccess("/login", null)).toBe("allow");
  });

  it("allows any authenticated role on employee routes", () => {
    for (const role of ["karyawan", "atasan", "hr_admin", "super_admin"] as const) {
      expect(resolveRouteAccess("/absen", role)).toBe("allow");
      expect(resolveRouteAccess("/cuti", role)).toBe("allow");
    }
  });

  it("blocks karyawan from admin routes and sends them to their employee home", () => {
    expect(resolveRouteAccess("/dashboard", "karyawan")).toBe("redirect-employee-home");
    expect(resolveRouteAccess("/karyawan", "karyawan")).toBe("redirect-employee-home");
  });

  it("allows atasan, hr_admin, and super_admin on admin routes", () => {
    for (const role of ["atasan", "hr_admin", "super_admin"] as const) {
      expect(resolveRouteAccess("/dashboard", role)).toBe("allow");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- route-access.test.ts
```

Expected: FAIL — `Cannot find module './route-access'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/auth/route-access.ts
export type Role = "karyawan" | "atasan" | "hr_admin" | "super_admin";
export type RouteAccessResult = "allow" | "redirect-login" | "redirect-employee-home";

const ADMIN_PATH_PREFIXES = ["/dashboard", "/karyawan", "/laporan", "/pengaturan", "/payroll"];
const PUBLIC_PATHS = ["/login"];

export function resolveRouteAccess(pathname: string, role: Role | null): RouteAccessResult {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return "allow";
  if (!role) return "redirect-login";

  const isAdminPath = ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminPath && role === "karyawan") return "redirect-employee-home";

  return "allow";
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- route-access.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Wire up `middleware.ts`**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveRouteAccess } from "@/lib/auth/route-access";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: userData } = await supabase.auth.getUser();
  let role: "karyawan" | "atasan" | "hr_admin" | "super_admin" | null = null;
  if (userData.user) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    role = employee?.role ?? null;
  }

  const decision = resolveRouteAccess(request.nextUrl.pathname, role);
  if (decision === "redirect-login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (decision === "redirect-employee-home") {
    return NextResponse.redirect(new URL("/absen", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/route-access.ts src/lib/auth/route-access.test.ts middleware.ts
git commit -m "feat: RBAC middleware blocking karyawan from admin routes"
```

---

## Task 12: Base Layout Shells (Employee & Admin)

**Files:**
- Create: `src/components/employee-shell.tsx`
- Create: `src/components/employee-shell.test.tsx`
- Create: `src/components/admin-shell.tsx`
- Create: `src/components/admin-shell.test.tsx`
- Create: `src/app/(employee)/layout.tsx`
- Create: `src/app/(admin)/layout.tsx`
- Modify: `tailwind.config.ts` or `src/app/globals.css` (design tokens)

**Interfaces:**
- Produces: `<EmployeeShell>{children}</EmployeeShell>` — bottom nav (Absen/Cuti/Riwayat/Profil), min 44×44px touch targets.
- Produces: `<AdminShell>{children}</AdminShell>` — sidebar nav (Dashboard/Karyawan/Cuti/Laporan/Pengaturan/Payroll).

- [ ] **Step 1: Add design tokens**

```css
/* src/app/globals.css — append */
:root {
  --color-brand: #2563eb; /* vibrant, high-saturation accent (spec §7.1/§8) */
  --color-neutral-50: #fafafa;
  --color-neutral-900: #171717;
}
```

- [ ] **Step 2: Write the failing test for `EmployeeShell`**

```typescript
// src/components/employee-shell.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeShell } from "./employee-shell";

describe("EmployeeShell", () => {
  it("renders bottom nav links with accessible names", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    for (const name of ["Absen", "Cuti", "Riwayat", "Profil"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("gives nav links the minimum touch target class", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    const absenLink = screen.getByRole("link", { name: "Absen" });
    expect(absenLink.className).toContain("min-h-11");
    expect(absenLink.className).toContain("min-w-11");
  });

  it("renders the page content", () => {
    render(<EmployeeShell><div>konten halaman</div></EmployeeShell>);
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- employee-shell.test.tsx
```

Expected: FAIL — `Cannot find module './employee-shell'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/components/employee-shell.tsx
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/absen", label: "Absen" },
  { href: "/cuti", label: "Cuti" },
  { href: "/riwayat", label: "Riwayat" },
  { href: "/profil", label: "Profil" },
];

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pb-16">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 flex border-t bg-white">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center py-2 text-base"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- employee-shell.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing test for `AdminShell`**

```typescript
// src/components/admin-shell.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  it("renders sidebar nav links with accessible names", () => {
    render(<AdminShell><div>content</div></AdminShell>);
    for (const name of ["Dashboard", "Karyawan", "Cuti", "Laporan", "Pengaturan", "Payroll"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("renders the page content", () => {
    render(<AdminShell><div>konten admin</div></AdminShell>);
    expect(screen.getByText("konten admin")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npm test -- admin-shell.test.tsx
```

Expected: FAIL — `Cannot find module './admin-shell'`.

- [ ] **Step 8: Write minimal implementation**

```typescript
// src/components/admin-shell.tsx
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/karyawan", label: "Karyawan" },
  { href: "/cuti", label: "Cuti" },
  { href: "/laporan", label: "Laporan" },
  { href: "/payroll", label: "Payroll" },
  { href: "/pengaturan", label: "Pengaturan" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4">
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
npm test -- admin-shell.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 10: Wire the shells into route group layouts**

```typescript
// src/app/(employee)/layout.tsx
import { EmployeeShell } from "@/components/employee-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <EmployeeShell>{children}</EmployeeShell>;
}
```

```typescript
// src/app/(admin)/layout.tsx
import { AdminShell } from "@/components/admin-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 11: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully` (note: routes under these layouts don't have `page.tsx` yet besides `/login`; that's fine — Plans 2–4 add the pages. If the build complains about an empty route group, add a placeholder `page.tsx` returning `null` under `src/app/(employee)/absen/page.tsx` and `src/app/(admin)/dashboard/page.tsx` so Task 13's manual smoke test has somewhere to land.)

```typescript
// src/app/(employee)/absen/page.tsx
export default function AbsenPage() {
  return <p className="p-4">Absen — coming in Plan 2.</p>;
}
```

```typescript
// src/app/(admin)/dashboard/page.tsx
export default function DashboardPage() {
  return <p>Dashboard — coming in Plan 3.</p>;
}
```

- [ ] **Step 12: Commit**

```bash
git add src/components/employee-shell.tsx src/components/employee-shell.test.tsx \
  src/components/admin-shell.tsx src/components/admin-shell.test.tsx \
  "src/app/(employee)" "src/app/(admin)" src/app/globals.css
git commit -m "feat: employee bottom-nav shell and admin sidebar shell with design tokens"
```

---

## Task 13: Seed Script (2 Super Admins + Base Branch)

**Files:**
- Create: `scripts/seed.ts`
- Create: `tests/integration/seed.test.ts`
- Modify: `package.json` (add `seed` script)

**Interfaces:**
- Produces: `npm run seed` — idempotent, creates one `branches` row ("Kantor Pusat"), one `work_schedules` row for it, and exactly two `super_admin` employees who are each other's `designated_approver_id` (satisfies the spec §5 "minimum 2 super admin" rule).

- [ ] **Step 1: Install `tsx` for running the script**

```bash
npm install -D tsx
```

- [ ] **Step 2: Add the `seed` script to `package.json`**

```json
"scripts": {
  "seed": "tsx scripts/seed.ts"
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// tests/integration/seed.test.ts
import { describe, it, expect } from "vitest";
import { runSeed } from "../../scripts/seed";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("runSeed", () => {
  it("creates exactly one Kantor Pusat branch and two super_admins, and is idempotent", async () => {
    await runSeed();
    await runSeed(); // run twice on purpose

    const db = createServiceRoleSupabaseClient();
    const { data: branches } = await db.from("branches").select("*").eq("nama", "Kantor Pusat");
    expect(branches).toHaveLength(1);

    const { data: admins } = await db
      .from("employees")
      .select("*")
      .eq("role", "super_admin")
      .eq("branch_id", branches![0].id);
    expect(admins).toHaveLength(2);
    expect(admins![0].designated_approver_id).toBe(admins![1].id);
    expect(admins![1].designated_approver_id).toBe(admins![0].id);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx supabase db reset
npm test -- seed.test.ts
```

Expected: FAIL — `Cannot find module '../../scripts/seed'`.

- [ ] **Step 5: Write minimal implementation**

```typescript
// scripts/seed.ts
import { createServiceRoleSupabaseClient } from "../src/lib/supabase/server";

export async function runSeed() {
  const db = createServiceRoleSupabaseClient();

  let { data: branch } = await db
    .from("branches")
    .select("*")
    .eq("nama", "Kantor Pusat")
    .maybeSingle();

  if (!branch) {
    const { data: created } = await db
      .from("branches")
      .insert({ nama: "Kantor Pusat", alamat: "-", lat: -6.2, long: 106.816 })
      .select()
      .single();
    branch = created;

    await db.from("work_schedules").insert({
      branch_id: branch!.id,
      jam_masuk: "09:00",
      jam_pulang: "17:00",
      hari_kerja: [1, 2, 3, 4, 5],
      toleransi_terlambat_menit: 15,
    });
  }

  const { data: existingAdmins } = await db
    .from("employees")
    .select("*")
    .eq("role", "super_admin")
    .eq("branch_id", branch!.id);

  if (existingAdmins && existingAdmins.length >= 2) return;

  const adminSeeds = [
    { email: "superadmin1@absensi-hr.local", nama: "Super Admin Satu" },
    { email: "superadmin2@absensi-hr.local", nama: "Super Admin Dua" },
  ];

  const createdIds: string[] = [];
  for (const seed of adminSeeds) {
    const { data: authUser } = await db.auth.admin.createUser({
      email: seed.email,
      password: "ChangeMe123!",
      email_confirm: true,
    });
    const { data: employee } = await db
      .from("employees")
      .insert({
        id: authUser!.user!.id,
        nama: seed.nama,
        email: seed.email,
        branch_id: branch!.id,
        jabatan: "Super Admin",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2026-01-01",
        role: "super_admin",
      })
      .select()
      .single();
    createdIds.push(employee!.id);
  }

  await db.from("employees").update({ designated_approver_id: createdIds[1] }).eq("id", createdIds[0]);
  await db.from("employees").update({ designated_approver_id: createdIds[0] }).eq("id", createdIds[1]);
}

if (require.main === module) {
  runSeed().then(() => {
    console.log("Seed complete.");
    process.exit(0);
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx supabase db reset
npm test -- seed.test.ts
```

Expected: PASS.

- [ ] **Step 7: Manual smoke test — log in as a seeded super admin**

```bash
npm run seed
npm run dev
```

Open `http://localhost:3000/login`, sign in with `superadmin1@absensi-hr.local` / `ChangeMe123!`. Expected: redirected to `/absen` (employee shell, bottom nav visible), and manually navigating to `/dashboard` succeeds (admin shell, sidebar visible) since this account is `super_admin`.

- [ ] **Step 8: Commit**

```bash
git add scripts/seed.ts tests/integration/seed.test.ts package.json package-lock.json
git commit -m "feat: idempotent seed script creating base branch and 2 mutually-approving super admins"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (route groups) → Task 1, 11, 12. §2 (data model) → Tasks 4–6. §3 (auth/RBAC) → Tasks 9–11. §4 (mobile-lock, geofencing, consent) → deferred to Plan 2 per spec's own module boundary, bucket/consent table provisioned here (Tasks 5, 8). §5 (self-approval, designated approver) → Task 7 (trigger) + Task 13 (2-super-admin seed); full leave workflow UI deferred to Plan 3. §7 (design tokens, touch targets) → Task 12. §8 (retention `expires_at` columns) → Task 5 (columns exist; the 90-day-write logic lands with the photo upload code in Plan 2). §8 non-functional (audit log table, RLS) → Tasks 6–7.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and an exact command with expected output.
- **Type consistency:** `Role` type (`"karyawan" | "atasan" | "hr_admin" | "super_admin"`) is identical across `session.ts`, `route-access.ts`, and `invite.ts`. `CurrentEmployee.branchId` (camelCase) is a deliberate mapping from the DB's `branch_id` (snake_case) — consistent at every call site.
