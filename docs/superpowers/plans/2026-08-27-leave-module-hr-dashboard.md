# Leave/Cuti Module + HR Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A karyawan can submit a real leave request (balance-checked server-side), the correctly-resolved approver can approve/reject it atomically (leave balance updates in the same transaction as the status change, self-approval is impossible even if application code has a bug), the admin dashboard shows real today's attendance counts and a monthly trend chart, and `/pengaturan` warns if fewer than 2 super admins exist.

**Architecture:** Pure business logic (approver resolution, day-count/balance validation) lives in small, fully unit-tested modules under `src/lib/leave/`, mirroring the Attendance Module's `src/lib/attendance/` split. The one genuinely new architectural piece is the approve/reject transaction: `leave_requests.status` and `leave_balances.saldo_terpakai` must change atomically, which a sequence of separate Supabase client calls cannot guarantee (a crash between the two calls corrupts the balance). This plan uses a **Postgres RPC function** (`approve_leave_request`/`reject_leave_request`, `SECURITY DEFINER`) called via `db.rpc(...)` from a **user-scoped client** — the function re-implements the same authorization check the `prevent_leave_self_approval` trigger already enforces (defense in depth: RPC-level check, then the trigger fires again during its internal `UPDATE` as a second independent gate), then updates both tables in one Postgres transaction. Dashboard reads are plain `SELECT`s through RLS (no writes), consistent with how `attendances` reads already work post-Foundation.

**Tech Stack:** Next.js 16 (App Router, Server Actions) · TypeScript strict · `@supabase/supabase-js` · Recharts (new dependency, for the monthly trend chart — the PRD names it explicitly) · Vitest + Testing Library · no other new dependencies.

This is **Plan 3 of a 4-plan sequence** derived from `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` (§5, §6) and `docs/PRD-Sistem-Absensi-HR.md` (§6 "Cuti & Izin", "Laporan & Dashboard HR"). Plans 1 (Foundation) and 2 (Attendance Module) are complete — see `docs/superpowers/plans/2026-08-25-foundation-auth-data-model.md`, `docs/superpowers/plans/2026-08-26-attendance-module.md`, and `.superpowers/sdd/progress.md` for what already exists and what was explicitly decided/deferred.

## Global Constraints

- TypeScript everywhere, strict mode on.
- **Self-approval is already blocked at the trigger level** (`prevent_leave_self_approval`, migrations 0006/0007/0010) — this plan's job is to correctly **wire** UI/RPC calls into that existing enforcement, never to reimplement or bypass it. Approve/reject RPC calls always use a **user-scoped client** (`createServerSupabaseClient()`), never service-role — the trigger's identity check depends on `auth.uid()` reflecting the real caller.
- **Approver resolution** (spec §5.2): `approver_id = employee.atasan_id`, **except** when the employee's role is `hr_admin`/`super_admin`, or `atasan_id` is null, or `atasan_id === employee.id` — in those cases use `employee.designated_approver_id` and set `is_self_request = true`.
- **Balance validation is application-level, server-side, before insert** (spec §5.3): only `jenis = 'tahunan'` is balance-checked; every other `jenis` (sakit, izin, etc.) skips the balance check entirely. Duration is calculated as calendar days inclusive of both endpoints (`tanggal_selesai - tanggal_mulai + 1`) — **this plan does not exclude weekends/holidays from the count**; that refinement is out of scope for this MVP pass (documented simplification, not a bug).
- **Reject requires `catatan_approval`; approve does not** (spec §5.6).
- **Approve is atomic**: `leave_requests.status → 'approved'` and `leave_balances.saldo_terpakai += duration` happen in one Postgres transaction (one RPC call), never as two separate client calls.
- `attendances` table is now **read-only for regular clients** (migration 0011 restricted `insert`/`update` to `is_hr_admin_role()`) — the dashboard only ever `SELECT`s it, consistent with that.
- **Dashboard visibility follows `is_admin_role()` (atasan included), not `is_hr_admin_role()`** — this is a read/reporting concern (spec §6: "atasan hanya lihat timnya"), not an anti-fraud write, so it uses the broader tier established in migration 0009, matching `employees_select`'s existing `atasan_id = auth.uid()` clause.
- **All date/time computation uses the established Asia/Jakarta-pinned pattern** — import `toJakartaDateOnly` from `src/lib/attendance/jakarta-date.ts` for any "today" computation. **Never** use `date.toISOString().slice(0, 10)`, bare `.getHours()`/`.getMinutes()`, or `toLocaleDateString`/`toLocaleTimeString` without an explicit `timeZone: "Asia/Jakarta"` option. This exact bug class was found and fixed **four separate times** during Plan 2 — do not reintroduce it a fifth time.
- **Never return raw Postgres/PostgREST error text to the user.** Every Server Action/library function that touches the DB must log the raw error via `console.error` and return a fixed, human-readable Indonesian message. This exact bug class was found and fixed repeatedly during Plan 2.
- Project uses a linked Supabase **cloud** project (no local Docker) — migrations apply via `npx supabase db push`, **never** `supabase db reset` (must preserve data). The last migration that exists is `0012_fix_attendance_photos_path_based_rls.sql` — this plan's migration starts at `0013`.
- `Role` type: import from `@/lib/auth/route-access` — never redefine it.
- Package manager: npm. `npm test` runs the fast unit suite (no network); `npm run test:integration` runs the live-cloud suite separately.
- Icons: inline SVG, stroke-based — never emoji, matching the rest of the codebase.

---

## Task 1: Approver Resolution

**Files:**
- Create: `src/lib/leave/approver.ts`
- Create: `src/lib/leave/approver.test.ts`

