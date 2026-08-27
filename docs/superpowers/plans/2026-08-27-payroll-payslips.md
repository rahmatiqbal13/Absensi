# Payroll & Slip Gaji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR admin generates a monthly, per-branch payroll — `gaji_pokok` minus proportional attendance deductions computed server-side from real `attendances` data — into draft payslips that can be regenerated, then finalized (locked) and downloaded as a PDF slip by both the admin and the employee.

**Architecture:** All per-day business logic (effective work days, daily wage, per-day deduction with holiday/approved-leave/mid-month-join handling, Asia/Jakarta minute extraction) lives in small, fully unit-tested pure modules under `src/lib/payroll/`, mirroring `src/lib/attendance/`. Persistence is a single **Postgres RPC** (`generate_payroll`, `SECURITY DEFINER`) that receives the already-computed payslip rows as `jsonb` and writes them plus the period-status guard in one transaction — a sequence of separate PostgREST calls cannot guarantee that atomicity. A second RPC (`finalize_payroll`) locks the period. Both are called via `db.rpc(...)` on a **user-scoped client** and re-check `is_hr_admin_role()` internally. Payslip PDF is rendered server-side with `@react-pdf/renderer` in a route handler.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, Route Handlers) · React 19.2 · TypeScript strict · `@supabase/supabase-js` · `@react-pdf/renderer` (new dependency, named in spec §6) · Vitest + Testing Library · no other new dependencies.

This is **Plan 4 of a 6-plan sequence** derived from `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` (§7, §6, §1) and refined in `docs/superpowers/specs/2026-08-27-payroll-payslips-design.md`. Plans 1 (Foundation), 2 (Attendance), 3 (Leave/Cuti + HR Dashboard) are complete — see `.superpowers/sdd/progress.md`. Plan 5 (`/karyawan` + invite flow + audit logging + holidays/schedules management) and Plan 6 (`/laporan` + Realtime dashboard + Excel/PDF recap export) follow.

## Global Constraints

- TypeScript everywhere, strict mode on. Package manager: **npm**. `npm test` runs the fast unit suite (no network); `npm run test:integration` runs the live-cloud suite separately.
- **All hour/minute extraction from a timestamp is pinned to Asia/Jakarta** via `Intl.DateTimeFormat` with `timeZone: "Asia/Jakarta"` — the pattern in `src/lib/attendance/status.ts`. **Never** use `Date.prototype.getHours()`/`getMinutes()`, `date.toISOString().slice(...)`, or `toLocaleTimeString`/`toLocaleDateString` without an explicit `timeZone: "Asia/Jakarta"` option. This bug class was found and fixed **4× in Plan 2 and 1× in Plan 3** — a new instance is a Critical review finding.
- **Date-only arithmetic** (leave-range overlap, days-in-month, day-of-week) may parse as UTC midnight (`new Date("YYYY-MM-DDT00:00:00Z")`) and compare/diff — this is safe because there is no time-of-day component, the reasoning already established in `src/lib/leave/balance.ts`. String comparison of `YYYY-MM-DD` values (`a >= b`) is also safe and preferred where possible.
- **Never return raw Postgres/PostgREST error text to the user.** Every Server Action / library function that touches the DB must `console.error` the raw error and return a fixed, human-readable Indonesian message. Use the map pattern in `src/app/(admin)/persetujuan-cuti/actions.ts` (`RPC_ERROR_MESSAGES` + `mapRpcError`).
- **Payroll RPCs are always called on a user-scoped client** (`createServerSupabaseClient()`), **never** service-role. Under a service-role client `auth.uid()` is NULL, which makes the internal `is_hr_admin_role()` check pass vacuously in some paths and fail-open in others — Plan 3 Task 7 established that service-role here is a silent auth *bypass*, not just a functional break.
- **`SECURITY DEFINER` RPCs** use `set search_path = public` and restrict EXECUTE in the same migration: `revoke execute ... from public, anon;` then `grant execute ... to authenticated, service_role;`. `revoke from public` alone is insufficient — Supabase's bootstrap installs a separate explicit `anon=X` grant (see the C1 comment block in `supabase/migrations/0014_fix_leave_approval_rpc_security.sql`). `anon` must be named.
- `Role` type: import from `@/lib/auth/route-access` — never redefine.
- Icons: inline stroke-based SVG, never emoji. Badges follow `src/components/leave-status-badge.tsx` (icon + color + Indonesian label, `role="img"` + `aria-hidden`). Admin pages follow the header/table/alert conventions in `src/app/(admin)/dashboard/page.tsx` and `src/app/(admin)/persetujuan-cuti/page.tsx`.
- Supabase is a linked **cloud** project (no local Docker). Migrations apply via `npx supabase db push`, **never** `supabase db reset` / `truncate` / `delete from` — the DB holds data that must be preserved. Export the token first: `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. Last existing migration: `0016_leave_approval_balance_guard.sql`. This plan's migration is `0017`.
- `payroll_periods.branch_id` is **NOT NULL** (migration `0004` overrode the parent spec's "nullable = company-wide") — payroll is **per-branch**: one `payroll_periods` row per `(branch_id, bulan, tahun)`, `unique` constraint already present.
- `payslips` has **no client write policy** (migration `0005` created only `payslips_select`) — all payslip writes go through the `SECURITY DEFINER` `generate_payroll` RPC, the same way `leave_balances` is written only by the definer leave RPC. Do not add a payslips write policy.
- `work_schedules` has no unique constraint on `branch_id`; look it up with `.limit(1).maybeSingle()`, never `.single()` — the pattern established in `src/lib/attendance/clock-in.ts:76`.
- `work_schedules.hari_kerja` is `integer[]` using the **JS `getUTCDay()` convention: 0 = Sunday … 6 = Saturday**. Confirmed against `scripts/seed.ts` (`hari_kerja: [1,2,3,4,5]` = Mon–Fri). Re-verify against a real branch row before implementing Task 1 if in doubt.

---

## Task 1: Effective work days

**Files:**
- Create: `src/lib/payroll/effective-days.ts`
- Create: `src/lib/payroll/effective-days.test.ts`

**Interfaces:**
- Produces: `effectiveWorkDays(input: { year: number; month: number; hariKerja: number[]; holidayDates: string[]; joinDate?: string | null }): { fullMonthDays: string[]; accrualDays: string[] }`. `month` is 1–12. `fullMonthDays` = every working date in the whole month (the divisor base for daily wage). `accrualDays` = the subset `>= joinDate` (days actually credited to this employee; days before hire are neither `alpa` nor paid).
- Consumed by: Task 4 (`computePayrollForBranch`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/payroll/effective-days.test.ts
import { describe, it, expect } from "vitest";
import { effectiveWorkDays } from "./effective-days";

const MON_FRI = [1, 2, 3, 4, 5];

describe("effectiveWorkDays", () => {
  it("lists every Mon-Fri in a month with no holidays", () => {
    const { fullMonthDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: [],
    });
    // August 2026: 1st is a Saturday. 21 weekdays.
    expect(fullMonthDays).toHaveLength(21);
    expect(fullMonthDays[0]).toBe("2026-08-03");
    expect(fullMonthDays.at(-1)).toBe("2026-08-31");
  });

  it("excludes holiday dates", () => {
    const { fullMonthDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: ["2026-08-17"],
    });
    expect(fullMonthDays).toHaveLength(20);
    expect(fullMonthDays).not.toContain("2026-08-17");
  });

  it("handles a leap-year February", () => {
    const { fullMonthDays } = effectiveWorkDays({
      year: 2028, month: 2, hariKerja: MON_FRI, holidayDates: [],
    });
    expect(fullMonthDays).toContain("2028-02-29");
  });

  it("accrualDays drops days before joinDate but fullMonthDays keeps them", () => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: [], joinDate: "2026-08-17",
    });
    expect(fullMonthDays).toHaveLength(21);
    expect(accrualDays[0]).toBe("2026-08-17");
    expect(accrualDays.every((d) => d >= "2026-08-17")).toBe(true);
  });

  it("a joinDate before the month has no effect", () => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: [], joinDate: "2026-01-01",
    });
    expect(accrualDays).toEqual(fullMonthDays);
  });

  it("returns empty arrays when hariKerja is empty", () => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: [], holidayDates: [],
    });
    expect(fullMonthDays).toEqual([]);
    expect(accrualDays).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- effective-days.test.ts
```

Expected: FAIL — `Cannot find module './effective-days'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/payroll/effective-days.ts

export type EffectiveWorkDaysInput = {
  year: number;
  month: number; // 1-12
  hariKerja: number[]; // work_schedules.hari_kerja, 0=Sun..6=Sat (getUTCDay convention)
  holidayDates: string[]; // "YYYY-MM-DD", already filtered to those that apply to the branch
  joinDate?: string | null; // employees.tanggal_mulai_kerja, "YYYY-MM-DD"
};

export type EffectiveWorkDays = {
  fullMonthDays: string[];
  accrualDays: string[];
};

export function effectiveWorkDays(input: EffectiveWorkDaysInput): EffectiveWorkDays {
  const { year, month, hariKerja, holidayDates, joinDate } = input;
  const workingDow = new Set(hariKerja);
  const holidays = new Set(holidayDates);
  // Day 0 of the next month === last day of this month.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const fullMonthDays: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    if (!workingDow.has(dow)) continue;
    if (holidays.has(dateStr)) continue;
    fullMonthDays.push(dateStr);
  }

  const accrualDays = joinDate
    ? fullMonthDays.filter((d) => d >= joinDate)
    : fullMonthDays;

  return { fullMonthDays, accrualDays };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- effective-days.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll/effective-days.ts src/lib/payroll/effective-days.test.ts
git commit -m "feat(payroll): effective work days per month (holidays + mid-month join)"
```

---

## Task 2: Daily wage + rounding helper

**Files:**
- Create: `src/lib/payroll/round.ts`
- Create: `src/lib/payroll/round.test.ts`
- Create: `src/lib/payroll/daily-wage.ts`
- Create: `src/lib/payroll/daily-wage.test.ts`

**Interfaces:**
- Produces: `round2(value: number): number` — half-up rounding to 2 decimal places.
- Produces: `dailyWage(gajiPokok: number, fullMonthEffectiveDays: number): number` — `gaji_pokok / fullMonthEffectiveDays`, `round2`-ed; returns `0` when the divisor is `<= 0`. The divisor is **always the full-month effective day count** — a mid-month joiner is prorated by having fewer `accrualDays` (Task 4), not by a smaller divisor.
- Consumed by: Task 3 (`round2`), Task 4 (both).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/payroll/round.test.ts
import { describe, it, expect } from "vitest";
import { round2 } from "./round";

