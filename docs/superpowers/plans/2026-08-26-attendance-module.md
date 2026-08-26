# Attendance Module (Clock In/Out) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A karyawan can clock in and clock out for real from `/absen` — GPS + selfie captured, geofencing validated against their branch, status (`tepat_waktu`/`terlambat`/`pulang_cepat`/`di_luar_lokasi`) computed **server-side** (never trusted from the client), duplicate clock-ins blocked, clock-in/out locked to mobile browsers only, and the result immediately visible in `/riwayat`.

**Architecture:** Business logic (geofencing math, status resolution, mobile detection, consent, photo upload, the clock-in/clock-out transactions themselves) lives in small, pure-where-possible, fully unit-tested modules under `src/lib/attendance/` and `src/lib/consent/` that take an injected Supabase client and an injectable "now" — no framework coupling, no hidden `new Date()`. Server Actions in `src/app/(employee)/absen/actions.ts` are thin wiring: pull the authenticated user via `getCurrentEmployee`, call the library function with a **service-role client** (never the anon/user client — status must not be spoofable via a client-manipulated write), and return a typed result. Client Components own only browser-API access (Geolocation, camera capture via `<input capture>`) and form submission — no business logic. This mirrors the split already established in Foundation between `src/lib/supabase/{client,server}.ts` and the pages that consume them.

**Tech Stack:** Next.js 16 (App Router, Server Actions) · TypeScript strict · `@supabase/supabase-js` (service-role client for writes that must not trust client input) · Vitest + Testing Library (already configured) · no new dependencies.

This is **Plan 2 of a 4-plan sequence** derived from `docs/superpowers/specs/2026-08-25-absensi-hr-mvp-design.md` (§4, §8) and `docs/PRD-Sistem-Absensi-HR.md` (§6 "Absensi"). Plan 1 (Foundation) is complete — see `docs/superpowers/plans/2026-08-25-foundation-auth-data-model.md` and `.superpowers/sdd/progress.md` for what already exists and what was explicitly decided/deferred.

## Global Constraints

- TypeScript everywhere, strict mode on.
- **Status is never trusted from the client.** Every write to `attendances.status` happens inside a Server Action that calls `createServiceRoleSupabaseClient()`, computes status from server-known inputs (branch coordinates, work schedule, server clock), and writes it — the client only supplies raw GPS coordinates and a photo. This closes the anti-fraud gap flagged in Foundation's final review (I2/attendances RLS policy).
- **Mobile-lock is enforced server-side**, in the Server Action, via `User-Agent` — never only in the UI. Client-side hiding of the button is a UX nicety on top, not the security boundary (per spec §4.1: "best-effort, not cryptographic proof").
- **Radius geofencing is 100m for every branch and every employee, no exceptions** (PRD §6, stakeholder-confirmed) — already the default on `branches.radius_geofencing_meter` from Foundation; this plan reads it per-branch rather than hardcoding 100, so a future per-branch override still works.
- **`di_luar_lokasi` requires a `catatan`** (reason) and is never auto-treated as a violation — it's context for the approving `atasan` (spec §4.4).
- **Duplicate clock-in is blocked** both by the DB's `unique (employee_id, tanggal)` constraint (Foundation Task 4) and by an explicit pre-check in the Server Action (clearer error message than a raw constraint violation).
- **Respect the anti-tampering trigger from Foundation** (`prevent_attendance_status_backdating`, migration 0007/0010): once `jam_pulang` is set on a row, a non-admin can never again change `status`, `jam_masuk`, `jam_pulang`, or `tanggal` on it. Clock-out must be the **one single UPDATE** that sets `jam_pulang` + `lokasi_pulang` + `foto_pulang_url` + `foto_pulang_expires_at` + final `status` together — never a partial write followed by a correction.
- **Photos**: uploaded to the private `attendance-photos` bucket (Foundation Task 8) under a path scoped by `employeeId`, never a public URL. `expires_at` is set to `now + 90 days` at upload time (spec §8 retention — v1 only *marks* expiry, no physical auto-delete).
- **Consent is required before the first clock-in**: if the employee has no row in `consents` for `jenis = 'lokasi_foto_absensi'`, the clock-in Server Action rejects with a clear error and the page redirects to a consent screen.
- Package manager: npm. Project uses a linked Supabase **cloud** project (no local Docker) — this plan's tasks are pure TypeScript/React with **no new migrations**, so no `supabase db push` is needed; every task is testable with `npm test` (fast, no network) using a mocked Supabase client, exactly like Foundation's `src/lib/employees/invite.test.ts` pattern.
- `Role` type: import from `@/lib/auth/route-access` — do not redefine it (Foundation's I4 fix consolidated this to one place).
- `AttendanceStatus` values are the five already defined by the `attendances_status_check` constraint in `supabase/migrations/0002_attendance_leave.sql`: `'tepat_waktu' | 'terlambat' | 'pulang_cepat' | 'alpa' | 'di_luar_lokasi'`. This plan's Server Actions only ever write `'tepat_waktu' | 'terlambat' | 'pulang_cepat' | 'di_luar_lokasi'` — `'alpa'` (no-show) is a reporting-time computation over days with no attendance row at all, out of this plan's scope (belongs with Plan 3's HR dashboard/reports).
- Icons: inline SVG, stroke-based, consistent 20px grid — never emoji (matches the no-emoji rule already implicit in the existing shell components).
- Status is **always** icon + color + text label together, never color alone (spec §7.1/§8 — red-green colorblind accessibility).

---

## Task 1: Geofencing (Haversine Distance)

**Files:**
- Create: `src/lib/attendance/geofencing.ts`
- Create: `src/lib/attendance/geofencing.test.ts`

**Interfaces:**
- Produces: `haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number` — great-circle distance in meters.
- Produces: `isWithinRadius(lat1: number, lon1: number, lat2: number, lon2: number, radiusMeters: number): boolean`.
- Consumed by: Task 6 (clock-in), Task 7 (clock-out).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/attendance/geofencing.test.ts
import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, isWithinRadius } from "./geofencing";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters(-6.2, 106.8, -6.2, 106.8)).toBe(0);
  });

  it("computes the known distance between Jakarta and Bandung (~115km) within 2km tolerance", () => {
    const jakarta = { lat: -6.2088, lon: 106.8456 };
    const bandung = { lat: -6.9175, lon: 107.6191 };
    const distance = haversineDistanceMeters(jakarta.lat, jakarta.lon, bandung.lat, bandung.lon);
    expect(distance).toBeGreaterThan(113_000);
    expect(distance).toBeLessThan(117_000);
  });

  it("computes a small known distance (~111m for 0.001 degree latitude) within 5m tolerance", () => {
    const distance = haversineDistanceMeters(-6.2, 106.8, -6.201, 106.8);
    expect(distance).toBeGreaterThan(106);
    expect(distance).toBeLessThan(116);
  });
});

