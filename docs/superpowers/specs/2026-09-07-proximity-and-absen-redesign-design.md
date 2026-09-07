# Proximity (Office Geofence) Admin + Absen Redesign — Design (SP1)

Date: 2026-09-07
Status: Approved for planning

## Problem

An employee could not clock in from the mobile app: they were outside the office
geofence radius, and the backend (`clockIn`) rejects an out-of-radius clock-in
unless a `catatan` (reason) is supplied — but `clock-panel.tsx` has **no field**
to enter one, so the flow dead-ends. Separately, branch `lat`/`long` was only ever
set by `scripts/seed.ts`; there is **no admin screen** to set or correct the
office point and radius. Finally, the Absen UI is bare and gives the employee no
feedback about whether their clock-in will be accepted before they tap.

## Scope

This is SP1 of a three-part effort. The full "redesign the whole employee UI"
request is decomposed so each part stays reviewable:

| Spec | Contents |
|---|---|
| **SP1 (this doc)** | Proximity admin page + Absen redesign + shared visual primitives (`LocationMap`, `MetricTile`, `FieldSection`) that SP2/SP3 reuse |
| SP2 (later) | Riwayat + Cuti redesign |
| SP3 (later) | Slip Gaji + Profil + shell / bottom-nav polish |

Out of scope for SP1: branch create/delete (no branch CRUD exists anywhere in the
app today), MapLibre/vector tiles, offline attendance.

## Design authority

The project has no `PRODUCT.md`/`DESIGN.md`. The existing code is the design
authority: monochrome shadcn base + a brand accent from branding settings, light
and system-dark themes already wired. This is a **refinement**, not a rebrand —
the visual system is kept; the Absen surface is made modern, interactive, and
informative within it. Both surfaces are **Operate** mode (the user is completing
a task): scanability, live system state, large touch targets, and calm
reassurance outrank visual expression.

Recommendation (non-blocking): run `$impeccable init` afterward to capture
`PRODUCT.md`.

## 1. Data model & backend

### Schema

No migration for columns — `branches` already has `lat double precision`,
`long double precision`, `radius_geofencing_meter integer not null default 100`.
RLS `branches_write` is already `is_admin_role()` (= `hr_admin` | `super_admin`),
which matches the chosen access level, so **no RLS migration** — a policy
restricting writes to the same role set would be a no-op.

### Access

Setting a branch's office point and radius is allowed for `hr_admin` and
`super_admin` (same as Jadwal Kerja / Hari Libur / Departemen). The page and the
server action both enforce this.

### Audit trail (the database-level strengthening)

Geofence config is anti-fraud-sensitive, so every change is written to the
existing `audit` table (same mechanism as employee-data and leave-approval
changes), visible in `/pengaturan/audit`:

- action: `branch_location_update`
- target: the branch row
- payload: before/after `{ lat, long, radius_geofencing_meter }`
- An audit-insert failure is logged (`console.error`) but does **not** fail the
  config save — the config write is the primary action.

### `validate-location.ts` (`src/lib/branches/`)

Pure function, unit-tested:

- `lat` finite, ∈ [-90, 90]
- `long` finite, ∈ [-180, 180]
- `radius` integer, ∈ [20, 5000]
- `(0, 0)` is treated as "belum diatur" (unset), not a valid point

### `saveBranchLocation(branchId, formData)` (`src/app/(admin)/pengaturan/lokasi/actions.ts`)

Mirrors `saveSchedule`:

1. `getCurrentEmployee`; reject unless `hr_admin` | `super_admin`
2. reject empty `branchId`
3. `validateLocationInput(...)` → on failure return `{ ok: false, error }`
4. read current `lat/long/radius_geofencing_meter` for the audit "before"
5. `db.from("branches").update({ lat, long, radius_geofencing_meter }).eq("id", branchId)`
6. insert audit row (tolerate failure)
7. `revalidatePath("/pengaturan/lokasi")`, `revalidatePath("/absen")`
8. return `{ ok: true }`

### `geofencing.ts` extension (`src/lib/attendance/`)

Add a pure helper used by both the client panel and the server:

```ts
geofenceState(userLat, userLng, office: {lat, long}, radiusMeters): {
  configured: boolean;       // false when office is (0,0)
  distanceMeters: number | null;
  withinRadius: boolean;     // false when not configured
}
```

`haversineDistanceMeters` / `isWithinRadius` stay as-is.

### `clock-in.ts` / `clock-out.ts` changes