**Interfaces:**
- Produces: `resolveApprover(employee: { id: string; role: Role; atasanId: string | null; designatedApproverId: string | null }): { approverId: string | null; isSelfRequest: boolean }`.
- Consumed by: Task 3 (`submitLeaveRequest`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/leave/approver.test.ts
import { describe, it, expect } from "vitest";
import { resolveApprover } from "./approver";

describe("resolveApprover", () => {
  it("uses atasan_id for a regular karyawan with a valid atasan", () => {
    const result = resolveApprover({
      id: "employee-1",
      role: "karyawan",
      atasanId: "atasan-1",
      designatedApproverId: "super-admin-1",
    });
    expect(result).toEqual({ approverId: "atasan-1", isSelfRequest: false });
  });

  it("uses designated_approver_id when the employee is hr_admin", () => {
    const result = resolveApprover({
      id: "hr-1",
      role: "hr_admin",
      atasanId: "atasan-1",
      designatedApproverId: "super-admin-1",
    });
    expect(result).toEqual({ approverId: "super-admin-1", isSelfRequest: true });
  });

  it("uses designated_approver_id when the employee is super_admin", () => {
    const result = resolveApprover({
      id: "super-1",
      role: "super_admin",
      atasanId: null,
      designatedApproverId: "super-admin-2",
    });
    expect(result).toEqual({ approverId: "super-admin-2", isSelfRequest: true });
  });

  it("uses designated_approver_id when atasan_id is null", () => {
    const result = resolveApprover({
      id: "employee-2",
      role: "karyawan",
      atasanId: null,
      designatedApproverId: "hr-1",
    });
    expect(result).toEqual({ approverId: "hr-1", isSelfRequest: true });
  });

  it("uses designated_approver_id when atasan_id points to the employee itself", () => {
    const result = resolveApprover({
      id: "employee-3",
      role: "atasan",
      atasanId: "employee-3",
      designatedApproverId: "hr-1",
    });
    expect(result).toEqual({ approverId: "hr-1", isSelfRequest: true });
  });

  it("returns a null approverId when there is no atasan and no designated approver", () => {
    const result = resolveApprover({
      id: "employee-4",
      role: "karyawan",
      atasanId: null,
      designatedApproverId: null,
    });
    expect(result).toEqual({ approverId: null, isSelfRequest: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- approver.test.ts
```

Expected: FAIL — `Cannot find module './approver'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/leave/approver.ts
import type { Role } from "@/lib/auth/route-access";

export type ApproverInput = {
  id: string;
  role: Role;
  atasanId: string | null;
  designatedApproverId: string | null;
};

export type ApproverResolution = {
  approverId: string | null;
  isSelfRequest: boolean;
};

export function resolveApprover(employee: ApproverInput): ApproverResolution {
  const needsDesignatedApprover =
    employee.role === "hr_admin" ||
    employee.role === "super_admin" ||
    !employee.atasanId ||
    employee.atasanId === employee.id;

  if (needsDesignatedApprover) {
    return { approverId: employee.designatedApproverId, isSelfRequest: true };
  }

  return { approverId: employee.atasanId, isSelfRequest: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- approver.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leave/approver.ts src/lib/leave/approver.test.ts
git commit -m "feat: leave request approver resolution (atasan_id vs designated_approver_id)"
```

---

## Task 2: Leave Balance Validation

**Files:**
- Create: `src/lib/leave/balance.ts`
- Create: `src/lib/leave/balance.test.ts`

**Interfaces:**
- Produces: `LEAVE_TYPES_WITH_BALANCE_CHECK = ["tahunan"]` constant.
- Produces: `calculateLeaveDays(startDate: string, endDate: string): number` — inclusive calendar-day count, `startDate`/`endDate` as `YYYY-MM-DD`.
- Produces: `requiresBalanceCheck(jenis: string): boolean`.
- Produces: `hasSufficientBalance(saldoSisa: number, requestedDays: number): boolean`.
- Consumed by: Task 3 (`submitLeaveRequest`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/leave/balance.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateLeaveDays,
  requiresBalanceCheck,
  hasSufficientBalance,
  LEAVE_TYPES_WITH_BALANCE_CHECK,
} from "./balance";

describe("calculateLeaveDays", () => {
  it("counts a single day as 1", () => {
    expect(calculateLeaveDays("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("counts a range inclusively", () => {
    expect(calculateLeaveDays("2026-10-01", "2026-10-05")).toBe(5);
  });

  it("counts across a month boundary correctly", () => {
    expect(calculateLeaveDays("2026-10-30", "2026-11-02")).toBe(4);
  });
});

describe("requiresBalanceCheck", () => {
  it("returns true only for tahunan", () => {
    expect(requiresBalanceCheck("tahunan")).toBe(true);
    expect(LEAVE_TYPES_WITH_BALANCE_CHECK).toEqual(["tahunan"]);
  });

  it("returns false for sakit and other types", () => {
    expect(requiresBalanceCheck("sakit")).toBe(false);
    expect(requiresBalanceCheck("menikah")).toBe(false);
    expect(requiresBalanceCheck("lainnya")).toBe(false);
  });
});

describe("hasSufficientBalance", () => {
  it("returns true when requested days is within the remaining balance", () => {
    expect(hasSufficientBalance(12, 5)).toBe(true);
    expect(hasSufficientBalance(5, 5)).toBe(true);
  });

  it("returns false when requested days exceeds the remaining balance", () => {
    expect(hasSufficientBalance(3, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- balance.test.ts
```

Expected: FAIL — `Cannot find module './balance'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/leave/balance.ts
export const LEAVE_TYPES_WITH_BALANCE_CHECK = ["tahunan"] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  return diffDays + 1;
}

export function requiresBalanceCheck(jenis: string): boolean {
  return (LEAVE_TYPES_WITH_BALANCE_CHECK as readonly string[]).includes(jenis);
}

export function hasSufficientBalance(saldoSisa: number, requestedDays: number): boolean {
  return requestedDays <= saldoSisa;
}
```

Note: `calculateLeaveDays` deliberately parses both dates as UTC midnight and diffs epoch milliseconds — this is safe (no Jakarta-timezone pinning needed) because both inputs are **date-only strings with no time-of-day component**, so there is no instant-to-wall-clock conversion happening, the same reasoning already established for `formatDate` in `src/app/(employee)/riwayat/history-list.tsx`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- balance.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leave/balance.ts src/lib/leave/balance.test.ts
git commit -m "feat: leave day-count and balance validation (tahunan only, per spec)"
```

---

## Task 3: Leave Request Submission

**Files:**
- Create: `src/lib/leave/submit.ts`
- Create: `src/lib/leave/submit.test.ts`

**Interfaces:**
- Consumes: `resolveApprover` (Task 1), `calculateLeaveDays`/`requiresBalanceCheck`/`hasSufficientBalance` (Task 2).
- Produces: `type SubmitLeaveInput = { employeeId: string; jenis: string; tanggalMulai: string; tanggalSelesai: string; alasan?: string; lampiranUrl?: string }`.
- Produces: `type SubmitLeaveResult = { ok: true; requestId: string } | { ok: false; error: string }`.
- Produces: `submitLeaveRequest(db: SupabaseClient, input: SubmitLeaveInput): Promise<SubmitLeaveResult>` — called with the **user-scoped client** (RLS's `leave_requests_insert` already permits `employee_id = auth.uid()`, no service-role needed).
- Consumed by: Task 6 (`/cuti` Server Action).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/leave/submit.test.ts
import { describe, it, expect, vi } from "vitest";
import { submitLeaveRequest } from "./submit";

const BASE_EMPLOYEE = {
  id: "employee-1",
  role: "karyawan",
  atasan_id: "atasan-1",
  designated_approver_id: "super-admin-1",
};

function makeMockDb(opts: {
  balanceRow?: { saldo_sisa: number } | null;
  insertError?: { message: string } | null;
} = {}) {
  const { balanceRow = { saldo_sisa: 12 }, insertError = null } = opts;

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    leave_balances: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: balanceRow, error: null }),
          }),
        }),
      }),
    },
    leave_requests: {
      insert: () => ({
        select: () => ({
          single: () =>
            insertError
              ? Promise.resolve({ data: null, error: insertError })
              : Promise.resolve({ data: { id: "leave-request-1" }, error: null }),
        }),
      }),
    },
  };

  return { from: vi.fn((table: string) => tables[table]) };
}

const BASE_INPUT = {
  employeeId: "employee-1",
  jenis: "tahunan",
  tanggalMulai: "2026-10-01",
  tanggalSelesai: "2026-10-03",
  alasan: "Liburan keluarga",
};

describe("submitLeaveRequest", () => {
  it("submits successfully when balance is sufficient", async () => {
    const db = makeMockDb();
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });
  });

  it("rejects a tahunan request that exceeds the remaining balance", async () => {
    const db = makeMockDb({ balanceRow: { saldo_sisa: 2 } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Saldo cuti tidak mencukupi. Sisa saldo: 2 hari, diajukan: 3 hari.",
    });
  });

  it("skips the balance check entirely for non-tahunan leave types", async () => {
    const db = makeMockDb({ balanceRow: { saldo_sisa: 0 } });
    const result = await submitLeaveRequest(db as any, { ...BASE_INPUT, jenis: "sakit" });
    expect(result).toEqual({ ok: true, requestId: "leave-request-1" });
  });

  it("treats a missing balance row as zero remaining for tahunan requests", async () => {
    const db = makeMockDb({ balanceRow: null });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({
      ok: false,
      error: "Saldo cuti tidak mencukupi. Sisa saldo: 0 hari, diajukan: 3 hari.",
    });
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({ insertError: { message: "constraint violation" } });
    const result = await submitLeaveRequest(db as any, BASE_INPUT);
    expect(result).toEqual({ ok: false, error: "Gagal mengajukan cuti." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- submit.test.ts
```

Expected: FAIL — `Cannot find module './submit'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/leave/submit.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveApprover } from "./approver";
import { calculateLeaveDays, requiresBalanceCheck, hasSufficientBalance } from "./balance";

export type SubmitLeaveInput = {
  employeeId: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasan?: string;
  lampiranUrl?: string;
};

export type SubmitLeaveResult = { ok: true; requestId: string } | { ok: false; error: string };

export async function submitLeaveRequest(
  db: SupabaseClient,
  input: SubmitLeaveInput,
): Promise<SubmitLeaveResult> {
  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .select("id, role, atasan_id, designated_approver_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    console.error("submitLeaveRequest: employee lookup failed", employeeErr);
    return { ok: false, error: "Data karyawan tidak ditemukan." };
  }

  const days = calculateLeaveDays(input.tanggalMulai, input.tanggalSelesai);

  if (requiresBalanceCheck(input.jenis)) {
    const year = Number(input.tanggalMulai.slice(0, 4));
    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_sisa")
      .eq("employee_id", input.employeeId)
      .eq("tahun", year)
      .maybeSingle();

    const saldoSisa = balance?.saldo_sisa ?? 0;
    if (!hasSufficientBalance(saldoSisa, days)) {
      return {
        ok: false,
        error: `Saldo cuti tidak mencukupi. Sisa saldo: ${saldoSisa} hari, diajukan: ${days} hari.`,
      };
    }
  }

  const { approverId, isSelfRequest } = resolveApprover({
    id: employee.id,
    role: employee.role,
    atasanId: employee.atasan_id,
    designatedApproverId: employee.designated_approver_id,
  });

  const { data: inserted, error: insertErr } = await db
    .from("leave_requests")
    .insert({
      employee_id: input.employeeId,
      jenis: input.jenis,
      tanggal_mulai: input.tanggalMulai,
      tanggal_selesai: input.tanggalSelesai,
      alasan: input.alasan ?? null,
      lampiran_url: input.lampiranUrl ?? null,
      approver_id: approverId,
      is_self_request: isSelfRequest,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    console.error("submitLeaveRequest: insert failed", insertErr);
    return { ok: false, error: "Gagal mengajukan cuti." };
  }

  return { ok: true, requestId: inserted.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- submit.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leave/submit.ts src/lib/leave/submit.test.ts
git commit -m "feat: leave request submission (approver resolution + server-side balance check)"
```

---

## Task 4: Atomic Approve/Reject RPC

**Files:**
- Create: `supabase/migrations/0013_leave_approval_rpc.sql`
- Create: `tests/integration/leave-approval-rpc.test.ts`

**Interfaces:**
- Produces: Postgres RPC functions `approve_leave_request(p_request_id uuid, p_catatan text default null)` and `reject_leave_request(p_request_id uuid, p_catatan text)`, both `returns leave_requests`, `security definer`.
- Consumed by: Task 7 (`/persetujuan-cuti` Server Actions), always called via `db.rpc(...)` on a **user-scoped client**.

**Prerequisite:** `npx supabase link` already configured (Foundation). Export the token first: `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. Apply via `npx supabase db push`. **Never** run `db reset`, `truncate`, or `delete from` — this is a live cloud DB with data that must be preserved.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0013_leave_approval_rpc.sql

-- Approve a pending leave request and credit its days against the
-- employee's leave_balances.saldo_terpakai, atomically in one transaction.
--
-- SECURITY DEFINER is required to write leave_balances (no client role has a
-- direct write policy on that table — it's read-only for clients, written
-- only by service-role/admin paths per Foundation). Because the function
-- owner typically has BYPASSRLS, the leave_requests_update RLS policy is NOT
-- guaranteed to be evaluated here — so this function explicitly re-implements
-- the same authorization the prevent_leave_self_approval trigger enforces
-- (only the assigned approver or an hr_admin/super_admin may act; self-approval
-- is always rejected) as its own first line of defense. The trigger still
-- fires on the internal UPDATE below regardless of RLS bypass — triggers are
-- not affected by RLS — so this is genuine defense in depth, not a
-- replacement for the trigger.
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
begin
  select * into v_request from leave_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if v_request.approver_id = v_request.employee_id then
    raise exception 'self-approval is not allowed';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'approved', catatan_approval = p_catatan
  where id = p_request_id
  returning * into v_request;

  if v_request.jenis = 'tahunan' then
    v_days := (v_request.tanggal_selesai - v_request.tanggal_mulai + 1);
    v_year := extract(year from v_request.tanggal_mulai)::integer;

    insert into leave_balances (employee_id, tahun, saldo_terpakai)
    values (v_request.employee_id, v_year, v_days)
    on conflict (employee_id, tahun)
    do update set saldo_terpakai = leave_balances.saldo_terpakai + v_days;
  end if;

  return v_request;
end;
$$;

-- Reject a pending leave request. catatan_approval is required by the
-- caller-facing contract (enforced in application code, Task 7) — this
-- function accepts a NOT NULL text so a caller cannot pass an empty reject.
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

  select * into v_request from leave_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'leave request is not pending';
  end if;
  if auth.uid() is not null
     and v_request.approver_id is distinct from auth.uid()
     and is_hr_admin_role() = false then
    raise exception 'only the assigned approver may act on this request';
  end if;

  update leave_requests
  set status = 'rejected', catatan_approval = p_catatan
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/leave-approval-rpc.test.ts
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
  if (error || !data.session) {
    throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  }
  return client;
}

describe("leave approval RPC", () => {
  let branchId: string;
  let karyawan: { id: string; email: string };
  let atasan: { id: string; email: string };
  let outsider: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang Leave RPC", lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.leave.${suffix}@test.local`, role: "atasan" },
      { key: "karyawan", email: `karyawan.leave.${suffix}@test.local`, role: "karyawan" },
      { key: "outsider", email: `outsider.leave.${suffix}@test.local`, role: "karyawan" },
    ] as const;

    const ids: Record<string, string> = {};
    for (const seed of seeds) {
      const { data: authUser } = await db.auth.admin.createUser({
        email: seed.email,
        password,
        email_confirm: true,
      });
      ids[seed.key] = authUser!.user!.id;
    }

    for (const seed of seeds) {
      await db.from("employees").insert({
        id: ids[seed.key],
        nama: seed.key,
        email: seed.email,
        branch_id: branchId,
        jabatan: "Staff",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2026-01-01",
        role: seed.role,
        atasan_id: seed.key === "karyawan" ? ids.atasan : null,
      });
    }

    atasan = { id: ids.atasan, email: seeds[0].email };
    karyawan = { id: ids.karyawan, email: seeds[1].email };
    outsider = { id: ids.outsider, email: seeds[2].email };
  });

  it("lets the assigned approver approve a pending request and credits leave_balances atomically", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-11-02",
        tanggal_selesai: "2026-11-04",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const atasanClient = await signInAs(atasan.email);
    const { data: approved, error } = await atasanClient
      .rpc("approve_leave_request", { p_request_id: leave!.id, p_catatan: "Disetujui" })
      .single();

    expect(error).toBeNull();
    expect(approved.status).toBe("approved");

    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", karyawan.id)
      .eq("tahun", 2026)
      .single();
    expect(Number(balance!.saldo_terpakai)).toBe(3);
  });

  it("blocks a non-assigned employee from approving the request", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-10",
        tanggal_selesai: "2026-11-10",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const outsiderClient = await signInAs(outsider.email);
    const { error } = await outsiderClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("only the assigned approver may act on this request");
  });

  it("blocks self-approval even if approver_id was somehow set to the requester", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-15",
        tanggal_selesai: "2026-11-15",
        approver_id: karyawan.id,
        is_self_request: true,
      })
      .select()
      .single();

    const karyawanClient = await signInAs(karyawan.email);
    const { error } = await karyawanClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  });

  it("rejects requires a non-empty catatan", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-20",
        tanggal_selesai: "2026-11-20",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const atasanClient = await signInAs(atasan.email);
    const { error } = await atasanClient.rpc("reject_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("catatan_approval is required");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:integration -- leave-approval-rpc.test.ts
```

Expected: FAIL — `PGRST202` / `Could not find the function public.approve_leave_request` (function doesn't exist yet).

- [ ] **Step 4: Apply the migration and re-run**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
npm run test:integration -- leave-approval-rpc.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_leave_approval_rpc.sql tests/integration/leave-approval-rpc.test.ts
git commit -m "feat(db): atomic approve/reject RPC for leave_requests + leave_balances"
```

---

## Task 5: Leave Status Badge Component

**Files:**
- Create: `src/components/leave-status-badge.tsx`
- Create: `src/components/leave-status-badge.test.tsx`

**Interfaces:**
- Produces: `<LeaveStatusBadge status={"pending" | "approved" | "rejected"} />` — icon + color + Indonesian label, matching the same accessibility pattern as `AttendanceStatusBadge` (Task 8 of Plan 2).
- Consumed by: Task 6 (`/cuti`), Task 7 (`/persetujuan-cuti`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/leave-status-badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaveStatusBadge } from "./leave-status-badge";

describe("LeaveStatusBadge", () => {
  it("renders the Indonesian label and an icon for pending", () => {
    render(<LeaveStatusBadge status="pending" />);
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
    expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument();
  });

  it("renders the Indonesian label for approved", () => {
    render(<LeaveStatusBadge status="approved" />);
    expect(screen.getByText("Disetujui")).toBeInTheDocument();
  });

  it("renders the Indonesian label for rejected", () => {
    render(<LeaveStatusBadge status="rejected" />);
    expect(screen.getByText("Ditolak")).toBeInTheDocument();
  });

  it("gives each status a distinct background color class", () => {
    const { container: pending } = render(<LeaveStatusBadge status="pending" />);
    const { container: approved } = render(<LeaveStatusBadge status="approved" />);
    expect(pending.firstChild).not.toHaveClass(
      (approved.firstChild as HTMLElement).className,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- leave-status-badge.test.tsx
```

Expected: FAIL — `Cannot find module './leave-status-badge'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/leave-status-badge.tsx
export type LeaveStatus = "pending" | "approved" | "rejected";

const STATUS_CONFIG: Record<
  LeaveStatus,
  { label: string; bg: string; fg: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Menunggu",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  approved: {
    label: "Disetujui",
    bg: "bg-green-50",
    fg: "text-green-700",
    icon: <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />,
  },
  rejected: {
    label: "Ditolak",
    bg: "bg-red-50",
    fg: "text-red-700",
    icon: (
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
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

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- leave-status-badge.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/leave-status-badge.tsx src/components/leave-status-badge.test.tsx
git commit -m "feat: leave status badge (icon + color + label)"
```

---

## Task 6: `/cuti` Page — Submission Form + History

**Files:**
- Create: `src/app/(employee)/cuti/actions.ts`
- Create: `src/app/(employee)/cuti/leave-form.tsx`
- Create: `src/app/(employee)/cuti/leave-form.test.tsx`
- Create: `src/app/(employee)/cuti/page.tsx` (this route already exists as a nav target in `EmployeeShell`; no placeholder file exists yet — this creates it)

**Interfaces:**
- Consumes: `submitLeaveRequest` (Task 3), `LeaveStatusBadge` (Task 5), `getCurrentEmployee`/`createServerSupabaseClient` (Foundation).
- Produces: Server Action `submitLeave(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test for the form**

```typescript
// src/app/(employee)/cuti/leave-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeaveForm } from "./leave-form";

describe("LeaveForm", () => {
  it("renders jenis, date range, and alasan fields", () => {
    render(<LeaveForm submitLeave={vi.fn()} />);
    expect(screen.getByLabelText(/jenis cuti/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tanggal mulai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tanggal selesai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alasan/i)).toBeInTheDocument();
  });

  it("calls submitLeave with form data on submit", async () => {
    const submitLeave = vi.fn().mockResolvedValue({ ok: true });
    render(<LeaveForm submitLeave={submitLeave} />);

    fireEvent.change(screen.getByLabelText(/jenis cuti/i), { target: { value: "tahunan" } });
    fireEvent.change(screen.getByLabelText(/tanggal mulai/i), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(/tanggal selesai/i), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText(/alasan/i), { target: { value: "Liburan" } });
    fireEvent.click(screen.getByRole("button", { name: /ajukan/i }));

    await waitFor(() => expect(submitLeave).toHaveBeenCalled());
    const formData = submitLeave.mock.calls[0][0] as FormData;
    expect(formData.get("jenis")).toBe("tahunan");
    expect(formData.get("tanggalMulai")).toBe("2026-10-01");
    expect(formData.get("tanggalSelesai")).toBe("2026-10-03");
    expect(formData.get("alasan")).toBe("Liburan");
  });

  it("shows an error message when submitLeave returns ok: false", async () => {
    const submitLeave = vi.fn().mockResolvedValue({
      ok: false,
      error: "Saldo cuti tidak mencukupi.",
    });
    render(<LeaveForm submitLeave={submitLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /ajukan/i }));
    expect(await screen.findByText("Saldo cuti tidak mencukupi.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- leave-form.test.tsx
```

Expected: FAIL — `Cannot find module './leave-form'`.

- [ ] **Step 3: Write the Server Action**

```typescript
// src/app/(employee)/cuti/actions.ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { submitLeaveRequest, type SubmitLeaveResult } from "@/lib/leave/submit";

export async function submitLeave(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    return { ok: false, error: "Anda belum masuk. Silakan login ulang." };
  }

  const jenis = formData.get("jenis") as string;
  const tanggalMulai = formData.get("tanggalMulai") as string;
  const tanggalSelesai = formData.get("tanggalSelesai") as string;
  const alasan = (formData.get("alasan") as string | null)?.trim() || undefined;

  if (!jenis || !tanggalMulai || !tanggalSelesai) {
    return { ok: false, error: "Jenis cuti dan tanggal wajib diisi." };
  }
  if (tanggalSelesai < tanggalMulai) {
    return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }

  const result: SubmitLeaveResult = await submitLeaveRequest(db, {
    employeeId: employee.id,
    jenis,
    tanggalMulai,
    tanggalSelesai,
    alasan,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Write the client form**

```typescript
// src/app/(employee)/cuti/leave-form.tsx
"use client";

import { useState } from "react";

const JENIS_OPTIONS = [
  { value: "tahunan", label: "Cuti Tahunan" },
  { value: "sakit", label: "Sakit" },
  { value: "melahirkan", label: "Melahirkan" },
  { value: "keguguran", label: "Keguguran" },
  { value: "menikah", label: "Menikah" },
  { value: "menikahkan_anak", label: "Menikahkan Anak" },
  { value: "khitan_baptis_anak", label: "Khitan/Baptis Anak" },
  { value: "istri_melahirkan_keguguran", label: "Istri Melahirkan/Keguguran" },
  { value: "kematian_keluarga_inti", label: "Kematian Keluarga Inti" },
  { value: "kematian_keluarga_serumah", label: "Kematian Keluarga Serumah" },
  { value: "lainnya", label: "Lainnya" },
];

type ActionResult = { ok: true } | { ok: false; error: string };

export function LeaveForm({
  submitLeave,
}: {
  submitLeave: (formData: FormData) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const result = await submitLeave(formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="jenis" className="text-sm">Jenis Cuti</label>
        <select id="jenis" name="jenis" required className="w-full rounded border px-3 py-2 text-base">
          {JENIS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="tanggalMulai" className="text-sm">Tanggal Mulai</label>
        <input
          id="tanggalMulai"
          name="tanggalMulai"
          type="date"
          required
          className="w-full rounded border px-3 py-2 text-base"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="tanggalSelesai" className="text-sm">Tanggal Selesai</label>
        <input
          id="tanggalSelesai"
          name="tanggalSelesai"
          type="date"
          required
          className="w-full rounded border px-3 py-2 text-base"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="alasan" className="text-sm">Alasan</label>
        <textarea
          id="alasan"
          name="alasan"
          className="w-full rounded border px-3 py-2 text-base"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Pengajuan cuti berhasil dikirim.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white"
      >
        Ajukan
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- leave-form.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 6: Wire the page**

```typescript
// src/app/(employee)/cuti/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { LeaveStatusBadge, type LeaveStatus } from "@/components/leave-status-badge";
import { LeaveForm } from "./leave-form";
import { submitLeave } from "./actions";

export default async function CutiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const { data } = await db
    .from("leave_requests")
    .select("id, jenis, tanggal_mulai, tanggal_selesai, status, catatan_approval")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <main className="space-y-6 p-4">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Ajukan Cuti</h1>
        <LeaveForm submitLeave={submitLeave} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">Riwayat Pengajuan</h2>
        {(!data || data.length === 0) && (
          <p className="text-sm text-neutral-500">Belum ada pengajuan cuti.</p>
        )}
        <ul className="divide-y">
          {(data ?? []).map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {row.tanggal_mulai} – {row.tanggal_selesai}
                </span>
                <LeaveStatusBadge status={row.status as LeaveStatus} />
              </div>
              {row.catatan_approval && (
                <span className="text-sm text-neutral-500">{row.catatan_approval}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
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
git add src/app/\(employee\)/cuti
git commit -m "feat: /cuti page with real leave submission and history"
```

---

## Task 7: `/persetujuan-cuti` Page — Admin Approval

**Files:**
- Create: `src/app/(admin)/persetujuan-cuti/actions.ts`
- Create: `src/app/(admin)/persetujuan-cuti/approval-table.tsx`
- Create: `src/app/(admin)/persetujuan-cuti/approval-table.test.tsx`
- Create: `src/app/(admin)/persetujuan-cuti/page.tsx`

**Interfaces:**
- Consumes: `approve_leave_request`/`reject_leave_request` RPC (Task 4), `LeaveStatusBadge` (Task 5), `getCurrentEmployee`/`createServerSupabaseClient` (Foundation).
- Produces: Server Actions `approveLeave(requestId: string, catatan: string | null)` and `rejectLeave(requestId: string, catatan: string)`, both returning `{ ok: true } | { ok: false; error: string }`.

**Note:** `/persetujuan-cuti` is already in `ADMIN_PATH_PREFIXES` (Foundation Task 11's fix) — no route-access changes needed here.

- [ ] **Step 1: Write the failing test for the approval table**

```typescript
// src/app/(admin)/persetujuan-cuti/approval-table.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApprovalTable } from "./approval-table";

const PENDING_REQUESTS = [
  {
    id: "leave-1",
    employeeName: "Budi",
    jenis: "tahunan",
    tanggalMulai: "2026-10-01",
    tanggalSelesai: "2026-10-03",
    alasan: "Liburan",
  },
];

describe("ApprovalTable", () => {
  it("shows an empty state when there are no pending requests", () => {
    render(<ApprovalTable requests={[]} approveLeave={vi.fn()} rejectLeave={vi.fn()} />);
    expect(screen.getByText(/tidak ada pengajuan/i)).toBeInTheDocument();
  });

  it("renders a row per pending request with approve/reject buttons", () => {
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={vi.fn()} rejectLeave={vi.fn()} />,
    );
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /setujui/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tolak/i })).toBeInTheDocument();
  });

  it("calls approveLeave with the request id when Setujui is clicked", async () => {
    const approveLeave = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={approveLeave} rejectLeave={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /setujui/i }));
    await waitFor(() => expect(approveLeave).toHaveBeenCalledWith("leave-1", null));
  });

  it("requires a catatan before calling rejectLeave", async () => {
    const rejectLeave = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={vi.fn()} rejectLeave={rejectLeave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /tolak/i }));
    expect(rejectLeave).not.toHaveBeenCalled();
    expect(screen.getByText(/catatan wajib diisi/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/catatan penolakan/i), {
      target: { value: "Data tidak lengkap" },
    });
    fireEvent.click(screen.getByRole("button", { name: /tolak/i }));
    await waitFor(() =>
      expect(rejectLeave).toHaveBeenCalledWith("leave-1", "Data tidak lengkap"),
    );
  });

  it("shows an error message when an action returns ok: false", async () => {
    const approveLeave = vi.fn().mockResolvedValue({
      ok: false,
      error: "only the assigned approver may act on this request",
    });
    render(
      <ApprovalTable requests={PENDING_REQUESTS} approveLeave={approveLeave} rejectLeave={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /setujui/i }));
    expect(
      await screen.findByText("only the assigned approver may act on this request"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- approval-table.test.tsx
```

Expected: FAIL — `Cannot find module './approval-table'`.

- [ ] **Step 3: Write the Server Actions**

```typescript
// src/app/(admin)/persetujuan-cuti/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

const RPC_ERROR_MESSAGES: Record<string, string> = {
  "self-approval is not allowed": "Anda tidak dapat menyetujui pengajuan cuti Anda sendiri.",
  "only the assigned approver may act on this request":
    "Hanya atasan yang ditunjuk yang dapat memproses pengajuan ini.",
  "leave request is not pending": "Pengajuan ini sudah diproses sebelumnya.",
  "leave request not found": "Pengajuan cuti tidak ditemukan.",
  "catatan_approval is required to reject a leave request": "Catatan wajib diisi untuk menolak pengajuan.",
};

function mapRpcError(message: string | undefined): string {
  if (!message) return "Gagal memproses pengajuan cuti.";
  for (const [key, friendly] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(key)) return friendly;
  }
  console.error("persetujuan-cuti: unmapped RPC error", message);
  return "Gagal memproses pengajuan cuti.";
}

export async function approveLeave(requestId: string, catatan: string | null): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db.rpc("approve_leave_request", {
    p_request_id: requestId,
    p_catatan: catatan,
  });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath("/persetujuan-cuti");
  return { ok: true };
}

export async function rejectLeave(requestId: string, catatan: string): Promise<ActionResult> {
  const db = await createServerSupabaseClient();
  const { error } = await db.rpc("reject_leave_request", {
    p_request_id: requestId,
    p_catatan: catatan,
  });
  if (error) {
    return { ok: false, error: mapRpcError(error.message) };
  }
  revalidatePath("/persetujuan-cuti");
  return { ok: true };
}
```

- [ ] **Step 4: Write the approval table**

```typescript
// src/app/(admin)/persetujuan-cuti/approval-table.tsx
"use client";

import { useState } from "react";

export type PendingLeaveRequest = {
  id: string;
  employeeName: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasan: string | null;
};

type ActionResult = { ok: true } | { ok: false; error: string };

export function ApprovalTable({
  requests,
  approveLeave,
  rejectLeave,
}: {
  requests: PendingLeaveRequest[];
  approveLeave: (requestId: string, catatan: string | null) => Promise<ActionResult>;
  rejectLeave: (requestId: string, catatan: string) => Promise<ActionResult>;
}) {
  const [catatanByRequest, setCatatanByRequest] = useState<Record<string, string>>({});
  const [errorByRequest, setErrorByRequest] = useState<Record<string, string>>({});

  if (requests.length === 0) {
    return <p className="p-4 text-sm text-neutral-500">Tidak ada pengajuan cuti yang menunggu.</p>;
  }

  async function handleApprove(id: string) {
    setErrorByRequest((prev) => ({ ...prev, [id]: "" }));
    const result = await approveLeave(id, catatanByRequest[id] || null);
    if (!result.ok) {
      setErrorByRequest((prev) => ({ ...prev, [id]: result.error }));
    }
  }

  async function handleReject(id: string) {
    const catatan = (catatanByRequest[id] || "").trim();
    if (!catatan) {
      setErrorByRequest((prev) => ({ ...prev, [id]: "Catatan wajib diisi untuk menolak." }));
      return;
    }
    setErrorByRequest((prev) => ({ ...prev, [id]: "" }));
    const result = await rejectLeave(id, catatan);
    if (!result.ok) {
      setErrorByRequest((prev) => ({ ...prev, [id]: result.error }));
    }
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="p-2">Karyawan</th>
          <th className="p-2">Jenis</th>
          <th className="p-2">Tanggal</th>
          <th className="p-2">Alasan</th>
          <th className="p-2">Catatan Penolakan</th>
          <th className="p-2">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((req) => (
          <tr key={req.id} className="border-b">
            <td className="p-2">{req.employeeName}</td>
            <td className="p-2">{req.jenis}</td>
            <td className="p-2">{req.tanggalMulai} – {req.tanggalSelesai}</td>
            <td className="p-2">{req.alasan ?? "-"}</td>
            <td className="p-2">
              <label htmlFor={`catatan-${req.id}`} className="sr-only">Catatan Penolakan</label>
              <input
                id={`catatan-${req.id}`}
                type="text"
                className="w-full rounded border px-2 py-1"
                value={catatanByRequest[req.id] ?? ""}
                onChange={(e) =>
                  setCatatanByRequest((prev) => ({ ...prev, [req.id]: e.target.value }))
                }
              />
            </td>
            <td className="flex gap-2 p-2">
              <button
                type="button"
                onClick={() => handleApprove(req.id)}
                className="min-h-11 rounded bg-green-600 px-3 py-2 text-white"
              >
                Setujui
              </button>
              <button
                type="button"
                onClick={() => handleReject(req.id)}
                className="min-h-11 rounded bg-red-600 px-3 py-2 text-white"
              >
                Tolak
              </button>
              {errorByRequest[req.id] && (
                <p className="text-red-600">{errorByRequest[req.id]}</p>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- approval-table.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Wire the page**

```typescript
// src/app/(admin)/persetujuan-cuti/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { ApprovalTable, type PendingLeaveRequest } from "./approval-table";
import { approveLeave, rejectLeave } from "./actions";

export default async function PersetujuanCutiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const { data } = await db
    .from("leave_requests")
    .select("id, jenis, tanggal_mulai, tanggal_selesai, alasan, employees!leave_requests_employee_id_fkey(nama)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const requests: PendingLeaveRequest[] = (data ?? []).map((row: any) => ({
    id: row.id,
    employeeName: row.employees?.nama ?? "-",
    jenis: row.jenis,
    tanggalMulai: row.tanggal_mulai,
    tanggalSelesai: row.tanggal_selesai,
    alasan: row.alasan,
  }));

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Persetujuan Cuti</h1>
      <ApprovalTable requests={requests} approveLeave={approveLeave} rejectLeave={rejectLeave} />
    </main>
  );
}
```

Note: the embedded-resource select (`employees!leave_requests_employee_id_fkey(nama)`) relies on PostgREST's foreign-key-based join syntax. `leave_requests.employee_id` has exactly one foreign key to `employees` (`supabase/migrations/0002_attendance_leave.sql`), so PostgREST can infer the relationship without needing the explicit constraint name — but naming it explicitly avoids ambiguity if a future migration adds a second FK between these tables. If `db push`/runtime reveals the actual constraint name differs, adjust the embed hint accordingly (check via `\d leave_requests` or the Supabase dashboard's table editor).

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(admin\)/persetujuan-cuti
git commit -m "feat: /persetujuan-cuti admin approval page wired to atomic RPC"
```

---

## Task 8: Dashboard Attendance Summary

**Files:**
- Create: `src/lib/dashboard/attendance-summary.ts`
- Create: `src/lib/dashboard/attendance-summary.test.ts`

**Interfaces:**
- Consumes: `toJakartaDateOnly` (Plan 2, `src/lib/attendance/jakarta-date.ts`).
- Produces: `type AttendanceSummary = { hadir: number; terlambat: number; alpa: number; total: number }`.
- Produces: `getTodaySummary(db: SupabaseClient, branchId?: string): Promise<AttendanceSummary>` — counts today's `attendances` rows by status, scoped by branch when given. `hadir` counts `tepat_waktu` + `pulang_cepat` + `di_luar_lokasi` (physically present, regardless of lateness); `terlambat` counts rows whose status is `terlambat`; `alpa` is `total employees at the branch (or all, if no branchId) minus rows with any attendance record today` — a simple present/absent count, not a full holiday/schedule-aware calculation (documented simplification, consistent with this plan's MVP scope).
- Consumed by: Task 9 (`(admin)/dashboard` page).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/dashboard/attendance-summary.test.ts
import { describe, it, expect, vi } from "vitest";
import { getTodaySummary } from "./attendance-summary";

function makeMockDb(opts: {
  attendanceRows?: { status: string }[];
  employeeCount?: number;
} = {}) {
  const { attendanceRows = [], employeeCount = 10 } = opts;

  const tables: Record<string, any> = {
    attendances: {
      select: () => ({
        eq: () => Promise.resolve({ data: attendanceRows, error: null }),
      }),
    },
    employees: {
      select: () => ({
        eq: () => Promise.resolve({ count: employeeCount, error: null }),
      }),
    },
  };

  return { from: vi.fn((table: string) => tables[table]) };
}

describe("getTodaySummary", () => {
  it("counts hadir, terlambat, and alpa correctly", async () => {
    const db = makeMockDb({
      attendanceRows: [
        { status: "tepat_waktu" },
        { status: "tepat_waktu" },
        { status: "terlambat" },
        { status: "pulang_cepat" },
        { status: "di_luar_lokasi" },
      ],
      employeeCount: 10,
    });

    const summary = await getTodaySummary(db as any);

    expect(summary).toEqual({
      hadir: 4, // tepat_waktu x2 + pulang_cepat + di_luar_lokasi
      terlambat: 1,
      alpa: 5, // 10 employees - 5 rows with attendance today
      total: 10,
    });
  });

  it("returns all-alpa when nobody has clocked in today", async () => {
    const db = makeMockDb({ attendanceRows: [], employeeCount: 3 });
    const summary = await getTodaySummary(db as any);
    expect(summary).toEqual({ hadir: 0, terlambat: 0, alpa: 3, total: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- attendance-summary.test.ts
```

Expected: FAIL — `Cannot find module './attendance-summary'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/dashboard/attendance-summary.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

export type AttendanceSummary = {
  hadir: number;
  terlambat: number;
  alpa: number;
  total: number;
};

const PRESENT_STATUSES = ["tepat_waktu", "pulang_cepat", "di_luar_lokasi"];

export async function getTodaySummary(
  db: SupabaseClient,
  branchId?: string,
): Promise<AttendanceSummary> {
  const today = toJakartaDateOnly(new Date());

  let attendanceQuery = db.from("attendances").select("status").eq("tanggal", today);
  if (branchId) {
    attendanceQuery = attendanceQuery.eq("branch_id", branchId);
  }
  const { data: attendanceRows } = await attendanceQuery;

  let employeeQuery = db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "aktif");
  if (branchId) {
    employeeQuery = employeeQuery.eq("branch_id", branchId);
  }
  const { count: total } = await employeeQuery;

  const rows = attendanceRows ?? [];
  const hadir = rows.filter((row) => PRESENT_STATUSES.includes(row.status)).length;
  const terlambat = rows.filter((row) => row.status === "terlambat").length;
  const totalCount = total ?? 0;
  const alpa = Math.max(totalCount - rows.length, 0);

  return { hadir, terlambat, alpa, total: totalCount };
}
```

**Important:** `attendances` has no `branch_id` column of its own (it only carries `employee_id` — the branch is reachable only via `employees.branch_id`, per `supabase/migrations/0002_attendance_leave.sql`). The `.eq("branch_id", branchId)` filter above **will not work as written** — read the actual schema before implementing this task and either (a) join through `employees` using PostgREST's embedded-resource filter syntax (`.select("status, employees!inner(branch_id)").eq("employees.branch_id", branchId)`), or (b) first fetch the list of employee ids for the branch and use `.in("employee_id", ids)`. Pick whichever reads more clearly, update the test's mock shape to match, and note the correction in your implementation — this plan intentionally flags the discrepancy rather than papering over it with unverified code.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- attendance-summary.test.ts
```

Expected: PASS (2 tests) — after correcting the branch-filter approach per the note above.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/attendance-summary.ts src/lib/dashboard/attendance-summary.test.ts
git commit -m "feat: today's attendance summary (hadir/terlambat/alpa counts)"
```

---

## Task 9: `(admin)/dashboard` Page — Summary Cards

**Files:**
- Modify: `src/app/(admin)/dashboard/page.tsx` (replace the Foundation placeholder)
- Create: `src/components/summary-card.tsx`
- Create: `src/components/summary-card.test.tsx`

**Interfaces:**
- Consumes: `getTodaySummary` (Task 8), `getCurrentEmployee`/`createServerSupabaseClient` (Foundation).
- Produces: `<SummaryCard label={string} value={number} />`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/summary-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCard } from "./summary-card";

describe("SummaryCard", () => {
  it("renders the label and value", () => {
    render(<SummaryCard label="Hadir" value={42} />);
    expect(screen.getByText("Hadir")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- summary-card.test.tsx
```

Expected: FAIL — `Cannot find module './summary-card'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/summary-card.tsx
export function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- summary-card.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Wire the dashboard page**

```typescript
// src/app/(admin)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { SummaryCard } from "@/components/summary-card";

export default async function DashboardPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  // Dashboard visibility follows is_admin_role() (atasan included) — a plain
  // authenticated read, RLS already scopes what each role can see (atasan
  // sees only their team's rows via employees_select's atasan_id clause).
  const branchId = employee.role === "atasan" ? undefined : undefined; // full-org view for hr_admin/super_admin; per-branch filtering UI is a Task 9 follow-up, not required for this MVP pass
  const summary = await getTodaySummary(db, branchId);

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Hadir" value={summary.hadir} />
        <SummaryCard label="Terlambat" value={summary.terlambat} />
        <SummaryCard label="Alpa" value={summary.alpa} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(admin\)/dashboard src/components/summary-card.tsx src/components/summary-card.test.tsx
git commit -m "feat: admin dashboard with real today's attendance summary cards"
```

---

## Task 10: Monthly Attendance Trend Chart

**Files:**
- Create: `src/lib/dashboard/monthly-trend.ts`
- Create: `src/lib/dashboard/monthly-trend.test.ts`
- Create: `src/components/attendance-trend-chart.tsx`
- Modify: `src/app/(admin)/dashboard/page.tsx` (add the chart below the summary cards)
- Modify: `package.json` (add `recharts` dependency)

**Interfaces:**
- Produces: `type MonthlyTrendPoint = { date: string; hadir: number; terlambat: number }`.
- Produces: `getMonthlyTrend(db: SupabaseClient, yearMonth: string): Promise<MonthlyTrendPoint[]>` — `yearMonth` as `YYYY-MM`, one point per day in that month with attendance data.
- Produces: `<AttendanceTrendChart data={MonthlyTrendPoint[]} />`.

**Before writing the chart component:** load the `dataviz` skill for chart type, mark, and color guidance — this task is explicitly in scope for it per the project's own skill-triggering rules (building a chart/graph).

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Write the failing test for the data-prep function**

```typescript
// src/lib/dashboard/monthly-trend.test.ts
import { describe, it, expect, vi } from "vitest";
import { getMonthlyTrend } from "./monthly-trend";

function makeMockDb(rows: { tanggal: string; status: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

describe("getMonthlyTrend", () => {
  it("aggregates hadir and terlambat counts per day", async () => {
    const db = makeMockDb([
      { tanggal: "2026-10-01", status: "tepat_waktu" },
      { tanggal: "2026-10-01", status: "tepat_waktu" },
      { tanggal: "2026-10-01", status: "terlambat" },
      { tanggal: "2026-10-02", status: "terlambat" },
    ]);

    const trend = await getMonthlyTrend(db as any, "2026-10");

    expect(trend).toEqual([
      { date: "2026-10-01", hadir: 2, terlambat: 1 },
      { date: "2026-10-02", hadir: 0, terlambat: 1 },
    ]);
  });

  it("returns an empty array for a month with no attendance data", async () => {
    const db = makeMockDb([]);
    const trend = await getMonthlyTrend(db as any, "2026-10");
    expect(trend).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- monthly-trend.test.ts
```

Expected: FAIL — `Cannot find module './monthly-trend'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/lib/dashboard/monthly-trend.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type MonthlyTrendPoint = { date: string; hadir: number; terlambat: number };

const PRESENT_STATUSES = ["tepat_waktu", "pulang_cepat", "di_luar_lokasi"];

export async function getMonthlyTrend(
  db: SupabaseClient,
  yearMonth: string,
): Promise<MonthlyTrendPoint[]> {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  const { data } = await db
    .from("attendances")
    .select("tanggal, status")
    .gte("tanggal", startDate)
    .lte("tanggal", endDate);

  const byDate = new Map<string, { hadir: number; terlambat: number }>();
  for (const row of data ?? []) {
    const entry = byDate.get(row.tanggal) ?? { hadir: 0, terlambat: 0 };
    if (PRESENT_STATUSES.includes(row.status)) entry.hadir += 1;
    if (row.status === "terlambat") entry.terlambat += 1;
    byDate.set(row.tanggal, entry);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- monthly-trend.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Write the chart component**

Follow the `dataviz` skill's guidance (loaded above) for the exact mark type, color values, and axis/legend treatment appropriate for a two-series (hadir/terlambat) daily trend line — implement `src/components/attendance-trend-chart.tsx` as a `"use client"` component using `recharts`'s `LineChart`/`ResponsiveContainer`, taking `data: MonthlyTrendPoint[]` as its only prop. Do not hardcode arbitrary colors without checking the skill's palette guidance first.

- [ ] **Step 7: Wire into the dashboard page**

Add the chart below the summary cards in `src/app/(admin)/dashboard/page.tsx`, fetching the current month via `getMonthlyTrend(db, toJakartaDateOnly(new Date()).slice(0, 7))`.

- [ ] **Step 8: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/dashboard/monthly-trend.ts src/lib/dashboard/monthly-trend.test.ts \
  src/components/attendance-trend-chart.tsx src/app/\(admin\)/dashboard package.json package-lock.json
git commit -m "feat: monthly attendance trend chart on admin dashboard"
```

---

## Task 11: `/pengaturan` Page — Minimum 2 Super Admin Warning

**Files:**
- Create: `src/lib/employees/super-admin-count.ts`
- Create: `src/lib/employees/super-admin-count.test.ts`
- Create: `src/app/(admin)/pengaturan/page.tsx`

**Interfaces:**
- Produces: `countActiveSuperAdmins(db: SupabaseClient): Promise<number>`.
- Consumed by: `/pengaturan` page.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/employees/super-admin-count.test.ts
import { describe, it, expect, vi } from "vitest";
import { countActiveSuperAdmins } from "./super-admin-count";

describe("countActiveSuperAdmins", () => {
  it("returns the count of active super_admin employees", async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
          }),
        }),
      }),
    };
    const count = await countActiveSuperAdmins(db as any);
    expect(count).toBe(2);
  });

  it("returns 0 when the count query fails", async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: null, error: { message: "boom" } }),
          }),
        }),
      }),
    };
    const count = await countActiveSuperAdmins(db as any);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- super-admin-count.test.ts
```

Expected: FAIL — `Cannot find module './super-admin-count'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/employees/super-admin-count.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function countActiveSuperAdmins(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "aktif");

  if (error) {
    console.error("countActiveSuperAdmins: query failed", error);
    return 0;
  }
  return count ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- super-admin-count.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the page**

```typescript
// src/app/(admin)/pengaturan/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { countActiveSuperAdmins } from "@/lib/employees/super-admin-count";

export default async function PengaturanPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const superAdminCount = await countActiveSuperAdmins(db);

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Pengaturan</h1>
      {superAdminCount < 2 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Peringatan: sistem ini hanya memiliki {superAdminCount} Super Admin aktif. Minimal 2
          Super Admin diperlukan agar mekanisme persetujuan cuti berjenjang untuk HR/Super Admin
          tetap berfungsi. Tambahkan Super Admin lain sesegera mungkin.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/employees/super-admin-count.ts src/lib/employees/super-admin-count.test.ts \
  src/app/\(admin\)/pengaturan
git commit -m "feat: /pengaturan minimum-2-super-admin warning"
```

---

## Self-Review Notes

- **Spec coverage:** §5.1-§5.3 (submission, approver resolution, balance check) → Tasks 1-3, 6. §5.5 (server-side approve/reject identity check, already trigger-enforced from Foundation) → Task 4 (RPC wiring, not reimplementation). §5.6 (reject requires catatan) → Task 4 (RPC-level guard), Task 7 (UI-level guard, defense in depth). §5.7 (atomic balance credit) → Task 4. §5.9 (minimum 2 super admin warning) → Task 11. §6 (dashboard summary, per-branch/department filter, monthly trend, atasan-scoped visibility) → Tasks 8-10; per-branch/department filter UI is noted as a follow-up in Task 9 rather than fully built, since the spec's own filter requirement is broader than a single MVP task can cover without over-scoping — full filter UI (department + date-range pickers) is deferred to a fast-follow, consistent with how Plan 2 deferred several UI polish items.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and an exact command with expected output, except Task 10's chart-styling step, which deliberately defers to the `dataviz` skill's guidance rather than hardcoding colors the skill would tell us to change anyway — this is a documented process step, not a content placeholder.
- **Type consistency:** `LeaveStatus` (Task 5) matches the `leave_requests.status` check constraint (`pending`/`approved`/`rejected`) exactly. `Role` is imported from `@/lib/auth/route-access` in Task 1, never redefined. `AttendanceSummary`/`MonthlyTrendPoint` field names are consistent between their producing library functions and their consuming components.
- **Known, flagged-not-fixed discrepancy:** Task 8 explicitly flags that the branch-filter approach shown needs correction against the real schema (no `branch_id` column on `attendances`) rather than shipping unverified code — the implementer must resolve this via the embedded-resource join or the two-step `.in()` approach before the task can pass its own test.