describe("isWithinRadius", () => {
  it("returns true when the point is inside the radius", () => {
    expect(isWithinRadius(-6.2, 106.8, -6.2, 106.8, 100)).toBe(true);
  });

  it("returns false when the point is outside the radius", () => {
    const jakarta = { lat: -6.2088, lon: 106.8456 };
    const bandung = { lat: -6.9175, lon: 107.6191 };
    expect(isWithinRadius(jakarta.lat, jakarta.lon, bandung.lat, bandung.lon, 100)).toBe(false);
  });

  it("treats exactly-on-the-boundary as within radius", () => {
    // ~100m north of the branch
    const distance = haversineDistanceMeters(-6.2, 106.8, -6.2009, 106.8);
    expect(isWithinRadius(-6.2, 106.8, -6.2009, 106.8, Math.ceil(distance))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- geofencing.test.ts
```

Expected: FAIL — `Cannot find module './geofencing'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/attendance/geofencing.ts
const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number,
): boolean {
  return haversineDistanceMeters(lat1, lon1, lat2, lon2) <= radiusMeters;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- geofencing.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/geofencing.ts src/lib/attendance/geofencing.test.ts
git commit -m "feat: Haversine distance and geofencing radius check"
```

---

## Task 2: Attendance Status Resolution

**Files:**
- Create: `src/lib/attendance/status.ts`
- Create: `src/lib/attendance/status.test.ts`

**Interfaces:**
- Produces: `type AttendanceStatus = "tepat_waktu" | "terlambat" | "pulang_cepat" | "alpa" | "di_luar_lokasi"`.
- Produces: `resolveClockInStatus(params: { clockInTime: Date; scheduledStart: string; toleranceMinutes: number; withinRadius: boolean }): "tepat_waktu" | "terlambat" | "di_luar_lokasi"` — `scheduledStart` is `"HH:MM"` (24h), compared in local wall-clock time.
- Produces: `resolveClockOutStatus(params: { clockOutTime: Date; scheduledEnd: string; withinRadius: boolean }): "tepat_waktu" | "pulang_cepat" | "di_luar_lokasi"`.
- Produces: `mergeAttendanceStatus(clockInStatus: AttendanceStatus, clockOutStatus: AttendanceStatus): AttendanceStatus` — the single `attendances.status` column must hold one value covering the whole day; priority (most worth flagging first): `di_luar_lokasi` > `terlambat` > `pulang_cepat` > `tepat_waktu`.
- Consumed by: Task 6 (clock-in), Task 7 (clock-out), Task 8 (status badge), Task 9/10 (pages).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/attendance/status.test.ts
import { describe, it, expect } from "vitest";
import { resolveClockInStatus, resolveClockOutStatus, mergeAttendanceStatus } from "./status";

describe("resolveClockInStatus", () => {
  it("returns tepat_waktu when clocking in before the scheduled start, within radius", () => {
    const clockInTime = new Date("2026-09-01T08:55:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: true,
    });
    expect(result).toBe("tepat_waktu");
  });

  it("returns tepat_waktu when clocking in within the tolerance window", () => {
    const clockInTime = new Date("2026-09-01T09:10:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: true,
    });
    expect(result).toBe("tepat_waktu");
  });

  it("returns terlambat when clocking in past the tolerance window", () => {
    const clockInTime = new Date("2026-09-01T09:16:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: true,
    });
    expect(result).toBe("terlambat");
  });

  it("returns di_luar_lokasi when outside radius, even if on time", () => {
    const clockInTime = new Date("2026-09-01T08:55:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: false,
    });
    expect(result).toBe("di_luar_lokasi");
  });
});

describe("resolveClockOutStatus", () => {
  it("returns tepat_waktu when clocking out at or after the scheduled end, within radius", () => {
    const clockOutTime = new Date("2026-09-01T17:05:00+07:00");
    const result = resolveClockOutStatus({
      clockOutTime,
      scheduledEnd: "17:00",
      withinRadius: true,
    });
    expect(result).toBe("tepat_waktu");
  });

  it("returns pulang_cepat when clocking out before the scheduled end", () => {
    const clockOutTime = new Date("2026-09-01T16:30:00+07:00");
    const result = resolveClockOutStatus({
      clockOutTime,
      scheduledEnd: "17:00",
      withinRadius: true,
    });
    expect(result).toBe("pulang_cepat");
  });

  it("returns di_luar_lokasi when outside radius, even if on time", () => {
    const clockOutTime = new Date("2026-09-01T17:05:00+07:00");
    const result = resolveClockOutStatus({
      clockOutTime,
      scheduledEnd: "17:00",
      withinRadius: false,
    });
    expect(result).toBe("di_luar_lokasi");
  });
});

describe("mergeAttendanceStatus", () => {
  it("prioritizes di_luar_lokasi over everything else", () => {
    expect(mergeAttendanceStatus("di_luar_lokasi", "tepat_waktu")).toBe("di_luar_lokasi");
    expect(mergeAttendanceStatus("tepat_waktu", "di_luar_lokasi")).toBe("di_luar_lokasi");
    expect(mergeAttendanceStatus("terlambat", "di_luar_lokasi")).toBe("di_luar_lokasi");
  });

  it("prioritizes terlambat over pulang_cepat and tepat_waktu", () => {
    expect(mergeAttendanceStatus("terlambat", "pulang_cepat")).toBe("terlambat");
    expect(mergeAttendanceStatus("terlambat", "tepat_waktu")).toBe("terlambat");
  });

  it("prioritizes pulang_cepat over tepat_waktu", () => {
    expect(mergeAttendanceStatus("tepat_waktu", "pulang_cepat")).toBe("pulang_cepat");
  });

  it("returns tepat_waktu when both are tepat_waktu", () => {
    expect(mergeAttendanceStatus("tepat_waktu", "tepat_waktu")).toBe("tepat_waktu");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- status.test.ts
```

Expected: FAIL — `Cannot find module './status'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/attendance/status.ts
export type AttendanceStatus =
  | "tepat_waktu"
  | "terlambat"
  | "pulang_cepat"
  | "alpa"
  | "di_luar_lokasi";

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseHHMM(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function resolveClockInStatus(params: {
  clockInTime: Date;
  scheduledStart: string;
  toleranceMinutes: number;
  withinRadius: boolean;
}): "tepat_waktu" | "terlambat" | "di_luar_lokasi" {
  if (!params.withinRadius) return "di_luar_lokasi";

  const scheduledMinutes = parseHHMM(params.scheduledStart);
  const actualMinutes = minutesSinceMidnight(params.clockInTime);
  const lateBy = actualMinutes - scheduledMinutes;

  return lateBy > params.toleranceMinutes ? "terlambat" : "tepat_waktu";
}

export function resolveClockOutStatus(params: {
  clockOutTime: Date;
  scheduledEnd: string;
  withinRadius: boolean;
}): "tepat_waktu" | "pulang_cepat" | "di_luar_lokasi" {
  if (!params.withinRadius) return "di_luar_lokasi";

  const scheduledMinutes = parseHHMM(params.scheduledEnd);
  const actualMinutes = minutesSinceMidnight(params.clockOutTime);

  return actualMinutes < scheduledMinutes ? "pulang_cepat" : "tepat_waktu";
}

const STATUS_PRIORITY: AttendanceStatus[] = [
  "di_luar_lokasi",
  "terlambat",
  "pulang_cepat",
  "tepat_waktu",
  "alpa",
];

export function mergeAttendanceStatus(
  clockInStatus: AttendanceStatus,
  clockOutStatus: AttendanceStatus,
): AttendanceStatus {
  const inRank = STATUS_PRIORITY.indexOf(clockInStatus);
  const outRank = STATUS_PRIORITY.indexOf(clockOutStatus);
  return inRank <= outRank ? clockInStatus : clockOutStatus;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- status.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/status.ts src/lib/attendance/status.test.ts
git commit -m "feat: attendance status resolution (clock-in/out, geofencing override, merge priority)"
```

---

## Task 3: Mobile-Only Detection

**Files:**
- Create: `src/lib/attendance/mobile-detect.ts`
- Create: `src/lib/attendance/mobile-detect.test.ts`

**Interfaces:**
- Produces: `isMobileUserAgent(userAgent: string | null): boolean` — the server-side authority; best-effort, not cryptographic (spec §4.1).
- Consumed by: Task 6 (clock-in action), Task 7 (clock-out action), Task 9 (`/absen` page, to hide the button client-side as a UX nicety).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/attendance/mobile-detect.test.ts
import { describe, it, expect } from "vitest";
import { isMobileUserAgent } from "./mobile-detect";

describe("isMobileUserAgent", () => {
  it("returns true for a typical Android Chrome user agent", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
    expect(isMobileUserAgent(ua)).toBe(true);
  });

  it("returns true for a typical iPhone Safari user agent", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(isMobileUserAgent(ua)).toBe(true);
  });

  it("returns false for a typical desktop Chrome user agent", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(isMobileUserAgent(ua)).toBe(false);
  });

  it("returns false for a typical desktop Windows Firefox user agent", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(isMobileUserAgent(ua)).toBe(false);
  });

  it("returns false when the user agent is null or missing", () => {
    expect(isMobileUserAgent(null)).toBe(false);
  });

  it("returns true for an iPad user agent (tablet counts as mobile for this app)", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(isMobileUserAgent(ua)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- mobile-detect.test.ts
```

Expected: FAIL — `Cannot find module './mobile-detect'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/attendance/mobile-detect.ts
const MOBILE_UA_PATTERN = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i;

export function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- mobile-detect.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/mobile-detect.ts src/lib/attendance/mobile-detect.test.ts
git commit -m "feat: server-side mobile user-agent detection for clock-in/out lock"
```

---

## Task 4: Consent Helpers

**Files:**
- Create: `src/lib/consent/consent.ts`
- Create: `src/lib/consent/consent.test.ts`

**Interfaces:**
- Produces: `CONSENT_JENIS_LOKASI_FOTO = "lokasi_foto_absensi"` constant, `CONSENT_POLICY_VERSION = "1.0"` constant.
- Produces: `hasActiveConsent(db: SupabaseClient, employeeId: string): Promise<boolean>`.
- Produces: `recordConsent(db: SupabaseClient, employeeId: string): Promise<{ ok: true } | { ok: false; error: string }>`.
- Consumes: `consents` table (Foundation migration 0002; RLS in 0005 — `consents_insert` requires `employee_id = auth.uid()`, so `recordConsent` must be called with a user-scoped client, not service-role, when invoked from the consent-acceptance action; `hasActiveConsent` is read-only and safe with either).
- Consumed by: Task 6 (clock-in refuses without consent), Task 9 (consent screen).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/consent/consent.test.ts
import { describe, it, expect, vi } from "vitest";
import { hasActiveConsent, recordConsent, CONSENT_JENIS_LOKASI_FOTO, CONSENT_POLICY_VERSION } from "./consent";

function makeMockDb(overrides: Partial<any> = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "consent-1" }, error: null }),
        }),
      }),
    }),
    ...overrides,
  };
}

describe("hasActiveConsent", () => {
  it("returns false when no consent row exists", async () => {
    const db = makeMockDb();
    const result = await hasActiveConsent(db as any, "employee-1");
    expect(result).toBe(false);
    expect(db.from).toHaveBeenCalledWith("consents");
  });

  it("returns true when a consent row exists for the right jenis", async () => {
    const db = makeMockDb({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: "consent-1" }], error: null }),
            }),
          }),
        }),
      }),
    });
    const result = await hasActiveConsent(db as any, "employee-1");
    expect(result).toBe(true);
  });
});

describe("recordConsent", () => {
  it("inserts a consent row with the current policy version and jenis", async () => {
    const db = makeMockDb();
    const result = await recordConsent(db as any, "employee-1");
    expect(result).toEqual({ ok: true });
    expect(db.from).toHaveBeenCalledWith("consents");
    const insertCall = db.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: "employee-1",
        jenis: CONSENT_JENIS_LOKASI_FOTO,
        versi_kebijakan: CONSENT_POLICY_VERSION,
      }),
    );
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "insert failed" } }),
          }),
        }),
      }),
    });
    const result = await recordConsent(db as any, "employee-1");
    expect(result).toEqual({ ok: false, error: "insert failed" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- consent.test.ts
```

Expected: FAIL — `Cannot find module './consent'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/consent/consent.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export const CONSENT_JENIS_LOKASI_FOTO = "lokasi_foto_absensi";
export const CONSENT_POLICY_VERSION = "1.0";

export async function hasActiveConsent(
  db: SupabaseClient,
  employeeId: string,
): Promise<boolean> {
  const { data } = await db
    .from("consents")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("jenis", CONSENT_JENIS_LOKASI_FOTO)
    .limit(1);

  return Boolean(data && data.length > 0);
}

export async function recordConsent(
  db: SupabaseClient,
  employeeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db
    .from("consents")
    .insert({
      employee_id: employeeId,
      jenis: CONSENT_JENIS_LOKASI_FOTO,
      versi_kebijakan: CONSENT_POLICY_VERSION,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- consent.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/consent/consent.ts src/lib/consent/consent.test.ts
git commit -m "feat: consent check and recording helpers for location/photo processing"
```

---

## Task 5: Attendance Photo Upload

**Files:**
- Create: `src/lib/attendance/photo-upload.ts`
- Create: `src/lib/attendance/photo-upload.test.ts`

**Interfaces:**
- Produces: `PHOTO_RETENTION_DAYS = 90` constant.
- Produces: `uploadAttendancePhoto(db: SupabaseClient, employeeId: string, file: Blob, kind: "masuk" | "pulang", now?: Date): Promise<{ ok: true; path: string; expiresAt: string } | { ok: false; error: string }>` — uploads to the `attendance-photos` bucket (Foundation Task 8) at path `${employeeId}/${kind}-${timestamp}.jpg`, returns the storage path (not a public URL — the bucket is private) and an ISO `expiresAt` 90 days out.
- Consumed by: Task 6 (clock-in), Task 7 (clock-out).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/attendance/photo-upload.test.ts
import { describe, it, expect, vi } from "vitest";
import { uploadAttendancePhoto, PHOTO_RETENTION_DAYS } from "./photo-upload";

function makeMockDb(overrides: Partial<any> = {}) {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: "employee-1/masuk-1735689600000.jpg" },
          error: null,
        }),
      }),
    },
    ...overrides,
  };
}