- When the branch geofence is **not configured** (`(0,0)`): skip the
  out-of-radius hard block (do not force a reason on the employee for missing
  admin config). Record the attendance with `withinRadius = false` semantics —
  status resolution is unchanged, `resolveClockInStatus` already takes
  `withinRadius`.
- When the geofence **is** configured and the employee is out of radius: keep
  the existing rule — clock-in/out allowed only with a non-empty `catatan`.
- `submitClockOut` gains `catatan` handling symmetric to `submitClockIn`
  (currently only clock-in threads a reason). `clock-out.ts` applies the same
  "configured + out of radius → reason required" gate.

## 2. Proximity admin page — `/pengaturan/lokasi`

### Entry

New `HubCard` in the `/pengaturan` grid, shown for `hr_admin` | `super_admin`:

- icon `MapPin`, title "Lokasi Kantor",
  desc "Titik kantor & radius geofence untuk absensi per cabang."

### Route files

```
src/app/(admin)/pengaturan/lokasi/
  page.tsx              server component
  location-form.tsx     client component (one per branch)
  actions.ts            saveBranchLocation + audit
  actions.test.ts
  location-form.test.tsx
```

### `page.tsx`

- `getCurrentEmployee`; `redirect("/dashboard")` unless `hr_admin` | `super_admin`
- `db.from("branches").select("id, nama, alamat, lat, long, radius_geofencing_meter").order("nama")`
- `PageHeader` title "Lokasi Kantor",
  description "Titik kantor dan radius geofence dipakai untuk memvalidasi absensi karyawan."
- zero branches → `EmptyState` icon `MapPin`, "Belum ada cabang."
- else render one `LocationForm` per branch

### `location-form.tsx` (client)

Card per branch containing, top to bottom:

1. **Branch name** + `alamat` (muted), and a **state chip**:
   - `(0,0)` → amber "Belum diatur"
   - else → brand/emerald "Aktif" + "radius 120 m · ± 2 menit jalan kaki"
2. **`<LocationMap mode="edit">`**, ~260px tall:
   - OSM raster tiles, attribution control always visible
   - draggable marker at the office point; when unset `(0,0)`, the map opens
     centered on another already-configured branch's point, else on Jakarta
     (`-6.2, 106.816`), with an explicit "geser pin ke lokasi kantor" hint and
     the marker starting at that center
   - a `Circle` overlay whose radius updates live with the slider
   - tapping the map moves the pin
3. **Controls:**
   - `[📍 Pakai lokasi saya sekarang]` (`MapPin` / `LocateFixed` icon) —
     `navigator.geolocation.getCurrentPosition`, drops the pin, recenters,
     fills lat/long
   - lat/long shown read-only with a small "Edit manual" disclosure revealing
     two numeric inputs (for precise values from Google Maps, etc.)
4. **Radius slider** — visible range 20–500 m (numeric input accepts up to
   5000), value rendered as `120 m`; helper: "Karyawan di luar radius tetap
   bisa absen, tapi wajib mengisi alasan."
5. **Save** — disabled until dirty; `sonner` toast on success/failure; inline
   `Alert` for validation errors.

### `LocationMap` component

`src/components/location-map.tsx`, described in section 4.

## 3. Absen page redesign — `/absen`

Real usage scene: standing near the office, on a phone, possibly hurried, maybe
weak signal. The design's job: remove doubt about "will this clock-in count?"
*before* the tap.

### `page.tsx` (server) changes

In addition to today's attendance, load and pass down:

- the employee's branch geofence (`lat`, `long`, `radius_geofencing_meter`)
- the branch `work_schedule` first row (`jam_masuk`, `toleransi_terlambat_menit`)
  for the shift line

### Structure (top → bottom)

1. **Header** — greeting + live formatted date + a compact shift line
   ("Masuk 08:00 · toleransi 15 mnt") so lateness is not a surprise.
2. **Status hero card** — animated state machine:
   - *Belum absen* → primary "Absen Masuk" CTA
   - *Sudah masuk* → clock-in time + running work duration ("08:14 · sudah 3j 20m",
     ticking), then "Absen Pulang" CTA
   - *Selesai* → summary line + `AttendanceStatusBadge`
   Transitions use a short fade/slide; respects `prefers-reduced-motion`.
