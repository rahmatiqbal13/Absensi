# Proximity (Office Geofence) Admin + Absen Redesign — Implementation Plan (SP1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a screen to set each branch's office point + geofence radius on an interactive map, and rebuild the employee Absen page so it shows live distance/accuracy/in-radius status and lets an out-of-radius employee clock in with a reason.

**Architecture:** Backend geofence data already exists on `branches` (`lat`, `long`, `radius_geofencing_meter`) with `is_admin_role()` write RLS — no schema migration. A pure `geofenceState()` helper is shared by the server clock-in/out path and the client Absen panel. A new `/pengaturan/lokasi` page (pattern-cloned from `/pengaturan/jadwal`) writes the branch point via a server action that also records an audit row through the service-role client. A new vanilla-Leaflet `<LocationMap>` client component (dynamically imported, `ssr:false`) serves both the admin editor and the Absen mini-map. The Absen page gains a proximity panel driven by a `useGeolocation()` `watchPosition` hook.

**Tech Stack:** Next.js 16.3.2 (App Router, Server Actions), React 19.2, Supabase (`@supabase/ssr` + service-role client), Tailwind v4 + shadcn, `leaflet` (new dep), `lucide-react`, `sonner`, `vitest` + React Testing Library.

## Global Constraints

- **Read the relevant guide under `node_modules/next/dist/docs/` before writing code** (dynamic import, client components, server actions). Resolve `next` from the project dir. If `next dev` re-adds the agent-files block to `AGENTS.md`, commit it with the work — don't fight it.
- Icons: `lucide-react` only. **Never emoji** in shipped UI.
- All user-facing strings in Indonesian. Never surface raw Postgres/PostgREST text to users — log it, return an Indonesian message.
- Geofence "unset" sentinel: office point `(0, 0)` means "belum diatur".
- `validate-location` radius bounds: integer, `[20, 5000]` metres. Admin slider visible range `20–500`, numeric input accepts up to `5000`.
- Out-of-radius rule (unchanged): when the geofence **is configured** and the employee is outside the radius, clock-in/out is allowed **only** with a non-empty `catatan`. When the geofence is **not configured**, never force a reason.
- Motion respects `prefers-reduced-motion`.
- Test runner: `npx vitest run <path>` for one file; `npx vitest run` for all.
- Commit after every task. Conventional-commit prefixes (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`). End commit messages with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- After the UI tasks, run the Impeccable detector once:
  `node .agents/skills/impeccable/scripts/detect.mjs --json <changed targets>`

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/branches/validate-location.ts` | Pure validator for `{lat, long, radius}` → `{ok, value}` \| `{ok:false, error}` |
| `src/lib/branches/validate-location.test.ts` | Unit tests for the validator |
| `src/lib/geo/format-distance.ts` | `formatDistance(m)` and `walkingMinutes(m)` — id-ID display helpers |
| `src/lib/geo/format-distance.test.ts` | Unit tests |
| `src/lib/geo/use-geolocation.ts` | Client hook wrapping `navigator.geolocation.watchPosition` |
| `src/components/location-map.tsx` | Vanilla-Leaflet map: `mode: "edit" \| "view"`, marker + radius circle + optional user dot |
| `src/components/metric-tile.tsx` | Small labeled stat with status color |
| `src/components/metric-tile.test.tsx` | Component tests |
| `src/components/field-section.tsx` | Titled icon + heading + hint group wrapper |
| `src/app/(admin)/pengaturan/lokasi/page.tsx` | Server component: role guard, list branches + current geofence |
| `src/app/(admin)/pengaturan/lokasi/location-form.tsx` | Client: map editor + slider + "pakai lokasi saya" + save |
| `src/app/(admin)/pengaturan/lokasi/actions.ts` | `saveBranchLocation()` + audit insert |
| `src/app/(admin)/pengaturan/lokasi/actions.test.ts` | Action tests (mocked Supabase) |
| `src/app/(admin)/pengaturan/lokasi/location-form.test.tsx` | Form component tests |
| `src/app/(employee)/absen/proximity-panel.tsx` | Client: mini-map + live metric tiles |
| `src/app/(employee)/absen/today-timeline.tsx` | Client/server: vertical timeline of today's masuk/pulang |

**Modified:**

| File | Change |
|---|---|
| `src/lib/attendance/geofencing.ts` | Add `geofenceState()` |
| `src/lib/attendance/geofencing.test.ts` | Tests for `geofenceState()` |
| `src/lib/attendance/clock-in.ts` | Skip hard out-of-radius block when geofence unconfigured |
| `src/lib/attendance/clock-in.test.ts` | New cases |
| `src/lib/attendance/clock-out.ts` | Add `catatan` input + "configured + out of radius → reason required" gate |
| `src/lib/attendance/clock-out.test.ts` | New cases |
| `src/app/(employee)/absen/actions.ts` | `submitClockOut` reads `catatan` and threads it to `clockOut` |
| `src/app/(employee)/absen/page.tsx` | Load branch geofence + first work_schedule row; pass to panel |
| `src/app/(employee)/absen/clock-panel.tsx` | Rewrite: state machine + `ProximityPanel` + reason field + geo states |
| `src/app/(employee)/absen/clock-panel.test.tsx` | Rewrite/extend for new behavior |
| `src/app/(admin)/pengaturan/page.tsx` | Add "Lokasi Kantor" `HubCard` |
| `src/components/audit-aksi-badge.tsx` | Add `branch_location_update` label |
| `package.json` | Add `leaflet` + `@types/leaflet` |

---

## Task 1: `geofenceState()` shared helper

**Files:**
- Modify: `src/lib/attendance/geofencing.ts`
- Test: `src/lib/attendance/geofencing.test.ts`

**Interfaces:**
- Consumes: existing `haversineDistanceMeters`, `isWithinRadius` (same file).
- Produces:
  ```ts
  export type GeofenceState = {
    configured: boolean;
    distanceMeters: number | null;
    withinRadius: boolean;
  };
  export function geofenceState(
    userLat: number,
    userLng: number,
    office: { lat: number; long: number },
    radiusMeters: number,
  ): GeofenceState;
  ```
  Rules: `configured` is `false` when `office.lat === 0 && office.long === 0`. When not configured: `{ configured: false, distanceMeters: null, withinRadius: false }`. When configured: `distanceMeters` = `haversineDistanceMeters(...)`, `withinRadius` = `distance <= radiusMeters`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/attendance/geofencing.test.ts` (create the file with a `describe` import if it does not exist — check first; `geofencing.test.ts` is listed in the repo, so append):

```ts
import { geofenceState } from "./geofencing";

describe("geofenceState", () => {
  const office = { lat: -6.2, long: 106.8 };

  it("reports unconfigured when office is (0,0)", () => {
    expect(geofenceState(-6.2, 106.8, { lat: 0, long: 0 }, 100)).toEqual({
      configured: false,
      distanceMeters: null,
      withinRadius: false,
    });
  });

  it("is within radius when user sits on the office point", () => {
    const s = geofenceState(-6.2, 106.8, office, 100);
    expect(s.configured).toBe(true);
    expect(s.distanceMeters).toBeCloseTo(0, 5);
    expect(s.withinRadius).toBe(true);
  });

  it("is outside radius when user is far away", () => {
    const s = geofenceState(-6.9, 107.6, office, 100); // ~150 km
    expect(s.configured).toBe(true);
    expect(s.withinRadius).toBe(false);
    expect(s.distanceMeters).toBeGreaterThan(100_000);
  });

  it("treats a point exactly on the radius as within", () => {
    // 0.001 deg latitude ~= 111.19 m; radius 200 m keeps it inside
    const s = geofenceState(-6.201, 106.8, office, 200);
    expect(s.withinRadius).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/attendance/geofencing.test.ts`
Expected: FAIL — `geofenceState is not a function` / import error.

- [ ] **Step 3: Implement**

Append to `src/lib/attendance/geofencing.ts`:

```ts
export type GeofenceState = {
  configured: boolean;
  distanceMeters: number | null;
  withinRadius: boolean;
};

export function geofenceState(
  userLat: number,
  userLng: number,
  office: { lat: number; long: number },
  radiusMeters: number,
): GeofenceState {
  if (office.lat === 0 && office.long === 0) {
    return { configured: false, distanceMeters: null, withinRadius: false };
  }
  const distanceMeters = haversineDistanceMeters(userLat, userLng, office.lat, office.long);
  return {
    configured: true,
    distanceMeters,
    withinRadius: distanceMeters <= radiusMeters,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/attendance/geofencing.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/geofencing.ts src/lib/attendance/geofencing.test.ts
git commit -m "feat: add geofenceState helper for shared geofence checks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `validate-location` validator

**Files:**
- Create: `src/lib/branches/validate-location.ts`
- Test: `src/lib/branches/validate-location.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LocationInput = {
    lat: FormDataEntryValue | null;
    long: FormDataEntryValue | null;
    radius: FormDataEntryValue | null;
  };
  export type LocationValue = { lat: number; long: number; radius: number };
  export type LocationResult =
    | { ok: true; value: LocationValue }
    | { ok: false; error: string };
  export function validateLocationInput(input: LocationInput): LocationResult;
  ```
  Rules: coerce with `Number(...)`; `lat` finite in `[-90, 90]`; `long` finite in `[-180, 180]`; `radius` finite integer in `[20, 5000]`; reject `lat === 0 && long === 0` with `"Titik kantor belum dipilih di peta."`. Error strings are Indonesian.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/branches/validate-location.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateLocationInput } from "./validate-location";

const ok = { lat: "-6.2", long: "106.816", radius: "120" };

describe("validateLocationInput", () => {
  it("accepts a valid point and radius", () => {
    expect(validateLocationInput(ok)).toEqual({
      ok: true,
      value: { lat: -6.2, long: 106.816, radius: 120 },
    });
  });

  it("rejects (0,0) as not chosen", () => {
    const r = validateLocationInput({ lat: "0", long: "0", radius: "100" });
    expect(r).toEqual({ ok: false, error: "Titik kantor belum dipilih di peta." });
  });

  it("rejects latitude out of range", () => {
    expect(validateLocationInput({ ...ok, lat: "95" }).ok).toBe(false);
  });

  it("rejects longitude out of range", () => {
    expect(validateLocationInput({ ...ok, long: "200" }).ok).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(validateLocationInput({ ...ok, lat: "abc" }).ok).toBe(false);
    expect(validateLocationInput({ ...ok, lat: null }).ok).toBe(false);
  });

  it("rejects radius below 20", () => {
    expect(validateLocationInput({ ...ok, radius: "10" }).ok).toBe(false);
  });

  it("rejects radius above 5000", () => {
    expect(validateLocationInput({ ...ok, radius: "6000" }).ok).toBe(false);
  });

  it("rejects a non-integer radius", () => {
    expect(validateLocationInput({ ...ok, radius: "120.5" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/branches/validate-location.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/branches/validate-location.ts`:

```ts
export type LocationInput = {
  lat: FormDataEntryValue | null;
  long: FormDataEntryValue | null;
  radius: FormDataEntryValue | null;
};

export type LocationValue = { lat: number; long: number; radius: number };

export type LocationResult =
  | { ok: true; value: LocationValue }
  | { ok: false; error: string };

export function validateLocationInput(input: LocationInput): LocationResult {
  const lat = Number(input.lat);
  const long = Number(input.long);
  const radius = Number(input.radius);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude tidak valid." };
  }
  if (!Number.isFinite(long) || long < -180 || long > 180) {
    return { ok: false, error: "Longitude tidak valid." };
  }
  if (lat === 0 && long === 0) {
    return { ok: false, error: "Titik kantor belum dipilih di peta." };
  }
  if (!Number.isInteger(radius) || radius < 20 || radius > 5000) {
    return { ok: false, error: "Radius harus antara 20 dan 5000 meter." };
  }
  return { ok: true, value: { lat, long, radius } };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/branches/validate-location.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branches/
git commit -m "feat: add branch office-location validator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `format-distance` display helpers

**Files:**
- Create: `src/lib/geo/format-distance.ts`
- Test: `src/lib/geo/format-distance.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function formatDistance(meters: number): string; // "82 m" | "1,2 km"
  export function walkingMinutes(meters: number): string;  // "± 2 menit jalan kaki"
  ```
  `formatDistance`: `< 1000` → `"<rounded> m"` (round to nearest metre); `>= 1000` → `"<km with 1 decimal, id-ID separator> km"` (e.g. `"1,2 km"`). `walkingMinutes`: `Math.max(1, Math.round(meters / 80))` minutes at ~80 m/min; `"± 1 menit jalan kaki"` singular/plural identical in Indonesian.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geo/format-distance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDistance, walkingMinutes } from "./format-distance";

describe("formatDistance", () => {
  it("shows metres below 1 km", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(82.4)).toBe("82 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("shows kilometres with an id-ID decimal comma at/above 1 km", () => {
    expect(formatDistance(1000)).toBe("1 km");
    expect(formatDistance(1240)).toBe("1,2 km");
    expect(formatDistance(15980)).toBe("16 km");
  });
});

describe("walkingMinutes", () => {
  it("floors to at least 1 minute", () => {
    expect(walkingMinutes(10)).toBe("± 1 menit jalan kaki");
  });
  it("estimates ~80 m per minute", () => {
    expect(walkingMinutes(400)).toBe("± 5 menit jalan kaki");
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/geo/format-distance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/geo/format-distance.ts`:

```ts
const km = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${km.format(Math.round(meters / 100) / 10)} km`;
}

export function walkingMinutes(meters: number): string {
  const minutes = Math.max(1, Math.round(meters / 80));
  return `± ${minutes} menit jalan kaki`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/geo/format-distance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo/format-distance.ts src/lib/geo/format-distance.test.ts
git commit -m "feat: add distance/walking-time formatting helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `clock-in.ts` — allow attendance when geofence unconfigured

**Files:**
- Modify: `src/lib/attendance/clock-in.ts:86-99`
- Test: `src/lib/attendance/clock-in.test.ts`

**Interfaces:**
- Consumes: `geofenceState` (Task 1).
- Produces: no signature change to `clockIn`. Behavior change only.

Behavior: replace the `isWithinRadius(...)` call + the `if (!withinRadius && !catatan)` block with `geofenceState(...)`. When `!state.configured` → `withinRadius` is `false` for status purposes but the reason is **not** required. When `state.configured && !state.withinRadius && !catatan` → return the existing error `"Anda berada di luar radius kantor. Wajib isi catatan/alasan."`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/attendance/clock-in.test.ts`, extend `makeMockDb` to accept a `branch` override and add cases. Add to the `opts` destructure: `branch = BASE_BRANCH`, and in `tables.branches.select` return `{ data: branch, error: null }`. Then add:

```ts
it("allows clock-in without a reason when the branch geofence is unconfigured", async () => {
  const db = makeMockDb({ branch: { id: "branch-1", lat: 0, long: 0, radius_geofencing_meter: 100 } });
  const result = await clockIn(db as any, {
    employeeId: "employee-1",
    lat: -6.2,
    long: 106.8,
    photoPath: "p",
    photoExpiresAt: new Date().toISOString(),
    now: new Date("2026-09-07T02:00:00Z"), // 09:00 WIB
  });
  expect(result.ok).toBe(true);
});

it("still requires a reason when configured and out of radius", async () => {
  const db = makeMockDb(); // BASE_BRANCH at -6.2,106.8 r=100
  const result = await clockIn(db as any, {
    employeeId: "employee-1",
    lat: -6.9,
    long: 107.6, // far
    photoPath: "p",
    photoExpiresAt: new Date().toISOString(),
    now: new Date("2026-09-07T02:00:00Z"),
  });
  expect(result).toEqual({
    ok: false,
    error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
  });
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `npx vitest run src/lib/attendance/clock-in.test.ts`
Expected: the "unconfigured" test FAILS (currently `(0,0)` + far coords → `isWithinRadius` false → reason required).

- [ ] **Step 3: Implement**

In `src/lib/attendance/clock-in.ts`:

Change the import line 2 to:
```ts
import { geofenceState } from "./geofencing";
```

Replace lines 86-99 (`const withinRadius = isWithinRadius(...)` through the `if (!withinRadius && !catatan)` block) with:

```ts
  const geo = geofenceState(input.lat, input.long, branch, branch.radius_geofencing_meter);
  const withinRadius = geo.withinRadius;

  // A whitespace-only catatan is not a reason — treat it as absent.
  const catatan = input.catatan?.trim() || null;

  // Only force a reason when the branch geofence is actually configured. If an
  // admin has not set the office point yet, do not block the employee for it.
  if (geo.configured && !withinRadius && !catatan) {
    return { ok: false, error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan." };
  }
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/attendance/clock-in.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/clock-in.ts src/lib/attendance/clock-in.test.ts
git commit -m "fix: don't block clock-in when branch geofence is unconfigured

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `clock-out.ts` + `absen/actions.ts` — reason on clock-out

**Files:**
- Modify: `src/lib/attendance/clock-out.ts`
- Modify: `src/app/(employee)/absen/actions.ts:95-123`
- Test: `src/lib/attendance/clock-out.test.ts`

**Interfaces:**
- Consumes: `geofenceState` (Task 1).
- Produces:
  ```ts
  export type ClockOutInput = {
    employeeId: string;
    lat: number;
    long: number;
    photoPath: string;
    photoExpiresAt: string;
    catatan?: string;   // NEW
    now?: Date;
  };
  ```
  Behavior: after computing `geo = geofenceState(...)`, if `geo.configured && !geo.withinRadius` and `catatan` (trimmed) is empty → return `{ ok: false, error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan." }`. When a reason IS given on an out-of-radius clock-out, persist it: `.update({ ..., catatan })` only when `catatan` is non-empty (do not null out a clock-in reason).

- [ ] **Step 1: Write the failing tests**

In `src/lib/attendance/clock-out.test.ts`, add a `branch` override to the mock db (same shape as Task 4) and:

```ts
it("requires a reason when configured and out of radius", async () => {
  const db = makeMockDb(); // BASE_BRANCH configured
  const result = await clockOut(db as any, {
    employeeId: "employee-1",
    lat: -6.9, long: 107.6,
    photoPath: "p", photoExpiresAt: new Date().toISOString(),
    now: new Date("2026-09-07T10:00:00Z"),
  });
  expect(result).toEqual({
    ok: false,
    error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
  });
});

it("allows an out-of-radius clock-out with a reason and persists it", async () => {
  const db = makeMockDb();
  const result = await clockOut(db as any, {
    employeeId: "employee-1",
    lat: -6.9, long: 107.6,
    photoPath: "p", photoExpiresAt: new Date().toISOString(),
    catatan: "Meeting klien di luar",
    now: new Date("2026-09-07T10:00:00Z"),
  });
  expect(result.ok).toBe(true);
  // assert the update payload carried catatan — see __updateMock in the mock db
  expect(db.__updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ catatan: "Meeting klien di luar" }),
  );
});

it("does not force a reason when the geofence is unconfigured", async () => {
  const db = makeMockDb({ branch: { id: "branch-1", lat: 0, long: 0, radius_geofencing_meter: 100 } });
  const result = await clockOut(db as any, {
    employeeId: "employee-1",
    lat: -6.9, long: 107.6,
    photoPath: "p", photoExpiresAt: new Date().toISOString(),
    now: new Date("2026-09-07T10:00:00Z"),
  });
  expect(result.ok).toBe(true);
});
```

If `clock-out.test.ts`'s mock db does not already expose the `.update()` spy, add `__updateMock` to it: capture the object passed to `.from("attendances").update(...)`.

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/attendance/clock-out.test.ts`
Expected: FAIL on the new cases (reason not enforced / not persisted).

- [ ] **Step 3: Implement**

In `src/lib/attendance/clock-out.ts`:

- Line 2: `import { geofenceState } from "./geofencing";`
- Add `catatan?: string;` to `ClockOutInput`.
- Replace the `const withinRadius = isWithinRadius(...)` block (lines 87-93) with:

```ts
  const geo = geofenceState(input.lat, input.long, branch, branch.radius_geofencing_meter);
  const withinRadius = geo.withinRadius;
  const catatan = input.catatan?.trim() || null;

  if (geo.configured && !withinRadius && !catatan) {
    return { ok: false, error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan." };
  }
```

- In the `.update({...})` payload (lines 105-111) add, conditionally, the reason. Change to build the payload first:

```ts
  const updatePayload: Record<string, unknown> = {
    jam_pulang: now.toISOString(),
    lokasi_pulang: `(${input.lat},${input.long})`,
    foto_pulang_url: input.photoPath,
    foto_pulang_expires_at: input.photoExpiresAt,
    status: finalStatus,
  };
  if (catatan) updatePayload.catatan = catatan;

  const { data: updated, error: updateErr } = await db
    .from("attendances")
    .update(updatePayload)
    .eq("id", today.id)
    .is("jam_pulang", null)
    .select()
    .single();
```

In `src/app/(employee)/absen/actions.ts`, `submitClockOut` (lines 95-123): after the coordinate check, read the reason and pass it:

```ts
  const catatan = (formData.get("catatan") as string | null) ?? undefined;
```

and add `catatan,` to the `clockOut(serviceDb, { ... })` call object.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/attendance/clock-out.test.ts src/lib/attendance/clock-in.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/clock-out.ts "src/app/(employee)/absen/actions.ts" src/lib/attendance/clock-out.test.ts
git commit -m "feat: accept an out-of-radius reason on clock-out

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `MetricTile` component

**Files:**
- Create: `src/components/metric-tile.tsx`
- Test: `src/components/metric-tile.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type MetricStatus = "neutral" | "good" | "warn" | "bad";
  export function MetricTile(props: {
    label: string;
    value: string;
    hint?: string;
    icon?: LucideIcon;
    status?: MetricStatus;   // default "neutral"
  }): JSX.Element;
  ```
  Renders a `rounded-lg border bg-card p-3` block: label (`text-xs text-muted-foreground`), value (`text-lg font-semibold tabular-nums`), optional hint (`text-xs text-muted-foreground`). `status` colors the value text and icon only — never a full background. Color map: `good` → `text-emerald-600 dark:text-emerald-500`, `warn` → `text-amber-600 dark:text-amber-500`, `bad` → `text-destructive`, `neutral` → `text-foreground`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/metric-tile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { MetricTile } from "./metric-tile";

describe("MetricTile", () => {
  it("renders label, value, and hint", () => {
    render(<MetricTile label="Jarak ke kantor" value="82 m" hint="± 1 menit jalan kaki" />);
    expect(screen.getByText("Jarak ke kantor")).toBeInTheDocument();
    expect(screen.getByText("82 m")).toBeInTheDocument();
    expect(screen.getByText("± 1 menit jalan kaki")).toBeInTheDocument();
  });

  it("applies the status color to the value, not a background", () => {
    render(<MetricTile label="Status" value="Dalam radius" status="good" icon={MapPin} />);
    const value = screen.getByText("Dalam radius");
    expect(value.className).toMatch(/text-emerald/);
    expect(value.className).not.toMatch(/bg-emerald/);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/components/metric-tile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/metric-tile.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricStatus = "neutral" | "good" | "warn" | "bad";

const STATUS_COLOR: Record<MetricStatus, string> = {
  neutral: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-500",
  warn: "text-amber-600 dark:text-amber-500",
  bad: "text-destructive",
};

export function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  status = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  status?: MetricStatus;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("flex items-center gap-1.5 text-lg font-semibold tabular-nums", STATUS_COLOR[status])}>
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/metric-tile.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/metric-tile.tsx src/components/metric-tile.test.tsx
git commit -m "feat: add MetricTile component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `FieldSection` wrapper

**Files:**
- Create: `src/components/field-section.tsx`
- Test: `src/components/field-section.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function FieldSection(props: {
    icon?: LucideIcon;
    title: string;
    hint?: string;
    children: React.ReactNode;
    className?: string;
  }): JSX.Element;
  ```
  Renders a `<section>` with a header row (icon `size-4 text-muted-foreground` + `title` as `text-sm font-medium`), optional `hint` line (`text-xs text-muted-foreground`), then `children` in a `mt-3` container.

- [ ] **Step 1: Write the failing test**

Create `src/components/field-section.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldSection } from "./field-section";

describe("FieldSection", () => {
  it("renders title, hint, and children", () => {
    render(
      <FieldSection title="Lokasi" hint="Geser pin ke kantor">
        <p>isi</p>
      </FieldSection>,
    );
    expect(screen.getByText("Lokasi")).toBeInTheDocument();
    expect(screen.getByText("Geser pin ke kantor")).toBeInTheDocument();
    expect(screen.getByText("isi")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/components/field-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/field-section.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldSection({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/components/field-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/field-section.tsx src/components/field-section.test.tsx
git commit -m "feat: add FieldSection wrapper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `useGeolocation` hook

**Files:**
- Create: `src/lib/geo/use-geolocation.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GeoStatus = "prompt" | "watching" | "granted" | "denied" | "unavailable";
  export type GeoReading = {
    position: { lat: number; lng: number } | null;
    accuracy: number | null;
    status: GeoStatus;
    error: string | null;
    refresh: () => void;
  };
  export function useGeolocation(enabled?: boolean): GeoReading;
  ```
  Starts a `watchPosition` on mount (when `enabled !== false` and `navigator.geolocation` exists). `status` starts `"prompt"`, becomes `"watching"` once a watch id is registered, `"granted"` after the first fix, `"denied"` on `PERMISSION_DENIED`, `"unavailable"` on `POSITION_UNAVAILABLE`/`TIMEOUT` or no `navigator.geolocation`. `refresh()` re-issues a one-shot `getCurrentPosition`. `enableHighAccuracy: true`, `timeout: 15000`, `maximumAge: 10000`. Clears the watch on unmount.

- [ ] **Step 1: Implement (no unit test — jsdom has no geolocation; covered via panel tests with a mock)**

Create `src/lib/geo/use-geolocation.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoStatus = "prompt" | "watching" | "granted" | "denied" | "unavailable";

export type GeoReading = {
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  status: GeoStatus;
  error: string | null;
  refresh: () => void;
};

const OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 };

export function useGeolocation(enabled = true): GeoReading {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>("prompt");
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const onOk = useCallback((p: GeolocationPosition) => {
    setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
    setAccuracy(p.coords.accuracy);
    setStatus("granted");
    setError(null);
  }, []);

  const onErr = useCallback((e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) {
      setStatus("denied");
      setError("Izin lokasi ditolak.");
    } else {
      setStatus("unavailable");
      setError("GPS tidak tersedia. Coba lagi di area terbuka.");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setError("Perangkat tidak mendukung lokasi.");
      return;
    }
    setStatus("watching");
    watchId.current = navigator.geolocation.watchPosition(onOk, onErr, OPTS);
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled, onOk, onErr]);

  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(onOk, onErr, OPTS);
  }, [onOk, onErr]);

  return { position, accuracy, status, error, refresh };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/geo/use-geolocation.ts
git commit -m "feat: add useGeolocation watchPosition hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `leaflet` dependency + `LocationMap` component

**Files:**
- Modify: `package.json`
- Create: `src/components/location-map.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type LatLng = { lat: number; lng: number };
  export function LocationMap(props: {
    mode: "edit" | "view";
    center: LatLng;
    radiusMeters: number;
    marker: LatLng;
    userPosition?: { lat: number; lng: number; accuracy?: number };
    onMarkerChange?: (p: LatLng) => void;
    className?: string;
  }): JSX.Element;
  ```
  Consumers import it via `next/dynamic(() => import("@/components/location-map").then(m => m.LocationMap), { ssr: false })`.

- [ ] **Step 1: Install leaflet**

Run:
```bash
npm install leaflet@^1.9.4 && npm install -D @types/leaflet@^1.9.12
```
Expected: `package.json` gains `leaflet` in deps and `@types/leaflet` in devDeps; lockfile updates.

- [ ] **Step 2: Read the Next dynamic-import guide**

Run: `ls node_modules/next/dist/docs/` then read the file covering `next/dynamic` / client components. Confirm `ssr: false` dynamic import usage for a browser-only lib is current. (No code in this step — just verification.)

- [ ] **Step 3: Implement the component**

Create `src/components/location-map.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

export type LatLng = { lat: number; lng: number };

// Leaflet's default marker icons resolve to broken relative URLs under a
// bundler. Point them at the CDN copy that ships with the leaflet package
// version we pinned.
const ICON = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export function LocationMap({
  mode,
  center,
  radiusMeters,
  marker,
  userPosition,
  onMarkerChange,
  className,
}: {
  mode: "edit" | "view";
  center: LatLng;
  radiusMeters: number;
  marker: LatLng;
  userPosition?: { lat: number; lng: number; accuracy?: number };
  onMarkerChange?: (p: LatLng) => void;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const userRef = useRef<L.CircleMarker | null>(null);
  const onMarkerChangeRef = useRef(onMarkerChange);
  onMarkerChangeRef.current = onMarkerChange;

  // Init once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: [center.lat, center.lng],
      zoom: 16,
      scrollWheelZoom: mode === "edit",
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const m = L.marker([marker.lat, marker.lng], { draggable: mode === "edit", icon: ICON }).addTo(map);
    const c = L.circle([marker.lat, marker.lng], { radius: radiusMeters, color: "#2563eb", weight: 1, fillOpacity: 0.1 }).addTo(map);
    markerRef.current = m;
    circleRef.current = c;

    if (mode === "edit") {
      m.on("dragend", () => {
        const p = m.getLatLng();
        c.setLatLng(p);
        onMarkerChangeRef.current?.({ lat: p.lat, lng: p.lng });
      });
      map.on("click", (e: L.LeafletMouseEvent) => {
        m.setLatLng(e.latlng);
        c.setLatLng(e.latlng);
        onMarkerChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to prop changes.
  useEffect(() => {
    markerRef.current?.setLatLng([marker.lat, marker.lng]);
    circleRef.current?.setLatLng([marker.lat, marker.lng]);
  }, [marker.lat, marker.lng]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusMeters);
  }, [radiusMeters]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!userPosition) {
      userRef.current?.remove();
      userRef.current = null;
      return;
    }
    const ll: L.LatLngExpression = [userPosition.lat, userPosition.lng];
    if (userRef.current) {
      userRef.current.setLatLng(ll);
    } else {
      userRef.current = L.circleMarker(ll, {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#16a34a",
        fillOpacity: 1,
      }).addTo(mapRef.current);
    }
  }, [userPosition?.lat, userPosition?.lng]);

  return (
    <div
      ref={elRef}
      className={cn(
        "h-64 w-full overflow-hidden rounded-lg border border-border",
        "[&_.leaflet-tile-pane]:dark:brightness-90 [&_.leaflet-tile-pane]:dark:contrast-90 [&_.leaflet-tile-pane]:dark:invert [&_.leaflet-tile-pane]:dark:hue-rotate-180",
        className,
      )}
    />
  );
}
```

Note: the marker icon URLs are `https://unpkg.com/leaflet@1.9.4/...` (images, not scripts — allowed in the real app; no artifact CSP applies here). If the project already vendors leaflet images under `public/`, use those paths instead.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/location-map.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/location-map.tsx
git commit -m "feat: add LocationMap Leaflet component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: `saveBranchLocation` server action + audit

**Files:**
- Create: `src/app/(admin)/pengaturan/lokasi/actions.ts`
- Test: `src/app/(admin)/pengaturan/lokasi/actions.test.ts`

**Interfaces:**
- Consumes: `validateLocationInput` (Task 2), `createServerSupabaseClient` + `createServiceRoleSupabaseClient` (`@/lib/supabase/server`), `getCurrentEmployee` (`@/lib/auth/session`).
- Produces:
  ```ts
  export async function saveBranchLocation(
    branchId: string,
    formData: FormData,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  ```
  FormData keys: `lat`, `long`, `radius`.

Flow:
1. authed client → `getCurrentEmployee`; reject unless `role` is `hr_admin` | `super_admin` with `"Tidak diizinkan."`.
2. reject empty `branchId` with `"Cabang tidak valid."`.
3. `validateLocationInput({ lat, long, radius })`; on `!ok` return it.
4. Read current row for the audit "before": `authedDb.from("branches").select("lat, long, radius_geofencing_meter").eq("id", branchId).single()`.
5. `authedDb.from("branches").update({ lat, long, radius_geofencing_meter: radius }).eq("id", branchId)` — on error log + return `"Gagal menyimpan lokasi kantor."`.
6. Audit via **service-role** client (RLS blocks client inserts into `audit_logs`):
   `serviceDb.from("audit_logs").insert({ actor_id: me.id, target_employee_id: null, aksi: "branch_location_update", detail: { branch_id: branchId, before, after } })`. On error: `console.error` only — do not fail.
7. `revalidatePath("/pengaturan/lokasi")` and `revalidatePath("/absen")`.
8. return `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/(admin)/pengaturan/lokasi/actions.test.ts`. Mirror the mocking style of `src/app/(admin)/pengaturan/instansi/actions.test.ts` (check it first for how `@/lib/supabase/server` and `@/lib/auth/session` are mocked, and how `next/cache` is stubbed). Cases:

```ts
// - rejects a non-admin caller with "Tidak diizinkan."
// - rejects invalid coordinates (delegates to validateLocationInput)
// - on valid input: calls branches.update with { lat, long, radius_geofencing_meter }
//   and inserts an audit_logs row with aksi "branch_location_update" and
//   detail.before / detail.after
// - still returns { ok: true } when the audit insert errors
// - returns an Indonesian error when the branches.update errors
```

Write concrete `it(...)` blocks with `expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ lat: -6.2, long: 106.816, radius_geofencing_meter: 120 }))` and `expect(auditInsertMock).toHaveBeenCalledWith(expect.objectContaining({ aksi: "branch_location_update" }))`.

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/actions.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/app/(admin)/pengaturan/lokasi/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateLocationInput } from "@/lib/branches/validate-location";

type Result = { ok: true } | { ok: false; error: string };

export async function saveBranchLocation(branchId: string, formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const parsed = validateLocationInput({
    lat: formData.get("lat"),
    long: formData.get("long"),
    radius: formData.get("radius"),
  });
  if (!parsed.ok) return parsed;

  const { data: before } = await db
    .from("branches")
    .select("lat, long, radius_geofencing_meter")
    .eq("id", branchId)
    .single();

  const after = {
    lat: parsed.value.lat,
    long: parsed.value.long,
    radius_geofencing_meter: parsed.value.radius,
  };

  const { error } = await db.from("branches").update(after).eq("id", branchId);
  if (error) {
    console.error("saveBranchLocation: update failed", error);
    return { ok: false, error: "Gagal menyimpan lokasi kantor." };
  }

  const service = createServiceRoleSupabaseClient();
  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: null,
    aksi: "branch_location_update",
    detail: { branch_id: branchId, before: before ?? null, after },
  });
  if (auditErr) console.error("saveBranchLocation: audit insert failed", auditErr);

  revalidatePath("/pengaturan/lokasi");
  revalidatePath("/absen");
  return { ok: true };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/lokasi/actions.ts" "src/app/(admin)/pengaturan/lokasi/actions.test.ts"
git commit -m "feat: add saveBranchLocation action with audit trail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: `LocationForm` client component

**Files:**
- Create: `src/app/(admin)/pengaturan/lokasi/location-form.tsx`
- Test: `src/app/(admin)/pengaturan/lokasi/location-form.test.tsx`

**Interfaces:**
- Consumes: `saveBranchLocation` (Task 10), `LocationMap` (Task 9, via `next/dynamic`), `FieldSection` (Task 7), `formatDistance`/`walkingMinutes` (Task 3), `geofenceState` (Task 1, for the "configured?" chip), UI `Card`, `Button`, `Alert`, `Input`, `Field`, `sonner`'s `toast`.
- Produces:
  ```ts
  export type BranchLocation = {
    id: string;
    nama: string;
    alamat: string | null;
    lat: number;
    long: number;
    radius: number;
  };
  export function LocationForm(props: {
    branch: BranchLocation;
    fallbackCenter: { lat: number; lng: number };
    saveBranchLocation: (branchId: string, fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  }): JSX.Element;
  ```

Behavior:
- Local state: `marker {lat,lng}`, `radius` (number), `busy`, `error`.
- Initial `marker`: if `branch.lat===0 && branch.long===0` → `fallbackCenter`; else `{lat: branch.lat, lng: branch.long}`. Initial `radius`: `branch.radius || 100`.
- `configured` = not `(0,0)`. Chip: `configured` → emerald "Aktif · {radius} m · {walkingMinutes(radius)}"; else amber "Belum diatur".
- `<LocationMap mode="edit" center={initialMarker} marker={marker} radiusMeters={radius} onMarkerChange={setMarker} />`.
- Button `[LocateFixed] Pakai lokasi saya sekarang` → `navigator.geolocation.getCurrentPosition` → `setMarker({lat,lng})`; on error `toast.error("Gagal mengambil lokasi.")`.
- Read-only lat/long display (`{marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}`) + a `<details>` "Edit manual" with two `Input type="number" step="any"` bound to `marker`.
- Radius: native `<input type="range" min={20} max={500} step={5}>` + a `<input type="number" min={20} max={5000}>` mirrored, both bound to `radius`; label shows `{radius} m`.
- `dirty` = marker or radius differs from initial. Submit disabled unless `dirty && !busy`.
- On submit (`<form action={action}>`): build `FormData` with `lat`, `long`, `radius`; call `saveBranchLocation(branch.id, fd)`; `ok` → `toast.success("Lokasi kantor tersimpan.")` + reset initial baseline to current; `!ok` → `setError(r.error)`.
- Helper under the slider: "Karyawan di luar radius tetap bisa absen, tapi wajib mengisi alasan."

- [ ] **Step 1: Write the failing tests**

Create `src/app/(admin)/pengaturan/lokasi/location-form.test.tsx`. Mock `LocationMap` (`vi.mock("@/components/location-map", () => ({ LocationMap: () => <div data-testid="map" /> }))`) and `next/dynamic` if needed (or import the component directly and let the mock cover it). Mock `navigator.geolocation.getCurrentPosition`. Cases:

```ts
// - renders "Belum diatur" chip when branch point is (0,0)
// - renders "Aktif" chip with radius text when configured
// - Save button is disabled until the radius slider changes
// - changing the radius number input updates the "{n} m" label
// - "Pakai lokasi saya" populates the read-only lat/long from a mocked position
// - a failed save shows the returned error in an Alert
// - a successful save calls saveBranchLocation with FormData carrying lat/long/radius
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/location-form.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** the component per the Behavior spec above. Keep it a single focused file (~150 lines). Use `"use client"`. Import `LocationMap` via:

```tsx
import dynamic from "next/dynamic";
const LocationMap = dynamic(() => import("@/components/location-map").then((m) => m.LocationMap), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg border border-border bg-muted" />,
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/location-form.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/lokasi/location-form.tsx" "src/app/(admin)/pengaturan/lokasi/location-form.test.tsx"
git commit -m "feat: add branch LocationForm map editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: `/pengaturan/lokasi` page + hub card + audit label

**Files:**
- Create: `src/app/(admin)/pengaturan/lokasi/page.tsx`
- Modify: `src/app/(admin)/pengaturan/page.tsx`
- Modify: `src/components/audit-aksi-badge.tsx`

**Interfaces:**
- Consumes: `LocationForm` + `BranchLocation` (Task 11), `saveBranchLocation` (Task 10).

- [ ] **Step 1: Create the page**

Create `src/app/(admin)/pengaturan/lokasi/page.tsx` (clone `jadwal/page.tsx` structure):

```tsx
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LocationForm, type BranchLocation } from "./location-form";
import { saveBranchLocation } from "./actions";

const JAKARTA = { lat: -6.2, lng: 106.816 };

export default async function LokasiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter")
    .order("nama");
  if (error) console.error("lokasi: branches query failed", error);

  const rows: BranchLocation[] = (branches ?? []).map((b) => ({
    id: b.id,
    nama: b.nama,
    alamat: b.alamat,
    lat: b.lat,
    long: b.long,
    radius: b.radius_geofencing_meter,
  }));

  const fallbackCenter =
    rows.find((r) => !(r.lat === 0 && r.long === 0)) is undefined
      ? JAKARTA
      : (() => {
          const c = rows.find((r) => !(r.lat === 0 && r.long === 0))!;
          return { lat: c.lat, lng: c.long };
        })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lokasi Kantor"
        description="Titik kantor dan radius geofence dipakai untuk memvalidasi absensi karyawan."
      />
      {rows.length === 0 ? (
        <EmptyState icon={MapPin} message="Belum ada cabang." />
      ) : (
        <div className="space-y-4">
          {rows.map((b) => (
            <LocationForm
              key={b.id}
              branch={b}
              fallbackCenter={fallbackCenter}
              saveBranchLocation={saveBranchLocation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Fix the `fallbackCenter` expression to valid TS:

```tsx
  const configuredBranch = rows.find((r) => !(r.lat === 0 && r.long === 0));
  const fallbackCenter = configuredBranch
    ? { lat: configuredBranch.lat, lng: configuredBranch.long }
    : JAKARTA;
```

- [ ] **Step 2: Add the hub card**

In `src/app/(admin)/pengaturan/page.tsx`: add `MapPin` to the `lucide-react` import, and add inside the `hr_admin || super_admin` grid (after the Jadwal card):

```tsx
          <HubCard href="/pengaturan/lokasi" icon={MapPin} title="Lokasi Kantor"
            desc="Titik kantor & radius geofence untuk absensi per cabang." />
```

- [ ] **Step 3: Add the audit label**

In `src/components/audit-aksi-badge.tsx` `CONFIG`, add:

```ts
  branch_location_update: { label: "Lokasi Kantor Diubah", variant: "info" },
```

- [ ] **Step 4: Typecheck + run the settings tests**

Run: `npx tsc --noEmit && npx vitest run src/components/audit-aksi-badge.test.tsx`
Expected: clean / PASS.

- [ ] **Step 5: Manually verify (dev server)**

Run `npm run dev`, sign in as an admin, open `/pengaturan` → "Lokasi Kantor" card is present → the page lists branches with maps. Set a point + radius, save, see the toast, and check `/pengaturan/audit` shows "Lokasi Kantor Diubah".

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/pengaturan/lokasi/page.tsx" "src/app/(admin)/pengaturan/page.tsx" src/components/audit-aksi-badge.tsx
git commit -m "feat: add /pengaturan/lokasi office geofence page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Absen page server data + `ProximityPanel`

**Files:**
- Modify: `src/app/(employee)/absen/page.tsx`
- Create: `src/app/(employee)/absen/proximity-panel.tsx`

**Interfaces:**
- Consumes: `useGeolocation` (Task 8), `geofenceState` (Task 1), `LocationMap` (Task 9), `MetricTile` (Task 6), `formatDistance`/`walkingMinutes` (Task 3).
- Produces:
  ```ts
  export type BranchGeofence = { lat: number; long: number; radius: number };
  export function ProximityPanel(props: {
    office: BranchGeofence;
    onGeoChange: (g: {
      status: import("@/lib/geo/use-geolocation").GeoStatus;
      configured: boolean;
      withinRadius: boolean;
      hasFix: boolean;
    }) => void;
  }): JSX.Element;
  ```
  `page.tsx` passes `office` into `ClockPanel`, which renders `ProximityPanel` and lifts the geo summary via `onGeoChange` to decide reason-field visibility and submit gating.

- [ ] **Step 1: Update `page.tsx` to load geofence + schedule**

In `src/app/(employee)/absen/page.tsx`, after loading `employee`, add:

```ts
  const { data: branch } = await db
    .from("branches")
    .select("lat, long, radius_geofencing_meter")
    .eq("id", employee.branch_id)
    .single();

  const { data: schedule } = await db
    .from("work_schedules")
    .select("jam_masuk, toleransi_terlambat_menit")
    .eq("branch_id", employee.branch_id)
    .limit(1)
    .maybeSingle();
```

Pass to `ClockPanel`:

```tsx
      <ClockPanel
        todaysAttendance={todaysAttendance}
        office={{
          lat: branch?.lat ?? 0,
          long: branch?.long ?? 0,
          radius: branch?.radius_geofencing_meter ?? 100,
        }}
        shift={
          schedule
            ? { jamMasuk: schedule.jam_masuk.slice(0, 5), toleransiMenit: schedule.toleransi_terlambat_menit }
            : null
        }
        submitClockIn={submitClockIn}
        submitClockOut={submitClockOut}
      />
```

- [ ] **Step 2: Create `ProximityPanel`**

Create `src/app/(employee)/absen/proximity-panel.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { MapPin, Crosshair, LoaderCircle } from "lucide-react";
import { MetricTile } from "@/components/metric-tile";
import { useGeolocation } from "@/lib/geo/use-geolocation";
import { geofenceState } from "@/lib/attendance/geofencing";
import { formatDistance, walkingMinutes } from "@/lib/geo/format-distance";

const LocationMap = dynamic(
  () => import("@/components/location-map").then((m) => m.LocationMap),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg border border-border bg-muted" /> },
);

export type BranchGeofence = { lat: number; long: number; radius: number };

export function ProximityPanel({
  office,
  onGeoChange,
}: {
  office: BranchGeofence;
  onGeoChange: (g: {
    status: ReturnType<typeof useGeolocation>["status"];
    configured: boolean;
    withinRadius: boolean;
    hasFix: boolean;
  }) => void;
}) {
  const { position, accuracy, status } = useGeolocation();

  const geo =
    position != null
      ? geofenceState(position.lat, position.lng, office, office.radius)
      : { configured: !(office.lat === 0 && office.long === 0), distanceMeters: null, withinRadius: false };

  useEffect(() => {
    onGeoChange({
      status,
      configured: geo.configured,
      withinRadius: geo.withinRadius,
      hasFix: position != null,
    });
  }, [status, geo.configured, geo.withinRadius, position, onGeoChange]);

  const accuracyStatus = accuracy == null ? "neutral" : accuracy <= 30 ? "good" : accuracy <= 100 ? "warn" : "bad";
  const distanceStatus = !geo.configured ? "neutral" : geo.withinRadius ? "good" : "bad";

  return (
    <div className="space-y-3">
      {geo.configured && (
        <LocationMap
          mode="view"
          center={{ lat: office.lat, lng: office.long }}
          marker={{ lat: office.lat, lng: office.long }}
          radiusMeters={office.radius}
          userPosition={position ? { lat: position.lat, lng: position.lng, accuracy: accuracy ?? undefined } : undefined}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          label="Jarak ke kantor"
          value={geo.distanceMeters == null ? "—" : formatDistance(geo.distanceMeters)}
          hint={geo.distanceMeters == null ? undefined : walkingMinutes(geo.distanceMeters)}
          icon={MapPin}
          status={distanceStatus}
        />
        <MetricTile
          label="Akurasi GPS"
          value={accuracy == null ? "—" : `± ${Math.round(accuracy)} m`}
          icon={status === "watching" && position == null ? LoaderCircle : Crosshair}
          status={accuracyStatus}
        />
        <MetricTile
          label="Status"
          value={
            !geo.configured
              ? "Belum diatur"
              : position == null
                ? "Mencari…"
                : geo.withinRadius
                  ? "Dalam radius"
                  : "Luar radius"
          }
          status={!geo.configured ? "neutral" : position == null ? "neutral" : geo.withinRadius ? "good" : "bad"}
        />
      </div>

      {status === "watching" && position == null && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Memperbarui lokasi…
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: fails only in `clock-panel.tsx` (props not updated yet) — that's Task 14. `page.tsx` and `proximity-panel.tsx` themselves must be clean; if `ClockPanel` prop errors block the check, proceed to Task 14 and typecheck together.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(employee)/absen/page.tsx" "src/app/(employee)/absen/proximity-panel.tsx"
git commit -m "feat: load branch geofence + add Absen ProximityPanel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: `TodayTimeline` + `ClockPanel` rewrite

**Files:**
- Create: `src/app/(employee)/absen/today-timeline.tsx`
- Modify: `src/app/(employee)/absen/clock-panel.tsx` (full rewrite)
- Modify: `src/app/(employee)/absen/clock-panel.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `ProximityPanel` + `BranchGeofence` (Task 13), `AttendanceStatusBadge`, UI `Card`/`Button`/`Alert`/`Textarea`.
- Produces:
  ```ts
  export function ClockPanel(props: {
    todaysAttendance: TodaysAttendance;
    office: BranchGeofence;
    shift: { jamMasuk: string; toleransiMenit: number } | null;
    submitClockIn: (fd: FormData) => Promise<ActionResult>;
    submitClockOut: (fd: FormData) => Promise<ActionResult>;
  }): JSX.Element;
  ```
  `TodaysAttendance` and `ActionResult` types unchanged from the current file.

**`ClockPanel` behavior:**
- Keeps `getPosition()` one-shot for the actual submit (fresh fix at tap time), plus `ProximityPanel` for the live display.
- State: `error`, `submitting`, `photo: File | null`, `reason: string`, and `geo` (the summary from `ProximityPanel.onGeoChange`, default `{ status: "prompt", configured: !(office is 0,0), withinRadius: false, hasFix: false }`).
- `reasonRequired` = `geo.configured && geo.hasFix && !geo.withinRadius` OR `geo.status === "denied"` OR `geo.status === "unavailable"`.
- Reason `<Textarea>` is rendered (with a `transition`/`animate-in` class) only when `reasonRequired`. Helper text: out-of-radius → "Anda terdeteksi di luar radius kantor. Jelaskan alasannya."; denied/unavailable → "Lokasi tidak terbaca. Isi alasan untuk tetap absen."
- `submitDisabled` = `submitting || !photo || (reasonRequired && !reason.trim())`.
- Disabled reason text under the button: no photo → "Ambil foto selfie dulu."; reason required + empty → "Isi alasan dulu."
- `handleClock`: get one-shot position; build FormData with `lat`, `long`, `photo`, and `catatan` (`reason.trim()`, only if non-empty); call the action; on `!ok` `setError`; on `ok` clear `photo`/`reason`.
- The three render branches stay: `jamPulang` set → "selesai" summary card (add `TodayTimeline`); `jamMasuk` set → clock-out flow (show running duration `computeDuration(jamMasuk)` ticking every 60s via `useEffect` + `useState`, plus `ProximityPanel`, selfie, reason, button, `TodayTimeline`); neither → clock-in flow (same parts).
- Header shift line rendered by `page.tsx` already? No — render it here above the hero, or in `page.tsx`. Put it in `page.tsx` next to the greeting: "Masuk {shift.jamMasuk} · toleransi {shift.toleransiMenit} mnt" when `shift` present. (Adjust: pass `shift` to `page.tsx`'s own JSX rather than `ClockPanel` if simpler — either is fine; keep `shift` in `ClockPanel` props if the hero needs it.)
- Respect `prefers-reduced-motion`: gate any `animate-*` entrance behind `motion-safe:`.

**`TodayTimeline` behavior:**
- Props: `{ jamMasuk: string | null; jamPulang: string | null }` (ISO strings or `HH:mm`).
- Renders a small vertical timeline: node "Masuk" with time or "—", node "Pulang" with time or "—"; completed nodes get a filled dot + `CheckCircle2`, pending nodes an outline dot. Pure presentational, no client hooks needed (can be a server component but lives with the panel; mark `"use client"` only if imported into the client panel — it will be, so either keep it server-safe and import, or add `"use client"`. Keep it with no hooks so it works either way).

- [ ] **Step 1: Rewrite the test file**

Rewrite `src/app/(employee)/absen/clock-panel.test.tsx`. Mock `ProximityPanel` so tests control the geo summary:

```tsx
vi.mock("./proximity-panel", () => ({
  ProximityPanel: ({ onGeoChange }: { onGeoChange: (g: unknown) => void }) => {
    // expose a way for each test to push a geo summary
    (globalThis as any).__pushGeo = onGeoChange;
    return <div data-testid="proximity" />;
  },
}));
```

Mock `navigator.geolocation.getCurrentPosition` for the submit path. Cases:

```ts
// - clock-in flow: submit disabled until a photo is attached (in-radius geo)
// - in-radius: no reason textarea rendered; submit enabled with photo only
// - push out-of-radius geo (configured, hasFix, !withinRadius): reason textarea
//   appears; submit stays disabled until reason has text
// - push denied geo: reason textarea appears with the "lokasi tidak terbaca" helper
// - unconfigured geo (office 0,0): no reason textarea even with no fix; submit
//   enabled with photo only
// - successful clock-in calls submitClockIn with FormData containing lat/long/photo
//   and, when a reason was typed, catatan
// - clock-out flow (todaysAttendance.jamMasuk set): renders "Absen Pulang" button
//   and the running-duration text
// - completed flow (jamPulang set): renders the done state + AttendanceStatusBadge
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run "src/app/(employee)/absen/clock-panel.test.tsx"`
Expected: FAIL — new props / behavior absent.

- [ ] **Step 3: Implement `TodayTimeline`** then the `ClockPanel` rewrite per the Behavior specs. Add a `computeDuration(startIso: string): string` local helper → `"3j 20m"` (hours `j`, minutes `m`, drop hours when 0). Keep the file focused; if it exceeds ~200 lines, extract `PhotoCaptureButton` (already separate) and `computeDuration` into siblings.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run "src/app/(employee)/absen/"`
Expected: PASS.

- [ ] **Step 5: Full typecheck + lint + suite**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: clean, all green.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(employee)/absen/"
git commit -m "feat: rebuild Absen clock panel with live proximity + reason field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Design detector + device verification

**Files:** none (verification only), plus any micro-fixes the detector flags.

- [ ] **Step 1: Run the Impeccable detector**

Run:
```bash
node .agents/skills/impeccable/scripts/detect.mjs --json \
  "src/app/(employee)/absen/clock-panel.tsx" \
  "src/app/(employee)/absen/proximity-panel.tsx" \
  "src/app/(employee)/absen/today-timeline.tsx" \
  "src/app/(admin)/pengaturan/lokasi/location-form.tsx" \
  src/components/location-map.tsx src/components/metric-tile.tsx
```
Fix anything it flags in one batch. Re-run once to confirm.

- [ ] **Step 2: Screenshot pass (desktop + mobile viewport)**

Use the `run` skill (or `npm run dev` + browser) to capture:
- `/pengaturan/lokasi` — map renders, pin drags, radius circle resizes with the slider, "pakai lokasi saya" works, save toast.
- `/absen` — in-radius state (green tiles, no reason field), and a simulated out-of-radius state (reason field appears, submit gated). Use browser devtools "Sensors" to spoof a far location.
Check light and dark themes.

- [ ] **Step 3: Real-phone verification**

On an actual phone (mobile UA is enforced by `requireMobileEmployee`):
- With the branch geofence configured and standing in range: selfie + "Absen Masuk" succeeds, status not "di luar radius".
- Simulate out of range (or set a tiny radius): reason field is required, absen succeeds with a reason, `/riwayat` shows the note.
- Before any admin sets the point: absen still works, no forced reason.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: address design-detector findings on proximity + absen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Finish the branch**

Use the `finishing-a-development-branch` skill to choose merge / PR / cleanup.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| 1 — no column/RLS migration | (design decision, nothing to build) |
| 1 — access hr_admin + super_admin | Task 10 (action), Task 12 (page guard) |
| 1 — audit trail `branch_location_update` | Task 10 (insert), Task 12 (badge label) |
| 1 — `validate-location.ts` | Task 2 |
| 1 — `saveBranchLocation` | Task 10 |
| 1 — `geofenceState` | Task 1 |
| 1 — clock-in unconfigured geofence | Task 4 |
| 1 — clock-out reason + gate | Task 5 |
| 2 — `/pengaturan/lokasi` page + hub card | Task 12 |
| 2 — `LocationForm` (map, "pakai lokasi saya", slider, chip, save) | Task 11 |
| 2 — empty state | Task 12 |
| 3 — page.tsx loads schedule + geofence | Task 13 |
| 3 — status hero / running duration | Task 14 |
| 3 — proximity panel (mini-map, metric tiles, watchPosition, shimmer) | Task 13 |
| 3 — selfie restyle | Task 14 |
| 3 — reason field appears only when out-of-radius/denied | Task 14 |
| 3 — submit gating + disabled reason text | Task 14 |
| 3 — today timeline | Task 14 |
| 4 — `location-map.tsx` | Task 9 |
| 4 — `metric-tile.tsx` | Task 6 |
| 4 — `field-section.tsx` | Task 7 |
| 4 — `use-geolocation.ts` | Task 8 |
| 4 — `format-distance.ts` | Task 3 |
| 5 — geolocation states table | Task 14 (panel + reason logic), Task 13 (status tile) |
| 5 — leaflet tile failure degrades | Task 9 (grey grid is Leaflet default; metric tiles independent) |
| 6 — all test groups | Tasks 1–6, 10, 11, 14 |
| 7 — read next docs, lucide only, reduced motion | Global Constraints + Task 9/14 |
| 8 — rollout order | Task order matches (backend → admin → absen → verify) |

No gaps.

**Placeholder scan:** `LocationForm` (Task 11 Step 3) and `ClockPanel`/`TodayTimeline` (Task 14 Step 3) are specified by a detailed Behavior contract + interfaces + full test list rather than a verbatim code block, because they are large stateful view components where the exact JSX is subordinate to the behavior. Every input, output, state variable, conditional, and copy string is enumerated. All pure functions and small components have complete code. Acceptable.

**Type consistency:** `geofenceState(userLat, userLng, office: {lat, long}, radiusMeters)` — same signature in Tasks 1, 4, 5, 13. `BranchGeofence = { lat, long, radius }` — Tasks 13, 14. `saveBranchLocation(branchId, formData)` — Tasks 10, 11, 12. `GeoStatus` union — Task 8, referenced in 13/14. `office.radius` (not `radius_geofencing_meter`) on the client type; DB column name only inside `page.tsx` mapping and the action. Consistent.