describe("uploadAttendancePhoto", () => {
  it("uploads to the attendance-photos bucket under a path scoped by employee id", async () => {
    const db = makeMockDb();
    const file = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const now = new Date("2026-09-01T09:00:00Z");

    const result = await uploadAttendancePhoto(db as any, "employee-1", file, "masuk", now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toMatch(/^employee-1\/masuk-\d+\.jpg$/);
      expect(result.expiresAt).toBe(
        new Date(now.getTime() + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      );
    }
    expect(db.storage.from).toHaveBeenCalledWith("attendance-photos");
  });

  it("returns an error when the upload fails", async () => {
    const db = makeMockDb({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: "storage full" } }),
        }),
      },
    });
    const file = new Blob(["fake-image-bytes"], { type: "image/jpeg" });

    const result = await uploadAttendancePhoto(db as any, "employee-1", file, "pulang");

    expect(result).toEqual({ ok: false, error: "storage full" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- photo-upload.test.ts
```

Expected: FAIL — `Cannot find module './photo-upload'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/attendance/photo-upload.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_RETENTION_DAYS = 90;
const BUCKET = "attendance-photos";

export async function uploadAttendancePhoto(
  db: SupabaseClient,
  employeeId: string,
  file: Blob,
  kind: "masuk" | "pulang",
  now: Date = new Date(),
): Promise<{ ok: true; path: string; expiresAt: string } | { ok: false; error: string }> {
  const path = `${employeeId}/${kind}-${now.getTime()}.jpg`;

  const { data, error } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: "image/jpeg",
    upsert: false,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "failed to upload photo" };
  }

  const expiresAt = new Date(now.getTime() + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return { ok: true, path: data.path, expiresAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- photo-upload.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/photo-upload.ts src/lib/attendance/photo-upload.test.ts
git commit -m "feat: attendance photo upload to private bucket with 90-day retention marking"
```

---

## Task 6: Clock-In Business Logic

**Files:**
- Create: `src/lib/attendance/clock-in.ts`
- Create: `src/lib/attendance/clock-in.test.ts`
- Create: `src/lib/attendance/jakarta-date.ts` (shared Asia/Jakarta date helper — see note below)

**Interfaces:**
- Consumes: `isWithinRadius` (Task 1), `resolveClockInStatus` (Task 2), `hasActiveConsent` (Task 4).
- Produces: `toJakartaDateOnly(date: Date): string` in `src/lib/attendance/jakarta-date.ts` — returns the Asia/Jakarta calendar date (`YYYY-MM-DD`) for any instant, independent of the executing process's own timezone (via `Intl.DateTimeFormat` pinned to `Asia/Jakarta`, same rationale as Task 2's status-time pinning). **Never** derive `tanggal` with `date.toISOString().slice(0, 10)` — that's the UTC date, which is the previous day for any instant before 07:00 WIB.
- Produces: `type ClockInInput = { employeeId: string; lat: number; long: number; photoPath: string; photoExpiresAt: string; catatan?: string; now?: Date }`.
- Produces: `type ClockInResult = { ok: true; attendanceId: string; status: AttendanceStatus } | { ok: false; error: string }`.
- Produces: `clockIn(db: SupabaseClient, input: ClockInInput): Promise<ClockInResult>`.
- Consumed by: Task 7 (`toJakartaDateOnly`), Task 9 (`/absen` Server Action + page, both `clockIn`/`clockOut` and `toJakartaDateOnly`) — `clockIn`/`clockOut` always called with a **service-role client**, per Global Constraints.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/attendance/clock-in.test.ts
import { describe, it, expect, vi } from "vitest";
import { clockIn } from "./clock-in";

const BASE_EMPLOYEE = {
  id: "employee-1",
  branch_id: "branch-1",
};

const BASE_BRANCH = {
  id: "branch-1",
  lat: -6.2,
  long: 106.8,
  radius_geofencing_meter: 100,
};

const BASE_SCHEDULE = {
  branch_id: "branch-1",
  jam_masuk: "09:00:00",
  jam_pulang: "17:00:00",
  toleransi_terlambat_menit: 15,
};

function makeMockDb(opts: {
  existingAttendance?: any[];
  consentRows?: any[];
  insertError?: { message: string } | null;
} = {}) {
  const {
    existingAttendance = [],
    consentRows = [{ id: "consent-1" }],
    insertError = null,
  } = opts;

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    branches: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_BRANCH, error: null }) }),
      }),
    },
    work_schedules: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_SCHEDULE, error: null }) }),
      }),
    },
    consents: {
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: consentRows, error: null }) }) }),
      }),
    },
    attendances: {
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: existingAttendance, error: null }) }) }),
      }),
      insert: () => ({
        select: () => ({
          single: () =>
            insertError
              ? Promise.resolve({ data: null, error: insertError })
              : Promise.resolve({ data: { id: "attendance-1" }, error: null }),
        }),
      }),
    },
  };

  return {
    from: vi.fn((table: string) => tables[table]),
  };
}

describe("clockIn", () => {
  it("creates an attendance row with tepat_waktu when on time and within radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T08:58:00+07:00");

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now,
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
  });

  it("rejects when the employee has not given consent", async () => {
    const db = makeMockDb({ consentRows: [] });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Persetujuan pemrosesan data lokasi/foto diperlukan sebelum absen.",
    });
  });

  it("rejects a duplicate clock-in for the same day", async () => {
    const db = makeMockDb({ existingAttendance: [{ id: "attendance-existing" }] });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda sudah absen masuk hari ini." });
  });

  it("requires catatan when clocking in outside the geofence radius", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9175,
      long: 107.6191,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
    });
  });

  it("accepts clocking in outside the geofence radius when catatan is provided, with di_luar_lokasi status", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9175,
      long: 107.6191,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      catatan: "Kunjungan klien di luar kota",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "di_luar_lokasi" });
  });

  it("returns terlambat status when clocking in past the tolerance window", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T09:30:00+07:00"),
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "terlambat" });
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({ insertError: { message: "duplicate key" } });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "duplicate key" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- clock-in.test.ts
```

Expected: FAIL — `Cannot find module './clock-in'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/attendance/clock-in.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinRadius } from "./geofencing";
import { resolveClockInStatus, type AttendanceStatus } from "./status";
import { hasActiveConsent } from "@/lib/consent/consent";

export type ClockInInput = {
  employeeId: string;
  lat: number;
  long: number;
  photoPath: string;
  photoExpiresAt: string;
  catatan?: string;
  now?: Date;
};

export type ClockInResult =
  | { ok: true; attendanceId: string; status: AttendanceStatus }
  | { ok: false; error: string };

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function clockIn(db: SupabaseClient, input: ClockInInput): Promise<ClockInResult> {
  const now = input.now ?? new Date();

  const hasConsent = await hasActiveConsent(db, input.employeeId);
  if (!hasConsent) {
    return { ok: false, error: "Persetujuan pemrosesan data lokasi/foto diperlukan sebelum absen." };
  }

  const tanggal = toDateOnly(now);

  const { data: existing } = await db
    .from("attendances")
    .select("id")
    .eq("employee_id", input.employeeId)
    .eq("tanggal", tanggal)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, error: "Anda sudah absen masuk hari ini." };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .select("id, branch_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    return { ok: false, error: employeeErr?.message ?? "Data karyawan tidak ditemukan." };
  }

  const { data: branch, error: branchErr } = await db
    .from("branches")
    .select("id, lat, long, radius_geofencing_meter")
    .eq("id", employee.branch_id)
    .single();
  if (branchErr || !branch) {
    return { ok: false, error: branchErr?.message ?? "Data cabang tidak ditemukan." };
  }

  const { data: schedule, error: scheduleErr } = await db
    .from("work_schedules")
    .select("jam_masuk, jam_pulang, toleransi_terlambat_menit")
    .eq("branch_id", employee.branch_id)
    .single();
  if (scheduleErr || !schedule) {
    return { ok: false, error: scheduleErr?.message ?? "Jadwal kerja cabang tidak ditemukan." };
  }

  const withinRadius = isWithinRadius(
    input.lat,
    input.long,
    branch.lat,
    branch.long,
    branch.radius_geofencing_meter,
  );

  if (!withinRadius && !input.catatan) {
    return { ok: false, error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan." };
  }

  const status = resolveClockInStatus({
    clockInTime: now,
    scheduledStart: schedule.jam_masuk.slice(0, 5),
    toleranceMinutes: schedule.toleransi_terlambat_menit,
    withinRadius,
  });

  const { data: inserted, error: insertErr } = await db
    .from("attendances")
    .insert({
      employee_id: input.employeeId,
      tanggal,
      jam_masuk: now.toISOString(),
      lokasi_masuk: `(${input.lat},${input.long})`,
      foto_masuk_url: input.photoPath,
      foto_masuk_expires_at: input.photoExpiresAt,
      status,
      catatan: input.catatan ?? null,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? "Gagal menyimpan absensi." };
  }

  return { ok: true, attendanceId: inserted.id, status };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- clock-in.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/clock-in.ts src/lib/attendance/clock-in.test.ts
git commit -m "feat: clock-in business logic (consent, duplicate, geofence, server-computed status)"
```

---

## Task 7: Clock-Out Business Logic

**Files:**
- Create: `src/lib/attendance/clock-out.ts`
- Create: `src/lib/attendance/clock-out.test.ts`

**Interfaces:**
- Consumes: `isWithinRadius` (Task 1), `resolveClockOutStatus`/`mergeAttendanceStatus` (Task 2), `toJakartaDateOnly` (Task 6, `src/lib/attendance/jakarta-date.ts`).
- **Do NOT re-derive `tanggal` locally.** The `tanggal` column is the Asia/Jakarta calendar date; computing it with `date.toISOString().slice(0, 10)` yields the UTC date, which is the previous day for any instant before 07:00 WIB and would fail to find the clock-in row that Task 6 wrote under the Jakarta date. Import `toJakartaDateOnly` instead.
- Produces: `type ClockOutInput = { employeeId: string; lat: number; long: number; photoPath: string; photoExpiresAt: string; now?: Date }`.
- Produces: `type ClockOutResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string }`.
- Produces: `clockOut(db: SupabaseClient, input: ClockOutInput): Promise<ClockOutResult>` — performs exactly ONE `update` (never a second corrective write), matching the Foundation anti-tampering trigger's expectations.
- Consumed by: Task 9 (`/absen` Server Action), always with a **service-role client**.
- **The double clock-out guard must be atomic, not just an app-level pre-check.** `today.jam_pulang` truthy → reject is a read-then-write race: two concurrent requests can both pass it, and the later write overwrites `jam_pulang`/photos/**status**, letting an employee launder their final status. The Foundation anti-tampering trigger `prevent_attendance_status_backdating` (migration 0010) does **NOT** backstop this: it is gated on `auth.uid() = old.employee_id`, and `clockOut` always runs with a **service-role client** where `auth.uid()` is NULL, so its guard body never executes on this path. Add `.is("jam_pulang", null)` to the update's filter chain and map the resulting zero-row error (PGRST116) to the same "Anda sudah absen pulang hari ini." message the pre-check uses. Keep the pre-check too — it is the faster, cheaper rejection in the non-race case.
- **`work_schedules` has no unique constraint on `branch_id`** (a branch may have several rows for different `hari_kerja` patterns), so `.single()` throws PGRST116 as soon as a second row exists. Use `.limit(1).maybeSingle()`, same as Task 6's `clockIn`.
- **Never return raw Postgres/PostgREST error text to the user.** It is English, internal, and can disclose schema details. `console.error` the raw error and return a fixed Indonesian message on every failure path. A failed *today* lookup must also be distinguished from a genuine missing clock-in — reporting an infrastructure error as "Anda belum absen masuk hari ini." is actively misleading.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clockOut } from "./clock-out";

const BASE_EMPLOYEE = { id: "employee-1", branch_id: "branch-1" };
const BASE_BRANCH = { id: "branch-1", lat: -6.2, long: 106.8, radius_geofencing_meter: 100 };
const BASE_SCHEDULE = { branch_id: "branch-1", jam_masuk: "09:00:00", jam_pulang: "17:00:00" };

type QueryResult = { data: any; error: { message: string; code?: string } | null };

const UPDATE_OK: QueryResult = {
  data: { id: "attendance-1", status: "tepat_waktu" },
  error: null,
};
// What PostgREST returns when a filtered `.update(...).select().single()`
// matches zero rows — here, because `jam_pulang is null` no longer holds.
const UPDATE_ZERO_ROWS: QueryResult = {
  data: null,
  error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
};

function makeMockDb(
  opts: {
    todaysAttendance?: any;
    todaysAttendanceError?: { message: string; code?: string } | null;
    updateError?: { message: string; code?: string } | null;
    /** Successive results for repeated update() calls; the last one repeats. */
    updateResults?: QueryResult[];
  } = {},
) {
  const {
    todaysAttendance = { id: "attendance-1", status: "tepat_waktu", jam_pulang: null },
    todaysAttendanceError = todaysAttendance
      ? null
      : { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    updateError = null,
    updateResults = [updateError ? { data: null, error: updateError } : UPDATE_OK],
  } = opts;

  // Spies for the chain steps whose arguments/payloads the tests assert on.
  const todaySingleMock = vi
    .fn()
    .mockResolvedValue({ data: todaysAttendance, error: todaysAttendanceError });
  const todayTanggalEqMock = vi.fn().mockReturnValue({ single: todaySingleMock });
  const todayEmployeeEqMock = vi.fn().mockReturnValue({ eq: todayTanggalEqMock });
  const attendancesSelectMock = vi.fn().mockReturnValue({ eq: todayEmployeeEqMock });

  let updateCall = 0;
  const updateSingleMock = vi.fn(() =>
    Promise.resolve(updateResults[Math.min(updateCall++, updateResults.length - 1)]),
  );
  const updateSelectMock = vi.fn().mockReturnValue({ single: updateSingleMock });
  const updateIsMock = vi.fn().mockReturnValue({ select: updateSelectMock });
  const updateEqMock = vi.fn().mockReturnValue({ is: updateIsMock });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  const scheduleMaybeSingleMock = vi.fn().mockResolvedValue({ data: BASE_SCHEDULE, error: null });
  const scheduleLimitMock = vi.fn().mockReturnValue({ maybeSingle: scheduleMaybeSingleMock });
  const scheduleEqMock = vi.fn().mockReturnValue({ limit: scheduleLimitMock });

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    branches: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_BRANCH, error: null }) }),
      }),
    },
    work_schedules: {
      select: vi.fn().mockReturnValue({ eq: scheduleEqMock }),
    },
    attendances: {
      select: attendancesSelectMock,
      update: updateMock,
    },
  };

  return {
    from: vi.fn((table: string) => tables[table]),
    __attendancesSelectMock: attendancesSelectMock,
    __todayEmployeeEqMock: todayEmployeeEqMock,
    __todayTanggalEqMock: todayTanggalEqMock,
    __updateMock: updateMock,
    __updateEqMock: updateEqMock,
    __updateIsMock: updateIsMock,
    __scheduleEqMock: scheduleEqMock,
    __scheduleLimitMock: scheduleLimitMock,
    __scheduleMaybeSingleMock: scheduleMaybeSingleMock,
  };
}

