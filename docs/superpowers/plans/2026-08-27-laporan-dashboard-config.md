# Laporan Kehadiran + Dashboard Filter/Refresh + Departemen/Jadwal + Purge Foto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can pull a per-employee attendance recap for a chosen branch and date range and download it as CSV or PDF; the dashboard gains a branch filter and refreshes itself every 30 seconds; HR admins get management screens for departments and per-branch work schedules; and a nightly Edge Function purges attendance photos past their 90-day retention.

**Architecture:** The recap is pure logic (`src/lib/laporan/`) mirroring the payroll module — a data-loading function feeds `computeAttendanceRecap`, whose output serialises to CSV (a plain route handler, no `xlsx` dependency) or PDF (`@react-pdf/renderer`, already a dependency). The dashboard's existing `getTodaySummary(db, branchId)` already accepts a branch; this plan wires a `?branch=` searchParam to it and adds `getMonthlyTrend`'s missing `branchId` param, plus a small client component that pushes filter state into the URL and calls `router.refresh()` on a 30s interval. Departments/schedules are `is_hr_admin_role()`-gated CRUD screens under `/pengaturan/`, following the Plan 5 `/pengaturan/libur` pattern; migration `0024` tightens their RLS and enforces one `work_schedules` row per branch. The photo purge is a service-role Deno Edge Function scheduled via `pg_cron` (migration `0025`, with a documented dashboard-schedule fallback).

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, Route Handlers) · React 19.2 · TypeScript strict · `@supabase/supabase-js` · `@react-pdf/renderer` (existing) · Supabase Edge Functions (Deno) · Vitest + Testing Library · **no new npm dependencies**.

This is **Plan 6 of a 6-plan sequence — the final plan** — derived from `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` (§6, §10) and refined in `docs/superpowers/specs/2026-08-27-laporan-dashboard-config-design.md`. Plans 1–5 are complete (see `.superpowers/sdd/progress.md`). This completes the Fase 1+2 MVP.

## Global Constraints

- TypeScript strict. Package manager **npm**. `npm test` = fast unit suite; `npm run test:integration` = live-cloud suite.
- **Never return or render raw Postgres/PostgREST error text.** Every DB-touching Server Action / function / route: `console.error` the raw error, return a fixed Indonesian message. Map pattern: `src/app/(admin)/persetujuan-cuti/actions.ts`.
- **Hour/minute extraction from a timestamp is pinned to Asia/Jakarta** — import `jakartaMinutesOfDay` / `scheduleMinutes` from `src/lib/payroll/minutes.ts`. **Never** `Date.prototype.getHours()`/`getMinutes()`, `date.toISOString().slice(...)`, or `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` without an explicit `timeZone: "Asia/Jakarta"`. Date-only values may parse as UTC midnight (`new Date("YYYY-MM-DDT00:00:00Z")`) and compare/diff — the pattern in `src/lib/leave/balance.ts`.
- **Every mutation Server Action gates the caller at the top:** `const db = await createServerSupabaseClient(); const me = await getCurrentEmployee(db); if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) return { ok: false, error: "Tidak diizinkan." };` — the `assertHrAdmin` pattern from Plan 5. RLS is the second layer.
- **Delete via an action uses `.delete().eq(...).select("id")`** and treats an empty result array as failure/forbidden — `{ ok: false, error: "<...> atau Anda tidak berhak." }` (Plan 5 M1: an RLS-filtered delete returns no error and 0 rows, and would otherwise report `{ ok: true }` falsely). See `src/app/(admin)/pengaturan/libur/actions.ts` `deleteHoliday`.
- **Reads for `/laporan` and its export routes use the user-scoped client** (`createServerSupabaseClient()`) — RLS `attendances_select` / `employees_select` (both `is_admin_role()`) does the scoping. **Service-role is used ONLY by the `purge-expired-photos` Edge Function.**
- `Role` type: import from `@/lib/auth/route-access` — never redefine.
- Icons: inline stroke-based SVG, never emoji. Admin pages follow `src/app/(admin)/dashboard/page.tsx` / `payroll/page.tsx` / `karyawan/page.tsx` conventions: `getCurrentEmployee` + `redirect("/login")`, result-union rendering `{x.ok ? … : <p className="text-sm text-red-600">{x.error}</p>}`, distinct error vs empty states.
- To-one PostgREST embeds (`branches(nama)`) are mis-inferred as arrays — use `as unknown as { nama: string } | null` (Plan 4/5 precedent).
- `@react-pdf/renderer` route handlers are `route.tsx`, declare `export const runtime = "nodejs"`, and wrap `renderToBuffer` in `try/catch` (returning a fixed 500 string) — the pattern in `src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx`.
- `work_schedules.hari_kerja` is `integer[]` using the JS `getUTCDay()` convention (0 = Sunday … 6 = Saturday), confirmed against `scripts/seed.ts` and the payroll module.
- Supabase is a linked **cloud** project. Migrations apply via `npx supabase db push`, **never** `supabase db reset` / `truncate` / `delete from` on live data. Export the token first: `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. Last migration: `0023_audit_delete_null_target.sql`. This plan: `0024`, `0025`.
- `/laporan` is already in `ADMIN_PATH_PREFIXES` and NOT in `HR_ADMIN_PATH_PREFIXES` — atasan may access it (reporting tier). No `route-access.ts` change.
- `/laporan` **requires a `cabang` to be selected** (default: the first branch alphabetically) so a single `work_schedule` is unambiguous.
- `getTodaySummary(db, branchId?)` and (after Task 8) `getMonthlyTrend(db, yearMonth, branchId?)` already/also branch-scope via the `employees!inner(branch_id)` + `.eq("employees.branch_id", …)` embed-filter pattern (see `src/lib/dashboard/attendance-summary.ts`) — `attendances` has no `branch_id` column of its own.

---

## Task 1: Migration 0024 — departemen/jadwal RLS + one schedule per branch

**Files:**
- Create: `supabase/migrations/0024_reporting_config_rls.sql`
- Create: `tests/integration/reporting-config-rls.test.ts`

**Interfaces:**
- Produces: `departments_write` + `work_schedules_write` policies now `is_hr_admin_role()`; `work_schedules` gains `unique (branch_id)` (constraint name `work_schedules_branch_id_key`).
- Consumed by: Task 10 (`saveSchedule` upserts `onConflict: "branch_id"`), Task 9 (`addDepartment`/`deleteDepartment`).

**Prerequisite:** Export `SUPABASE_ACCESS_TOKEN`. Apply via `npx supabase db push`. **Never** `db reset`.

- [ ] **Step 1: Check for duplicate work_schedules rows before writing the constraint**

Run this against the live DB (via the Supabase SQL editor, or a throwaway `npx tsx` script using `createServiceRoleSupabaseClient()` and `.from("work_schedules").select("branch_id")` then group in JS):

```sql
select branch_id, count(*) from work_schedules group by branch_id having count(*) > 1;
```

Expected: **0 rows.** If any branch has >1 schedule, STOP and report to the human which branch and which schedule rows exist — the `unique` constraint cannot be added until the duplicates are resolved.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/0024_reporting_config_rls.sql
--
-- Plan 6.
--   1. departments_write / work_schedules_write were is_admin_role() (0005),
--      which 0009 widened to include `atasan`. Tighten to is_hr_admin_role()
--      for consistency with holidays_write (0018), /karyawan, /payroll. The
--      SELECT policies stay `authenticated` — everyone needs to read the
--      schedule/departments for their own screens.
--   2. work_schedules has always been effectively one-row-per-branch (the app
--      reads it with .limit(1).maybeSingle()). The new /pengaturan/jadwal
--      screen upserts on branch_id, which needs a unique constraint. Verified
--      no live duplicates before writing this (see Step 1).

drop policy departments_write on departments;
create policy departments_write on departments
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

drop policy work_schedules_write on work_schedules;
create policy work_schedules_write on work_schedules
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

alter table work_schedules add constraint work_schedules_branch_id_key unique (branch_id);
```

- [ ] **Step 3: Write the failing integration test**

