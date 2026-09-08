# QR Attendance (rotating kiosk QR as an alternative to GPS) — Design

Date: 2026-09-08
Status: Approved for planning

## Problem

Browser geolocation on a phone is unreliable indoors — an employee standing
inside the office is frequently read as hundreds of metres away (or in the wrong
city), so the geofence gate on `/absen` blocks a legitimate clock-in and forces
a written reason. There needs to be a second way to prove "I am physically at
the office" that does not depend on GPS accuracy.

## Solution

A **rotating QR code** shown on a screen at each branch entrance (a TV / tablet /
spare phone loading a "kiosk" page). The QR encodes a time-based token that
changes every 30 seconds, so a photo of it sent to someone at home is stale
before they can scan it. An employee opens `/absen`, picks **Scan QR** instead of
**Lokasi GPS**, points the camera at the office screen, and a valid scan
satisfies the location requirement.

QR is **per-branch, admin-enabled**, and an **alternative** — not a replacement:

- When a branch has QR enabled, the employee chooses **Scan QR** *or* **Lokasi
  GPS** on `/absen`. Either path (valid QR, or in-radius GPS, or out-of-radius
  GPS + reason) is accepted.
- Selfie stays mandatory in every path. Mobile-only stays enforced.
- When a branch does not have QR enabled, `/absen` is unchanged.

### Known residual risk (accepted, communicated to the user)

Rotating QR does not stop a *real-time* relay (video-call a colleague at the
office, they aim the screen, you scan within 60 s). It also can't stop someone
who has the secret kiosk URL from generating valid QRs remotely. The kiosk URL is
therefore a resettable bearer secret, and QR is layered on top of the existing
selfie + mobile-only + (optional) GPS record — not trusted alone.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Kiosk protection | A per-branch **secret URL** (`/kiosk/<key>`), no login. Admin can reset the key. |
| QR rotation | **30 s window**, server accepts the current **and** previous window (~60 s tolerance). |
| Employee-side scanner | In-app camera + a bundled QR-decode library (`jsqr`). |
| Kiosk-side QR generation | Server-side (`qrcode` package) inside a server action; the kiosk page just swaps an `<img>`. |
| Build | Subagent-driven, after this spec + plan. |

## 1. Data model — migration `0031_qr_attendance.sql`

```sql
alter table branches
  add column qr_enabled boolean not null default false,
  add column qr_secret  text,                 -- 32 random bytes hex; set when enabled, null when disabled
  add column kiosk_key   text unique;          -- ~24-char urlsafe; the /kiosk/<key> segment; resettable

alter table attendances
  add column metode_masuk  text check (metode_masuk  in ('gps','qr')),
  add column metode_pulang text check (metode_pulang in ('gps','qr'));
```

- No RLS change. `branches_select` is already `authenticated`; the kiosk path
  reads `branches` with the **service-role** client (the kiosk device has no
  session). `branches_write` is already `is_admin_role()`.
- `attendances` writes are already locked to service_role (0011); `clockIn` /
  `clockOut` run with that client and set the new `metode_*` column.
- Apply via `supabase db push` to the cloud project (no local Docker — matches
  every prior migration this project). Extend the schema integration test
  (`tests/integration/schema-*.test.ts`) minimally to assert the new columns.

## 2. Token — `src/lib/attendance/qr-token.ts` (pure, no dependency)

```ts
export const QR_WINDOW_MS = 30_000;

export function qrToken(secret: string, now?: number): string;
// hex = createHmac("sha256", secret).update(String(Math.floor(now / QR_WINDOW_MS))).digest("hex")
// return hex.slice(0, 16)

export function verifyQrToken(secret: string, token: string, now?: number): boolean;
// timing-safe compare of `token` against qrToken(secret, now) for the current
// window AND the previous window (now - QR_WINDOW_MS). Non-16-hex-char input → false.

export function windowRemainingMs(now?: number): number;
// QR_WINDOW_MS - (now % QR_WINDOW_MS) — how long the current QR stays valid
```

QR payload string carried in the QR image and scanned by the app:
`"<branchId>|<token>"`. The server checks the `branchId` half equals the
employee's branch and `verifyQrToken` passes for that branch's `qr_secret`.

Unit-tested: token stable within a window, differs across windows, previous
window accepted, window+1 rejected, malformed token rejected, `windowRemainingMs`
bounds.

## 3. Admin — QR section on `/pengaturan/lokasi`

`src/app/(admin)/pengaturan/lokasi/location-form.tsx` gains a second section
(wrap the existing map/coords/radius block and the new block in the so-far-unused
`FieldSection` component):

- **Section "Titik & Radius"** — the current geofence editor, unchanged.
- **Section "Absen QR"**:
  - A toggle "Aktifkan Absen QR" bound to `branch.qrEnabled`.
  - When on: show the kiosk URL `"{origin}/kiosk/{kioskKey}"` read-only, a
    "Salin link" button, a "Buka kiosk" link (`target="_blank"`), and a
    "Ganti link" button (regenerates `kiosk_key` only, invalidating the old
    URL — for when a screen is decommissioned or the URL leaked).
  - Helper: "Tampilkan link ini di layar dekat pintu kantor. Kode berganti tiap
    30 detik. Karyawan pilih 'Scan QR' di halaman Absen."