const BASE_INPUT = {
  employeeId: "employee-1",
  lat: -6.2,
  long: 106.8,
  photoPath: "employee-1/pulang-1.jpg",
  photoExpiresAt: "2026-12-01T00:00:00.000Z",
};

describe("clockOut", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("updates the attendance row with tepat_waktu when on time and within radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T17:05:00+07:00");

    const result = await clockOut(db as any, { ...BASE_INPUT, now });

    expect(result).toEqual({ ok: true, status: "tepat_waktu" });

    // The today lookup must be scoped to this employee and the Jakarta date.
    expect(db.__attendancesSelectMock).toHaveBeenCalledWith("id, status, jam_pulang");
    expect(db.__todayEmployeeEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__todayTanggalEqMock).toHaveBeenCalledWith("tanggal", "2026-09-01");

    // The persisted payload, not just the returned status.
    expect(db.__updateMock).toHaveBeenCalledTimes(1);
    expect(db.__updateMock).toHaveBeenCalledWith({
      jam_pulang: now.toISOString(),
      lokasi_pulang: "(-6.2,106.8)",
      foto_pulang_url: "employee-1/pulang-1.jpg",
      foto_pulang_expires_at: "2026-12-01T00:00:00.000Z",
      status: "tepat_waktu",
    });
    expect(db.__updateEqMock).toHaveBeenCalledWith("id", "attendance-1");
    // The atomic compare-and-set that backstops the double clock-out race.
    expect(db.__updateIsMock).toHaveBeenCalledWith("jam_pulang", null);
  });

  it("keys the today lookup to the Asia/Jakarta calendar date, not the UTC date", async () => {
    const db = makeMockDb();
    // 2026-09-01T20:00:00Z is 2026-09-02T03:00:00+07:00 — the Jakarta date
    // (2026-09-02) differs from the UTC date (2026-09-01).
    const now = new Date("2026-09-01T20:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-09-01");

    await clockOut(db as any, { ...BASE_INPUT, now });

    expect(db.__todayTanggalEqMock).toHaveBeenCalledWith("tanggal", "2026-09-02");
  });

  it("rejects when there is no clock-in record for today", async () => {
    const db = makeMockDb({ todaysAttendance: null });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda belum absen masuk hari ini." });
    expect(db.__updateMock).not.toHaveBeenCalled();
  });

  it("distinguishes a failed today lookup from a genuine missing clock-in", async () => {
    const db = makeMockDb({
      todaysAttendance: null,
      todaysAttendanceError: { message: "connection reset" },
    });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Gagal memeriksa absensi hari ini." });
    expect(db.__updateMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("rejects a second clock-out attempt on an already-closed record", async () => {
    const db = makeMockDb({
      todaysAttendance: {
        id: "attendance-1",
        status: "tepat_waktu",
        jam_pulang: "2026-09-01T17:05:00.000Z",
      },
    });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      photoPath: "employee-1/pulang-2.jpg",
      now: new Date("2026-09-01T18:00:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda sudah absen pulang hari ini." });
    expect(db.__updateMock).not.toHaveBeenCalled();
  });

  it("rejects the losing request when two concurrent clock-outs pass the pre-check", async () => {
    // Both requests read jam_pulang as NULL (the read-then-write race), so both
    // reach the update. The `.is("jam_pulang", null)` filter makes the second
    // one match zero rows instead of overwriting the first one's status.
    const db = makeMockDb({ updateResults: [UPDATE_OK, UPDATE_ZERO_ROWS] });
    const now = new Date("2026-09-01T17:05:00+07:00");

    const first = await clockOut(db as any, { ...BASE_INPUT, now });
    const second = await clockOut(db as any, {
      ...BASE_INPUT,
      photoPath: "employee-1/pulang-2.jpg",
      now,
    });

    expect(first).toEqual({ ok: true, status: "tepat_waktu" });
    expect(second).toEqual({ ok: false, error: "Anda sudah absen pulang hari ini." });
    expect(db.__updateMock).toHaveBeenCalledTimes(2);
    expect(db.__updateIsMock).toHaveBeenNthCalledWith(2, "jam_pulang", null);
  });

  it("merges pulang_cepat over an existing tepat_waktu clock-in status", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T16:00:00+07:00");

    const result = await clockOut(db as any, { ...BASE_INPUT, now });

    expect(result).toEqual({ ok: true, status: "pulang_cepat" });
    expect(db.__updateMock).toHaveBeenCalledTimes(1);
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pulang_cepat" }),
    );
  });

  it("keeps terlambat from clock-in even when clocking out on time", async () => {
    const db = makeMockDb({
      todaysAttendance: { id: "attendance-1", status: "terlambat", jam_pulang: null },
    });
    const now = new Date("2026-09-01T17:05:00+07:00");

    const result = await clockOut(db as any, { ...BASE_INPUT, now });

    expect(result).toEqual({ ok: true, status: "terlambat" });
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "terlambat" }),
    );
  });

  it("records di_luar_lokasi when clocking out beyond the branch geofence radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T17:05:00+07:00");

    // Bandung — far outside branch-1's 100 m radius around (-6.2, 106.8).
    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      lat: -6.9175,
      long: 107.6191,
      now,
    });

    expect(result).toEqual({ ok: true, status: "di_luar_lokasi" });
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "di_luar_lokasi",
        lokasi_pulang: "(-6.9175,107.6191)",
      }),
    );
  });

  it("takes the first work schedule row rather than erroring when a branch has several", async () => {
    const db = makeMockDb();

    await clockOut(db as any, { ...BASE_INPUT, now: new Date("2026-09-01T17:05:00+07:00") });

    expect(db.__scheduleEqMock).toHaveBeenCalledWith("branch_id", "branch-1");
    expect(db.__scheduleLimitMock).toHaveBeenCalledWith(1);
    expect(db.__scheduleMaybeSingleMock).toHaveBeenCalled();
  });

  it("returns a generic Indonesian message and logs the raw error when the update fails", async () => {
    const db = makeMockDb({ updateError: { message: "deadlock detected" } });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Gagal menyimpan absen pulang." });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- clock-out.test.ts
```

Expected: FAIL — `Cannot find module './clock-out'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinRadius } from "./geofencing";
import { toJakartaDateOnly } from "./jakarta-date";
import { resolveClockOutStatus, mergeAttendanceStatus, type AttendanceStatus } from "./status";

// PostgREST's "no rows returned" code, surfaced as PostgrestError.code when a
// `.single()` matches zero rows. On the update below that means the atomic
// `jam_pulang is null` filter did NOT match — i.e. the row was already closed.
const PGRST_NO_ROWS = "PGRST116";
const DUPLICATE_CLOCK_OUT_MESSAGE = "Anda sudah absen pulang hari ini.";

export type ClockOutInput = {
  employeeId: string;
  lat: number;
  long: number;
  photoPath: string;
  photoExpiresAt: string;
  now?: Date;
};

export type ClockOutResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

export async function clockOut(db: SupabaseClient, input: ClockOutInput): Promise<ClockOutResult> {
  const now = input.now ?? new Date();
  // Asia/Jakarta calendar date — must match the key Task 6's clockIn wrote.
  const tanggal = toJakartaDateOnly(now);

  const { data: today, error: todayErr } = await db
    .from("attendances")
    .select("id, status, jam_pulang")
    .eq("employee_id", input.employeeId)
    .eq("tanggal", tanggal)
    .single();
  // A genuine "no row for today" (PGRST116, or null data with no error) means
  // the employee has not clocked in. Any OTHER error is an infrastructure
  // failure and must not be reported as "you haven't clocked in" — that
  // message is actively misleading and invites a pointless retry.
  if (todayErr && todayErr.code !== PGRST_NO_ROWS) {
    console.error("clockOut: today lookup failed", todayErr);
    return { ok: false, error: "Gagal memeriksa absensi hari ini." };
  }
  if (!today) {
    return { ok: false, error: "Anda belum absen masuk hari ini." };
  }
  if (today.jam_pulang) {
    return { ok: false, error: DUPLICATE_CLOCK_OUT_MESSAGE };
  }

  const { data: employee, error: employeeErr } = await db
    .from("employees")
    .select("id, branch_id")
    .eq("id", input.employeeId)
    .single();
  if (employeeErr || !employee) {
    // Never surface raw Postgres/PostgREST text to the user: it is English,
    // internal, and can disclose schema details. Log it, return Indonesian.
    console.error("clockOut: employee lookup failed", employeeErr);
    return { ok: false, error: "Data karyawan tidak ditemukan." };
  }

  const { data: branch, error: branchErr } = await db
    .from("branches")
    .select("id, lat, long, radius_geofencing_meter")
    .eq("id", employee.branch_id)
    .single();
  if (branchErr || !branch) {
    console.error("clockOut: branch lookup failed", branchErr);
    return { ok: false, error: "Data cabang tidak ditemukan." };
  }

  const { data: schedule, error: scheduleErr } = await db
    .from("work_schedules")
    .select("jam_pulang")
    .eq("branch_id", employee.branch_id)
    // work_schedules has no unique constraint on branch_id alone (a branch may
    // have several rows for different hari_kerja patterns), so .single() would
    // error with PGRST116 as soon as a second row exists. Taking the first row
    // keeps this path working; picking the row matching today's hari_kerja is
    // deliberately out of scope here. Mirrors clockIn.
    .limit(1)
    .maybeSingle();
  if (scheduleErr || !schedule) {
    console.error("clockOut: work schedule lookup failed", scheduleErr);
    return { ok: false, error: "Jadwal kerja cabang tidak ditemukan." };
  }

  const withinRadius = isWithinRadius(
    input.lat,
    input.long,
    branch.lat,
    branch.long,
    branch.radius_geofencing_meter,
  );

  const clockOutStatus = resolveClockOutStatus({
    clockOutTime: now,
    scheduledEnd: schedule.jam_pulang.slice(0, 5),
    withinRadius,
  });

  const finalStatus = mergeAttendanceStatus(today.status as AttendanceStatus, clockOutStatus);

  const { data: updated, error: updateErr } = await db
    .from("attendances")
    .update({
      jam_pulang: now.toISOString(),
      lokasi_pulang: `(${input.lat},${input.long})`,
      foto_pulang_url: input.photoPath,
      foto_pulang_expires_at: input.photoExpiresAt,
      status: finalStatus,
    })
    .eq("id", today.id)
    // Atomic backstop for the `today.jam_pulang` pre-check above, which is a
    // read-then-write race: two concurrent clock-outs can both pass it, and the
    // later write would overwrite jam_pulang/photos/status — letting an employee
    // launder their final status by firing two requests. The DB anti-tampering
    // trigger (prevent_attendance_status_backdating, migration 0010) does NOT
    // cover this path: it is gated on `auth.uid() = old.employee_id`, and
    // clockOut always runs with a service-role client where auth.uid() is NULL,
    // so its guard body never executes. Restricting the UPDATE to rows whose
    // jam_pulang is still NULL makes "close the record" a single atomic
    // compare-and-set — the loser matches zero rows instead of overwriting.
    .is("jam_pulang", null)
    .select()
    .single();

  if (updateErr || !updated) {
    // Zero rows matched: another request closed the record between the
    // pre-check and this write. Report it exactly as the pre-check does, so
    // both paths read identically to the user.
    if (updateErr?.code === PGRST_NO_ROWS || (!updateErr && !updated)) {
      return { ok: false, error: DUPLICATE_CLOCK_OUT_MESSAGE };
    }
    console.error("clockOut: update failed", updateErr);
    return { ok: false, error: "Gagal menyimpan absen pulang." };
  }

  return { ok: true, status: finalStatus };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- clock-out.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/clock-out.ts src/lib/attendance/clock-out.test.ts
git commit -m "feat: clock-out business logic (single-write update, status merge, closed-record guard)"
```

---

## Task 8: Attendance Status Badge Component

**Files:**
- Create: `src/components/attendance-status-badge.tsx`
- Create: `src/components/attendance-status-badge.test.tsx`

**Interfaces:**
- Produces: `<AttendanceStatusBadge status={AttendanceStatus} />` — renders an icon (inline SVG) + colored background + text label together, never color alone.
- Consumed by: Task 9 (`/absen`), Task 10 (`/riwayat`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/attendance-status-badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttendanceStatusBadge } from "./attendance-status-badge";

describe("AttendanceStatusBadge", () => {
  it("renders the Indonesian label and an icon for tepat_waktu", () => {
    render(<AttendanceStatusBadge status="tepat_waktu" />);
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
    expect(screen.getByRole("img", { hidden: true })).toBeInTheDocument();
  });

  it("renders the Indonesian label for terlambat", () => {
    render(<AttendanceStatusBadge status="terlambat" />);
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
  });

  it("renders the Indonesian label for pulang_cepat", () => {
    render(<AttendanceStatusBadge status="pulang_cepat" />);
    expect(screen.getByText("Pulang Cepat")).toBeInTheDocument();
  });

  it("renders the Indonesian label for alpa", () => {
    render(<AttendanceStatusBadge status="alpa" />);
    expect(screen.getByText("Alpa")).toBeInTheDocument();
  });

  it("renders the Indonesian label for di_luar_lokasi", () => {
    render(<AttendanceStatusBadge status="di_luar_lokasi" />);
    expect(screen.getByText("Di Luar Lokasi")).toBeInTheDocument();
  });

  it("gives each status a distinct background color class, never relying on color alone", () => {
    const { container: onTime } = render(<AttendanceStatusBadge status="tepat_waktu" />);
    const { container: late } = render(<AttendanceStatusBadge status="terlambat" />);
    expect(onTime.firstChild).not.toHaveClass((late.firstChild as HTMLElement).className);
    // Text label must always be present alongside color (accessibility requirement).
    expect(onTime.querySelector("span")?.textContent).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- attendance-status-badge.test.tsx
```

Expected: FAIL — `Cannot find module './attendance-status-badge'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/attendance-status-badge.tsx
import type { AttendanceStatus } from "@/lib/attendance/status";

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; bg: string; fg: string; icon: React.ReactNode }
> = {
  tepat_waktu: {
    label: "Tepat Waktu",
    bg: "bg-green-50",
    fg: "text-green-700",
    icon: (
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  terlambat: {
    label: "Terlambat",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  pulang_cepat: {
    label: "Pulang Cepat",
    bg: "bg-sky-50",
    fg: "text-sky-700",
    icon: (
      <path
        d="M15 6 9 12l6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  alpa: {
    label: "Alpa",
    bg: "bg-red-50",
    fg: "text-red-700",
    icon: (
      <path
        d="M18 6 6 18M6 6l12 12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  di_luar_lokasi: {
    label: "Di Luar Lokasi",
    bg: "bg-orange-50",
    fg: "text-orange-700",
    icon: (
      <>
        <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  },
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
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
npm test -- attendance-status-badge.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/attendance-status-badge.tsx src/components/attendance-status-badge.test.tsx
git commit -m "feat: attendance status badge (icon + color + label, colorblind-accessible)"
```

---

## Task 9: `/absen` Page — Server Actions, Consent Gate, Clock-In/Out UI

**Files:**
- Create: `src/app/(employee)/absen/actions.ts`
- Create: `src/app/(employee)/absen/clock-panel.tsx`
- Modify: `src/app/(employee)/absen/page.tsx` (replace the Foundation placeholder)
- Create: `src/app/(employee)/absen/clock-panel.test.tsx`

**Interfaces:**
- Consumes: `clockIn` (Task 6), `clockOut` (Task 7), `uploadAttendancePhoto` (Task 5), `hasActiveConsent`/`recordConsent` (Task 4), `isMobileUserAgent` (Task 3), `AttendanceStatusBadge` (Task 8), `toJakartaDateOnly` (Task 6, `src/lib/attendance/jakarta-date.ts`), `getCurrentEmployee` (Foundation), `createServerSupabaseClient`/`createServiceRoleSupabaseClient` (Foundation).
- **Do NOT re-derive today's date with `new Date().toISOString().slice(0, 10)`** — that's the UTC date, not the Asia/Jakarta date `clockIn`/`clockOut` key attendance rows by. Use `toJakartaDateOnly(new Date())`.
- Produces: Server Actions `submitClockIn(formData: FormData)` and `submitClockOut(formData: FormData)`, exported from `actions.ts`, both reading `headers()` for the User-Agent mobile check and using the **service-role client** for the actual `clockIn`/`clockOut` call (per Global Constraints — status must not be client-writable via a user-scoped RLS path).

- [ ] **Step 1: Write the failing test for the client panel**

```typescript
// src/app/(employee)/absen/clock-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClockPanel } from "./clock-panel";

describe("ClockPanel", () => {
  const mockSubmitClockIn = vi.fn();
  const mockSubmitClockOut = vi.fn();

  beforeEach(() => {
    mockSubmitClockIn.mockReset().mockResolvedValue({ ok: true, status: "tepat_waktu" });
    mockSubmitClockOut.mockReset().mockResolvedValue({ ok: true, status: "tepat_waktu" });
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: -6.2, longitude: 106.8 },
          } as GeolocationPosition),
      },
    });
  });

  it("shows a Clock In button when there is no attendance record yet", () => {
    render(
      <ClockPanel
        todaysAttendance={null}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    expect(screen.getByRole("button", { name: /absen masuk/i })).toBeInTheDocument();
  });

  it("shows a Clock Out button (and today's status) once clocked in but not out", () => {
    render(
      <ClockPanel
        todaysAttendance={{ jamMasuk: "2026-09-01T09:00:00Z", jamPulang: null, status: "tepat_waktu" }}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    expect(screen.getByRole("button", { name: /absen pulang/i })).toBeInTheDocument();
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
  });

  it("shows a completed state once both clock-in and clock-out are recorded", () => {
    render(
      <ClockPanel
        todaysAttendance={{
          jamMasuk: "2026-09-01T09:00:00Z",
          jamPulang: "2026-09-01T17:00:00Z",
          status: "tepat_waktu",
        }}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    expect(screen.queryByRole("button", { name: /absen masuk/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /absen pulang/i })).not.toBeInTheDocument();
    expect(screen.getByText(/absensi hari ini selesai/i)).toBeInTheDocument();
  });

  it("captures geolocation and calls submitClockIn when Absen Masuk is clicked", async () => {
    render(
      <ClockPanel
        todaysAttendance={null}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    await waitFor(() => expect(mockSubmitClockIn).toHaveBeenCalled());
    const formData = mockSubmitClockIn.mock.calls[0][0] as FormData;
    expect(formData.get("lat")).toBe("-6.2");
    expect(formData.get("long")).toBe("106.8");
  });

  it("shows an error message when submitClockIn returns ok: false", async () => {
    mockSubmitClockIn.mockResolvedValue({ ok: false, error: "Anda sudah absen masuk hari ini." });
    render(
      <ClockPanel
        todaysAttendance={null}
        submitClockIn={mockSubmitClockIn}
        submitClockOut={mockSubmitClockOut}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /absen masuk/i }));
    expect(await screen.findByText("Anda sudah absen masuk hari ini.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- clock-panel.test.tsx
```

Expected: FAIL — `Cannot find module './clock-panel'`.

- [ ] **Step 3: Write the Server Actions**

```typescript
// src/app/(employee)/absen/actions.ts
"use server";

import { headers } from "next/headers";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { isMobileUserAgent } from "@/lib/attendance/mobile-detect";
import { clockIn, type ClockInResult } from "@/lib/attendance/clock-in";
import { clockOut, type ClockOutResult } from "@/lib/attendance/clock-out";
import { uploadAttendancePhoto } from "@/lib/attendance/photo-upload";

async function requireMobileEmployee() {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent");
  if (!isMobileUserAgent(userAgent)) {
    return { ok: false as const, error: "Absen hanya bisa dilakukan dari HP." };
  }

  const authedDb = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(authedDb);
  if (!employee) {
    return { ok: false as const, error: "Anda belum masuk. Silakan login ulang." };
  }

  return { ok: true as const, employee };
}

export async function submitClockIn(formData: FormData): Promise<ClockInResult> {
  const guard = await requireMobileEmployee();
  if (!guard.ok) return guard;

  const lat = Number(formData.get("lat"));
  const long = Number(formData.get("long"));
  const catatan = (formData.get("catatan") as string | null) ?? undefined;
  const photo = formData.get("photo") as Blob | null;
  if (!photo) {
    return { ok: false, error: "Foto selfie diperlukan." };
  }

  const serviceDb = createServiceRoleSupabaseClient();

  const uploadResult = await uploadAttendancePhoto(serviceDb, guard.employee.id, photo, "masuk");
  if (!uploadResult.ok) {
    return { ok: false, error: uploadResult.error };
  }

  return clockIn(serviceDb, {
    employeeId: guard.employee.id,
    lat,
    long,
    photoPath: uploadResult.path,
    photoExpiresAt: uploadResult.expiresAt,
    catatan,
  });
}

export async function submitClockOut(formData: FormData): Promise<ClockOutResult> {
  const guard = await requireMobileEmployee();
  if (!guard.ok) return guard;

  const lat = Number(formData.get("lat"));
  const long = Number(formData.get("long"));
  const photo = formData.get("photo") as Blob | null;
  if (!photo) {
    return { ok: false, error: "Foto selfie diperlukan." };
  }

  const serviceDb = createServiceRoleSupabaseClient();

  const uploadResult = await uploadAttendancePhoto(serviceDb, guard.employee.id, photo, "pulang");
  if (!uploadResult.ok) {
    return { ok: false, error: uploadResult.error };
  }

  return clockOut(serviceDb, {
    employeeId: guard.employee.id,
    lat,
    long,
    photoPath: uploadResult.path,
    photoExpiresAt: uploadResult.expiresAt,
  });
}
```

- [ ] **Step 4: Write the client panel**

```typescript
// src/app/(employee)/absen/clock-panel.tsx
"use client";

import { useState } from "react";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type TodaysAttendance = {
  jamMasuk: string;
  jamPulang: string | null;
  status: AttendanceStatus;
} | null;

type ActionResult = { ok: true; status: AttendanceStatus } | { ok: false; error: string };

export function ClockPanel({
  todaysAttendance,
  submitClockIn,
  submitClockOut,
}: {
  todaysAttendance: TodaysAttendance;
  submitClockIn: (formData: FormData) => Promise<ActionResult>;
  submitClockOut: (formData: FormData) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
  }

  async function handleClock(kind: "masuk" | "pulang", photo: File | null) {
    setError(null);
    setSubmitting(true);
    try {
      const position = await getPosition();
      const formData = new FormData();
      formData.set("lat", String(position.coords.latitude));
      formData.set("long", String(position.coords.longitude));
      if (photo) formData.set("photo", photo);

      const action = kind === "masuk" ? submitClockIn : submitClockOut;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
      }
    } catch {
      setError("Gagal mengambil lokasi. Pastikan GPS aktif dan izin lokasi diberikan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (todaysAttendance?.jamPulang) {
    return (
      <div className="rounded border p-6 text-center">
        <p className="text-base font-medium">Absensi hari ini selesai.</p>
        <div className="mt-2 flex justify-center">
          <AttendanceStatusBadge status={todaysAttendance.status} />
        </div>
      </div>
    );
  }

  if (todaysAttendance?.jamMasuk) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <AttendanceStatusBadge status={todaysAttendance.status} />
        <PhotoCaptureButton
          label="Absen Pulang"
          disabled={submitting}
          onCapture={(file) => handleClock("pulang", file)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <PhotoCaptureButton
        label="Absen Masuk"
        disabled={submitting}
        onCapture={(file) => handleClock("masuk", file)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PhotoCaptureButton({
  label,
  disabled,
  onCapture,
}: {
  label: string;
  disabled: boolean;
  onCapture: (file: File | null) => void;
}) {
  return (
    <label className="flex min-h-16 w-full max-w-xs cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-6 py-4 text-lg font-semibold text-white">
      {label}
      <input
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        disabled={disabled}
        onChange={(event) => onCapture(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- clock-panel.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Wire the page**

```typescript
// src/app/(employee)/absen/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { hasActiveConsent } from "@/lib/consent/consent";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { ClockPanel, type TodaysAttendance } from "./clock-panel";
import { submitClockIn, submitClockOut } from "./actions";

export default async function AbsenPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const consented = await hasActiveConsent(db, employee.id);
  if (!consented) {
    redirect("/absen/consent");
  }

  // Do NOT use `new Date().toISOString().slice(0, 10)` here — that's the UTC
  // date, which is the previous day for any instant before 07:00 WIB and
  // would miss the row Task 6's clockIn() wrote under the Jakarta date.
  const today = toJakartaDateOnly(new Date());
  const { data: attendance } = await db
    .from("attendances")
    .select("jam_masuk, jam_pulang, status")
    .eq("employee_id", employee.id)
    .eq("tanggal", today)
    .maybeSingle();

  const todaysAttendance: TodaysAttendance = attendance
    ? { jamMasuk: attendance.jam_masuk, jamPulang: attendance.jam_pulang, status: attendance.status }
    : null;

  return (
    <main className="p-4">
      <h1 className="mb-4 text-xl font-semibold">Absen</h1>
      <ClockPanel
        todaysAttendance={todaysAttendance}
        submitClockIn={submitClockIn}
        submitClockOut={submitClockOut}
      />
    </main>
  );
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`. (Note: `/absen/consent` does not exist yet — that page is a small addition in Task 10 alongside `/riwayat`; if the build complains about the redirect target missing, that's expected until Task 10 lands, since Next doesn't validate `redirect()` targets at build time — no action needed here.)

- [ ] **Step 8: Commit**

```bash
git add src/app/\(employee\)/absen
git commit -m "feat: /absen page with real clock-in/out, server-computed status, mobile-lock"
```

---

## Task 10: `/riwayat` Page and Consent Screen

**Files:**
- Create: `src/app/(employee)/riwayat/page.tsx`
- Create: `src/app/(employee)/riwayat/history-list.tsx`
- Create: `src/app/(employee)/riwayat/history-list.test.tsx`
- Create: `src/app/(employee)/absen/consent/page.tsx`
- Create: `src/app/(employee)/absen/consent/actions.ts`

**Interfaces:**
- Consumes: `AttendanceStatusBadge` (Task 8), `recordConsent` (Task 4), `getCurrentEmployee`/`createServerSupabaseClient` (Foundation).
- Produces: `<HistoryList records={AttendanceRecord[]} />` where `AttendanceRecord = { tanggal: string; jamMasuk: string | null; jamPulang: string | null; status: AttendanceStatus; catatan: string | null }`.

- [ ] **Step 1: Write the failing test for the history list**

```typescript
// src/app/(employee)/riwayat/history-list.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryList } from "./history-list";

describe("HistoryList", () => {
  it("shows an empty state when there are no records", () => {
    render(<HistoryList records={[]} />);
    expect(screen.getByText(/belum ada riwayat absensi/i)).toBeInTheDocument();
  });

  it("renders one row per attendance record with date, times, and status badge", () => {
    render(
      <HistoryList
        records={[
          {
            tanggal: "2026-09-01",
            jamMasuk: "2026-09-01T09:00:00Z",
            jamPulang: "2026-09-01T17:00:00Z",
            status: "tepat_waktu",
            catatan: null,
          },
          {
            tanggal: "2026-09-02",
            jamMasuk: "2026-09-02T09:20:00Z",
            jamPulang: "2026-09-02T17:00:00Z",
            status: "terlambat",
            catatan: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("Tepat Waktu")).toBeInTheDocument();
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
  });

  it("shows the catatan (reason) when present, e.g. for di_luar_lokasi records", () => {
    render(
      <HistoryList
        records={[
          {
            tanggal: "2026-09-01",
            jamMasuk: "2026-09-01T09:00:00Z",
            jamPulang: "2026-09-01T17:00:00Z",
            status: "di_luar_lokasi",
            catatan: "Kunjungan klien di luar kota",
          },
        ]}
      />,
    );
    expect(screen.getByText("Kunjungan klien di luar kota")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- history-list.test.tsx
```

Expected: FAIL — `Cannot find module './history-list'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/(employee)/riwayat/history-list.tsx
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import type { AttendanceStatus } from "@/lib/attendance/status";

export type AttendanceRecord = {
  tanggal: string;
  jamMasuk: string | null;
  jamPulang: string | null;
  status: AttendanceStatus;
  catatan: string | null;
};

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function HistoryList({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <p className="p-4 text-sm text-neutral-500">Belum ada riwayat absensi.</p>;
  }

  return (
    <ul className="divide-y">
      {records.map((record) => (
        <li key={record.tanggal} className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{formatDate(record.tanggal)}</span>
            <AttendanceStatusBadge status={record.status} />
          </div>
          <span className="text-sm text-neutral-600">
            {formatTime(record.jamMasuk)} – {formatTime(record.jamPulang)}
          </span>
          {record.catatan && <span className="text-sm text-neutral-500">{record.catatan}</span>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- history-list.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the consent action**

```typescript
// src/app/(employee)/absen/consent/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { recordConsent } from "@/lib/consent/consent";

export async function acceptConsent() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const result = await recordConsent(db, employee.id);
  if (!result.ok) {
    redirect(`/absen/consent?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/absen");
}
```

- [ ] **Step 6: Write the consent page**

```typescript
// src/app/(employee)/absen/consent/page.tsx
import { acceptConsent } from "./actions";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Persetujuan Lokasi &amp; Foto</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Untuk mencatat absensi, aplikasi ini perlu mengakses lokasi GPS dan mengambil foto selfie
        Anda saat clock-in dan clock-out. Data ini disimpan sesuai kebijakan privasi perusahaan dan
        akan ditandai kedaluwarsa setelah 90 hari.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={acceptConsent}>
        <button
          type="submit"
          className="min-h-11 rounded bg-blue-600 px-6 py-3 text-base font-medium text-white"
        >
          Saya Setuju
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Write the riwayat page**

```typescript
// src/app/(employee)/riwayat/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { HistoryList, type AttendanceRecord } from "./history-list";

export default async function RiwayatPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  const { data } = await db
    .from("attendances")
    .select("tanggal, jam_masuk, jam_pulang, status, catatan")
    .eq("employee_id", employee.id)
    .order("tanggal", { ascending: false })
    .limit(60);

  const records: AttendanceRecord[] = (data ?? []).map((row) => ({
    tanggal: row.tanggal,
    jamMasuk: row.jam_masuk,
    jamPulang: row.jam_pulang,
    status: row.status,
    catatan: row.catatan,
  }));

  return (
    <main className="p-4">
      <h1 className="mb-4 text-xl font-semibold">Riwayat Absensi</h1>
      <HistoryList records={records} />
    </main>
  );
}
```

- [ ] **Step 8: Verify build**

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(employee\)/riwayat src/app/\(employee\)/absen/consent
git commit -m "feat: /riwayat history page and /absen/consent gate"
```

---

## Self-Review Notes

- **Spec coverage:** §4.1 (mobile-lock) → Task 3, 9. §4.2 (consent) → Task 4, 10. §4.3 (GPS + selfie capture) → Task 9. §4.4 (geofencing, `di_luar_lokasi` + mandatory catatan) → Task 1, 6, 7. §4.5 (duplicate clock-in prevention) → Task 6 (explicit check) + Foundation's DB unique constraint (defense in depth). §4.6 (status from `work_schedules` + tolerance) → Task 2, 6, 7. §4.7 (private photo storage, URL only) → Task 5. §8 retention (90-day `expires_at` marking) → Task 5. §8 accessibility (icon+color+label) → Task 8. §8 testing (unit test geofencing/status/approver resolution — approver resolution is Plan 3 scope, geofencing/status covered here) → Task 1, 2.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and an exact command with expected output.
- **Type consistency:** `AttendanceStatus` (Task 2) is the single source of truth, imported by Tasks 6, 7, 8, 9, 10 — no task redefines it. `ClockInResult`/`ClockOutResult` shapes match exactly between the library functions (Tasks 6, 7) and the Server Actions/client panel that consume them (Task 9). `Role`/`CurrentEmployee` are reused from Foundation (`@/lib/auth/route-access`, `@/lib/auth/session`), never redefined.
- **Known follow-ups not in this plan** (per Foundation's final-review ledger, still open): the `atasan`-can-edit-any-employee-row lateral-escalation gap and the `attendances.tanggal` mutability residual are pre-existing RLS-layer items, out of scope for this application-layer plan — they'd be addressed in a dedicated RLS-hardening pass, not attendance feature work.