```typescript
// tests/integration/reporting-config-rls.test.ts
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

describe("reporting-config RLS (0024)", () => {
  let branchId: string;
  let atasan: { id: string; email: string };
  let hrAdmin: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches").insert({ nama: `Cabang Config ${suffix}`, lat: -6.2, long: 106.8 })
      .select().single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.cfg.${suffix}@test.local`, role: "atasan" },
      { key: "hrAdmin", email: `hradmin.cfg.${suffix}@test.local`, role: "hr_admin" },
    ] as const;
    const ids: Record<string, string> = {};
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      ids[s.key] = u!.user!.id;
      await db.from("employees").insert({
        id: ids[s.key], nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    hrAdmin = { id: ids.hrAdmin, email: seeds[1].email };
  });

  it("blocks an atasan from inserting a department", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("departments").insert({ branch_id: branchId, nama: `Dept ${suffix}` });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("lets an hr_admin insert a department", async () => {
    const client = await signInAs(hrAdmin.email);
    const { error } = await client.from("departments").insert({ branch_id: branchId, nama: `Dept HR ${suffix}` });
    expect(error).toBeNull();
  });

  it("blocks an atasan from updating a work schedule", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.from("work_schedules").insert({
      branch_id: branchId, jam_masuk: "09:00", jam_pulang: "17:00", hari_kerja: [1, 2, 3, 4, 5], toleransi_terlambat_menit: 15,
    });
    const client = await signInAs(atasan.email);
    const { error } = await client.from("work_schedules").update({ toleransi_terlambat_menit: 99 }).eq("branch_id", branchId);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("rejects a second work_schedules row for the same branch", async () => {
    const db = createServiceRoleSupabaseClient();
    const { error } = await db.from("work_schedules").insert({
      branch_id: branchId, jam_masuk: "08:00", jam_pulang: "16:00", hari_kerja: [1], toleransi_terlambat_menit: 0,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505"); // unique_violation
  });
});
```

- [ ] **Step 4: Run to verify it fails**

```bash
npm run test:integration -- reporting-config-rls.test.ts
```

Expected: FAIL — atasan writes succeed (no `is_hr_admin_role()` yet), second schedule insert succeeds (no unique constraint).

- [ ] **Step 5: Apply the migration and re-run**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
npm run test:integration -- reporting-config-rls.test.ts
```

Expected: PASS (4 tests). (If `db push` needs `--include-all` because `0020` is out of numeric order — that is a known consequence of Plan 5's renumbering; check the diff first, then proceed.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0024_reporting_config_rls.sql tests/integration/reporting-config-rls.test.ts
git commit -m "feat(db): hr_admin-only departemen/jadwal writes + one schedule per branch"
```

---

## Task 2: `computeAttendanceRecap`

**Files:**
- Create: `src/lib/laporan/attendance-recap.ts`
- Create: `src/lib/laporan/attendance-recap.test.ts`

**Interfaces:**
- Consumes: `jakartaMinutesOfDay`, `scheduleMinutes` from `@/lib/payroll/minutes`.
- Produces: types `RecapEmployee`, `RecapAttendanceRow`, `RecapLeave`, `RecapSchedule`, `RecapRow` and `computeAttendanceRecap(input): RecapRow[]` (signatures below).
- Consumed by: Task 4 (`load-recap`), Task 6 (CSV/PDF).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/laporan/attendance-recap.test.ts
import { describe, it, expect } from "vitest";
import { computeAttendanceRecap, type RecapAttendanceRow } from "./attendance-recap";

const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5] };

function attMap(rows: (RecapAttendanceRow & { employee_id: string })[]) {
  const byEmp = new Map<string, Map<string, RecapAttendanceRow>>();
  for (const r of rows) {
    const m = byEmp.get(r.employee_id) ?? new Map();
    m.set(r.tanggal, r);
    byEmp.set(r.employee_id, m);
  }
  return byEmp;
}

describe("computeAttendanceRecap", () => {
  it("counts each status into its bucket and sums late minutes (Jakarta-pinned)", () => {
    // 2026-08-03..2026-08-07 = Mon..Fri = 5 working days.
    const rows = [
      { employee_id: "e1", tanggal: "2026-08-03", status: "tepat_waktu", jam_masuk: "2026-08-03T02:00:00Z" },
      { employee_id: "e1", tanggal: "2026-08-04", status: "terlambat", jam_masuk: "2026-08-04T02:25:00Z" }, // 09:25 WIB -> 10 late min past tolerance
      { employee_id: "e1", tanggal: "2026-08-05", status: "pulang_cepat", jam_masuk: "2026-08-05T02:00:00Z" },
      { employee_id: "e1", tanggal: "2026-08-06", status: "di_luar_lokasi", jam_masuk: "2026-08-06T02:00:00Z" },
      // 2026-08-07 has no row -> alpa
    ];
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-07",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: attMap(rows),
      approvedLeavesByEmployee: new Map(),
    });
    expect(recap).toMatchObject({
      employeeId: "e1", nama: "Budi",
      hadir: 1, terlambat: 1, pulangCepat: 1, diLuarLokasi: 1, alpa: 1, cuti: 0, lain: 0,
      totalMenitTerlambat: 10, hariKerjaEfektif: 5,
    });
    expect(recap.hadir + recap.terlambat + recap.pulangCepat + recap.diLuarLokasi + recap.alpa + recap.cuti + recap.lain)
      .toBe(recap.hariKerjaEfektif);
  });

  it("excludes holidays and pre-join days from hariKerjaEfektif", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-07",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-08-05" }],
      schedule: SCHEDULE,
      holidayDates: ["2026-08-06"],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map(),
    });
    // Aug 5, 7 are the only counted days (6 = holiday, 3-4 = pre-join). Both alpa.
    expect(recap.hariKerjaEfektif).toBe(2);
    expect(recap.alpa).toBe(2);
  });

  it("counts approved-leave days as cuti, not alpa", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-07",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map([["e1", [{ employeeId: "e1", tanggalMulai: "2026-08-03", tanggalSelesai: "2026-08-04" }]]]),
    });
    expect(recap.cuti).toBe(2);
    expect(recap.alpa).toBe(3);
  });

  it("routes an unknown status to `lain`, never to alpa", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-03",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE, holidayDates: [],
      attendancesByEmployee: attMap([{ employee_id: "e1", tanggal: "2026-08-03", status: "cuti_massal", jam_masuk: null }]),
      approvedLeavesByEmployee: new Map(),
    });
    expect(recap.lain).toBe(1);
    expect(recap.alpa).toBe(0);
  });

  it("is timezone-independent for late minutes", () => {
    const original = process.env.TZ;
    try {
      const run = () => computeAttendanceRecap({
        from: "2026-08-04", to: "2026-08-04",
        employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
        schedule: SCHEDULE, holidayDates: [],
        attendancesByEmployee: attMap([{ employee_id: "e1", tanggal: "2026-08-04", status: "terlambat", jam_masuk: "2026-08-04T02:25:00Z" }]),
        approvedLeavesByEmployee: new Map(),
      })[0].totalMenitTerlambat;
      process.env.TZ = "America/New_York";
      expect(run()).toBe(10);
      process.env.TZ = "Pacific/Kiritimati";
      expect(run()).toBe(10);
    } finally {
      process.env.TZ = original;
    }
  });

  it("returns an empty-but-shaped row for an employee with no data and no working days", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-01", to: "2026-08-02", // Sat, Sun
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE, holidayDates: [],
      attendancesByEmployee: new Map(), approvedLeavesByEmployee: new Map(),
    });
    expect(recap).toMatchObject({ hariKerjaEfektif: 0, hadir: 0, alpa: 0, cuti: 0, totalMenitTerlambat: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- attendance-recap.test.ts
```

Expected: FAIL — `Cannot find module './attendance-recap'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/laporan/attendance-recap.ts
import { jakartaMinutesOfDay, scheduleMinutes } from "@/lib/payroll/minutes";

export type RecapEmployee = { id: string; nama: string; tanggalMulaiKerja: string | null };
export type RecapAttendanceRow = { tanggal: string; status: string; jam_masuk: string | null };
export type RecapLeave = { employeeId: string; tanggalMulai: string; tanggalSelesai: string };
export type RecapSchedule = { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[] };

export type RecapRow = {
  employeeId: string;
  nama: string;
  hadir: number;
  terlambat: number;
  pulangCepat: number;
  diLuarLokasi: number;
  alpa: number;
  cuti: number;
  lain: number;
  totalMenitTerlambat: number;
  hariKerjaEfektif: number;
};

// Every date string in [from, to] inclusive.
function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start.getTime(); d <= end.getTime(); d += 24 * 60 * 60 * 1000) {
    out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

function leaveCovers(leaves: RecapLeave[], tanggal: string): boolean {
  return leaves.some((lv) => tanggal >= lv.tanggalMulai && tanggal <= lv.tanggalSelesai);
}

export function computeAttendanceRecap(input: {
  from: string;
  to: string;
  employees: RecapEmployee[];
  schedule: RecapSchedule;
  holidayDates: string[];
  attendancesByEmployee: Map<string, Map<string, RecapAttendanceRow>>;
  approvedLeavesByEmployee: Map<string, RecapLeave[]>;
}): RecapRow[] {
  const { from, to, employees, schedule, holidayDates, attendancesByEmployee, approvedLeavesByEmployee } = input;
  const holidays = new Set(holidayDates);
  const workingDow = new Set(schedule.hariKerja);
  const lateThreshold = scheduleMinutes(schedule.jamMasuk) + schedule.toleransiMenit;
  const allDates = datesInRange(from, to);

  return employees.map((emp) => {
    const attendance = attendancesByEmployee.get(emp.id) ?? new Map<string, RecapAttendanceRow>();
    const leaves = approvedLeavesByEmployee.get(emp.id) ?? [];

    const row: RecapRow = {
      employeeId: emp.id, nama: emp.nama,
      hadir: 0, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0, alpa: 0, cuti: 0, lain: 0,
      totalMenitTerlambat: 0, hariKerjaEfektif: 0,
    };

    for (const tanggal of allDates) {
      const dow = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
      if (!workingDow.has(dow)) continue;
      if (holidays.has(tanggal)) continue;
      if (emp.tanggalMulaiKerja && tanggal < emp.tanggalMulaiKerja) continue;

      row.hariKerjaEfektif += 1;

      if (leaveCovers(leaves, tanggal)) {
        row.cuti += 1;
        continue;
      }
      const att = attendance.get(tanggal);
      if (!att) {
        row.alpa += 1;
        continue;
      }
      switch (att.status) {
        case "tepat_waktu":
          row.hadir += 1;
          break;
        case "terlambat":
          row.terlambat += 1;
          if (att.jam_masuk) {
            row.totalMenitTerlambat += Math.max(0, jakartaMinutesOfDay(att.jam_masuk) - lateThreshold);
          }
          break;
        case "pulang_cepat":
          row.pulangCepat += 1;
          break;
        case "di_luar_lokasi":
          row.diLuarLokasi += 1;
          break;
        case "alpa":
          row.alpa += 1;
          break;
        default:
          row.lain += 1;
      }
    }

    return row;
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- attendance-recap.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/laporan/attendance-recap.ts src/lib/laporan/attendance-recap.test.ts
git commit -m "feat(laporan): per-employee attendance recap computation"
```

---

## Task 3: `recapToCsv`

**Files:**
- Create: `src/lib/laporan/recap-csv.ts`
- Create: `src/lib/laporan/recap-csv.test.ts`

**Interfaces:**
- Consumes: `RecapRow` (Task 2).
- Produces: `recapToCsv(rows: RecapRow[]): string` — a UTF-8 CSV string with a BOM, CRLF line endings, RFC-4180 quoting.
- Consumed by: Task 6 (CSV route).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/laporan/recap-csv.test.ts
import { describe, it, expect } from "vitest";
import { recapToCsv } from "./recap-csv";
import type { RecapRow } from "./attendance-recap";

const row = (over: Partial<RecapRow>): RecapRow => ({
  employeeId: "e1", nama: "Budi", hadir: 20, terlambat: 1, pulangCepat: 0, diLuarLokasi: 0,
  alpa: 0, cuti: 1, lain: 0, totalMenitTerlambat: 12, hariKerjaEfektif: 22, ...over,
});

describe("recapToCsv", () => {
  it("emits a BOM, a header row, and one CRLF-terminated data row per input", () => {
    const csv = recapToCsv([row({})]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Nama,Hadir,Terlambat,Pulang Cepat,Di Luar Lokasi,Alpa,Cuti,Menit Terlambat,Hari Kerja Efektif");
    expect(lines[1]).toBe("Budi,20,1,0,0,0,1,12,22");
    expect(lines[2]).toBe(""); // trailing CRLF
  });

  it("quotes a name containing a comma and doubles inner quotes", () => {
    const csv = recapToCsv([row({ nama: 'Budi, "BS"' })]);
    const dataLine = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(dataLine.startsWith('"Budi, ""BS""",')).toBe(true);
  });

  it("quotes a name containing a newline", () => {
    const csv = recapToCsv([row({ nama: "Budi\nSantoso" })]);
    expect(csv).toContain('"Budi\nSantoso"');
  });

  it("returns just the header + BOM for no rows", () => {
    const csv = recapToCsv([]);
    expect(csv.replace(/^﻿/, "")).toBe("Nama,Hadir,Terlambat,Pulang Cepat,Di Luar Lokasi,Alpa,Cuti,Menit Terlambat,Hari Kerja Efektif\r\n");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- recap-csv.test.ts
```

Expected: FAIL — `Cannot find module './recap-csv'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/laporan/recap-csv.ts
import type { RecapRow } from "./attendance-recap";

const HEADER = [
  "Nama", "Hadir", "Terlambat", "Pulang Cepat", "Di Luar Lokasi",
  "Alpa", "Cuti", "Menit Terlambat", "Hari Kerja Efektif",
];

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function recapToCsv(rows: RecapRow[]): string {
  const lines = [HEADER.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.nama, r.hadir, r.terlambat, r.pulangCepat, r.diLuarLokasi,
        r.alpa, r.cuti, r.totalMenitTerlambat, r.hariKerjaEfektif,
      ].map(csvField).join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- recap-csv.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/laporan/recap-csv.ts src/lib/laporan/recap-csv.test.ts
git commit -m "feat(laporan): RFC-4180 CSV serialisation of the recap"
```

---

## Task 4: `load-recap` — assemble recap data from the DB

**Files:**
- Create: `src/lib/laporan/load-recap.ts`
- Create: `src/lib/laporan/load-recap.test.ts`

**Interfaces:**
- Consumes: `computeAttendanceRecap` + its types (Task 2), a `SupabaseClient`.
- Produces: `type RecapFilters = { branchId: string; departmentId?: string | null; from: string; to: string }`.
- Produces: `type LoadRecapResult = { ok: true; rows: RecapRow[]; branchNama: string } | { ok: false; error: string }`.
- Produces: `loadRecap(db: SupabaseClient, filters: RecapFilters): Promise<LoadRecapResult>`.
- Consumed by: Task 5 (`/laporan` page), Task 6 (CSV + PDF routes).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/laporan/load-recap.test.ts
import { describe, it, expect, vi } from "vitest";
import { loadRecap } from "./load-recap";

// Thenable query-builder mock (same shape as payroll/actions.test.ts).
function q(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "in", "is", "order", "limit", "or"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result);
  b.single = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

const FILTERS = { branchId: "b1", from: "2026-08-03", to: "2026-08-07" };

function makeDb(tables: Record<string, unknown>) {
  return { from: vi.fn((t: string) => tables[t]) } as never;
}

describe("loadRecap", () => {
  it("returns an error if the branch is not found", async () => {
    const db = makeDb({ branches: q({ data: null, error: null }) });
    const result = await loadRecap(db, FILTERS);
    expect(result).toEqual({ ok: false, error: "Cabang tidak ditemukan." });
  });

  it("returns an error if a data query fails", async () => {
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: null, error: { message: "boom" } }),
    });
    const result = await loadRecap(db, FILTERS);
    expect(result).toEqual({ ok: false, error: "Gagal memuat data laporan." });
  });

  it("returns an error if the branch has no work schedule", async () => {
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: null, error: null }),
      employees: q({ data: [], error: null }),
      holidays: q({ data: [], error: null }),
      attendances: q({ data: [], error: null }),
      leave_requests: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, FILTERS);
    expect(result).toEqual({ ok: false, error: "Cabang ini belum punya jadwal kerja." });
  });

  it("computes a recap for a happy path", async () => {
    const db = makeDb({
      branches: q({ data: { nama: "Kantor Pusat" }, error: null }),
      work_schedules: q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }, error: null }),
      employees: q({ data: [{ id: "e1", nama: "Budi", tanggal_mulai_kerja: "2026-01-01" }], error: null }),
      holidays: q({ data: [], error: null }),
      attendances: q({ data: [{ employee_id: "e1", tanggal: "2026-08-03", status: "tepat_waktu", jam_masuk: "2026-08-03T02:00:00Z" }], error: null }),
      leave_requests: q({ data: [], error: null }),
    });
    const result = await loadRecap(db, FILTERS);
    expect(result).toMatchObject({ ok: true, branchNama: "Kantor Pusat" });
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ nama: "Budi", hadir: 1, alpa: 4, hariKerjaEfektif: 5 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- load-recap.test.ts
```

Expected: FAIL — `Cannot find module './load-recap'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/laporan/load-recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAttendanceRecap,
  type RecapRow,
  type RecapAttendanceRow,
  type RecapLeave,
} from "./attendance-recap";

export type RecapFilters = {
  branchId: string;
  departmentId?: string | null;
  from: string;
  to: string;
};

export type LoadRecapResult =
  | { ok: true; rows: RecapRow[]; branchNama: string }
  | { ok: false; error: string };

export async function loadRecap(
  db: SupabaseClient,
  filters: RecapFilters,
): Promise<LoadRecapResult> {
  const { branchId, departmentId, from, to } = filters;

  const { data: branch, error: branchErr } = await db
    .from("branches").select("nama").eq("id", branchId).maybeSingle();
  if (branchErr) {
    console.error("loadRecap: branch lookup failed", branchErr);
    return { ok: false, error: "Gagal memuat data laporan." };
  }
  if (!branch) return { ok: false, error: "Cabang tidak ditemukan." };

  let employeeQuery = db
    .from("employees")
    .select("id, nama, tanggal_mulai_kerja")
    .eq("branch_id", branchId)
    .eq("status", "aktif")
    .order("nama");
  if (departmentId) employeeQuery = employeeQuery.eq("department_id", departmentId);

  const [scheduleRes, employeesRes, holidaysRes] = await Promise.all([
    db.from("work_schedules")
      .select("jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja")
      .eq("branch_id", branchId).limit(1).maybeSingle(),
    employeeQuery,
    db.from("holidays").select("tanggal")
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .gte("tanggal", from).lte("tanggal", to),
  ]);

  if (scheduleRes.error || employeesRes.error || holidaysRes.error) {
    console.error("loadRecap: reference data query failed", {
      schedule: scheduleRes.error, employees: employeesRes.error, holidays: holidaysRes.error,
    });
    return { ok: false, error: "Gagal memuat data laporan." };
  }
  if (!scheduleRes.data) return { ok: false, error: "Cabang ini belum punya jadwal kerja." };

  const employees = (employeesRes.data ?? []) as { id: string; nama: string; tanggal_mulai_kerja: string | null }[];
  const employeeIds = employees.map((e) => e.id);

  const [attendanceRes, leaveRes] = await Promise.all([
    employeeIds.length
      ? db.from("attendances")
          .select("employee_id, tanggal, status, jam_masuk")
          .in("employee_id", employeeIds).gte("tanggal", from).lte("tanggal", to)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? db.from("leave_requests")
          .select("employee_id, tanggal_mulai, tanggal_selesai")
          .eq("status", "approved").in("employee_id", employeeIds)
          .lte("tanggal_mulai", to).gte("tanggal_selesai", from)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (attendanceRes.error || leaveRes.error) {
    console.error("loadRecap: attendance/leave query failed", {
      attendance: attendanceRes.error, leave: leaveRes.error,
    });
    return { ok: false, error: "Gagal memuat data laporan." };
  }

  const attendancesByEmployee = new Map<string, Map<string, RecapAttendanceRow>>();
  for (const r of (attendanceRes.data ?? []) as { employee_id: string; tanggal: string; status: string; jam_masuk: string | null }[]) {
    const m = attendancesByEmployee.get(r.employee_id) ?? new Map();
    m.set(r.tanggal, { tanggal: r.tanggal, status: r.status, jam_masuk: r.jam_masuk });
    attendancesByEmployee.set(r.employee_id, m);
  }

  const approvedLeavesByEmployee = new Map<string, RecapLeave[]>();
  for (const r of (leaveRes.data ?? []) as { employee_id: string; tanggal_mulai: string; tanggal_selesai: string }[]) {
    const list = approvedLeavesByEmployee.get(r.employee_id) ?? [];
    list.push({ employeeId: r.employee_id, tanggalMulai: r.tanggal_mulai, tanggalSelesai: r.tanggal_selesai });
    approvedLeavesByEmployee.set(r.employee_id, list);
  }

  const rows = computeAttendanceRecap({
    from, to,
    employees: employees.map((e) => ({ id: e.id, nama: e.nama, tanggalMulaiKerja: e.tanggal_mulai_kerja })),
    schedule: {
      jamMasuk: scheduleRes.data.jam_masuk,
      jamPulang: scheduleRes.data.jam_pulang,
      toleransiMenit: scheduleRes.data.toleransi_terlambat_menit,
      hariKerja: scheduleRes.data.hari_kerja,
    },
    holidayDates: ((holidaysRes.data ?? []) as { tanggal: string }[]).map((h) => h.tanggal),
    attendancesByEmployee,
    approvedLeavesByEmployee,
  });

  return { ok: true, rows, branchNama: (branch as { nama: string }).nama };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- load-recap.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/laporan/load-recap.ts src/lib/laporan/load-recap.test.ts
git commit -m "feat(laporan): assemble recap data from the DB (shared by page + exports)"
```

---

## Task 5: `/laporan` page

**Files:**
- Create: `src/app/(admin)/laporan/page.tsx`
- Create: `src/app/(admin)/laporan/laporan-filters.tsx`
- Create: `src/app/(admin)/laporan/laporan-filters.test.tsx`

**Interfaces:**
- Consumes: `loadRecap` + `RecapFilters` (Task 4), `getCurrentEmployee` / `createServerSupabaseClient` (Foundation).
- Produces: `<LaporanFilters branches={{id,nama}[]} departments={{id,nama,branchId}[]} defaults={{ cabang: string; dept: string; dari: string; sampai: string }} />` — a client form that pushes `cabang`/`dept`/`dari`/`sampai` into the URL query.

- [ ] **Step 1: Write the failing test for the filters**

```typescript
// src/app/(admin)/laporan/laporan-filters.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { LaporanFilters } from "./laporan-filters";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }, { id: "b2", nama: "Cabang B" }];
const DEPTS = [{ id: "d1", nama: "Operasional", branchId: "b1" }];

describe("LaporanFilters", () => {
  it("renders cabang / departemen / dari / sampai controls", () => {
    render(<LaporanFilters branches={BRANCHES} departments={DEPTS} defaults={{ cabang: "b1", dept: "", dari: "2026-08-01", sampai: "2026-08-31" }} />);
    expect(screen.getByLabelText(/cabang/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/departemen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dari/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sampai/i)).toBeInTheDocument();
  });

  it("pushes the full query string when cabang changes", () => {
    push.mockClear();
    render(<LaporanFilters branches={BRANCHES} departments={DEPTS} defaults={{ cabang: "b1", dept: "", dari: "2026-08-01", sampai: "2026-08-31" }} />);
    fireEvent.change(screen.getByLabelText(/cabang/i), { target: { value: "b2" } });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("cabang=b2"));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("dari=2026-08-01"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- laporan-filters.test.tsx
```

Expected: FAIL — `Cannot find module './laporan-filters'`.

- [ ] **Step 3: Write the filters component**

```tsx
// src/app/(admin)/laporan/laporan-filters.tsx
"use client";

import { useRouter } from "next/navigation";

type Defaults = { cabang: string; dept: string; dari: string; sampai: string };

export function LaporanFilters({
  branches, departments, defaults,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string; branchId: string }[];
  defaults: Defaults;
}) {
  const router = useRouter();

  function pushWith(over: Partial<Defaults>) {
    const next = { ...defaults, ...over };
    const params = new URLSearchParams();
    params.set("cabang", next.cabang);
    if (next.dept) params.set("dept", next.dept);
    params.set("dari", next.dari);
    params.set("sampai", next.sampai);
    router.push(`/laporan?${params.toString()}`);
  }

  const deptOptions = departments.filter((d) => d.branchId === defaults.cabang);

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); pushWith({}); }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="cabang" className="text-sm text-neutral-700">Cabang</label>
        <select id="cabang" defaultValue={defaults.cabang} onChange={(e) => pushWith({ cabang: e.target.value, dept: "" })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dept" className="text-sm text-neutral-700">Departemen</label>
        <select id="dept" defaultValue={defaults.dept} onChange={(e) => pushWith({ dept: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Semua departemen</option>
          {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dari" className="text-sm text-neutral-700">Dari</label>
        <input id="dari" type="date" defaultValue={defaults.dari} onChange={(e) => pushWith({ dari: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="sampai" className="text-sm text-neutral-700">Sampai</label>
        <input id="sampai" type="date" defaultValue={defaults.sampai} onChange={(e) => pushWith({ sampai: e.target.value })}
          className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <button type="submit" className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white">Terapkan</button>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- laporan-filters.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the page**

```tsx
// src/app/(admin)/laporan/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { loadRecap } from "@/lib/laporan/load-recap";
import { LaporanFilters } from "./laporan-filters";

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ cabang?: string; dept?: string; dari?: string; sampai?: string }>;
}) {
  const sp = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  // `/laporan` is in ADMIN_PATH_PREFIXES (src/lib/auth/route-access.ts) so the
  // middleware already redirects `karyawan` to employee-home; the dashboard
  // page uses the same minimal `!employee` guard. No role check here.

  const { data: branches, error: branchErr } = await db.from("branches").select("id, nama").order("nama");
  if (branchErr) console.error("laporan: branches query failed", branchErr);
  const branchList = branches ?? [];

  const { data: departments } = await db.from("departments").select("id, nama, branch_id").order("nama");
  const deptList = (departments ?? []).map((d) => ({ id: d.id, nama: d.nama, branchId: d.branch_id }));

  const today = toJakartaDateOnly(new Date());
  const defaultCabang = sp.cabang || branchList[0]?.id || "";
  const dari = sp.dari || `${today.slice(0, 7)}-01`;
  const sampai = sp.sampai || today;

  const queryString = new URLSearchParams({ cabang: defaultCabang, ...(sp.dept ? { dept: sp.dept } : {}), dari, sampai }).toString();

  const recap = defaultCabang
    ? await loadRecap(db, { branchId: defaultCabang, departmentId: sp.dept || null, from: dari, to: sampai })
    : ({ ok: false, error: "Belum ada cabang." } as const);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Laporan Kehadiran</h1>
          <p className="mt-1 text-sm text-neutral-500">Rekap per karyawan untuk rentang tanggal terpilih.</p>
        </div>
        {recap.ok && (
          <div className="flex gap-2">
            <a href={`/laporan/csv?${queryString}`} className="min-h-10 rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800">Unduh CSV</a>
            <a href={`/laporan/pdf?${queryString}`} className="min-h-10 rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800">Unduh PDF</a>
          </div>
        )}
      </div>

      <LaporanFilters
        branches={branchList}
        departments={deptList}
        defaults={{ cabang: defaultCabang, dept: sp.dept ?? "", dari, sampai }}
      />

      {!recap.ok && <p className="text-sm text-red-600">{recap.error}</p>}
      {recap.ok && recap.rows.length === 0 && (
        <p className="text-sm text-neutral-500">Tidak ada karyawan aktif untuk filter ini.</p>
      )}
      {recap.ok && recap.rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Hadir</th>
                <th className="px-4 py-2 font-medium">Terlambat</th>
                <th className="px-4 py-2 font-medium">Pulang Cepat</th>
                <th className="px-4 py-2 font-medium">Di Luar Lokasi</th>
                <th className="px-4 py-2 font-medium">Alpa</th>
                <th className="px-4 py-2 font-medium">Cuti</th>
                <th className="px-4 py-2 font-medium">Menit Terlambat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {recap.rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2 font-medium text-neutral-900">{r.nama}</td>
                  <td className="px-4 py-2">{r.hadir}</td>
                  <td className="px-4 py-2">{r.terlambat}</td>
                  <td className="px-4 py-2">{r.pulangCepat}</td>
                  <td className="px-4 py-2">{r.diLuarLokasi}</td>
                  <td className="px-4 py-2 text-red-600">{r.alpa}</td>
                  <td className="px-4 py-2">{r.cuti}</td>
                  <td className="px-4 py-2">{r.totalMenitTerlambat}</td>
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

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`, `/laporan` listed.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/laporan/page.tsx" "src/app/(admin)/laporan/laporan-filters.tsx" "src/app/(admin)/laporan/laporan-filters.test.tsx"
git commit -m "feat(laporan): /laporan page with branch/department/date filters"
```

---

## Task 6: CSV + PDF export routes

**Files:**
- Create: `src/app/(admin)/laporan/csv/route.ts`
- Create: `src/components/recap-document.tsx`
- Create: `src/app/(admin)/laporan/pdf/route.tsx`
- Create: `tests/integration/laporan-export.test.ts`

**Interfaces:**
- Consumes: `loadRecap` (Task 4), `recapToCsv` (Task 3), `getCurrentEmployee` / `createServerSupabaseClient`, `@react-pdf/renderer`.
- Produces: `GET /laporan/csv?cabang&dept&dari&sampai` → `text/csv`; `GET /laporan/pdf?...` → `application/pdf`. Both 400 on missing `cabang`/`dari`/`sampai`, redirect/403 for a non-admin (RLS-backed).
- Produces: `<RecapDocument data={{ branchNama: string; from: string; to: string; rows: RecapRow[] }} />`.

- [ ] **Step 1: Write the CSV route**

```typescript
// src/app/(admin)/laporan/csv/route.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadRecap } from "@/lib/laporan/load-recap";
import { recapToCsv } from "@/lib/laporan/recap-csv";

export async function GET(request: Request) {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") {
    return new Response("Tidak diizinkan.", { status: 403 });
  }

  const url = new URL(request.url);
  const cabang = url.searchParams.get("cabang");
  const dari = url.searchParams.get("dari");
  const sampai = url.searchParams.get("sampai");
  const dept = url.searchParams.get("dept");
  if (!cabang || !dari || !sampai) {
    return new Response("Parameter cabang, dari, dan sampai wajib.", { status: 400 });
  }

  const recap = await loadRecap(db, { branchId: cabang, departmentId: dept, from: dari, to: sampai });
  if (!recap.ok) {
    return new Response(recap.error, { status: 400 });
  }

  return new Response(recapToCsv(recap.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-kehadiran-${dari}_${sampai}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Write the PDF document component**

```tsx
// src/components/recap-document.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RecapRow } from "@/lib/laporan/attendance-recap";

export type RecapDocData = { branchNama: string; from: string; to: string; rows: RecapRow[] };

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 14, marginBottom: 2 },
  sub: { color: "#555", marginBottom: 12 },
  headRow: { flexDirection: "row", borderBottom: "1px solid #333", paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: "1px solid #eee" },
  cNama: { width: "28%" },
  cNum: { width: "12%", textAlign: "right" },
});

export function RecapDocument({ data }: { data: RecapDocData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <Text style={styles.title}>Laporan Kehadiran — {data.branchNama}</Text>
        <Text style={styles.sub}>{data.from} s/d {data.to}</Text>
        <View style={styles.headRow}>
          <Text style={styles.cNama}>Nama</Text>
          <Text style={styles.cNum}>Hadir</Text>
          <Text style={styles.cNum}>Terlambat</Text>
          <Text style={styles.cNum}>P. Cepat</Text>
          <Text style={styles.cNum}>Luar Lok.</Text>
          <Text style={styles.cNum}>Alpa</Text>
          <Text style={styles.cNum}>Cuti</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.employeeId} style={styles.row}>
            <Text style={styles.cNama}>{r.nama}</Text>
            <Text style={styles.cNum}>{r.hadir}</Text>
            <Text style={styles.cNum}>{r.terlambat}</Text>
            <Text style={styles.cNum}>{r.pulangCepat}</Text>
            <Text style={styles.cNum}>{r.diLuarLokasi}</Text>
            <Text style={styles.cNum}>{r.alpa}</Text>
            <Text style={styles.cNum}>{r.cuti}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Write the PDF route**

```tsx
// src/app/(admin)/laporan/pdf/route.tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadRecap } from "@/lib/laporan/load-recap";
import { RecapDocument } from "@/components/recap-document";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") {
    return new Response("Tidak diizinkan.", { status: 403 });
  }

  const url = new URL(request.url);
  const cabang = url.searchParams.get("cabang");
  const dari = url.searchParams.get("dari");
  const sampai = url.searchParams.get("sampai");
  const dept = url.searchParams.get("dept");
  if (!cabang || !dari || !sampai) {
    return new Response("Parameter cabang, dari, dan sampai wajib.", { status: 400 });
  }

  const recap = await loadRecap(db, { branchId: cabang, departmentId: dept, from: dari, to: sampai });
  if (!recap.ok) {
    return new Response(recap.error, { status: 400 });
  }

  try {
    const buffer = await renderToBuffer(
      <RecapDocument data={{ branchNama: recap.branchNama, from: dari, to: sampai, rows: recap.rows }} />,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="laporan-kehadiran-${dari}_${sampai}.pdf"`,
      },
    });
  } catch (err) {
    console.error("laporan pdf render failed", err);
    return new Response("Gagal membuat PDF laporan.", { status: 500 });
  }
}
```

- [ ] **Step 4: Write the route integration test (dev-server gated)**

```typescript
// tests/integration/laporan-export.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();
const BASE_URL = process.env.LAPORAN_BASE_URL; // e.g. http://localhost:3000

describe.skipIf(!BASE_URL)("laporan export routes", () => {
  let adminCookie: string;
  let branchId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db.from("branches").insert({ nama: `Cabang Export ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = branch!.id;
    await db.from("work_schedules").insert({
      branch_id: branchId, jam_masuk: "09:00", jam_pulang: "17:00", hari_kerja: [1, 2, 3, 4, 5], toleransi_terlambat_menit: 15,
    });
    const { data: u } = await db.auth.admin.createUser({ email: `admin.export.${suffix}@test.local`, password, email_confirm: true });
    await db.from("employees").insert({
      id: u!.user!.id, nama: "Admin Export", email: `admin.export.${suffix}@test.local`, branch_id: branchId,
      jabatan: "HR", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: "hr_admin",
    });
    const c = createClient(SUPABASE_URL, ANON_KEY);
    const { data } = await c.auth.signInWithPassword({ email: `admin.export.${suffix}@test.local`, password });
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    adminCookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  });

  it("serves CSV for an admin", async () => {
    const res = await fetch(`${BASE_URL}/laporan/csv?cabang=${branchId}&dari=2026-08-01&sampai=2026-08-31`, { headers: { cookie: adminCookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("Nama,Hadir,Terlambat");
  });

  it("serves PDF for an admin", async () => {
    const res = await fetch(`${BASE_URL}/laporan/pdf?cabang=${branchId}&dari=2026-08-01&sampai=2026-08-31`, { headers: { cookie: adminCookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);
  });

  it("400s without cabang", async () => {
    const res = await fetch(`${BASE_URL}/laporan/csv?dari=2026-08-01&sampai=2026-08-31`, { headers: { cookie: adminCookie } });
    expect(res.status).toBe(400);
  });
});
```

Note: the cookie construction mirrors `tests/integration/payslip-pdf.test.ts` (Plan 4). If the installed `@supabase/ssr` chunk-splits the cookie, copy that test's `combineChunks`/split logic. This test SKIPS in a normal `test:integration` run (no `LAPORAN_BASE_URL`).

- [ ] **Step 5: Run + verify**

```bash
npm run build          # both routes compile
# optional, needs a dev server:
# npm run dev  (other shell)
# LAPORAN_BASE_URL=http://localhost:3000 npx vitest run tests/integration/laporan-export.test.ts
./node_modules/.bin/tsc --noEmit
```

Expected: build compiles with `/laporan/csv` and `/laporan/pdf` listed; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/laporan/csv" "src/app/(admin)/laporan/pdf" src/components/recap-document.tsx tests/integration/laporan-export.test.ts
git commit -m "feat(laporan): CSV + PDF export routes"
```

---

## Task 7: Dashboard controls — branch filter + auto-refresh

**Files:**
- Create: `src/app/(admin)/dashboard/dashboard-controls.tsx`
- Create: `src/app/(admin)/dashboard/dashboard-controls.test.tsx`

**Interfaces:**
- Produces: `<DashboardControls branches={{id,nama}[]} selectedBranch={string} />` — a client bar with a branch `<select>` (pushes `?branch=`), a "Muat ulang" button (`router.refresh()`), a 30-second auto-refresh interval, and a "Diperbarui HH:MM:SS" label.
- Consumed by: Task 8 (`dashboard/page.tsx`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/(admin)/dashboard/dashboard-controls.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { DashboardControls } from "./dashboard-controls";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }, { id: "b2", nama: "Cabang B" }];

beforeEach(() => { vi.useFakeTimers(); push.mockClear(); refresh.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("DashboardControls", () => {
  it("pushes ?branch= when a branch is chosen and clears it for 'Semua'", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    fireEvent.change(screen.getByLabelText(/cabang/i), { target: { value: "b2" } });
    expect(push).toHaveBeenCalledWith("/dashboard?branch=b2");
    fireEvent.change(screen.getByLabelText(/cabang/i), { target: { value: "" } });
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("calls router.refresh() on the Muat ulang button", () => {
    render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    fireEvent.click(screen.getByRole("button", { name: /muat ulang/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("auto-refreshes every 30 seconds and stops on unmount", () => {
    const { unmount } = render(<DashboardControls branches={BRANCHES} selectedBranch="" />);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- dashboard-controls.test.tsx
```

Expected: FAIL — `Cannot find module './dashboard-controls'`.

- [ ] **Step 3: Write the component**

```tsx
// src/app/(admin)/dashboard/dashboard-controls.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TIME_FMT = new Intl.DateTimeFormat("id-ID", { timeStyle: "medium", timeZone: "Asia/Jakarta" });

export function DashboardControls({
  branches, selectedBranch,
}: {
  branches: { id: string; nama: string }[];
  selectedBranch: string;
}) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string>(() => TIME_FMT.format(new Date()));

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  // Re-stamp the label whenever this component re-renders after a refresh.
  useEffect(() => {
    setUpdatedAt(TIME_FMT.format(new Date()));
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="branch" className="text-xs text-neutral-500">Cabang</label>
        <select
          id="branch"
          defaultValue={selectedBranch}
          onChange={(e) => router.push(e.target.value ? `/dashboard?branch=${e.target.value}` : "/dashboard")}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </div>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="min-h-9 rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700"
      >
        Muat ulang
      </button>
      <span className="text-xs text-neutral-400">Diperbarui {updatedAt}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- dashboard-controls.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/dashboard/dashboard-controls.tsx" "src/app/(admin)/dashboard/dashboard-controls.test.tsx"
git commit -m "feat(dashboard): branch filter + 30s auto-refresh controls"
```

---

## Task 8: Wire the dashboard branch filter

**Files:**
- Modify: `src/lib/dashboard/monthly-trend.ts`
- Modify: `src/lib/dashboard/monthly-trend.test.ts`
- Modify: `src/app/(admin)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `DashboardControls` (Task 7), `getTodaySummary(db, branchId?)` (existing).
- Produces: `getMonthlyTrend(db: SupabaseClient, yearMonth: string, branchId?: string): Promise<MonthlyTrendResult>` — the added optional `branchId` scopes via the `employees!inner(branch_id)` embed filter.

- [ ] **Step 1: Add the failing test case to `monthly-trend.test.ts`**

```typescript
// src/lib/dashboard/monthly-trend.test.ts — ADD
it("scopes the query to a branch via the employees embed filter when branchId is given", async () => {
  const eq = vi.fn().mockReturnThis();
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    eq,
    then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
  };
  const db = { from: vi.fn(() => builder) } as never;
  await getMonthlyTrend(db, "2026-08", "branch-1");
  expect(builder.select).toHaveBeenCalledWith("tanggal, status, employees!inner(branch_id)");
  expect(eq).toHaveBeenCalledWith("employees.branch_id", "branch-1");
});
```

(Adjust the mock shape to whatever the existing `monthly-trend.test.ts` uses; the assertion is: with a `branchId`, the select string includes `employees!inner(branch_id)` and there is an `.eq("employees.branch_id", branchId)` call.)

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- monthly-trend.test.ts
```

Expected: FAIL — `getMonthlyTrend` ignores the third argument.

- [ ] **Step 3: Update `monthly-trend.ts`**

```typescript
// src/lib/dashboard/monthly-trend.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESENT_STATUSES } from "@/lib/attendance/status";

export type MonthlyTrendPoint = { date: string; hadir: number; terlambat: number };

export type MonthlyTrendResult =
  | { ok: true; points: MonthlyTrendPoint[] }
  | { ok: false; error: string };

export async function getMonthlyTrend(
  db: SupabaseClient,
  yearMonth: string,
  branchId?: string,
): Promise<MonthlyTrendResult> {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  // attendances has no branch_id — scope via the employees embed, same as
  // getTodaySummary (src/lib/dashboard/attendance-summary.ts).
  const query = branchId
    ? db
        .from("attendances")
        .select("tanggal, status, employees!inner(branch_id)")
        .gte("tanggal", startDate)
        .lte("tanggal", endDate)
        .eq("employees.branch_id", branchId)
    : db
        .from("attendances")
        .select("tanggal, status")
        .gte("tanggal", startDate)
        .lte("tanggal", endDate);

  const { data, error } = await query;

  if (error) {
    console.error("getMonthlyTrend: attendances query failed", error);
    return { ok: false, error: "Gagal memuat tren kehadiran." };
  }

  const byDate = new Map<string, { hadir: number; terlambat: number }>();
  for (const row of (data ?? []) as { tanggal: string; status: string }[]) {
    const entry = byDate.get(row.tanggal) ?? { hadir: 0, terlambat: 0 };
    if (PRESENT_STATUSES.includes(row.status)) entry.hadir += 1;
    if (row.status === "terlambat") entry.terlambat += 1;
    byDate.set(row.tanggal, entry);
  }

  const points = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return { ok: true, points };
}
```

- [ ] **Step 4: Update `dashboard/page.tsx`**

Replace the hardcoded-`branchId` block and add the controls:

```tsx
// src/app/(admin)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { getMonthlyTrend } from "@/lib/dashboard/monthly-trend";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { SummaryCard } from "@/components/summary-card";
import { AttendanceTrendChart } from "@/components/attendance-trend-chart";
import { DashboardControls } from "./dashboard-controls";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  // Dashboard reads run under is_admin_role() (migration 0009), which includes
  // the atasan role. Aggregate counts here are org-wide (or branch-scoped when
  // a branch is chosen below). Per-branch filtering is now exposed via the
  // DashboardControls select; team-scoping for atasan would still need a
  // separate atasan_id-filtered query and is out of scope.
  const branchId = branch || undefined;
  const { data: branches } = await db.from("branches").select("id, nama").order("nama");

  const summaryResult = await getTodaySummary(db, branchId);
  const currentYearMonth = toJakartaDateOnly(new Date()).slice(0, 7);
  const trendResult = await getMonthlyTrend(db, currentYearMonth, branchId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">Ringkasan kehadiran hari ini.</p>
        </div>
        <DashboardControls branches={branches ?? []} selectedBranch={branchId ?? ""} />
      </div>
      {summaryResult.ok ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Hadir" value={summaryResult.summary.hadir} />
          <SummaryCard label="Terlambat" value={summaryResult.summary.terlambat} />
          <SummaryCard label="Alpa" value={summaryResult.summary.alpa} />
        </div>
      ) : (
        <p className="text-sm text-red-600">{summaryResult.error}</p>
      )}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <p className="text-sm font-medium text-neutral-900">Tren Kehadiran Bulan Ini</p>
        <p className="mt-1 text-xs text-neutral-500">Jumlah hadir dan terlambat per hari.</p>
        <div className="mt-4">
          {trendResult.ok ? (
            <AttendanceTrendChart data={trendResult.points} />
          ) : (
            <p className="text-sm text-red-600">{trendResult.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + build**

```bash
npm test -- monthly-trend.test.ts && npm run build
```

Expected: monthly-trend tests pass (existing + 1 new); build compiles.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/monthly-trend.ts src/lib/dashboard/monthly-trend.test.ts "src/app/(admin)/dashboard/page.tsx"
git commit -m "feat(dashboard): branch-scope the summary + trend via ?branch"
```

---

## Task 9: `validateScheduleInput`

**Files:**
- Create: `src/lib/schedule/validate-schedule.ts`
- Create: `src/lib/schedule/validate-schedule.test.ts`

**Interfaces:**
- Consumes: `scheduleMinutes` from `@/lib/payroll/minutes`.
- Produces: `type ScheduleInput = { jamMasuk: string; jamPulang: string; hariKerja: number[]; toleransiMenit: number }`.
- Produces: `validateScheduleInput(raw: Record<string, FormDataEntryValue | null>): { ok: true; value: ScheduleInput } | { ok: false; error: string }`.
- Consumed by: Task 10 (`saveSchedule`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/schedule/validate-schedule.test.ts
import { describe, it, expect } from "vitest";
import { validateScheduleInput } from "./validate-schedule";

const base = { jamMasuk: "09:00", jamPulang: "17:00", hariKerja: ["1", "2", "3", "4", "5"], toleransiMenit: "15" };

describe("validateScheduleInput", () => {
  it("accepts a valid schedule and coerces types", () => {
    expect(validateScheduleInput(base as never)).toEqual({
      ok: true,
      value: { jamMasuk: "09:00", jamPulang: "17:00", hariKerja: [1, 2, 3, 4, 5], toleransiMenit: 15 },
    });
  });

  it("accepts a single hariKerja value (FormData sends one string, not an array)", () => {
    const result = validateScheduleInput({ ...base, hariKerja: "1" } as never);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ hariKerja: [1] }) });
  });

  it("rejects a bad time format", () => {
    expect(validateScheduleInput({ ...base, jamMasuk: "9am" } as never)).toEqual({ ok: false, error: "Jam masuk dan jam pulang harus format HH:MM." });
  });

  it("rejects jam_pulang not after jam_masuk", () => {
    expect(validateScheduleInput({ ...base, jamMasuk: "17:00", jamPulang: "09:00" } as never)).toEqual({ ok: false, error: "Jam pulang harus setelah jam masuk." });
  });

  it("rejects an empty hariKerja", () => {
    expect(validateScheduleInput({ ...base, hariKerja: [] } as never)).toEqual({ ok: false, error: "Pilih minimal satu hari kerja." });
  });

  it("rejects a hariKerja value outside 0-6", () => {
    expect(validateScheduleInput({ ...base, hariKerja: ["7"] } as never)).toEqual({ ok: false, error: "Hari kerja tidak valid." });
  });

  it("rejects a negative or non-numeric toleransi", () => {
    expect(validateScheduleInput({ ...base, toleransiMenit: "-1" } as never)).toEqual({ ok: false, error: "Toleransi keterlambatan harus angka >= 0." });
    expect(validateScheduleInput({ ...base, toleransiMenit: "abc" } as never)).toEqual({ ok: false, error: "Toleransi keterlambatan harus angka >= 0." });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- validate-schedule.test.ts
```

Expected: FAIL — `Cannot find module './validate-schedule'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/schedule/validate-schedule.ts
import { scheduleMinutes } from "@/lib/payroll/minutes";

export type ScheduleInput = {
  jamMasuk: string;
  jamPulang: string;
  hariKerja: number[];
  toleransiMenit: number;
};

const HHMM = /^\d{2}:\d{2}$/;

export function validateScheduleInput(
  raw: Record<string, FormDataEntryValue | null> & { hariKerja?: unknown },
): { ok: true; value: ScheduleInput } | { ok: false; error: string } {
  const jamMasuk = String(raw.jamMasuk ?? "").trim();
  const jamPulang = String(raw.jamPulang ?? "").trim();

  if (!HHMM.test(jamMasuk) || !HHMM.test(jamPulang)) {
    return { ok: false, error: "Jam masuk dan jam pulang harus format HH:MM." };
  }
  if (scheduleMinutes(jamPulang) <= scheduleMinutes(jamMasuk)) {
    return { ok: false, error: "Jam pulang harus setelah jam masuk." };
  }

  const rawDays = raw.hariKerja;
  const dayList = Array.isArray(rawDays) ? rawDays : rawDays == null || rawDays === "" ? [] : [rawDays];
  const hariKerja = dayList.map((d) => Number(d));
  if (hariKerja.length === 0) {
    return { ok: false, error: "Pilih minimal satu hari kerja." };
  }
  if (hariKerja.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { ok: false, error: "Hari kerja tidak valid." };
  }

  const toleransiMenit = Number(String(raw.toleransiMenit ?? "").trim() || "0");
  if (!Number.isInteger(toleransiMenit) || toleransiMenit < 0) {
    return { ok: false, error: "Toleransi keterlambatan harus angka >= 0." };
  }

  return { ok: true, value: { jamMasuk, jamPulang, hariKerja, toleransiMenit } };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- validate-schedule.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule/validate-schedule.ts src/lib/schedule/validate-schedule.test.ts
git commit -m "feat(jadwal): work-schedule input validation"
```

---

## Task 10: `/pengaturan/departemen`

**Files:**
- Create: `src/app/(admin)/pengaturan/departemen/page.tsx`
- Create: `src/app/(admin)/pengaturan/departemen/actions.ts`
- Create: `src/app/(admin)/pengaturan/departemen/department-form.tsx`
- Create: `src/app/(admin)/pengaturan/departemen/department-form.test.tsx`

**Interfaces:**
- Consumes: `getCurrentEmployee` / `createServerSupabaseClient`.
- Produces: `addDepartment(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`, `deleteDepartment(id: string): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing form test**

```typescript
// src/app/(admin)/pengaturan/departemen/department-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DepartmentForm } from "./department-form";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("DepartmentForm", () => {
  it("submits nama and branchId", async () => {
    const addDepartment = vi.fn().mockResolvedValue({ ok: true });
    render(<DepartmentForm branches={BRANCHES} addDepartment={addDepartment} />);
    fireEvent.change(screen.getByLabelText(/nama/i), { target: { value: "Operasional" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(addDepartment).toHaveBeenCalled());
    const fd = addDepartment.mock.calls[0][0] as FormData;
    expect(fd.get("nama")).toBe("Operasional");
    expect(fd.get("branchId")).toBe("b1");
  });

  it("shows an error from a failed add", async () => {
    const addDepartment = vi.fn().mockResolvedValue({ ok: false, error: "Gagal menambah departemen." });
    render(<DepartmentForm branches={BRANCHES} addDepartment={addDepartment} />);
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    expect(await screen.findByText("Gagal menambah departemen.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- department-form.test.tsx
```

Expected: FAIL — `Cannot find module './department-form'`.

- [ ] **Step 3: Write the actions**

```typescript
// src/app/(admin)/pengaturan/departemen/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";

type Result = { ok: true } | { ok: false; error: string };

async function assertHrAdmin() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { db, denied: { ok: false as const, error: "Tidak diizinkan." } };
  }
  return { db, denied: null };
}

export async function addDepartment(formData: FormData): Promise<Result> {
  const { db, denied } = await assertHrAdmin();
  if (denied) return denied;

  const nama = String(formData.get("nama") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim();
  if (!nama || !branchId) {
    return { ok: false, error: "Nama departemen dan cabang wajib diisi." };
  }
  const { error } = await db.from("departments").insert({ nama, branch_id: branchId });
  if (error) {
    console.error("addDepartment: insert failed", error);
    return { ok: false, error: "Gagal menambah departemen." };
  }
  revalidatePath("/pengaturan/departemen");
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<Result> {
  const { db, denied } = await assertHrAdmin();
  if (denied) return denied;

  const { data, error } = await db.from("departments").delete().eq("id", id).select("id");
  if (error) {
    console.error("deleteDepartment: delete failed", error);
    return { ok: false, error: "Gagal menghapus departemen." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menghapus departemen atau Anda tidak berhak." };
  }
  revalidatePath("/pengaturan/departemen");
  return { ok: true };
}
```

- [ ] **Step 4: Write the form + page**

```tsx
// src/app/(admin)/pengaturan/departemen/department-form.tsx
"use client";

import { useState } from "react";

type Result = { ok: true } | { ok: false; error: string };

export function DepartmentForm({
  branches, addDepartment,
}: {
  branches: { id: string; nama: string }[];
  addDepartment: (fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function action(fd: FormData) {
    setError(null);
    setBusy(true);
    try {
      const r = await addDepartment(fd);
      if (!r.ok) setError(r.error);
    } catch (e) {
      console.error(e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Nama Departemen
        <input name="nama" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Cabang
        <select name="branchId" defaultValue={branches[0]?.id ?? ""} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy} className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Tambah</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

```tsx
// src/app/(admin)/pengaturan/departemen/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { DepartmentForm } from "./department-form";
import { addDepartment, deleteDepartment } from "./actions";

export default async function DepartemenPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const { data: departments, error } = await db
    .from("departments")
    .select("id, nama, branches(nama)")
    .order("nama");

  async function remove(id: string) {
    "use server";
    return deleteDepartment(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Departemen</h1>
        <p className="mt-1 text-sm text-neutral-500">Kelompokkan karyawan per departemen di tiap cabang.</p>
      </div>

      <DepartmentForm branches={branches ?? []} addDepartment={addDepartment} />

      {error && <p className="text-sm text-red-600">Gagal memuat daftar departemen.</p>}
      {!error && (!departments || departments.length === 0) && (
        <p className="text-sm text-neutral-500">Belum ada departemen.</p>
      )}
      {departments && departments.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white text-sm">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-2">
              <span>
                <span className="font-medium">{d.nama}</span>{" "}
                <span className="text-neutral-500">· {(d.branches as unknown as { nama: string } | null)?.nama ?? "-"}</span>
              </span>
              <form action={remove.bind(null, d.id)}>
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
npm test -- department-form.test.tsx && npm run build
```

Expected: form tests pass; build compiles with `/pengaturan/departemen`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/pengaturan/departemen"
git commit -m "feat(pengaturan): departemen CRUD"
```

---

## Task 11: `/pengaturan/jadwal` + pengaturan links

**Files:**
- Create: `src/app/(admin)/pengaturan/jadwal/page.tsx`
- Create: `src/app/(admin)/pengaturan/jadwal/actions.ts`
- Create: `src/app/(admin)/pengaturan/jadwal/schedule-form.tsx`
- Create: `src/app/(admin)/pengaturan/jadwal/schedule-form.test.tsx`
- Modify: `src/app/(admin)/pengaturan/page.tsx`

**Interfaces:**
- Consumes: `validateScheduleInput` (Task 9), `getCurrentEmployee` / `createServerSupabaseClient`.
- Produces: `saveSchedule(branchId: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing form test**

```typescript
// src/app/(admin)/pengaturan/jadwal/schedule-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScheduleForm } from "./schedule-form";

describe("ScheduleForm", () => {
  it("submits jam, hari kerja checkboxes, and toleransi for its branch", async () => {
    const saveSchedule = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ScheduleForm
        branchId="b1"
        branchNama="Kantor Pusat"
        defaults={{ jamMasuk: "09:00", jamPulang: "17:00", hariKerja: [1, 2, 3, 4, 5], toleransiMenit: 15 }}
        saveSchedule={saveSchedule}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(saveSchedule).toHaveBeenCalledWith("b1", expect.any(FormData)));
    const fd = saveSchedule.mock.calls[0][1] as FormData;
    expect(fd.get("jamMasuk")).toBe("09:00");
    expect(fd.getAll("hariKerja")).toEqual(["1", "2", "3", "4", "5"]);
    expect(fd.get("toleransiMenit")).toBe("15");
  });

  it("shows an error from a failed save", async () => {
    const saveSchedule = vi.fn().mockResolvedValue({ ok: false, error: "Jam pulang harus setelah jam masuk." });
    render(
      <ScheduleForm branchId="b1" branchNama="Kantor Pusat" defaults={null} saveSchedule={saveSchedule} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(await screen.findByText("Jam pulang harus setelah jam masuk.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- schedule-form.test.tsx
```

Expected: FAIL — `Cannot find module './schedule-form'`.

- [ ] **Step 3: Write the actions**

```typescript
// src/app/(admin)/pengaturan/jadwal/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateScheduleInput } from "@/lib/schedule/validate-schedule";

type Result = { ok: true } | { ok: false; error: string };

export async function saveSchedule(branchId: string, formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const parsed = validateScheduleInput({
    jamMasuk: formData.get("jamMasuk"),
    jamPulang: formData.get("jamPulang"),
    hariKerja: formData.getAll("hariKerja") as string[],
    toleransiMenit: formData.get("toleransiMenit"),
  });
  if (!parsed.ok) return parsed;

  const { error } = await db.from("work_schedules").upsert(
    {
      branch_id: branchId,
      jam_masuk: parsed.value.jamMasuk,
      jam_pulang: parsed.value.jamPulang,
      hari_kerja: parsed.value.hariKerja,
      toleransi_terlambat_menit: parsed.value.toleransiMenit,
    },
    { onConflict: "branch_id" },
  );
  if (error) {
    console.error("saveSchedule: upsert failed", error);
    return { ok: false, error: "Gagal menyimpan jadwal kerja." };
  }
  revalidatePath("/pengaturan/jadwal");
  return { ok: true };
}
```

- [ ] **Step 4: Write the form + page**

```tsx
// src/app/(admin)/pengaturan/jadwal/schedule-form.tsx
"use client";

import { useState } from "react";

type ScheduleDefaults = { jamMasuk: string; jamPulang: string; hariKerja: number[]; toleransiMenit: number } | null;
type Result = { ok: true } | { ok: false; error: string };

const DAYS = [
  { v: 0, label: "Min" }, { v: 1, label: "Sen" }, { v: 2, label: "Sel" }, { v: 3, label: "Rab" },
  { v: 4, label: "Kam" }, { v: 5, label: "Jum" }, { v: 6, label: "Sab" },
];

export function ScheduleForm({
  branchId, branchNama, defaults, saveSchedule,
}: {
  branchId: string;
  branchNama: string;
  defaults: ScheduleDefaults;
  saveSchedule: (branchId: string, fd: FormData) => Promise<Result>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const days = new Set(defaults?.hariKerja ?? [1, 2, 3, 4, 5]);

  async function action(fd: FormData) {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await saveSchedule(branchId, fd);
      if (!r.ok) { setError(r.error); return; }
      setMsg("Jadwal tersimpan.");
    } catch (e) {
      console.error(e);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-900">{branchNama}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Jam Masuk
          <input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Jam Pulang
          <input name="jamPulang" type="time" defaultValue={defaults?.jamPulang ?? "17:00"} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Toleransi (menit)
          <input name="toleransiMenit" type="number" min="0" defaultValue={defaults?.toleransiMenit ?? 15} className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="text-sm text-neutral-700">Hari kerja</legend>
        {DAYS.map((d) => (
          <label key={d.v} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="hariKerja" value={d.v} defaultChecked={days.has(d.v)} />
            {d.label}
          </label>
        ))}
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <button type="submit" disabled={busy} className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Simpan</button>
    </form>
  );
}
```

```tsx
// src/app/(admin)/pengaturan/jadwal/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { ScheduleForm } from "./schedule-form";
import { saveSchedule } from "./actions";

export default async function JadwalPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error: branchErr } = await db.from("branches").select("id, nama").order("nama");
  if (branchErr) console.error("jadwal: branches query failed", branchErr);
  const { data: schedules, error: schedErr } = await db
    .from("work_schedules")
    .select("branch_id, jam_masuk, jam_pulang, hari_kerja, toleransi_terlambat_menit");
  if (schedErr) console.error("jadwal: schedules query failed", schedErr);

  const byBranch = new Map(
    (schedules ?? []).map((s) => [
      s.branch_id,
      { jamMasuk: s.jam_masuk.slice(0, 5), jamPulang: s.jam_pulang.slice(0, 5), hariKerja: s.hari_kerja, toleransiMenit: s.toleransi_terlambat_menit },
    ]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Jadwal Kerja</h1>
        <p className="mt-1 text-sm text-neutral-500">Satu jadwal per cabang — dipakai untuk status terlambat dan perhitungan payroll.</p>
      </div>
      {(branches ?? []).length === 0 && <p className="text-sm text-neutral-500">Belum ada cabang.</p>}
      <div className="space-y-4">
        {(branches ?? []).map((b) => (
          <ScheduleForm
            key={b.id}
            branchId={b.id}
            branchNama={b.nama}
            defaults={byBranch.get(b.id) ?? null}
            saveSchedule={saveSchedule}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the pengaturan links**

In `src/app/(admin)/pengaturan/page.tsx`, inside the existing `{(employee.role === "hr_admin" || employee.role === "super_admin") && (<div className="grid gap-3 sm:grid-cols-2">…</div>)}` block, add two more `<Link>` cards after the audit card:

```tsx
          <Link href="/pengaturan/departemen" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-blue-300">
            <p className="text-sm font-medium text-neutral-900">Departemen</p>
            <p className="mt-1 text-xs text-neutral-500">Kelompokkan karyawan per departemen di tiap cabang.</p>
          </Link>
          <Link href="/pengaturan/jadwal" className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-blue-300">
            <p className="text-sm font-medium text-neutral-900">Jadwal Kerja</p>
            <p className="mt-1 text-xs text-neutral-500">Jam kerja, hari kerja, dan toleransi keterlambatan per cabang.</p>
          </Link>
```

- [ ] **Step 6: Run form test + build**

```bash
npm test -- schedule-form.test.tsx && npm run build
```

Expected: form tests pass; build compiles with `/pengaturan/jadwal`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/pengaturan/jadwal" "src/app/(admin)/pengaturan/page.tsx"
git commit -m "feat(pengaturan): per-branch work-schedule editor + nav links"
```

---

## Task 12: Purge expired attendance photos (Edge Function + cron)

**Files:**
- Create: `supabase/functions/purge-expired-photos/index.ts`
- Modify: `supabase/config.toml`
- Create: `supabase/migrations/0025_schedule_photo_purge.sql`
- Create: `tests/integration/purge-expired-photos.test.ts`

**Interfaces:**
- Consumes: `attendances.foto_masuk_url` / `foto_pulang_url` (storage paths), `foto_*_expires_at`; the `attendance-photos` bucket.
- Produces: a Deno Edge Function that deletes expired photos + nulls their columns, callable with the service-role key.

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/purge-expired-photos/index.ts
// Deno Edge Function. Deletes attendance photos past their 90-day retention
// (foto_*_expires_at < now()) from the attendance-photos bucket and nulls the
// corresponding url + expires_at columns. Idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "attendance-photos";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response("forbidden", { status: 403 });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db
    .from("attendances")
    .select("id, foto_masuk_url, foto_masuk_expires_at, foto_pulang_url, foto_pulang_expires_at")
    .or(`foto_masuk_expires_at.lt.${nowIso},foto_pulang_expires_at.lt.${nowIso}`)
    .limit(500);
  if (error) {
    console.error("purge-expired-photos: query failed", error);
    return new Response(JSON.stringify({ error: "query failed" }), { status: 500 });
  }

  const toRemove: string[] = [];
  const masukExpiredIds: string[] = [];
  const pulangExpiredIds: string[] = [];

  const stripPath = (v: string) => {
    const marker = `/${BUCKET}/`;
    const i = v.indexOf(marker);
    return i >= 0 ? v.slice(i + marker.length) : v;
  };

  for (const r of rows ?? []) {
    if (r.foto_masuk_expires_at && r.foto_masuk_expires_at < nowIso) {
      if (r.foto_masuk_url) toRemove.push(stripPath(r.foto_masuk_url));
      masukExpiredIds.push(r.id);
    }
    if (r.foto_pulang_expires_at && r.foto_pulang_expires_at < nowIso) {
      if (r.foto_pulang_url) toRemove.push(stripPath(r.foto_pulang_url));
      pulangExpiredIds.push(r.id);
    }
  }

  let deletedPhotos = 0;
  for (let i = 0; i < toRemove.length; i += 100) {
    const batch = toRemove.slice(i, i + 100);
    const { error: rmErr } = await db.storage.from(BUCKET).remove(batch);
    if (rmErr) console.error("purge-expired-photos: storage remove failed", rmErr);
    else deletedPhotos += batch.length;
  }

  if (masukExpiredIds.length) {
    await db.from("attendances").update({ foto_masuk_url: null, foto_masuk_expires_at: null }).in("id", masukExpiredIds);
  }
  if (pulangExpiredIds.length) {
    await db.from("attendances").update({ foto_pulang_url: null, foto_pulang_expires_at: null }).in("id", pulangExpiredIds);
  }

  return new Response(
    JSON.stringify({ deletedPhotos, updatedRows: masukExpiredIds.length + pulangExpiredIds.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
```

- [ ] **Step 2: Register the function in `config.toml`**

Add to `supabase/config.toml`:

```toml
[functions.purge-expired-photos]
verify_jwt = false
```

(`verify_jwt = false` because the function does its own `Authorization: Bearer <service key>` check; it is never called with a user JWT.)

- [ ] **Step 3: Deploy the function**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase functions deploy purge-expired-photos
```

Expected: `Deployed Function purge-expired-photos`.

- [ ] **Step 4: Write the schedule migration (with fallback)**

```sql
-- supabase/migrations/0025_schedule_photo_purge.sql
--
-- Plan 6 / spec-induk §10: attendance photos past 90 days must be physically
-- deleted, not just flagged. The purge-expired-photos Edge Function does the
-- work; this schedules it nightly at 02:00 WIB (19:00 UTC).
--
-- The function URL and service key are project-specific. Preferred: store the
-- service key in Supabase Vault and reference it. If pg_cron / pg_net turn out
-- to be unavailable or awkward on this project, DELETE the cron.schedule call
-- below, keep only the `create extension` lines, and schedule the function
-- from the Supabase dashboard instead (Edge Functions -> the function ->
-- Schedules, cron `0 19 * * *`). Document whichever path was taken in the
-- task report.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- IMPLEMENTER: replace <PROJECT_REF> with the real project ref (from
-- NEXT_PUBLIC_SUPABASE_URL) and <SERVICE_KEY_EXPR> with either a Vault lookup
-- (`(select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')`)
-- or, if Vault is not set up, the literal key. Verify the call once by hand
-- (`select ...net.http_post(...)`) before relying on the schedule.
select cron.schedule(
  'purge-expired-photos',
  '0 19 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-expired-photos',
    headers := jsonb_build_object('Authorization', 'Bearer ' || <SERVICE_KEY_EXPR>)
  )
  $$
);
```

Apply:

```bash
npx supabase db push
```

If `db push` errors on `pg_cron`/`pg_net` (extension not allowed) or the `cron.schedule` call: reduce the migration to just the two `create extension if not exists` lines (or an empty file with a comment), schedule the function via the Supabase dashboard, and note it in the report.

- [ ] **Step 5: Write the integration test**

```typescript
// tests/integration/purge-expired-photos.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL; // https://<ref>.supabase.co/functions/v1
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const suffix = Date.now();

describe.skipIf(!FUNCTIONS_URL)("purge-expired-photos", () => {
  let branchId: string;
  let employeeId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db.from("branches").insert({ nama: `Cabang Purge ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = branch!.id;
    const { data: u } = await db.auth.admin.createUser({ email: `purge.${suffix}@test.local`, password: "TestPassword123!", email_confirm: true });
    employeeId = u!.user!.id;
    await db.from("employees").insert({
      id: employeeId, nama: "Purge", email: `purge.${suffix}@test.local`, branch_id: branchId,
      jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: "karyawan",
    });
  });

  it("deletes an expired photo and nulls its columns, leaving a future-dated one alone", async () => {
    const db = createServiceRoleSupabaseClient();
    const expiredPath = `${employeeId}/masuk-${suffix}.jpg`;
    const freshPath = `${employeeId}/pulang-${suffix}.jpg`;
    await db.storage.from("attendance-photos").upload(expiredPath, new Blob(["x"], { type: "image/jpeg" }));
    await db.storage.from("attendance-photos").upload(freshPath, new Blob(["y"], { type: "image/jpeg" }));

    const { data: att } = await db.from("attendances").insert({
      employee_id: employeeId, tanggal: "2026-05-01", status: "tepat_waktu",
      foto_masuk_url: expiredPath, foto_masuk_expires_at: "2020-01-01T00:00:00Z",
      foto_pulang_url: freshPath, foto_pulang_expires_at: "2099-01-01T00:00:00Z",
    }).select().single();

    const res = await fetch(`${FUNCTIONS_URL}/purge-expired-photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedPhotos).toBeGreaterThanOrEqual(1);

    const { data: row } = await db.from("attendances").select("foto_masuk_url, foto_masuk_expires_at, foto_pulang_url").eq("id", att!.id).single();
    expect(row!.foto_masuk_url).toBeNull();
    expect(row!.foto_masuk_expires_at).toBeNull();
    expect(row!.foto_pulang_url).toBe(freshPath); // untouched

    const { data: listExpired } = await db.storage.from("attendance-photos").list(employeeId);
    expect(listExpired?.some((f) => f.name === `masuk-${suffix}.jpg`)).toBe(false);
    expect(listExpired?.some((f) => f.name === `pulang-${suffix}.jpg`)).toBe(true);
  });

  it("rejects a call without the service key", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/purge-expired-photos`, { method: "POST" });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run the integration test**

```bash
SUPABASE_FUNCTIONS_URL=https://<PROJECT_REF>.supabase.co/functions/v1 npx vitest run tests/integration/purge-expired-photos.test.ts
```

Expected: PASS (2 tests). It SKIPS in a normal run (no `SUPABASE_FUNCTIONS_URL`).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/purge-expired-photos supabase/config.toml supabase/migrations/0025_schedule_photo_purge.sql tests/integration/purge-expired-photos.test.ts
git commit -m "feat: nightly purge of attendance photos past 90-day retention"
```

---

## Post-plan verification

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npm run test:integration -- reporting-config-rls.test.ts
```

Then the final whole-branch review (subagent-driven-development skill), then `finishing-a-development-branch`. **This completes the Fase 1+2 MVP.**

## Deferred / operational

- Edge Function schedule: if `pg_cron`/`pg_net` were not usable, the function must be scheduled manually in the Supabase dashboard — recorded in the Task 12 report.
- 90-day physical-deletion policy needs legal sign-off before go-live (spec-induk §10) — process, not code.
- `/laporan` requires a branch selection; a cross-branch single-table report is Fase 3 if requested.
- The `xlsx` deviation (CSV instead of a native `.xlsx`) and the Realtime deviation (30s polling instead of a WebSocket subscription) are documented in the spec §1 "Di luar scope".