3. **Proximity panel** (`proximity-panel.tsx`, new) — the informative core:
   - `<LocationMap mode="view">` mini-map: office pin + radius circle +
     live "you are here" dot
   - **Metric row** — three `MetricTile`s: `Jarak ke kantor` (`82 m`),
     `Akurasi GPS` (`± 12 m`, color-coded good/ok/weak), `Status`
     (`Dalam radius` ✓ / `Luar radius` / `Radius belum diatur`)
   - uses `watchPosition` while the page is open; a subtle "memperbarui lokasi…"
     shimmer during updates
4. **Selfie capture** — keep the existing `capture="user"` file-input flow,
   restyled: circular preview, clear retake affordance, same a11y label.
5. **Alasan field** — textarea; appears (animated) and becomes **required** only
   when: GPS says out-of-radius, OR GPS is denied/unavailable. Helper text states
   why it is required. Not shown when in-radius or geofence unconfigured.
6. **Submit** — large button (keep `min-h-16`), disabled until
   `photo && (withinRadius || geofenceUnconfigured || reason.trim())`; when
   disabled it names the exact blocker ("Ambil foto dulu", "Isi alasan — Anda di
   luar radius").
7. **Today timeline** (`today-timeline.tsx`, new) — small vertical timeline:
   "Masuk 08:14 ✓ → Pulang —", filled in as the day progresses.

### `clock-panel.tsx` (rewritten)

Keeps the same props contract shape but:

- consumes `useGeolocation()` (section 4) instead of a one-shot `getCurrentPosition`
- renders the state machine + `ProximityPanel` + reason field
- passes `catatan` in the `FormData` for both clock-in and clock-out
- each geolocation state renders a specific inline message (table below), never a
  dead button

### `actions.ts` (edited)

- `submitClockIn`: already reads `catatan` — keep.
- `submitClockOut`: add `catatan` read + `isValidPhoto`-style passthrough to
  `clockOut`.

## 4. Shared components & lib modules

### `src/components/location-map.tsx`

- `"use client"`, wrapped by `next/dynamic(() => import(...), { ssr: false })`
  from the consuming files (Leaflet touches `window` at import).
- Vanilla `leaflet` (add dependency), **not** `react-leaflet` (React 19 peer
  friction). Leaflet CSS imported in the module.
- Props:
  ```ts
  {
    mode: "edit" | "view";
    center: { lat: number; lng: number };
    radiusMeters: number;
    marker: { lat: number; lng: number };
    userPosition?: { lat: number; lng: number; accuracy?: number };
    onMarkerChange?: (p: { lat: number; lng: number }) => void;
    className?: string;
  }
  ```
- `edit`: draggable marker + map-click sets marker; circle follows `radiusMeters`.
- `view`: static marker + circle + optional pulsing user dot; no drag, scroll
  zoom off by default (tap to interact).
- Dark mode: apply a CSS filter to the tile layer
  (`filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)`) under
  `.dark`, matching the app's existing dark treatment; verify legibility.
- Tile failure degrades to Leaflet's grey grid; the panel's metric tiles remain
  the source of truth.
- OSM attribution control always rendered (usage-policy requirement).

### `src/components/metric-tile.tsx`

Small labeled stat: label (muted, xs), value (tabular-nums, base/lg), optional
leading icon, optional status color (`neutral | good | warn | bad`) driving the
value/icon color only (never a full-bleed background). Follows the repo's
`dataviz` conventions. Reusable by the admin dashboard later.

### `src/components/field-section.tsx`

Titled group wrapper: icon + heading + optional hint, then `children`. Gives the
stacked forms on both surfaces a scannable rhythm; reused in SP2/SP3.

### `src/lib/geo/use-geolocation.ts`

Client hook wrapping `navigator.geolocation.watchPosition`:

```ts
useGeolocation(): {
  position: { lat: number; lng: number } | null;
  accuracy: number | null;          // meters
  status: "prompt" | "watching" | "granted" | "denied" | "unavailable";
  error: string | null;
  refresh: () => void;
}
```

Cleans up the watch on unmount. Keeps `clock-panel` lean and is unit-testable via
a mocked `navigator.geolocation`.

### `src/lib/geo/format-distance.ts`

`formatDistance(meters)` → `"82 m"` / `"1,2 km"` (id-ID separators, sensible
rounding). `walkingMinutes(meters)` → `"± 2 menit jalan kaki"` at ~80 m/min.
Unit-tested.

### File tree (SP1)

```
src/app/(admin)/pengaturan/
  page.tsx                       (edited: add Lokasi Kantor HubCard)
  lokasi/
    page.tsx                     (new)
    location-form.tsx            (new)
    actions.ts                   (new)
    actions.test.ts              (new)
    location-form.test.tsx       (new)
src/app/(employee)/absen/
  page.tsx                       (edited: load schedule + geofence)
  clock-panel.tsx                (rewritten)
  clock-panel.test.tsx           (extended)
  proximity-panel.tsx            (new)
  today-timeline.tsx             (new)
  actions.ts                     (edited: clock-out catatan)
src/components/
  location-map.tsx               (new)
  metric-tile.tsx                (new)
  metric-tile.test.tsx           (new)
  field-section.tsx              (new)
src/lib/
  branches/validate-location.ts       (new) + .test.ts
  geo/use-geolocation.ts              (new)
  geo/format-distance.ts             (new) + .test.ts
  attendance/geofencing.ts           (edited: geofenceState) + .test.ts
  attendance/clock-in.ts             (edited: unconfigured geofence)
  attendance/clock-out.ts            (edited: catatan + geofence gate) + .test.ts
```

## 5. Error handling & edge cases

### Geolocation states (each → a distinct inline UI on Absen; never a dead button)

| State | UI |
|---|---|
| `prompt` | "Izinkan akses lokasi untuk absen" + a button that triggers the permission prompt |
| `denied` | Explain, show how to re-enable in browser settings; reason field becomes the fallback path — absen still allowed with a reason |
| `unavailable` / timeout | "GPS tidak tersedia. Isi alasan untuk tetap absen." |
| low accuracy (`± > 100 m`) | Amber note "Sinyal GPS lemah — coba ke area terbuka"; submit still allowed |
| geofence not configured (branch `(0,0)`) | Neutral note "Radius kantor belum diatur admin"; absen allowed, `withinRadius = false` recorded, no reason forced |
| watching, in radius | Green "Dalam radius" — reason field hidden |
| watching, out of radius | "Luar radius" — reason field shown and required |

### Backend failure modes

Preserved as-is: duplicate clock-in, unique-violation race, missing consent,
non-mobile user-agent, photo-upload failure — all already return Indonesian
messages.

`saveBranchLocation`: validation error → inline `Alert`; DB error → generic
Indonesian `sonner` toast + `console.error`; audit-insert failure → logged, save
still succeeds.

### Leaflet / tiles

Tile load failure → Leaflet's grey grid; the metric tiles (distance / accuracy /
status) are the source of truth, so a broken map never blocks absen or the admin
save. Attribution control always rendered.