describe("round2", () => {
  it("rounds half up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
  it("leaves clean values untouched", () => {
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
  });
  it("rounds a repeating division", () => {
    expect(round2(10_000_000 / 3)).toBe(3_333_333.33);
  });
});
```

```typescript
// src/lib/payroll/daily-wage.test.ts
import { describe, it, expect } from "vitest";
import { dailyWage } from "./daily-wage";

describe("dailyWage", () => {
  it("divides gaji pokok by full-month effective days", () => {
    expect(dailyWage(10_000_000, 20)).toBe(500_000);
  });
  it("rounds to 2 decimals", () => {
    expect(dailyWage(10_000_000, 22)).toBe(454_545.45);
  });
  it("returns 0 when there are no effective days", () => {
    expect(dailyWage(10_000_000, 0)).toBe(0);
    expect(dailyWage(10_000_000, -1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- round.test.ts daily-wage.test.ts
```

Expected: FAIL — `Cannot find module './round'` / `'./daily-wage'`.

- [ ] **Step 3: Write minimal implementations**

```typescript
// src/lib/payroll/round.ts

// Half-up rounding to 2 decimal places. The + Number.EPSILON nudge keeps
// values like 2.675 (stored as 2.67499999…) from rounding down.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
```

```typescript
// src/lib/payroll/daily-wage.ts
import { round2 } from "./round";

export function dailyWage(gajiPokok: number, fullMonthEffectiveDays: number): number {
  if (fullMonthEffectiveDays <= 0) return 0;
  return round2(gajiPokok / fullMonthEffectiveDays);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- round.test.ts daily-wage.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll/round.ts src/lib/payroll/round.test.ts src/lib/payroll/daily-wage.ts src/lib/payroll/daily-wage.test.ts
git commit -m "feat(payroll): round2 helper and daily wage"
```

---

## Task 3: Per-day deduction

**Files:**
- Create: `src/lib/payroll/minutes.ts`
- Create: `src/lib/payroll/minutes.test.ts`
- Create: `src/lib/payroll/deduction.ts`
- Create: `src/lib/payroll/deduction.test.ts`

**Interfaces:**
- Consumes: `round2` (Task 2).
- Produces: `jakartaMinutesOfDay(iso: string): number` — minutes since Asia/Jakarta midnight for a timestamptz ISO string. `scheduleMinutes(value: string): number` — minutes since midnight for a `"HH:MM"` or `"HH:MM:SS"` string.
- Produces: `type RincianHarianEntry = { tanggal: string; jenis: "kerja" | "alpa" | "cuti" | "luar_kantor"; status: string | null; menit_terlambat: number; menit_pulang_cepat: number; potongan: number; catatan?: string }`.
- Produces: `type AttendanceRowLite = { status: string; jam_masuk: string | null; jam_pulang: string | null }`.
- Produces: `type ScheduleLite = { jamMasuk: string; jamPulang: string; toleransiMenit: number }`.
- Produces: `type LeaveCoverage = { covered: boolean; jenis?: string }`.
- Produces: `leaveCoversDate(approvedLeaves: { tanggalMulai: string; tanggalSelesai: string; jenis: string }[], tanggal: string): LeaveCoverage`.
- Produces: `dayDeduction(params: { tanggal: string; attendanceRow: AttendanceRowLite | null; schedule: ScheduleLite; dailyWage: number; leave: LeaveCoverage }): RincianHarianEntry`.
- Consumed by: Task 4.

Deduction rules, in priority order: (1) approved leave covers the date → `jenis: "cuti"`, `potongan: 0`, `catatan: "cuti_<jenis>"`; (2) no attendance row → `jenis: "alpa"`, `potongan: dailyWage`; (3) `status === "di_luar_lokasi"` → `jenis: "luar_kantor"`, `potongan: 0`; (4) explicit `status === "alpa"` row → `potongan: dailyWage`; (5) otherwise proportional both sides — late minutes counted **from `scheduled_start + tolerance`**, early-leave minutes from `scheduled_end`; `jam_pulang === null` → 0 on the leave side plus `catatan: "pulang tidak tercatat"`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/payroll/minutes.test.ts
import { describe, it, expect } from "vitest";
import { jakartaMinutesOfDay, scheduleMinutes } from "./minutes";

describe("jakartaMinutesOfDay", () => {
  it("reads the wall-clock minute in Asia/Jakarta regardless of the offset in the string", () => {
    // 02:05Z == 09:05 WIB
    expect(jakartaMinutesOfDay("2026-08-14T02:05:00Z")).toBe(9 * 60 + 5);
    // same instant, written with the +07:00 offset
    expect(jakartaMinutesOfDay("2026-08-14T09:05:00+07:00")).toBe(9 * 60 + 5);
  });

  it("is independent of the executing process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(jakartaMinutesOfDay("2026-08-14T02:05:00Z")).toBe(9 * 60 + 5);
      process.env.TZ = "Pacific/Kiritimati";
      expect(jakartaMinutesOfDay("2026-08-14T02:05:00Z")).toBe(9 * 60 + 5);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("scheduleMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(scheduleMinutes("09:00")).toBe(540);
    expect(scheduleMinutes("17:30:00")).toBe(1050);
  });
});
```

```typescript
// src/lib/payroll/deduction.test.ts
import { describe, it, expect } from "vitest";
import { dayDeduction, leaveCoversDate } from "./deduction";

const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15 }; // 480 work minutes
const WAGE = 480_000; // -> Rp 1_000 per work minute

describe("leaveCoversDate", () => {
  it("matches an inclusive range", () => {
    const leaves = [{ tanggalMulai: "2026-08-10", tanggalSelesai: "2026-08-12", jenis: "tahunan" }];
    expect(leaveCoversDate(leaves, "2026-08-11")).toEqual({ covered: true, jenis: "tahunan" });
    expect(leaveCoversDate(leaves, "2026-08-12")).toEqual({ covered: true, jenis: "tahunan" });
    expect(leaveCoversDate(leaves, "2026-08-13")).toEqual({ covered: false });
  });
});

describe("dayDeduction", () => {
  const base = { tanggal: "2026-08-14", schedule: SCHEDULE, dailyWage: WAGE };

  it("approved leave -> zero, labelled", () => {
    const r = dayDeduction({ ...base, attendanceRow: null, leave: { covered: true, jenis: "sakit" } });
    expect(r).toMatchObject({ jenis: "cuti", status: null, potongan: 0, catatan: "cuti_sakit" });
  });

  it("no attendance row -> full-day deduction", () => {
    const r = dayDeduction({ ...base, attendanceRow: null, leave: { covered: false } });
    expect(r).toMatchObject({ jenis: "alpa", status: "alpa", potongan: WAGE });
  });

  it("di_luar_lokasi -> zero", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "di_luar_lokasi", jam_masuk: "2026-08-14T03:00:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r).toMatchObject({ jenis: "luar_kantor", potongan: 0 });
  });

  it("explicit alpa row -> full-day deduction", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "alpa", jam_masuk: null, jam_pulang: null },
      leave: { covered: false },
    });
    expect(r.potongan).toBe(WAGE);
  });

  it("late but within tolerance -> zero", () => {
    // scheduled 09:00, tolerance 15m; arrive 09:10 WIB (02:10Z)
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "tepat_waktu", jam_masuk: "2026-08-14T02:10:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r.menit_terlambat).toBe(0);
    expect(r.potongan).toBe(0);
  });

  it("late past tolerance -> deduction counted from scheduled + tolerance", () => {
    // arrive 09:25 WIB (02:25Z): 25 - 15 = 10 late minutes
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "terlambat", jam_masuk: "2026-08-14T02:25:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r.menit_terlambat).toBe(10);
    expect(r.potongan).toBe(10_000); // 1_000/min * 10
  });

  it("early leave -> deduction from scheduled end", () => {
    // leave 16:30 WIB (09:30Z): 30 early minutes
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "pulang_cepat", jam_masuk: "2026-08-14T02:00:00Z", jam_pulang: "2026-08-14T09:30:00Z" },
      leave: { covered: false },
    });
    expect(r.menit_pulang_cepat).toBe(30);
    expect(r.potongan).toBe(30_000);
  });

  it("missing clock-out -> leave side zero, flagged", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "terlambat", jam_masuk: "2026-08-14T02:25:00Z", jam_pulang: null },
      leave: { covered: false },
    });
    expect(r.menit_pulang_cepat).toBe(0);
    expect(r.catatan).toBe("pulang tidak tercatat");
    expect(r.potongan).toBe(10_000); // only the late side
  });

  it("on time both ends -> zero", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "tepat_waktu", jam_masuk: "2026-08-14T02:00:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r.potongan).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- minutes.test.ts deduction.test.ts
```

Expected: FAIL — `Cannot find module './minutes'` / `'./deduction'`.

- [ ] **Step 3: Write minimal implementations**

```typescript
// src/lib/payroll/minutes.ts

// Minutes since Asia/Jakarta midnight for an instant given as an ISO
// timestamptz string. Pinned to Asia/Jakarta via Intl rather than
// Date.prototype.getHours(), for the reason documented at length in
// src/lib/attendance/status.ts: getHours() reads the EXECUTING PROCESS's
// local timezone, which is wrong on a UTC-default cloud/serverless server.
const JAKARTA_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function jakartaMinutesOfDay(iso: string): number {
  const parts = JAKARTA_TIME_FORMATTER.formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Minutes since midnight for a work_schedules time value ("HH:MM" or "HH:MM:SS").
export function scheduleMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
```

```typescript
// src/lib/payroll/deduction.ts
import { round2 } from "./round";
import { jakartaMinutesOfDay, scheduleMinutes } from "./minutes";

export type AttendanceRowLite = {
  status: string;
  jam_masuk: string | null;
  jam_pulang: string | null;
};

export type ScheduleLite = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
};

export type RincianHarianEntry = {
  tanggal: string;
  jenis: "kerja" | "alpa" | "cuti" | "luar_kantor";
  status: string | null;
  menit_terlambat: number;
  menit_pulang_cepat: number;
  potongan: number;
  catatan?: string;
};

export type LeaveCoverage = { covered: boolean; jenis?: string };

export function leaveCoversDate(
  approvedLeaves: { tanggalMulai: string; tanggalSelesai: string; jenis: string }[],
  tanggal: string,
): LeaveCoverage {
  for (const lv of approvedLeaves) {
    if (tanggal >= lv.tanggalMulai && tanggal <= lv.tanggalSelesai) {
      return { covered: true, jenis: lv.jenis };
    }
  }
  return { covered: false };
}

export function dayDeduction(params: {
  tanggal: string;
  attendanceRow: AttendanceRowLite | null;
  schedule: ScheduleLite;
  dailyWage: number;
  leave: LeaveCoverage;
}): RincianHarianEntry {
  const { tanggal, attendanceRow, schedule, dailyWage, leave } = params;

  const entry: RincianHarianEntry = {
    tanggal,
    jenis: "kerja",
    status: attendanceRow?.status ?? null,
    menit_terlambat: 0,
    menit_pulang_cepat: 0,
    potongan: 0,
  };

  if (leave.covered) {
    return { ...entry, jenis: "cuti", status: null, catatan: `cuti_${leave.jenis}` };
  }
  if (attendanceRow === null) {
    return { ...entry, jenis: "alpa", status: "alpa", potongan: dailyWage };
  }
  if (attendanceRow.status === "di_luar_lokasi") {
    return { ...entry, jenis: "luar_kantor", potongan: 0 };
  }
  if (attendanceRow.status === "alpa") {
    return { ...entry, jenis: "alpa", potongan: dailyWage };
  }

  const workMinutes = scheduleMinutes(schedule.jamPulang) - scheduleMinutes(schedule.jamMasuk);
  const lateThreshold = scheduleMinutes(schedule.jamMasuk) + schedule.toleransiMenit;
  const endScheduled = scheduleMinutes(schedule.jamPulang);

  let potonganMasuk = 0;
  if (attendanceRow.jam_masuk) {
    entry.menit_terlambat = Math.max(0, jakartaMinutesOfDay(attendanceRow.jam_masuk) - lateThreshold);
    potonganMasuk = workMinutes > 0 ? (dailyWage * entry.menit_terlambat) / workMinutes : 0;
  }

  let potonganPulang = 0;
  if (attendanceRow.jam_pulang === null) {
    entry.catatan = "pulang tidak tercatat";
  } else {
    entry.menit_pulang_cepat = Math.max(0, endScheduled - jakartaMinutesOfDay(attendanceRow.jam_pulang));
    potonganPulang = workMinutes > 0 ? (dailyWage * entry.menit_pulang_cepat) / workMinutes : 0;
  }

  entry.potongan = round2(round2(potonganMasuk) + round2(potonganPulang));
  return entry;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- minutes.test.ts deduction.test.ts
```

Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll/minutes.ts src/lib/payroll/minutes.test.ts src/lib/payroll/deduction.ts src/lib/payroll/deduction.test.ts
git commit -m "feat(payroll): per-day attendance deduction (Jakarta-pinned minutes)"
```

---

## Task 4: Branch payroll computation

**Files:**
- Create: `src/lib/payroll/compute.ts`
- Create: `src/lib/payroll/compute.test.ts`

**Interfaces:**
- Consumes: `effectiveWorkDays` (T1), `dailyWage` + `round2` (T2), `dayDeduction` + `leaveCoversDate` + `RincianHarianEntry` + `AttendanceRowLite` (T3).
- Produces: `type PayrollEmployee = { id: string; gajiPokok: number; tanggalMulaiKerja: string | null }`.
- Produces: `type PayrollSchedule = { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[] }`.
- Produces: `type ApprovedLeave = { tanggalMulai: string; tanggalSelesai: string; jenis: string }`.
- Produces: `type PayslipRow = { employee_id: string; gaji_pokok: number; hari_kerja_efektif: number; gaji_harian: number; total_potongan_absensi: number; gaji_akhir: number; rincian_harian: RincianHarianEntry[] }`.
- Produces: `computePayrollForBranch(input: { year: number; month: number; employees: PayrollEmployee[]; schedule: PayrollSchedule; holidayDates: string[]; attendancesByEmployee: Map<string, Map<string, AttendanceRowLite>>; approvedLeavesByEmployee: Map<string, ApprovedLeave[]> }): PayslipRow[]`.
- Consumed by: Task 6 (`generatePayroll` server action).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/payroll/compute.test.ts
import { describe, it, expect } from "vitest";
import { computePayrollForBranch } from "./compute";

const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5] };

describe("computePayrollForBranch", () => {
  it("pays a full month with perfect attendance in full", () => {
    // August 2026: 21 working days.
    const attendance = new Map<string, { status: string; jam_masuk: string | null; jam_pulang: string | null }>();
    // no rows -> every day would be alpa; instead give perfect rows for all 21 days
    const days = [
      "03", "04", "05", "06", "07", "10", "11", "12", "13", "14",
      "17", "18", "19", "20", "21", "24", "25", "26", "27", "28", "31",
    ];
    for (const d of days) {
      attendance.set(`2026-08-${d}`, {
        status: "tepat_waktu",
        jam_masuk: `2026-08-${d}T02:00:00Z`, // 09:00 WIB
        jam_pulang: `2026-08-${d}T10:00:00Z`, // 17:00 WIB
      });
    }

    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map([["e1", attendance]]),
      approvedLeavesByEmployee: new Map(),
    });

    expect(row.hari_kerja_efektif).toBe(21);
    expect(row.gaji_harian).toBe(500_000); // 10_500_000 / 21
    expect(row.total_potongan_absensi).toBe(0);
    expect(row.gaji_akhir).toBe(10_500_000);
    expect(row.rincian_harian).toHaveLength(21);
  });

  it("deducts alpa days, leaves approved-leave days untouched, and never goes negative", () => {
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(), // no rows at all -> every non-leave day is alpa
      approvedLeavesByEmployee: new Map([
        ["e1", [{ tanggalMulai: "2026-08-03", tanggalSelesai: "2026-08-07", jenis: "tahunan" }]],
      ]),
    });

    // 5 leave days (Aug 3-7) at 0, 16 alpa days at 500_000 each = 8_000_000
    const cuti = row.rincian_harian.filter((r) => r.jenis === "cuti");
    expect(cuti).toHaveLength(5);
    expect(row.total_potongan_absensi).toBe(8_000_000);
    expect(row.gaji_akhir).toBe(2_500_000);
  });

  it("floors gaji_akhir at 0 when deductions exceed gaji pokok", () => {
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 1_000_000, tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map(),
    });
    expect(row.gaji_akhir).toBe(0);
  });

  it("prorates a mid-month joiner via accrualDays, keeping the full-month divisor", () => {
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-08-17" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(), // joiner has no attendance -> post-join days are alpa
      approvedLeavesByEmployee: new Map(),
    });
    // gaji_harian still 10_500_000 / 21 = 500_000
    expect(row.gaji_harian).toBe(500_000);
    // Aug 17..31 working days = 11; all alpa -> potongan 5_500_000
    expect(row.hari_kerja_efektif).toBe(11);
    expect(row.total_potongan_absensi).toBe(5_500_000);
    expect(row.gaji_akhir).toBe(5_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- compute.test.ts
```

Expected: FAIL — `Cannot find module './compute'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/payroll/compute.ts
import { effectiveWorkDays } from "./effective-days";
import { dailyWage } from "./daily-wage";
import { round2 } from "./round";
import {
  dayDeduction,
  leaveCoversDate,
  type RincianHarianEntry,
  type AttendanceRowLite,
} from "./deduction";

export type PayrollEmployee = {
  id: string;
  gajiPokok: number;
  tanggalMulaiKerja: string | null;
};

export type PayrollSchedule = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: number[];
};

export type ApprovedLeave = { tanggalMulai: string; tanggalSelesai: string; jenis: string };

export type PayslipRow = {
  employee_id: string;
  gaji_pokok: number;
  hari_kerja_efektif: number;
  gaji_harian: number;
  total_potongan_absensi: number;
  gaji_akhir: number;
  rincian_harian: RincianHarianEntry[];
};

export function computePayrollForBranch(input: {
  year: number;
  month: number;
  employees: PayrollEmployee[];
  schedule: PayrollSchedule;
  holidayDates: string[];
  attendancesByEmployee: Map<string, Map<string, AttendanceRowLite>>;
  approvedLeavesByEmployee: Map<string, ApprovedLeave[]>;
}): PayslipRow[] {
  const { year, month, employees, schedule, holidayDates, attendancesByEmployee, approvedLeavesByEmployee } = input;

  return employees.map((emp) => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year,
      month,
      hariKerja: schedule.hariKerja,
      holidayDates,
      joinDate: emp.tanggalMulaiKerja,
    });
    const wage = dailyWage(emp.gajiPokok, fullMonthDays.length);
    const attendance = attendancesByEmployee.get(emp.id) ?? new Map<string, AttendanceRowLite>();
    const leaves = approvedLeavesByEmployee.get(emp.id) ?? [];

    const rincian_harian = accrualDays.map((tanggal) =>
      dayDeduction({
        tanggal,
        attendanceRow: attendance.get(tanggal) ?? null,
        schedule,
        dailyWage: wage,
        leave: leaveCoversDate(leaves, tanggal),
      }),
    );

    const total_potongan_absensi = round2(
      rincian_harian.reduce((sum, r) => sum + r.potongan, 0),
    );
    const gaji_akhir = Math.max(0, round2(emp.gajiPokok - total_potongan_absensi));

    return {
      employee_id: emp.id,
      gaji_pokok: emp.gajiPokok,
      hari_kerja_efektif: accrualDays.length,
      gaji_harian: wage,
      total_potongan_absensi,
      gaji_akhir,
      rincian_harian,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- compute.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll/compute.ts src/lib/payroll/compute.test.ts
git commit -m "feat(payroll): compute branch payslips from attendance + leave"
```

---

## Task 5: Atomic generate/finalize RPC + migration

**Files:**
- Create: `supabase/migrations/0017_payroll_generate_finalize_rpc.sql`
- Create: `tests/integration/payroll-rpc.test.ts`

**Interfaces:**
- Produces: `generate_payroll(p_period_id uuid, p_rows jsonb) returns integer` — deletes all payslips for a **draft** period and re-inserts from `p_rows`; returns the inserted row count; raises on a finalized period or a non-hr-admin caller. `SECURITY DEFINER`.
- Produces: `finalize_payroll(p_period_id uuid) returns void` — flips a draft period with ≥1 payslip to `final`; raises on double-finalize, empty period, or non-hr-admin caller. `SECURITY DEFINER`.
- Consumed by: Task 6 (`db.rpc(...)` on a user-scoped client).

**Prerequisite:** `npx supabase link` already configured (Foundation). Export the token first (see Global Constraints). Apply via `npx supabase db push`. **Never** `db reset` / `truncate` / `delete from` — live cloud data.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0017_payroll_generate_finalize_rpc.sql
--
-- Payroll persistence layer. The per-day deduction math (holidays,
-- approved-leave overlap, Asia/Jakarta minute extraction, mid-month
-- proration) lives in unit-tested TypeScript under src/lib/payroll/ — see
-- docs/superpowers/specs/2026-08-27-payroll-payslips-design.md §4-5. This
-- migration only provides ATOMICITY: generate_payroll takes the already
-- computed payslip rows as jsonb and writes them + guards the period status
-- in one transaction. Same shape as 0014's leave-approval RPCs.
--
-- SECURITY DEFINER because `payslips` has NO client write policy (0005 only
-- created payslips_select) — like leave_balances, it is written only by the
-- definer. The caller is a user-scoped client, and the function re-checks
-- is_hr_admin_role() against the real auth.uid() as its first line.

-- --- RLS: payroll_periods write becomes hr_admin only. 0005 set it to
-- is_admin_role(); 0009 widened is_admin_role() to include `atasan`. Spec §1:
-- /payroll is hr_admin/super_admin only. (payslips is already definer-only.)
drop policy if exists payroll_periods_write on payroll_periods;
create policy payroll_periods_write on payroll_periods
  for all using (is_hr_admin_role()) with check (is_hr_admin_role());

-- --- generate_payroll -------------------------------------------------------
create or replace function generate_payroll(p_period_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count integer;
begin
  if auth.uid() is null or is_hr_admin_role() = false then
    raise exception 'only hr admin may run payroll';
  end if;

  select status into v_status from payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'payroll period not found';
  end if;
  if v_status = 'final' then
    raise exception 'payroll period is finalized';
  end if;

  delete from payslips where payroll_period_id = p_period_id;

  insert into payslips (
    payroll_period_id, employee_id, gaji_pokok, hari_kerja_efektif,
    gaji_harian, total_potongan_absensi, gaji_akhir, rincian_harian
  )
  select
    p_period_id, x.employee_id, x.gaji_pokok, x.hari_kerja_efektif,
    x.gaji_harian, x.total_potongan_absensi, x.gaji_akhir, x.rincian_harian
  from jsonb_to_recordset(p_rows) as x(
    employee_id uuid, gaji_pokok numeric, hari_kerja_efektif integer,
    gaji_harian numeric, total_potongan_absensi numeric, gaji_akhir numeric,
    rincian_harian jsonb
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --- finalize_payroll ------------------------------------------------------
create or replace function finalize_payroll(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_payslips integer;
begin
  if auth.uid() is null or is_hr_admin_role() = false then
    raise exception 'only hr admin may run payroll';
  end if;

  select status into v_status from payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'payroll period not found';
  end if;
  if v_status = 'final' then
    raise exception 'payroll period is already finalized';
  end if;

  select count(*) into v_payslips from payslips where payroll_period_id = p_period_id;
  if v_payslips = 0 then
    raise exception 'cannot finalize a payroll period with no payslips';
  end if;

  update payroll_periods set status = 'final' where id = p_period_id;
end;
$$;

-- --- EXECUTE grants. Same reasoning as 0014's C1: `revoke from public` alone
-- leaves Supabase's explicit per-role `anon=X` grant standing; anon must be
-- named. Postgres checks EXECUTE against the caller's role BEFORE the
-- SECURITY DEFINER body runs, so an anon-key caller is rejected by Postgres.
revoke execute on function generate_payroll(uuid, jsonb) from public, anon;
revoke execute on function finalize_payroll(uuid) from public, anon;
grant execute on function generate_payroll(uuid, jsonb) to authenticated, service_role;
grant execute on function finalize_payroll(uuid) to authenticated, service_role;
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/payroll-rpc.test.ts
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

function payslipRows(employeeId: string) {
  return [
    {
      employee_id: employeeId,
      gaji_pokok: 10_000_000,
      hari_kerja_efektif: 20,
      gaji_harian: 500_000,
      total_potongan_absensi: 0,
      gaji_akhir: 10_000_000,
      rincian_harian: [],
    },
  ];
}

describe("payroll RPC", () => {
  let branchId: string;
  let periodId: string;
  let karyawan: { id: string; email: string };
  let atasan: { id: string; email: string };
  let hrAdmin: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: `Cabang Payroll ${suffix}`, lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.payroll.${suffix}@test.local`, role: "atasan" },
      { key: "karyawan", email: `karyawan.payroll.${suffix}@test.local`, role: "karyawan" },
      { key: "hrAdmin", email: `hradmin.payroll.${suffix}@test.local`, role: "hr_admin" },
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
    karyawan = { id: ids.karyawan, email: seeds[1].email };
    hrAdmin = { id: ids.hrAdmin, email: seeds[2].email };

    const { data: period } = await db
      .from("payroll_periods")
      .insert({ branch_id: branchId, bulan: 8, tahun: 2026 })
      .select()
      .single();
    periodId = period!.id;
  });

  it("lets an hr_admin generate payslips and regenerate without duplicating", async () => {
    const client = await signInAs(hrAdmin.email);

    const { data: count1, error: e1 } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(e1).toBeNull();
    expect(count1).toBe(1);

    // regenerate -> still exactly one row (delete + reinsert)
    const { error: e2 } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(e2).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: slips } = await db.from("payslips").select("id").eq("payroll_period_id", periodId);
    expect(slips).toHaveLength(1);
  });

  it("blocks a non-hr-admin (atasan) from generating", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("only hr admin may run payroll");
  });

  it("finalizes a draft period with payslips, then blocks a second finalize and any regenerate", async () => {
    const client = await signInAs(hrAdmin.email);
    await client.rpc("generate_payroll", { p_period_id: periodId, p_rows: payslipRows(karyawan.id) });

    const { error: finErr } = await client.rpc("finalize_payroll", { p_period_id: periodId });
    expect(finErr).toBeNull();

    const { error: fin2 } = await client.rpc("finalize_payroll", { p_period_id: periodId });
    expect(fin2!.message).toContain("already finalized");

    const { error: regen } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(regen!.message).toContain("payroll period is finalized");
  });

  it("refuses to finalize a period with no payslips", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: emptyPeriod } = await db
      .from("payroll_periods")
      .insert({ branch_id: branchId, bulan: 9, tahun: 2026 })
      .select()
      .single();

    const client = await signInAs(hrAdmin.email);
    const { error } = await client.rpc("finalize_payroll", { p_period_id: emptyPeriod!.id });
    expect(error!.message).toContain("no payslips");
  });

  it("denies both RPCs to an unauthenticated anon-key caller", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY); // no session
    const gen = await anon.rpc("generate_payroll", { p_period_id: periodId, p_rows: [] });
    const fin = await anon.rpc("finalize_payroll", { p_period_id: periodId });
    expect(gen.error).not.toBeNull();
    expect(fin.error).not.toBeNull();
    // With EXECUTE revoked from anon, PostgREST cannot see the function for this
    // role: PGRST202 ("Could not find the function"), or a 42501 permission error.
    for (const err of [gen.error!, fin.error!]) {
      const m = err.message.toLowerCase();
      expect(err.code === "PGRST202" || m.includes("permission") || m.includes("not find")).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:integration -- payroll-rpc.test.ts
```

Expected: FAIL — `PGRST202` / `Could not find the function public.generate_payroll`.

- [ ] **Step 4: Apply the migration and re-run**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
npm run test:integration -- payroll-rpc.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_payroll_generate_finalize_rpc.sql tests/integration/payroll-rpc.test.ts
git commit -m "feat(db): atomic generate/finalize payroll RPCs + hr_admin RLS"
```

---

## Task 6: Payroll server actions

**Files:**
- Create: `src/app/(admin)/payroll/actions.ts`
- Create: `src/app/(admin)/payroll/actions.test.ts`

**Interfaces:**
- Consumes: `computePayrollForBranch` + types (T4), `createServerSupabaseClient` (Foundation), `generate_payroll` / `finalize_payroll` RPCs (T5).
- Produces: `type ActionResult = { ok: true; message?: string } | { ok: false; error: string }`.
- Produces: `createPayrollPeriod(branchId: string, bulan: number, tahun: number): Promise<ActionResult>`.
- Produces: `generatePayroll(periodId: string): Promise<ActionResult>`.
- Produces: `finalizePayroll(periodId: string): Promise<ActionResult>`.
- Consumed by: Task 8, Task 9. Tested by mocking `@/lib/supabase/server` (no exported internals needed).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/(admin)/payroll/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc, from })),
}));

import { generatePayroll, finalizePayroll } from "./actions";

function periodRow() {
  return { id: "p1", branch_id: "b1", bulan: 8, tahun: 2026, status: "draft" };
}

// A thenable query builder whose terminal awaits resolve to `result`.
function q(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "in", "is", "order", "limit"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("generatePayroll", () => {
  it("computes payslips and calls generate_payroll with rows", async () => {
    from.mockImplementation((table: string) => {
      switch (table) {
        case "payroll_periods":
          return q({ data: periodRow(), error: null });
        case "employees":
          return q({ data: [{ id: "e1", gaji_pokok: 10_500_000, tanggal_mulai_kerja: "2026-01-01" }], error: null });
        case "work_schedules":
          return q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1, 2, 3, 4, 5] }, error: null });
        case "holidays":
          return q({ data: [], error: null });
        case "attendances":
          return q({ data: [], error: null });
        case "leave_requests":
          return q({ data: [], error: null });
        default:
          throw new Error(`unexpected table ${table}`);
      }
    });
    rpc.mockResolvedValue({ data: 1, error: null });

    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: true, message: "1 slip gaji dibuat." });
    expect(rpc).toHaveBeenCalledWith("generate_payroll", expect.objectContaining({ p_period_id: "p1" }));
    const rows = rpc.mock.calls[0][1].p_rows;
    expect(rows[0].employee_id).toBe("e1");
    expect(rows[0].gaji_harian).toBe(500_000);
  });

  it("returns a fixed Indonesian message when a reference-data lookup errors", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "employees") return q({ data: null, error: { message: "boom" } });
      return q({ data: [], error: null });
    });
    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Gagal memuat data untuk payroll." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a finalized-period RPC error", async () => {
    from.mockImplementation((table: string) => {
      if (table === "payroll_periods") return q({ data: periodRow(), error: null });
      if (table === "work_schedules") return q({ data: { jam_masuk: "09:00:00", jam_pulang: "17:00:00", toleransi_terlambat_menit: 15, hari_kerja: [1] }, error: null });
      return q({ data: [], error: null });
    });
    rpc.mockResolvedValue({ data: null, error: { message: "payroll period is finalized" } });
    const result = await generatePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Periode ini sudah difinalisasi dan terkunci." });
  });
});

describe("finalizePayroll", () => {
  it("maps the empty-period error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "cannot finalize a payroll period with no payslips" } });
    const result = await finalizePayroll("p1");
    expect(result).toEqual({ ok: false, error: "Tidak dapat memfinalisasi periode tanpa slip gaji." });
  });

  it("succeeds", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await finalizePayroll("p1");
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- "payroll/actions.test.ts"
```

Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/(admin)/payroll/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  computePayrollForBranch,
  type PayrollEmployee,
  type ApprovedLeave,
} from "@/lib/payroll/compute";
import type { AttendanceRowLite } from "@/lib/payroll/deduction";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const RPC_ERROR_MESSAGES: Record<string, string> = {
  "only hr admin may run payroll": "Hanya HR admin yang dapat menjalankan payroll.",
  "payroll period not found": "Periode payroll tidak ditemukan.",
  "payroll period is finalized": "Periode ini sudah difinalisasi dan terkunci.",
  "payroll period is already finalized": "Periode ini sudah difinalisasi sebelumnya.",
  "cannot finalize a payroll period with no payslips":
    "Tidak dapat memfinalisasi periode tanpa slip gaji.",
};

function mapRpcError(message: string | undefined): string {
  if (!message) return "Gagal memproses payroll.";
  for (const [key, friendly] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(key)) return friendly;
  }
  console.error("payroll: unmapped RPC error", message);
  return "Gagal memproses payroll.";
}

// Last day of a month as "YYYY-MM-DD" (date-only math, UTC-safe).
function monthBounds(tahun: number, bulan: number): { start: string; end: string } {
  const mm = String(bulan).padStart(2, "0");
  const lastDay = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  return { start: `${tahun}-${mm}-01`, end: `${tahun}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export async function createPayrollPeriod(
  branchId: string,
  bulan: number,
  tahun: number,
): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db
    .from("payroll_periods")
    .insert({ branch_id: branchId, bulan, tahun });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Periode payroll untuk cabang dan bulan ini sudah ada." };
    }
    console.error("createPayrollPeriod: insert failed", error);
    return { ok: false, error: "Gagal membuat periode payroll." };
  }
  revalidatePath("/payroll");
  return { ok: true };
}

export async function generatePayroll(periodId: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();

  const { data: period, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, branch_id, bulan, tahun, status")
    .eq("id", periodId)
    .single();
  if (periodErr || !period) {
    console.error("generatePayroll: period lookup failed", periodErr);
    return { ok: false, error: "Periode payroll tidak ditemukan." };
  }

  const { start, end } = monthBounds(period.tahun, period.bulan);

  const [employeesRes, scheduleRes, holidaysRes] = await Promise.all([
    db
      .from("employees")
      .select("id, gaji_pokok, tanggal_mulai_kerja")
      .eq("branch_id", period.branch_id)
      .eq("status", "aktif"),
    db
      .from("work_schedules")
      .select("jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja")
      .eq("branch_id", period.branch_id)
      .limit(1)
      .maybeSingle(),
    db
      .from("holidays")
      .select("tanggal")
      // A holiday applies to this branch if it is national (branch_id null)
      // OR explicitly for this branch. A holiday for a DIFFERENT branch must
      // not suppress a working day here (design doc §5).
      .or(`branch_id.is.null,branch_id.eq.${period.branch_id}`)
      .gte("tanggal", start)
      .lte("tanggal", end),
  ]);

  if (employeesRes.error || scheduleRes.error || holidaysRes.error) {
    console.error("generatePayroll: reference data lookup failed", {
      employees: employeesRes.error,
      schedule: scheduleRes.error,
      holidays: holidaysRes.error,
    });
    return { ok: false, error: "Gagal memuat data untuk payroll." };
  }
  if (!scheduleRes.data) {
    return { ok: false, error: "Cabang ini belum punya jadwal kerja." };
  }

  const employees = (employeesRes.data ?? []) as {
    id: string;
    gaji_pokok: number;
    tanggal_mulai_kerja: string | null;
  }[];
  const employeeIds = employees.map((e) => e.id);

  const [attendanceRes, leaveRes] = await Promise.all([
    employeeIds.length
      ? db
          .from("attendances")
          .select("employee_id, tanggal, status, jam_masuk, jam_pulang")
          .in("employee_id", employeeIds)
          .gte("tanggal", start)
          .lte("tanggal", end)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? db
          .from("leave_requests")
          .select("employee_id, tanggal_mulai, tanggal_selesai, jenis")
          .eq("status", "approved")
          .in("employee_id", employeeIds)
          .lte("tanggal_mulai", end)
          .gte("tanggal_selesai", start)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (attendanceRes.error || leaveRes.error) {
    console.error("generatePayroll: attendance/leave lookup failed", {
      attendance: attendanceRes.error,
      leave: leaveRes.error,
    });
    return { ok: false, error: "Gagal memuat data untuk payroll." };
  }

  const attendancesByEmployee = new Map<string, Map<string, AttendanceRowLite>>();
  for (const row of (attendanceRes.data ?? []) as {
    employee_id: string;
    tanggal: string;
    status: string;
    jam_masuk: string | null;
    jam_pulang: string | null;
  }[]) {
    const byDate = attendancesByEmployee.get(row.employee_id) ?? new Map();
    byDate.set(row.tanggal, {
      status: row.status,
      jam_masuk: row.jam_masuk,
      jam_pulang: row.jam_pulang,
    });
    attendancesByEmployee.set(row.employee_id, byDate);
  }

  const approvedLeavesByEmployee = new Map<string, ApprovedLeave[]>();
  for (const row of (leaveRes.data ?? []) as {
    employee_id: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    jenis: string;
  }[]) {
    const list = approvedLeavesByEmployee.get(row.employee_id) ?? [];
    list.push({ tanggalMulai: row.tanggal_mulai, tanggalSelesai: row.tanggal_selesai, jenis: row.jenis });
    approvedLeavesByEmployee.set(row.employee_id, list);
  }

  const rows = computePayrollForBranch({
    year: period.tahun,
    month: period.bulan,
    employees: employees.map<PayrollEmployee>((e) => ({
      id: e.id,
      gajiPokok: Number(e.gaji_pokok),
      tanggalMulaiKerja: e.tanggal_mulai_kerja,
    })),
    schedule: {
      jamMasuk: scheduleRes.data.jam_masuk,
      jamPulang: scheduleRes.data.jam_pulang,
      toleransiMenit: scheduleRes.data.toleransi_terlambat_menit,
      hariKerja: scheduleRes.data.hari_kerja,
    },
    holidayDates: ((holidaysRes.data ?? []) as { tanggal: string }[]).map((h) => h.tanggal), // already branch-scoped by the .or() filter above
    attendancesByEmployee,
    approvedLeavesByEmployee,
  });

  const { data: count, error: rpcErr } = await db.rpc("generate_payroll", {
    p_period_id: periodId,
    p_rows: rows,
  });
  if (rpcErr) {
    return { ok: false, error: mapRpcError(rpcErr.message) };
  }

  revalidatePath(`/payroll/${periodId}`);
  return { ok: true, message: `${count ?? rows.length} slip gaji dibuat.` };
}

export async function finalizePayroll(periodId: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db.rpc("finalize_payroll", { p_period_id: periodId });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- "payroll/actions.test.ts"
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/payroll/actions.ts" "src/app/(admin)/payroll/actions.test.ts"
git commit -m "feat(payroll): server actions (create period, generate, finalize)"
```

---

## Task 7: Payroll status badge + rupiah formatter

**Files:**
- Create: `src/components/payroll-status-badge.tsx`
- Create: `src/components/payroll-status-badge.test.tsx`
- Create: `src/lib/format/rupiah.ts`
- Create: `src/lib/format/rupiah.test.ts`
- Create: `src/lib/format/month.ts`
- Create: `src/lib/format/month.test.ts`

**Interfaces:**
- Produces: `<PayrollStatusBadge status={"draft" | "final"} />` — icon + color + Indonesian label, same accessibility shape as `LeaveStatusBadge`.
- Produces: `formatRupiah(value: number): string` — `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })`.
- Produces: `MONTH_NAMES_ID: readonly string[]` (12 entries, index 0 = "Januari") and `monthLabel(bulan: number): string` (`bulan` 1–12). Used everywhere a `bulan` integer is shown, so it is defined once here.
- Consumed by: Tasks 8, 9, 11, 12.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/format/rupiah.test.ts
import { describe, it, expect } from "vitest";
import { formatRupiah } from "./rupiah";

describe("formatRupiah", () => {
  it("formats whole rupiah with a grouping separator and no decimals", () => {
    const s = formatRupiah(10_500_000);
    expect(s).toContain("10.500.000");
    expect(s).toContain("Rp");
    expect(s).not.toContain(",00");
  });
  it("rounds fractional input", () => {
    expect(formatRupiah(454_545.45)).toContain("454.545");
  });
});
```

```typescript
// src/lib/format/month.test.ts
import { describe, it, expect } from "vitest";
import { monthLabel, MONTH_NAMES_ID } from "./month";

describe("monthLabel", () => {
  it("maps 1..12 to Indonesian month names", () => {
    expect(monthLabel(1)).toBe("Januari");
    expect(monthLabel(8)).toBe("Agustus");
    expect(monthLabel(12)).toBe("Desember");
    expect(MONTH_NAMES_ID).toHaveLength(12);
  });
  it("returns a dash for out-of-range input", () => {
    expect(monthLabel(0)).toBe("-");
    expect(monthLabel(13)).toBe("-");
  });
});
```

```typescript
// src/components/payroll-status-badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayrollStatusBadge } from "./payroll-status-badge";

describe("PayrollStatusBadge", () => {
  it("renders the Indonesian label and an icon for draft", () => {
    render(<PayrollStatusBadge status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument();
  });
  it("renders the Indonesian label for final", () => {
    render(<PayrollStatusBadge status="final" />);
    expect(screen.getByText("Final")).toBeInTheDocument();
  });
  it("gives each status a distinct class", () => {
    const { container: draft } = render(<PayrollStatusBadge status="draft" />);
    const { container: final } = render(<PayrollStatusBadge status="final" />);
    expect((draft.firstChild as HTMLElement).className).not.toBe(
      (final.firstChild as HTMLElement).className,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- rupiah.test.ts month.test.ts payroll-status-badge.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementations**

```typescript
// src/lib/format/rupiah.ts
const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number): string {
  return RUPIAH.format(value);
}
```

```typescript
// src/lib/format/month.ts
export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

// `bulan` is 1-12 (as stored in payroll_periods.bulan). Out-of-range returns "-".
export function monthLabel(bulan: number): string {
  return MONTH_NAMES_ID[bulan - 1] ?? "-";
}
```

```typescript
// src/components/payroll-status-badge.tsx
export type PayrollStatus = "draft" | "final";

const STATUS_CONFIG: Record<
  PayrollStatus,
  { label: string; bg: string; fg: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    icon: (
      <>
        <path d="M12 20h9" strokeLinecap="round" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
      </>
    ),
  },
  final: {
    label: "Final",
    bg: "bg-green-50",
    fg: "text-green-700",
    icon: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
      </>
    ),
  },
};

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium ${config.bg} ${config.fg}`}
    >
      <svg
        role="img"
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        {config.icon}
      </svg>
      <span>{config.label}</span>
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- rupiah.test.ts month.test.ts payroll-status-badge.test.tsx
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/rupiah.ts src/lib/format/rupiah.test.ts src/lib/format/month.ts src/lib/format/month.test.ts src/components/payroll-status-badge.tsx src/components/payroll-status-badge.test.tsx
git commit -m "feat(payroll): status badge, rupiah + month formatters"
```

---

## Task 8: `/payroll` — period list + create

**Files:**
- Create: `src/app/(admin)/payroll/page.tsx`
- Create: `src/app/(admin)/payroll/create-period-form.tsx`
- Create: `src/app/(admin)/payroll/create-period-form.test.tsx`

**Interfaces:**
- Consumes: `createPayrollPeriod` (T6), `PayrollStatusBadge` (T7), `formatRupiah` (T7), `createServerSupabaseClient` (Foundation).
- Produces: `<CreatePeriodForm branches={{ id: string; nama: string }[]} createPeriod={(fd: FormData) => Promise<ActionResult>} />`.
- Consumed by: Task 9 (links to `/payroll/[periodId]`).

- [ ] **Step 1: Write the failing test for the form**

```typescript
// src/app/(admin)/payroll/create-period-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreatePeriodForm } from "./create-period-form";

const BRANCHES = [{ id: "b1", nama: "Kantor Pusat" }];

describe("CreatePeriodForm", () => {
  it("renders branch, month and year fields", () => {
    render(<CreatePeriodForm branches={BRANCHES} createPeriod={vi.fn()} />);
    expect(screen.getByLabelText(/cabang/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bulan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tahun/i)).toBeInTheDocument();
  });

  it("submits branch, month and year", async () => {
    const createPeriod = vi.fn().mockResolvedValue({ ok: true });
    render(<CreatePeriodForm branches={BRANCHES} createPeriod={createPeriod} />);
    fireEvent.change(screen.getByLabelText(/bulan/i), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText(/tahun/i), { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("button", { name: /buat periode/i }));
    await waitFor(() => expect(createPeriod).toHaveBeenCalled());
    const fd = createPeriod.mock.calls[0][0] as FormData;
    expect(fd.get("branchId")).toBe("b1");
    expect(fd.get("bulan")).toBe("8");
    expect(fd.get("tahun")).toBe("2026");
  });

  it("shows the error from a failed create", async () => {
    const createPeriod = vi.fn().mockResolvedValue({ ok: false, error: "Periode payroll untuk cabang dan bulan ini sudah ada." });
    render(<CreatePeriodForm branches={BRANCHES} createPeriod={createPeriod} />);
    fireEvent.click(screen.getByRole("button", { name: /buat periode/i }));
    expect(await screen.findByText(/sudah ada/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- create-period-form.test.tsx
```

Expected: FAIL — `Cannot find module './create-period-form'`.

- [ ] **Step 3: Write the client form**

```typescript
// src/app/(admin)/payroll/create-period-form.tsx
"use client";

import { useState } from "react";
import { MONTH_NAMES_ID } from "@/lib/format/month";
import type { ActionResult } from "./actions";

export function CreatePeriodForm({
  branches,
  createPeriod,
}: {
  branches: { id: string; nama: string }[];
  createPeriod: (formData: FormData) => Promise<ActionResult>;
}) {
  const now = new Date();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await createPeriod(formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="branchId" className="text-sm text-neutral-700">Cabang</label>
        <select id="branchId" name="branchId" required className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="bulan" className="text-sm text-neutral-700">Bulan</label>
        <select id="bulan" name="bulan" defaultValue={String(now.getMonth() + 1)} className="rounded border border-neutral-300 px-3 py-2 text-sm">
          {MONTH_NAMES_ID.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="tahun" className="text-sm text-neutral-700">Tahun</label>
        <input id="tahun" name="tahun" type="number" defaultValue={now.getFullYear()} className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Buat Periode
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {success && <p className="w-full text-sm text-green-600">Periode dibuat.</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- create-period-form.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Wire the page**

```typescript
// src/app/(admin)/payroll/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PayrollStatusBadge, type PayrollStatus } from "@/components/payroll-status-badge";
import { formatRupiah } from "@/lib/format/rupiah";
import { monthLabel } from "@/lib/format/month";
import { CreatePeriodForm } from "./create-period-form";
import { createPayrollPeriod } from "./actions";

export default async function PayrollPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error: branchErr } = await db
    .from("branches")
    .select("id, nama")
    .order("nama");

  const { data: periods, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, bulan, tahun, status, branches(nama), payslips(gaji_akhir)")
    .order("tahun", { ascending: false })
    .order("bulan", { ascending: false });

  async function createPeriod(formData: FormData) {
    "use server";
    const branchId = String(formData.get("branchId"));
    const bulan = Number(formData.get("bulan"));
    const tahun = Number(formData.get("tahun"));
    if (!branchId || !bulan || !tahun) {
      return { ok: false as const, error: "Cabang, bulan, dan tahun wajib diisi." };
    }
    return createPayrollPeriod(branchId, bulan, tahun);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Payroll</h1>
        <p className="mt-1 text-sm text-neutral-500">Buat periode, generate slip gaji, lalu finalisasi.</p>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">Buat Periode Baru</h2>
        {branchErr ? (
          <p className="text-sm text-red-600">Gagal memuat daftar cabang.</p>
        ) : (
          <CreatePeriodForm branches={branches ?? []} createPeriod={createPeriod} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-900">Periode</h2>
        {periodErr && <p className="text-sm text-red-600">Gagal memuat periode payroll.</p>}
        {!periodErr && (!periods || periods.length === 0) && (
          <p className="text-sm text-neutral-500">Belum ada periode payroll.</p>
        )}
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {(periods ?? []).map((p) => {
            const total = ((p.payslips ?? []) as { gaji_akhir: number }[]).reduce(
              (sum, s) => sum + Number(s.gaji_akhir),
              0,
            );
            const count = ((p.payslips ?? []) as unknown[]).length;
            return (
              <li key={p.id} className="flex items-center justify-between gap-4 p-4">
                <Link href={`/payroll/${p.id}`} className="flex-1 text-sm font-medium text-blue-700 hover:underline">
                  {(p.branches as { nama: string } | null)?.nama ?? "-"} — {monthLabel(p.bulan)} {p.tahun}
                </Link>
                <span className="text-sm text-neutral-500">{count} slip · {formatRupiah(total)}</span>
                <PayrollStatusBadge status={p.status as PayrollStatus} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`, route `/payroll` listed.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/payroll/page.tsx" "src/app/(admin)/payroll/create-period-form.tsx" "src/app/(admin)/payroll/create-period-form.test.tsx"
git commit -m "feat(payroll): /payroll period list and create-period form"
```

---

## Task 9: `/payroll/[periodId]` — detail, generate, finalize

**Files:**
- Create: `src/app/(admin)/payroll/[periodId]/page.tsx`
- Create: `src/app/(admin)/payroll/[periodId]/payslip-table.tsx`
- Create: `src/app/(admin)/payroll/[periodId]/payslip-table.test.tsx`

**Interfaces:**
- Consumes: `generatePayroll` / `finalizePayroll` (T6), `PayrollStatusBadge` + `formatRupiah` (T7), `RincianHarianEntry` (T3), `createServerSupabaseClient` / `getCurrentEmployee` (Foundation).
- Produces: `<PayslipTable rows={PayslipView[]} status={"draft"|"final"} onGenerate={() => Promise<ActionResult>} onFinalize={() => Promise<ActionResult>} />` where `type PayslipView = { id: string; nama: string; gajiPokok: number; hariKerjaEfektif: number; totalPotongan: number; gajiAkhir: number; rincian: RincianHarianEntry[] }`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/(admin)/payroll/[periodId]/payslip-table.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayslipTable } from "./payslip-table";

const ROWS = [
  {
    id: "s1", nama: "Budi", gajiPokok: 10_000_000, hariKerjaEfektif: 20,
    totalPotongan: 500_000, gajiAkhir: 9_500_000,
    rincian: [
      { tanggal: "2026-08-03", jenis: "alpa", status: "alpa", menit_terlambat: 0, menit_pulang_cepat: 0, potongan: 500_000 },
    ],
  },
];

describe("PayslipTable", () => {
  it("shows an empty prompt when there are no rows", () => {
    render(<PayslipTable rows={[]} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.getByText(/belum ada slip/i)).toBeInTheDocument();
  });

  it("renders one row per payslip with the final amount", () => {
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText(/9\.500\.000/)).toBeInTheDocument();
  });

  it("calls onGenerate when Generate is clicked", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: true, message: "1 slip gaji dibuat." });
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={onGenerate} onFinalize={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(await screen.findByText(/1 slip gaji dibuat/i)).toBeInTheDocument();
  });

  it("hides Generate and Finalize when the period is final", () => {
    render(<PayslipTable rows={ROWS} status="final" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finalisasi/i })).not.toBeInTheDocument();
  });

  it("asks for confirmation before finalizing", async () => {
    const onFinalize = vi.fn().mockResolvedValue({ ok: true });
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={onFinalize} />);
    fireEvent.click(screen.getByRole("button", { name: /finalisasi/i }));
    expect(onFinalize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /ya, finalisasi/i }));
    await waitFor(() => expect(onFinalize).toHaveBeenCalled());
  });

  it("expands a row to show rincian_harian", () => {
    render(<PayslipTable rows={ROWS} status="draft" onGenerate={vi.fn()} onFinalize={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /rincian budi/i }));
    expect(screen.getByText("2026-08-03")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- payslip-table.test.tsx
```

Expected: FAIL — `Cannot find module './payslip-table'`.

- [ ] **Step 3: Write the client table**

```typescript
// src/app/(admin)/payroll/[periodId]/payslip-table.tsx
"use client";

import { useState } from "react";
import type { ActionResult } from "../actions";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { formatRupiah } from "@/lib/format/rupiah";

export type PayslipView = {
  id: string;
  nama: string;
  gajiPokok: number;
  hariKerjaEfektif: number;
  totalPotongan: number;
  gajiAkhir: number;
  rincian: RincianHarianEntry[];
};

export function PayslipTable({
  rows,
  status,
  onGenerate,
  onFinalize,
}: {
  rows: PayslipView[];
  status: "draft" | "final";
  onGenerate: () => Promise<ActionResult>;
  onFinalize: () => Promise<ActionResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? "Berhasil.");
  }

  return (
    <div className="space-y-4">
      {status === "draft" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onGenerate)}
            className="min-h-10 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {rows.length ? "Regenerate" : "Generate"}
          </button>
          {rows.length > 0 && !confirming && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="min-h-10 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 disabled:opacity-60"
            >
              Finalisasi
            </button>
          )}
          {confirming && (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-neutral-700">Kunci periode ini?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(onFinalize).then(() => setConfirming(false))}
                className="rounded bg-red-600 px-3 py-1.5 font-medium text-white"
              >
                Ya, finalisasi
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded border border-neutral-300 px-3 py-1.5">
                Batal
              </button>
            </span>
          )}
        </div>
      )}

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Belum ada slip gaji. Klik Generate.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Nama</th>
                <th className="px-4 py-2 font-medium">Gaji Pokok</th>
                <th className="px-4 py-2 font-medium">Hari Efektif</th>
                <th className="px-4 py-2 font-medium">Potongan</th>
                <th className="px-4 py-2 font-medium">Gaji Akhir</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((row) => (
                <>
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-medium text-neutral-900">{row.nama}</td>
                    <td className="px-4 py-2">{formatRupiah(row.gajiPokok)}</td>
                    <td className="px-4 py-2">{row.hariKerjaEfektif}</td>
                    <td className="px-4 py-2 text-red-600">{formatRupiah(row.totalPotongan)}</td>
                    <td className="px-4 py-2 font-semibold text-neutral-900">{formatRupiah(row.gajiAkhir)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Rincian ${row.nama}`}
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        {expanded === row.id ? "Tutup" : "Rincian"}
                      </button>
                      <a href={`/slip-gaji/${row.id}/pdf`} className="ml-3 text-xs text-blue-700 hover:underline">
                        PDF
                      </a>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={6} className="bg-neutral-50 px-4 py-2">
                        <ul className="space-y-1 text-xs text-neutral-600">
                          {row.rincian.map((r) => (
                            <li key={r.tanggal} className="flex flex-wrap gap-x-4">
                              <span className="w-24">{r.tanggal}</span>
                              <span className="w-20">{r.jenis}</span>
                              <span className="w-28">{r.status ?? "-"}</span>
                              <span>terlambat {r.menit_terlambat}m · pulang cepat {r.menit_pulang_cepat}m</span>
                              <span className="text-red-600">{formatRupiah(r.potongan)}</span>
                              {r.catatan && <span className="italic">{r.catatan}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- payslip-table.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Wire the detail page**

```typescript
// src/app/(admin)/payroll/[periodId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PayrollStatusBadge, type PayrollStatus } from "@/components/payroll-status-badge";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { monthLabel } from "@/lib/format/month";
import { PayslipTable, type PayslipView } from "./payslip-table";
import { generatePayroll, finalizePayroll } from "../actions";

export default async function PayrollPeriodPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: period, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, bulan, tahun, status, branches(nama)")
    .eq("id", periodId)
    .maybeSingle();
  if (periodErr) {
    return <p className="text-sm text-red-600">Gagal memuat periode payroll.</p>;
  }
  if (!period) notFound();

  const { data: slips, error: slipErr } = await db
    .from("payslips")
    .select("id, gaji_pokok, hari_kerja_efektif, total_potongan_absensi, gaji_akhir, rincian_harian, employees(nama)")
    .eq("payroll_period_id", periodId)
    .order("created_at", { ascending: true });

  const rows: PayslipView[] = slipErr
    ? []
    : (slips ?? []).map((s) => ({
        id: s.id,
        nama: (s.employees as { nama: string } | null)?.nama ?? "-",
        gajiPokok: Number(s.gaji_pokok),
        hariKerjaEfektif: s.hari_kerja_efektif,
        totalPotongan: Number(s.total_potongan_absensi),
        gajiAkhir: Number(s.gaji_akhir),
        rincian: (s.rincian_harian ?? []) as RincianHarianEntry[],
      }));

  async function onGenerate() {
    "use server";
    return generatePayroll(periodId);
  }
  async function onFinalize() {
    "use server";
    return finalizePayroll(periodId);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {(period.branches as { nama: string } | null)?.nama ?? "-"} — {monthLabel(period.bulan)} {period.tahun}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Slip gaji periode ini.</p>
        </div>
        <PayrollStatusBadge status={period.status as PayrollStatus} />
      </div>

      {slipErr && <p className="text-sm text-red-600">Gagal memuat slip gaji.</p>}

      <PayslipTable
        rows={rows}
        status={period.status as "draft" | "final"}
        onGenerate={onGenerate}
        onFinalize={onFinalize}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`, route `/payroll/[periodId]` listed.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/payroll/[periodId]"
git commit -m "feat(payroll): period detail with generate/finalize and payslip rincian"
```

---

## Task 10: Gate `/payroll` to hr_admin (route-access, proxy, nav)

**Files:**
- Modify: `src/lib/auth/route-access.ts`
- Test: `src/lib/auth/route-access.test.ts` (add cases — file exists from Foundation)
- Modify: `src/proxy.ts:41-49` (the decision switch)
- Modify: `src/app/(admin)/layout.tsx` (pass role to shell)
- Modify: `src/components/admin-shell.tsx` (accept `role`, filter nav)

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveRouteAccess` now also returns `"redirect-admin-home"` for an `atasan` (or other non-hr-admin admin) hitting a path in `HR_ADMIN_PATH_PREFIXES` (`["/payroll"]`).
- Consumed by: `src/proxy.ts`, `src/app/(admin)/layout.tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/route-access.test.ts  — ADD these cases to the existing describe block
import { describe, it, expect } from "vitest";
import { resolveRouteAccess } from "./route-access";

describe("resolveRouteAccess — hr-admin-only paths", () => {
  it("lets hr_admin and super_admin into /payroll", () => {
    expect(resolveRouteAccess("/payroll", "hr_admin")).toBe("allow");
    expect(resolveRouteAccess("/payroll/abc", "super_admin")).toBe("allow");
  });

  it("redirects an atasan away from /payroll to the admin home", () => {
    expect(resolveRouteAccess("/payroll", "atasan")).toBe("redirect-admin-home");
    expect(resolveRouteAccess("/payroll/abc", "atasan")).toBe("redirect-admin-home");
  });

  it("still redirects a karyawan to the employee home for /payroll", () => {
    expect(resolveRouteAccess("/payroll", "karyawan")).toBe("redirect-employee-home");
  });

  it("does not affect other admin paths for atasan", () => {
    expect(resolveRouteAccess("/dashboard", "atasan")).toBe("allow");
    expect(resolveRouteAccess("/persetujuan-cuti", "atasan")).toBe("allow");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- route-access.test.ts
```

Expected: FAIL — `resolveRouteAccess("/payroll", "atasan")` returns `"allow"`, expected `"redirect-admin-home"`.

- [ ] **Step 3: Update `route-access.ts`**

```typescript
// src/lib/auth/route-access.ts
export type Role = "karyawan" | "atasan" | "hr_admin" | "super_admin";
export type RouteAccessResult =
  | "allow"
  | "redirect-login"
  | "redirect-employee-home"
  | "redirect-admin-home";

const ADMIN_PATH_PREFIXES = [
  "/dashboard",
  "/karyawan",
  "/persetujuan-cuti",
  "/laporan",
  "/pengaturan",
  "/payroll",
];
// Admin paths that additionally exclude the `atasan` role — HR-admin business,
// not team-lead reporting (spec §1: /payroll is hr_admin/super_admin only).
const HR_ADMIN_PATH_PREFIXES = ["/payroll"];
const PUBLIC_PATHS = ["/login"];

export function resolveRouteAccess(pathname: string, role: Role | null): RouteAccessResult {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "allow";
  if (!role) return "redirect-login";

  const isAdminPath = ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminPath && role === "karyawan") return "redirect-employee-home";

  const isHrAdminPath = HR_ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  if (isHrAdminPath && role === "atasan") return "redirect-admin-home";

  return "allow";
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- route-access.test.ts
```

Expected: PASS (existing + 4 new).

- [ ] **Step 5: Handle the new decision in `proxy.ts`**

In `src/proxy.ts`, after the existing `redirect-employee-home` block, add:

```typescript
  if (decision === "redirect-admin-home") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
```

- [ ] **Step 6: Pass role to the shell and filter the nav**

In `src/app/(admin)/layout.tsx`, change the render line to pass the role:

```typescript
  return <AdminShell role={employee?.role ?? null}>{children}</AdminShell>;
```

In `src/components/admin-shell.tsx`, add `import { type Role } from "@/lib/auth/route-access";`, give each `/payroll` NAV_ITEM a marker, and filter:

```typescript
// add `hrAdminOnly: true` to the /payroll entry in NAV_ITEMS, then:

export function AdminShell({ role, children }: { role: Role | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => !("hrAdminOnly" in item && item.hrAdminOnly) || role === "hr_admin" || role === "super_admin",
  );
  // ...render `items` instead of NAV_ITEMS
}
```

- [ ] **Step 7: Verify build + full unit suite**

```bash
npm run build && npm test
```

Expected: build compiles; all unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/route-access.ts src/lib/auth/route-access.test.ts src/proxy.ts "src/app/(admin)/layout.tsx" src/components/admin-shell.tsx
git commit -m "feat(payroll): restrict /payroll to hr_admin (route-access, proxy, nav)"
```

---

## Task 11: Payslip PDF — document + route handler

**Files:**
- Modify: `package.json` (add `@react-pdf/renderer`)
- Create: `src/components/payslip-document.tsx`
- Create: `src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx` (`.tsx` — the handler renders JSX)
- Create: `tests/integration/payslip-pdf.test.ts`

**Interfaces:**
- Consumes: `formatRupiah` (T7), `RincianHarianEntry` (T3), `createServerSupabaseClient` (Foundation).
- Produces: `<PayslipDocument data={PayslipDocData} />` (a `@react-pdf/renderer` `<Document>`), where `type PayslipDocData = { nama: string; branchNama: string; periodeLabel: string; gajiPokok: number; hariKerjaEfektif: number; gajiHarian: number; totalPotongan: number; gajiAkhir: number }`.
- Produces: `GET /slip-gaji/[payslipId]/pdf` → `application/pdf`; 404 when the caller cannot see that payslip (RLS) or it does not exist.
- Consumed by: Task 9's admin "PDF" link and Task 12's employee page both point at this route.

**Fallback:** if `@react-pdf/renderer` cannot be made to build under Next 16.3 / React 19.2 after a reasonable attempt (import errors, RSC/bundler conflicts), implement the route as an HTML page at `src/app/(employee)/slip-gaji/[payslipId]/page.tsx` styled with `@media print` plus a `window.print()` button, and remove the dependency. The integration test below (Step 4) is written to assert behavior that holds either way (`200` + a body for the owner, `404` for a non-owner) — adjust only the `Content-Type` assertion.

- [ ] **Step 1: Add the dependency**

```bash
npm install @react-pdf/renderer
```

Then verify it imports in the Next build context:

```bash
npm run build
```

Expected: `Compiled successfully`. If it fails with an import/bundler error, switch to the HTML-print fallback (see the note above) before continuing.

- [ ] **Step 2: Write the document component**

```typescript
// src/components/payslip-document.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatRupiah } from "@/lib/format/rupiah";

export type PayslipDocData = {
  nama: string;
  branchNama: string;
  periodeLabel: string;
  gajiPokok: number;
  hariKerjaEfektif: number;
  gajiHarian: number;
  totalPotongan: number;
  gajiAkhir: number;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 4 },
  sub: { color: "#555", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "1px solid #eee" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 8, fontSize: 13 },
});

export function PayslipDocument({ data }: { data: PayslipDocData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Slip Gaji — {data.branchNama}</Text>
        <Text style={styles.sub}>{data.nama} · {data.periodeLabel}</Text>

        <View style={styles.row}><Text>Gaji Pokok</Text><Text>{formatRupiah(data.gajiPokok)}</Text></View>
        <View style={styles.row}><Text>Hari Kerja Efektif</Text><Text>{data.hariKerjaEfektif} hari</Text></View>
        <View style={styles.row}><Text>Gaji Harian</Text><Text>{formatRupiah(data.gajiHarian)}</Text></View>
        <View style={styles.row}><Text>Total Potongan Absensi</Text><Text>- {formatRupiah(data.totalPotongan)}</Text></View>
        <View style={styles.total}><Text>Gaji Akhir</Text><Text>{formatRupiah(data.gajiAkhir)}</Text></View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Write the route handler**

```tsx
// src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/format/month";
import { PayslipDocument } from "@/components/payslip-document";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ payslipId: string }> },
) {
  const { payslipId } = await params;
  const db = await createServerSupabaseClient();

  const { data: slip, error } = await db
    .from("payslips")
    .select(
      "gaji_pokok, hari_kerja_efektif, gaji_harian, total_potongan_absensi, gaji_akhir, " +
        "employees(nama), payroll_periods(bulan, tahun, branches(nama))",
    )
    .eq("id", payslipId)
    .maybeSingle();

  if (error) {
    console.error("payslip pdf: lookup failed", error);
    return new Response("Gagal memuat slip gaji.", { status: 500 });
  }
  if (!slip) {
    return new Response("Slip gaji tidak ditemukan.", { status: 404 });
  }

  const period = slip.payroll_periods as { bulan: number; tahun: number; branches: { nama: string } | null } | null;
  const buffer = await renderToBuffer(
    <PayslipDocument
      data={{
        nama: (slip.employees as { nama: string } | null)?.nama ?? "-",
        branchNama: period?.branches?.nama ?? "-",
        periodeLabel: period ? `${monthLabel(period.bulan)} ${period.tahun}` : "-",
        gajiPokok: Number(slip.gaji_pokok),
        hariKerjaEfektif: slip.hari_kerja_efektif,
        gajiHarian: Number(slip.gaji_harian),
        totalPotongan: Number(slip.total_potongan_absensi),
        gajiAkhir: Number(slip.gaji_akhir),
      }}
    />,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="slip-gaji-${payslipId}.pdf"`,
    },
  });
}
```

Next supports `route.js|jsx|ts|tsx`; this one is `.tsx` because it renders `<PayslipDocument />`.

- [ ] **Step 4: Write the integration test**

```typescript
// tests/integration/payslip-pdf.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

// This test hits the running dev server's route handler. Skip unless BASE_URL is set.
const BASE_URL = process.env.PAYSLIP_PDF_BASE_URL; // e.g. http://localhost:3000

describe.skipIf(!BASE_URL)("payslip PDF route", () => {
  let ownerCookie: string;
  let strangerCookie: string;
  let payslipId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db.from("branches").insert({ nama: `PDF ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    const mk = async (role: string, key: string) => {
      const { data: u } = await db.auth.admin.createUser({ email: `${key}.pdf.${suffix}@test.local`, password, email_confirm: true });
      await db.from("employees").insert({
        id: u!.user!.id, nama: key, email: `${key}.pdf.${suffix}@test.local`, branch_id: branch!.id,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role,
      });
      return u!.user!.id;
    };
    const ownerId = await mk("karyawan", "owner");
    await mk("karyawan", "stranger");

    const { data: period } = await db.from("payroll_periods").insert({ branch_id: branch!.id, bulan: 8, tahun: 2026 }).select().single();
    const { data: slip } = await db.from("payslips").insert({
      payroll_period_id: period!.id, employee_id: ownerId, gaji_pokok: 10_000_000,
      hari_kerja_efektif: 20, gaji_harian: 500_000, total_potongan_absensi: 0, gaji_akhir: 10_000_000, rincian_harian: [],
    }).select().single();
    payslipId = slip!.id;

    const login = async (key: string) => {
      const c = createClient(SUPABASE_URL, ANON_KEY);
      const { data } = await c.auth.signInWithPassword({ email: `${key}.pdf.${suffix}@test.local`, password });
      return `sb-access-token=${data.session!.access_token}; sb-refresh-token=${data.session!.refresh_token}`;
    };
    ownerCookie = await login("owner");
    strangerCookie = await login("stranger");
  });

  it("returns a PDF for the payslip owner", async () => {
    const res = await fetch(`${BASE_URL}/slip-gaji/${payslipId}/pdf`, { headers: { cookie: ownerCookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(500);
  });

  it("returns 404 for a stranger (RLS hides the row)", async () => {
    const res = await fetch(`${BASE_URL}/slip-gaji/${payslipId}/pdf`, { headers: { cookie: strangerCookie } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the integration test**

```bash
# in one shell:
npm run dev
# in another:
PAYSLIP_PDF_BASE_URL=http://localhost:3000 npm run test:integration -- payslip-pdf.test.ts
```

Expected: PASS (2 tests). If `@react-pdf/renderer` was swapped for the HTML fallback, the first test asserts `text/html` instead — adjust and note it in the commit.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/payslip-document.tsx "src/app/(employee)/slip-gaji" tests/integration/payslip-pdf.test.ts
git commit -m "feat(payroll): payslip PDF document + download route"
```

---

## Task 12: `(employee)/slip-gaji` — employee's own finalized payslips

**Files:**
- Create: `src/app/(employee)/slip-gaji/page.tsx`
- Modify: `src/components/employee-shell.tsx` (add a nav entry if the bottom nav has room; otherwise link from `/profil` — check the existing file first)

**Interfaces:**
- Consumes: `formatRupiah` (T7), `createServerSupabaseClient` / `getCurrentEmployee` (Foundation), the PDF route from Task 11.
- Produces: page listing the current employee's payslips whose period `status = 'final'`, newest first, each with a PDF download link.

- [ ] **Step 1: Write the page**

```typescript
// src/app/(employee)/slip-gaji/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/format/rupiah";
import { monthLabel } from "@/lib/format/month";

export default async function SlipGajiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  // Only finalized periods are visible to the employee. The !inner join turns
  // the embed into a real join so the status filter excludes non-final rows,
  // matching the employees!inner pattern used in the dashboard summary.
  const { data, error } = await db
    .from("payslips")
    .select("id, gaji_akhir, payroll_periods!inner(bulan, tahun, status)")
    .eq("employee_id", employee.id)
    .eq("payroll_periods.status", "final")
    .order("created_at", { ascending: false });

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Slip Gaji</h1>

      {error && <p className="text-sm text-red-600">Gagal memuat slip gaji.</p>}
      {!error && (!data || data.length === 0) && (
        <p className="text-sm text-neutral-500">Belum ada slip gaji yang difinalisasi.</p>
      )}

      <ul className="divide-y divide-neutral-200">
        {(data ?? []).map((s) => {
          const p = s.payroll_periods as { bulan: number; tahun: number };
          return (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {monthLabel(p.bulan)} {p.tahun}
                </p>
                <p className="text-sm text-neutral-500">{formatRupiah(Number(s.gaji_akhir))}</p>
              </div>
              <a
                href={`/slip-gaji/${s.id}/pdf`}
                className="min-h-11 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800"
              >
                Unduh PDF
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Add navigation**

Read `src/components/employee-shell.tsx`. If the bottom nav has ≤4 items, add a "Slip Gaji" entry (`href="/slip-gaji"`, inline SVG document icon). If it already has 5, instead add a `<Link href="/slip-gaji">` row on the `/profil` page. Keep touch targets ≥44px and follow the existing item markup exactly.

- [ ] **Step 3: Verify build + full suite**

```bash
npm run build && npm test
```

Expected: build compiles with `/slip-gaji` listed; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(employee)/slip-gaji/page.tsx" src/components/employee-shell.tsx
git commit -m "feat(payroll): employee slip-gaji page (finalized payslips + PDF)"
```

---

## Post-plan verification

After Task 12, run the full gates and record the output:

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npm run test:integration -- payroll-rpc.test.ts
```

Then the final whole-branch review (subagent-driven-development skill), then `finishing-a-development-branch`.

## Deferred to later plans (not this plan's scope)

- Audit logging of generate/finalize (Plan 5 owns `audit_logs` infrastructure).
- Holidays / work_schedules / departments management UI (Plan 5).
- Un-finalize / post-final correction workflow (operational; out of MVP scope).
- Rupiah rounding policy beyond 2 decimals (open item — one-line change in `round2`/`compute` if HR asks for whole-rupiah).
- Draft payslips are hidden from employees at the query level, not by RLS (`payslips_select` stays `own OR is_admin_role()`); tightening RLS to also gate on period status is a Plan 6 hardening note.