New server actions in `src/app/(admin)/pengaturan/lokasi/actions.ts`:

- `setBranchQr(branchId, formData)` — `formData.get("enabled")` truthy check.
  - role guard (`hr_admin` | `super_admin`).
  - enable: if `qr_secret` is null, generate `qr_secret` = `randomBytes(32).toString("hex")` and `kiosk_key` = `randomBytes(18).toString("base64url")`; `update({ qr_enabled: true, qr_secret, kiosk_key })`.
  - disable: `update({ qr_enabled: false })` — keep the secret/key so re-enabling is stable (or null them; **decision: keep**, so a re-enable doesn't break a screen someone already set up).
  - audit `aksi: "branch_qr_update"`, `detail: { branch_id, enabled }`.
  - `revalidatePath("/pengaturan/lokasi")`.
- `resetKioskKey(branchId)` — role guard; generate a new `kiosk_key`; `update`; audit `aksi: "branch_kiosk_reset"`, `detail: { branch_id }`; revalidate.

Audit badge (`src/components/audit-aksi-badge.tsx`): `branch_qr_update` →
"Absen QR Diubah" (info), `branch_kiosk_reset` → "Link Kiosk Diganti" (info).
Audit filter options updated to match.

`src/app/(admin)/pengaturan/lokasi/page.tsx` — the branches query adds
`qr_enabled, kiosk_key`; passes `qrEnabled` + `kioskUrl` (built from the request
origin via `headers()`), and the two new actions, to `LocationForm`.

## 4. Kiosk — `/kiosk/[key]`

- `src/lib/auth/route-access.ts` — add `"/kiosk"` to `PUBLIC_PATHS`.
- `src/app/kiosk/[key]/page.tsx` — server component (no route group / no shell).
  - Service-role lookup: `branches` where `kiosk_key = key` and `qr_enabled = true`.
  - Not found / disabled → a plain centered "Kiosk tidak aktif." card (200, not a redirect — the kiosk device shouldn't bounce to login).
  - Found → `<KioskDisplay branchId branchNama kioskKey={key} />`.
- `src/app/kiosk/[key]/kiosk-display.tsx` — `"use client"`.
  - On mount and every `windowRemainingMs()` (re-scheduled each tick), call the
    server action `getKioskQr(kioskKey)` → `{ dataUrl, remainingMs }`; render a
    large `<img src={dataUrl}>` centered on a dark full-viewport background with
    the branch name and a thin countdown bar. `next/image` not used (data URL).
  - On a failed call: keep showing the last QR, retry in 5 s (a transient
    network blip on the screen device must not blank the QR).
- `getKioskQr(key)` server action (in `src/app/kiosk/[key]/actions.ts`):
  - service-role lookup branch by `kiosk_key` + `qr_enabled`; not found → `{ ok: false }`.
  - `token = qrToken(branch.qr_secret)`; `payload = \`${branch.id}|${token}\``.
  - `dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 512 })` (the `qrcode` package).
  - return `{ ok: true, dataUrl, remainingMs: windowRemainingMs() }`.

## 5. Backend clock-in / clock-out

`src/lib/attendance/clock-in.ts` / `clock-out.ts`:

- `ClockInInput` / `ClockOutInput` gain `qrToken?: string` (the scanned
  `"<branchId>|<token>"` payload).
- Branch select adds `qr_enabled, qr_secret`.
- New precedence:
  1. If `qrToken` is present **and** `branch.qr_enabled` **and** the payload's
     branchId half `=== branch.id` **and** `verifyQrToken(branch.qr_secret, tokenHalf)`:
     → `verifiedVia = "qr"`, `withinRadius = true` for status purposes, **no
     geofence gate, no reason required**. Record `metode_masuk/pulang = "qr"`.
     A malformed/expired/foreign qrToken when `qr_enabled` → return
     `{ ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." }`
     (do **not** silently fall through to GPS — the user chose QR).
  2. Else → existing `geofenceState` path unchanged; record
     `metode_masuk/pulang = "gps"`.
- `lokasi_masuk/pulang` still stores the GPS coords when the client sent them
  (useful for the record even on the QR path); coords are validated the same way
  but a QR clock-in with no/お invalid coords is still allowed (store `null`).
  — **decision:** on the QR path, coordinates are optional; `isValidCoordinate`
  failure is ignored rather than fatal.

`src/app/(employee)/absen/actions.ts` — `submitClockIn` / `submitClockOut` read
`formData.get("qrToken")` (string-guard) and thread it. On the QR path, a missing
photo is still `"Foto selfie diperlukan."`; a missing/invalid coordinate is no
longer fatal.

## 6. Employee scanner — `src/app/(employee)/absen/qr-scanner.tsx`

`"use client"`. Dependency: `jsqr`.

- Props: `{ onDecode: (payload: string) => void }`.
- "Buka kamera" button → `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` → `<video>` + hidden `<canvas>`; a `requestAnimationFrame` loop draws the frame and runs `jsQR(imageData, w, h)`. On a hit whose data matches `/^[0-9a-f-]{36}\|[0-9a-f]{16}$/` → stop the stream, call `onDecode(data)`.
- States: idle (button), requesting permission, scanning (live video + "Arahkan ke QR di layar kantor"), denied ("Izin kamera ditolak — pakai Lokasi GPS."), decoded ("QR terbaca ✓" + a "scan ulang" link).
- Stops the camera track on unmount and on decode.

## 7. Absen UI — `clock-panel.tsx` + `page.tsx`

- `page.tsx` passes `qrEnabled: boolean` (from the branch row).
- `ClockPanel`: when `qrEnabled`, render a two-option method switcher above the
  proximity/scan area — **"Scan QR"** and **"Lokasi GPS"** (a segmented control;
  `Tabs` from `@/components/ui/tabs`). Default to "Scan QR" when `qrEnabled`
  (that's why it was turned on). When `!qrEnabled`, no switcher — GPS flow only.
- Method **Scan QR**: render `<QrScanner onDecode={setQrPayload} />`. Once
  `qrPayload` is set, show a green "Lokasi terverifikasi via QR" line; the reason
  field is never shown on this method; submit needs only `photo && qrPayload`.
- Method **Lokasi GPS**: the existing `ProximityPanel` + reason-field logic,
  unchanged.
- `handleClock`: if method is `qr` and `qrPayload` set → `FormData` gets
  `qrToken = qrPayload` (+ `lat`/`long` if a fix happens to be available, best
  effort). If method is `gps` → current behavior.
- `submitDisabled`: method `qr` → `submitting || !photo || !qrPayload`; method
  `gps` → unchanged.

## 8. Dependencies

- `qrcode` + `@types/qrcode` (dev) — server-side QR image generation.
- `jsqr` — client-side QR decoding (ships its own types).

Both MIT, small, no transitive bloat. Pin exact-ish (`^`) per repo convention;
lockfile pins exact.

## 9. Error handling & edge cases

| Case | Behavior |
|---|---|
| Branch QR disabled, employee sends `qrToken` | ignored; GPS path runs |
| QR enabled, token expired / malformed / wrong branch | `{ ok:false, "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." }` |
| Camera permission denied | scanner shows the denied state; user can switch to "Lokasi GPS" |
| Kiosk key unknown / QR disabled | `/kiosk/<key>` shows "Kiosk tidak aktif." (200) |
| Kiosk server action transient failure | keep last QR, retry in 5 s |
| `getKioskQr` called with a stale key after a reset | `{ ok:false }` → kiosk shows "Kiosk tidak aktif." on next tick |
| Admin disables QR while an employee is mid-scan | their submit fails with the invalid-QR message; they switch to GPS |
| Duplicate clock-in / consent / mobile-UA | unchanged — all still enforced before the QR/GPS branch |

## 10. Testing

- **Unit:** `qr-token` (all cases in §2); `verifyQrToken` timing-safe path.
- **Actions (mocked Supabase):** `setBranchQr` (enable generates secret+key,
  disable keeps them, audit, role guard), `resetKioskKey` (new key, audit),
  `getKioskQr` (valid key → dataUrl + remainingMs; unknown key → `{ok:false}`;
  disabled → `{ok:false}`).
- **`clock-in` / `clock-out`:** QR path bypasses geofence + records `metode=qr`;
  expired/foreign token → error, no fallthrough; GPS path records `metode=gps`;
  QR path tolerates missing coordinates.
- **Component (RTL):** `qr-scanner` — mock `getUserMedia` + `jsQR`; asserts the
  decoded-state and the payload-shape filter, and the denied state. `clock-panel`
  — method switcher only when `qrEnabled`; QR method hides the reason field and
  gates submit on `photo && qrPayload`; `handleClock` sends `qrToken`.
  `location-form` — QR toggle calls `setBranchQr`; reset calls `resetKioskKey`;
  kiosk URL shown when enabled.
- **`kiosk-display`** — mock the action; asserts it renders the returned `<img>`
  and keeps the old one on a failed refresh.
- Extend the schema integration test for the new columns.

## 11. Rollout

1. Migration 0031 (push to cloud) + schema test.
2. `qr-token.ts` + tests.
3. `setBranchQr` / `resetKioskKey` actions + audit labels + tests.
4. Kiosk route + `getKioskQr` + `KioskDisplay` + `PUBLIC_PATHS` + `qrcode` dep.
5. `LocationForm` QR section + `lokasi/page.tsx` wiring.
6. `clock-in` / `clock-out` / `absen/actions.ts` QR path + tests.
7. `qr-scanner.tsx` + `jsqr` dep.
8. `clock-panel.tsx` + `absen/page.tsx` method switcher.
9. Impeccable detector + `next build` + manual verify (enable QR on a branch,
   open the kiosk URL on a second device, scan from a phone, confirm clock-in
   succeeds with `metode_masuk = 'qr'` and no reason prompt).