## 6. Testing

### Unit (vitest)

- `validate-location`: lat/long bounds, `(0,0)` unset, non-integer radius,
  radius bounds.
- `geofenceState`: inside, outside, exactly on the radius, unconfigured office.
- `format-distance`: metres vs km, rounding, id-ID decimal separator,
  `walkingMinutes`.
- `clock-in`: skips the hard out-of-radius block when geofence is unconfigured;
  still requires a reason when configured + out of radius.
- `clock-out`: same geofence gate; threads `catatan`.
- `saveBranchLocation`: rejects bad input; writes an audit row; still returns
  `{ ok: true }` when the audit insert fails.

### Component (React Testing Library)

- `clock-panel` (extend `clock-panel.test.tsx`): submit disabled until
  photo + (in-radius | reason); reason field appears only when out-of-radius or
  GPS denied; each geo-state renders its message. Mock `navigator.geolocation`.
- `location-form`: save disabled until dirty; validation `Alert` surfaces;
  "Pakai lokasi saya" populates lat/long (mock `navigator.geolocation`);
  radius slider updates the displayed value.
- `metric-tile`: renders label/value; applies status color, not a full
  background.

### Not unit-tested

`<LocationMap>` — thin Leaflet wrapper, `ssr: false`; exercised via the
form/panel tests with the module mocked.

## 7. Implementation notes

- Per `AGENTS.md`: read the relevant guide under `node_modules/next/dist/docs/`
  (dynamic import, client components, server actions) before writing code; keep
  the generated agent-files block if it reappears.
- Icons: `lucide-react` only, no emoji in shipped UI (the 📍 in this doc is
  shorthand for a `MapPin` / `LocateFixed` icon).
- Motion respects `prefers-reduced-motion`.
- After the UI is built, run the Impeccable mechanical detector once over the
  changed targets.

## 8. Rollout

1. Backend + lib (validator, `geofenceState`, clock-in/out changes) with tests.
2. Proximity admin page — so an admin can set the real office point.
3. Absen redesign consuming the same data.
4. Manual verification on a real phone (the `run` skill / device) that a
   configured geofence lets an in-range employee clock in, and an out-of-range
   one clocks in with a reason.
