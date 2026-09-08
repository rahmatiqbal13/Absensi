# QR Attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A rotating per-branch kiosk QR code as an admin-enabled alternative to the GPS geofence on `/absen`, so an employee whose phone GPS is inaccurate indoors can still clock in by scanning a screen at the office.

**Architecture:** A HMAC time-token (`qr-token.ts`, 30 s window + previous) is rendered as a QR on a login-less kiosk page (`/kiosk/<secret-key>`) that refreshes server-side every window. The employee's `/absen` gains a "Scan QR" / "Lokasi GPS" method switcher when the branch has QR enabled; a valid scan is threaded to `clockIn`/`clockOut`, which then skips the geofence gate and records `metode = 'qr'`. Selfie + mobile-only stay mandatory on every path.

**Tech Stack:** Next 16.3.2 App Router + Server Actions, React 19.2, Supabase (`@supabase/ssr` + service-role), Node `crypto`, `qrcode` (new, server), `jsqr` (new, client), Tailwind v4 + shadcn, `vitest` + RTL.

## Global Constraints

- Migration `0031_qr_attendance.sql`, applied via `supabase db push` to the cloud project (no local Docker — every prior migration did this). Do not `supabase db reset`.
- QR is **per-branch, admin-enabled** and an **alternative**, never a replacement. Selfie mandatory on every path; mobile-UA guard unchanged; duplicate/consent checks run before the QR-vs-GPS branch.
- `qr-token.ts`: `QR_WINDOW_MS = 30_000`. `verifyQrToken` accepts the current AND previous window, uses `crypto.timingSafeEqual`, rejects non-16-lowercase-hex input.
- QR payload string: `"<branchId>|<token>"` — `branchId` is a uuid, `token` is 16 lowercase hex. App-side filter regex: `/^[0-9a-f-]{36}\|[0-9a-f]{16}$/`.
- When `branch.qr_enabled` and the employee submits a `qrToken` that is malformed / expired / for another branch → `{ ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." }`. Do NOT silently fall back to GPS.
- On the QR path, GPS coordinates are optional — an invalid/absent `lat`/`long` is not fatal (store `null`).
- Kiosk (`/kiosk/<key>`) is public: add `"/kiosk"` to `PUBLIC_PATHS` in `src/lib/auth/route-access.ts`. An unknown / disabled key renders "Kiosk tidak aktif." (HTTP 200, never a redirect).
- Kiosk reads/writes use the **service-role** client (the kiosk device has no session). `getKioskQr` returns only `{ ok, dataUrl, remainingMs }` — never the secret.
- Audit `aksi` values, exact: `"branch_qr_update"`, `"branch_kiosk_reset"`. Audit-insert failure logged, never fatal (reuse the SP1 service-role pattern).
- All user-facing strings Indonesian. Icons `lucide-react` only, no emoji. No banned Tailwind (`src/no-legacy-classes.test.ts`).
- Deps pinned with `^` (repo convention); lockfile pins exact. `qrcode` + `@types/qrcode` (dev); `jsqr`.
- Test runner: `npx vitest run <path>` for one file; `npm test` (= `vitest run src/`) for the suite — **never** bare `npx vitest run` for verification (integration suite hits the live DB). `npx tsc --noEmit` + `npx eslint` clean. `npx next build` must pass before merge.
- TDD: failing test first. Commit after each task; end every commit message with exactly:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- After UI tasks: `node .agents/skills/impeccable/scripts/detect.mjs --json <changed UI files>` once.

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/0031_qr_attendance.sql` | branches qr cols + attendances metode cols |
| `src/lib/attendance/qr-token.ts` (+ `.test.ts`) | HMAC time-token generate / verify / window-remaining |
| `src/app/kiosk/[key]/page.tsx` | server: resolve key → branch, render display or "tidak aktif" |
| `src/app/kiosk/[key]/kiosk-display.tsx` | client: poll `getKioskQr`, swap `<img>`, countdown |
| `src/app/kiosk/[key]/actions.ts` (+ `.test.ts`) | `getKioskQr(key)` service-role QR generator |
| `src/app/(employee)/absen/qr-scanner.tsx` (+ `.test.tsx`) | client: camera + `jsqr` decode |
| `src/app/(admin)/pengaturan/lokasi/branch-qr-section.tsx` (+ `.test.tsx`) | client: QR toggle + kiosk URL + reset |

**Modified:**

| File | Change |
|---|---|
| `src/lib/auth/route-access.ts` | `PUBLIC_PATHS += "/kiosk"` |
| `src/lib/auth/route-access.test.ts` | assert `/kiosk/x` is allowed with no role |
| `src/app/(admin)/pengaturan/lokasi/actions.ts` | `setBranchQr`, `resetKioskKey` + audit |
| `src/app/(admin)/pengaturan/lokasi/actions.test.ts` | tests for the two new actions |
| `src/app/(admin)/pengaturan/lokasi/page.tsx` | load `qr_enabled`/`kiosk_key`, build kiosk URL, pass to form |
| `src/app/(admin)/pengaturan/lokasi/location-form.tsx` | wrap sections in `FieldSection`, render `<BranchQrSection>` |
| `src/components/audit-aksi-badge.tsx` | `branch_qr_update` / `branch_kiosk_reset` labels |
| `src/app/(admin)/pengaturan/audit/audit-filters.tsx` | add the two aksi to `AKSI_OPTIONS` |
| `src/lib/attendance/clock-in.ts` (+ `.test.ts`) | `qrToken` input, QR precedence, `metode_masuk` |
| `src/lib/attendance/clock-out.ts` (+ `.test.ts`) | same for `metode_pulang` |
| `src/app/(employee)/absen/actions.ts` | read + thread `qrToken`; coords optional on QR path |
| `src/app/(employee)/absen/page.tsx` | load `qr_enabled`, pass `qrEnabled` to `ClockPanel` |
| `src/app/(employee)/absen/clock-panel.tsx` (+ `.test.tsx`) | method switcher, wire `QrScanner` |
| `package.json` | `qrcode`, `@types/qrcode`, `jsqr` |

---

## Task 1: Migration 0031 + schema test

**Files:**
- Create: `supabase/migrations/0031_qr_attendance.sql`
- Modify: whichever `tests/integration/schema-*.test.ts` asserts `branches` / `attendances` columns (find it — likely `schema-core.test.ts` for branches, `schema-attendance-leave.test.ts` for attendances).

**Interfaces — Produces:** the columns listed in Global Constraints.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_qr_attendance.sql`:

```sql
-- QR attendance: a rotating per-branch kiosk QR as an admin-enabled alternative
-- to the GPS geofence on /absen. qr_secret / kiosk_key are set when an admin
-- enables QR for the branch and kept (not nulled) on disable so re-enabling
-- doesn't break a screen already pointed at the kiosk URL. kiosk_key is the
-- login-less /kiosk/<key> URL segment and is resettable.
alter table branches
  add column qr_enabled boolean not null default false,
  add column qr_secret  text,
  add column kiosk_key   text unique;

-- Which method proved presence for each half of the attendance day.
alter table attendances
  add column metode_masuk  text check (metode_masuk  in ('gps','qr')),
  add column metode_pulang text check (metode_pulang in ('gps','qr'));
```

- [ ] **Step 2: Apply to the cloud project**

Run: `npx supabase db push`
Expected: `0031_qr_attendance.sql` applied, no error. (If it prompts, confirm. Do NOT run `db reset`.)

- [ ] **Step 3: Extend the schema integration test**

Find the schema test that lists `branches` columns; add `qr_enabled`, `qr_secret`, `kiosk_key` to its expected set. Same for the `attendances` test with `metode_masuk`, `metode_pulang`. Keep the assertion style identical to what's there.

- [ ] **Step 4: Run the schema test**

Run: `npx vitest run -c vitest.integration.config.mts tests/integration/schema-core.test.ts tests/integration/schema-attendance-leave.test.ts`
Expected: PASS (the teardown will clean any fixtures). If cloud rate-limits, note it and re-run once.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0031_qr_attendance.sql tests/integration/
git commit -m "feat: migration for QR attendance (branch qr cols + attendance metode)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `qr-token.ts`

**Files:**
- Create: `src/lib/attendance/qr-token.ts`
- Test: `src/lib/attendance/qr-token.test.ts`

**Interfaces — Produces:**
```ts
export const QR_WINDOW_MS = 30_000;
export function qrToken(secret: string, now?: number): string;          // 16 lowercase hex
export function verifyQrToken(secret: string, token: string, now?: number): boolean;
export function windowRemainingMs(now?: number): number;                // (0, 30000]
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/attendance/qr-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { qrToken, verifyQrToken, windowRemainingMs, QR_WINDOW_MS } from "./qr-token";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const T0 = 1_700_000_010_000; // mid-window

describe("qrToken", () => {
  it("is 16 lowercase hex chars", () => {
    expect(qrToken(SECRET, T0)).toMatch(/^[0-9a-f]{16}$/);
  });
  it("is stable within a 30s window", () => {
    expect(qrToken(SECRET, T0)).toBe(qrToken(SECRET, T0 + 5_000));
  });
  it("changes across windows", () => {
    expect(qrToken(SECRET, T0)).not.toBe(qrToken(SECRET, T0 + QR_WINDOW_MS));
  });
  it("depends on the secret", () => {
    expect(qrToken(SECRET, T0)).not.toBe(qrToken(SECRET.replace("0", "1"), T0));
  });
});

describe("verifyQrToken", () => {
  it("accepts the current window", () => {
    expect(verifyQrToken(SECRET, qrToken(SECRET, T0), T0)).toBe(true);
  });
  it("accepts the previous window (≈60s tolerance)", () => {
    const old = qrToken(SECRET, T0);
    expect(verifyQrToken(SECRET, old, T0 + QR_WINDOW_MS)).toBe(true);
  });
  it("rejects two windows old", () => {
    const old = qrToken(SECRET, T0);
    expect(verifyQrToken(SECRET, old, T0 + 2 * QR_WINDOW_MS)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyQrToken(SECRET, qrToken("deadbeef".repeat(8), T0), T0)).toBe(false);
  });
  it("rejects malformed input without throwing", () => {
    expect(verifyQrToken(SECRET, "", T0)).toBe(false);
    expect(verifyQrToken(SECRET, "not-hex-not-hex!", T0)).toBe(false);
    expect(verifyQrToken(SECRET, "abcd", T0)).toBe(false);
    expect(verifyQrToken(SECRET, "ABCDEF0123456789", T0)).toBe(false); // uppercase
  });
});

describe("windowRemainingMs", () => {
  it("is within (0, 30000]", () => {
    const r = windowRemainingMs(T0);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(QR_WINDOW_MS);
  });
  it("is full at a window boundary", () => {
    expect(windowRemainingMs(1_700_000_000_000)).toBe(QR_WINDOW_MS);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/lib/attendance/qr-token.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/attendance/qr-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const QR_WINDOW_MS = 30_000;

function tokenForWindow(secret: string, win: number): string {
  return createHmac("sha256", secret).update(String(win)).digest("hex").slice(0, 16);
}

export function qrToken(secret: string, now: number = Date.now()): string {
  return tokenForWindow(secret, Math.floor(now / QR_WINDOW_MS));
}

export function verifyQrToken(secret: string, token: string, now: number = Date.now()): boolean {
  if (!/^[0-9a-f]{16}$/.test(token)) return false;
  const win = Math.floor(now / QR_WINDOW_MS);
  const candidates = [tokenForWindow(secret, win), tokenForWindow(secret, win - 1)];
  const got = Buffer.from(token);
  return candidates.some((c) => {
    const buf = Buffer.from(c);
    return buf.length === got.length && timingSafeEqual(buf, got);
  });
}

export function windowRemainingMs(now: number = Date.now()): number {
  return QR_WINDOW_MS - (now % QR_WINDOW_MS);
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/attendance/qr-token.test.ts` → PASS. `npm test` → no new failures. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/qr-token.ts src/lib/attendance/qr-token.test.ts
git commit -m "feat: add rotating QR time-token (HMAC, 30s window)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `setBranchQr` / `resetKioskKey` actions + audit labels

**Files:**
- Modify: `src/app/(admin)/pengaturan/lokasi/actions.ts`
- Modify: `src/app/(admin)/pengaturan/lokasi/actions.test.ts`
- Modify: `src/components/audit-aksi-badge.tsx`
- Modify: `src/app/(admin)/pengaturan/audit/audit-filters.tsx`

**Interfaces — Produces:**
```ts
export function setBranchQr(branchId: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>;
export function resetKioskKey(branchId: string): Promise<{ ok: true } | { ok: false; error: string }>;
```
`formData` key: `enabled` (present/"true" ⇒ enable, absent ⇒ disable).

**Read first:** the existing `src/app/(admin)/pengaturan/lokasi/actions.ts` — reuse its role guard + `createServiceRoleSupabaseClient` audit-insert helper pattern (SP1's `saveBranchLocation`, and the branch-management `writeAudit` helper if one is visible there).

- [ ] **Step 1: Write the failing tests**

In `actions.test.ts`, mirror the existing mocking style. Cases:

```
setBranchQr:
  - non-admin -> { ok: false, error: "Tidak diizinkan." }, no update
  - enable when qr_secret is null -> branches.update called with objectContaining({ qr_enabled: true }),
    and the update payload also has a 64-hex qr_secret and a non-empty kiosk_key;
    audit_logs.insert aksi "branch_qr_update" detail { branch_id, enabled: true }
  - enable when qr_secret already set -> update sets qr_enabled: true but does NOT overwrite qr_secret/kiosk_key
  - disable -> update { qr_enabled: false } only; qr_secret/kiosk_key untouched; audit enabled: false
  - still { ok: true } when the audit insert errors

resetKioskKey:
  - non-admin rejected
  - generates a new kiosk_key (update called with a kiosk_key different from a passed-in current one),
    audit "branch_kiosk_reset"
```

To assert "generated a 64-hex secret", capture the update payload arg and check `/^[0-9a-f]{64}$/.test(payload.qr_secret)`.

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/actions.test.ts"` → the new cases FAIL.

- [ ] **Step 3: Implement**

Add to `src/app/(admin)/pengaturan/lokasi/actions.ts` (keep the existing `saveBranchLocation` intact):

```ts
import { randomBytes } from "node:crypto";
// ...existing imports...

export async function setBranchQr(branchId: string, formData: FormData): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const enabled = ["true", "on", "1"].includes(String(formData.get("enabled") ?? "").toLowerCase());

  const { data: current } = await db
    .from("branches")
    .select("qr_secret, kiosk_key")
    .eq("id", branchId)
    .single();

  const patch: Record<string, unknown> = { qr_enabled: enabled };
  if (enabled && !current?.qr_secret) {
    patch.qr_secret = randomBytes(32).toString("hex");
    patch.kiosk_key = randomBytes(18).toString("base64url");
  }

  const { error } = await db.from("branches").update(patch).eq("id", branchId);
  if (error) {
    console.error("setBranchQr: update failed", error);
    return { ok: false, error: "Gagal menyimpan pengaturan Absen QR." };
  }

  const service = createServiceRoleSupabaseClient();
  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: null,
    aksi: "branch_qr_update",
    detail: { branch_id: branchId, enabled },
  });
  if (auditErr) console.error("setBranchQr: audit insert failed", auditErr);

  revalidatePath("/pengaturan/lokasi");
  return { ok: true };
}

export async function resetKioskKey(branchId: string): Promise<Result> {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { ok: false, error: "Tidak diizinkan." };
  }
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const { error } = await db
    .from("branches")
    .update({ kiosk_key: randomBytes(18).toString("base64url") })
    .eq("id", branchId);
  if (error) {
    console.error("resetKioskKey: update failed", error);
    return { ok: false, error: "Gagal mengganti link kiosk." };
  }

  const service = createServiceRoleSupabaseClient();
  const { error: auditErr } = await service.from("audit_logs").insert({
    actor_id: me.id,
    target_employee_id: null,
    aksi: "branch_kiosk_reset",
    detail: { branch_id: branchId },
  });
  if (auditErr) console.error("resetKioskKey: audit insert failed", auditErr);

  revalidatePath("/pengaturan/lokasi");
  return { ok: true };
}
```

(If `actions.ts` does not already import `createServiceRoleSupabaseClient` / `Result` type, add them — check the top of the file.)

`src/components/audit-aksi-badge.tsx` `CONFIG`, after the branch entries:
```ts
  branch_qr_update: { label: "Absen QR Diubah", variant: "info" },
  branch_kiosk_reset: { label: "Link Kiosk Diganti", variant: "info" },
```

`src/app/(admin)/pengaturan/audit/audit-filters.tsx` `AKSI_OPTIONS`: add
`{ value: "branch_qr_update", label: "Absen QR Diubah" }` and
`{ value: "branch_kiosk_reset", label: "Link Kiosk Diganti" }` (match the existing shape).

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/actions.test.ts" src/components/audit-aksi-badge.test.tsx` → PASS. `npm test` → no new failures. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/lokasi/actions.ts" "src/app/(admin)/pengaturan/lokasi/actions.test.ts" src/components/audit-aksi-badge.tsx "src/app/(admin)/pengaturan/audit/audit-filters.tsx"
git commit -m "feat: setBranchQr + resetKioskKey admin actions with audit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Kiosk route + `getKioskQr`

**Files:**
- Modify: `src/lib/auth/route-access.ts` + `src/lib/auth/route-access.test.ts`
- Create: `src/app/kiosk/[key]/actions.ts` + `src/app/kiosk/[key]/actions.test.ts`
- Create: `src/app/kiosk/[key]/page.tsx`
- Create: `src/app/kiosk/[key]/kiosk-display.tsx`
- Modify: `package.json` (`qrcode`, `@types/qrcode`)

**Interfaces:**
- Consumes: `qrToken` / `windowRemainingMs` (Task 2), `createServiceRoleSupabaseClient`.
- Produces:
  ```ts
  export function getKioskQr(key: string): Promise<
    { ok: true; dataUrl: string; remainingMs: number } | { ok: false }
  >;
  ```

- [ ] **Step 1: `PUBLIC_PATHS` + its test**

In `src/lib/auth/route-access.ts` add `"/kiosk"` to `PUBLIC_PATHS`. In `route-access.test.ts` add: `expect(resolveRouteAccess("/kiosk/anything", null)).toBe("allow")`.

Run: `npx vitest run src/lib/auth/route-access.test.ts` → PASS.

- [ ] **Step 2: Install `qrcode`**

Run: `npm install qrcode && npm install -D @types/qrcode`

- [ ] **Step 3: Write the failing action test**

Create `src/app/kiosk/[key]/actions.test.ts`. Mock `@/lib/supabase/server`'s `createServiceRoleSupabaseClient` to return a branch for a known key and nothing for others. Cases:
- unknown key → `{ ok: false }`
- key found but `qr_enabled: false` → `{ ok: false }`
- valid → `ok: true`, `dataUrl` starts with `"data:image/png;base64,"`, `remainingMs` in `(0, 30000]`

- [ ] **Step 4: Implement `getKioskQr`**

Create `src/app/kiosk/[key]/actions.ts`:

```ts
"use server";

import QRCode from "qrcode";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { qrToken, windowRemainingMs } from "@/lib/attendance/qr-token";

type KioskResult =
  | { ok: true; dataUrl: string; remainingMs: number }
  | { ok: false };

export async function getKioskQr(key: string): Promise<KioskResult> {
  if (!key) return { ok: false };
  const db = createServiceRoleSupabaseClient();
  const { data: branch, error } = await db
    .from("branches")
    .select("id, qr_enabled, qr_secret")
    .eq("kiosk_key", key)
    .maybeSingle();
  if (error || !branch || !branch.qr_enabled || !branch.qr_secret) return { ok: false };

  const payload = `${branch.id}|${qrToken(branch.qr_secret)}`;
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 512 });
  return { ok: true, dataUrl, remainingMs: windowRemainingMs() };
}
```

- [ ] **Step 5: `page.tsx` + `kiosk-display.tsx`**

`src/app/kiosk/[key]/page.tsx` (server):

```tsx
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { KioskDisplay } from "./kiosk-display";

export default async function KioskPage({ params }: PageProps<"/kiosk/[key]">) {
  const { key } = await params;
  const db = createServiceRoleSupabaseClient();
  const { data: branch } = await db
    .from("branches")
    .select("nama, qr_enabled")
    .eq("kiosk_key", key)
    .maybeSingle();

  if (!branch || !branch.qr_enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-8 text-center">
        <p className="text-lg text-neutral-400">Kiosk tidak aktif.</p>
      </main>
    );
  }
  return <KioskDisplay kioskKey={key} branchNama={branch.nama} />;
}
```

(NOTE: `bg-neutral-950` / `text-neutral-400` are on the `no-legacy-classes` banned list for `src/app` — use the design tokens instead: `bg-background`/`text-muted-foreground`, OR add `src/app/kiosk/` to that test's `exclude` since a kiosk screen is deliberately its own full-bleed dark surface. **Decision: add the exclude** — `src/no-legacy-classes.test.ts`, extend `ROOTS[0].exclude` to also skip `^kiosk/`. Do this in Step 5 and note it.)

`src/app/kiosk/[key]/kiosk-display.tsx` (`"use client"`) — behavior:
- state: `dataUrl: string | null`, `remainingMs: number`.
- `refresh()`: `await getKioskQr(kioskKey)`; on `ok` set both; on `!ok` keep the old `dataUrl` and set a 5000 ms retry. After a success, schedule the next `refresh` in `remainingMs` (min 1000).
- `useEffect` runs `refresh()` on mount, clears the timer on unmount.
- render: full-viewport dark flex-center; the branch name (`text-2xl`), a large `<img src={dataUrl} width={320} height={320} alt="QR absen">` (or a "Memuat…" placeholder while null), and a thin countdown bar whose width is `remainingMs / QR_WINDOW_MS`. A short line "Scan dengan aplikasi absensi. Kode berganti otomatis."
- No `lucide` needed; if used, lucide only.

- [ ] **Step 6: Run — verify**

Run: `npx vitest run "src/app/kiosk/" src/lib/auth/route-access.test.ts src/no-legacy-classes.test.ts` → PASS. `npm test` → no new failures. `npx tsc --noEmit` + `npx eslint "src/app/kiosk" src/lib/auth/route-access.ts` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/kiosk src/lib/auth/route-access.ts src/lib/auth/route-access.test.ts src/no-legacy-classes.test.ts package.json package-lock.json
git commit -m "feat: kiosk page + rotating QR generator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `BranchQrSection` + LocationForm/page wiring

**Files:**
- Create: `src/app/(admin)/pengaturan/lokasi/branch-qr-section.tsx` + `.test.tsx`
- Modify: `src/app/(admin)/pengaturan/lokasi/location-form.tsx`
- Modify: `src/app/(admin)/pengaturan/lokasi/page.tsx`

**Interfaces:**
- Consumes: `setBranchQr` / `resetKioskKey` (Task 3), `FieldSection` (`@/components/field-section`), `toast` from `sonner`.
- Produces:
  ```ts
  export function BranchQrSection(props: {
    branchId: string;
    qrEnabled: boolean;
    kioskUrl: string | null;   // full URL, or null when never enabled
    setBranchQr: (branchId: string, fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
    resetKioskKey: (branchId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  }): JSX.Element;
  ```

**Read first:** `src/app/(admin)/pengaturan/lokasi/location-form.tsx` (current structure) and `src/components/field-section.tsx`.

- [ ] **Step 1: Failing component test**

Create `branch-qr-section.test.tsx`. Mock `sonner`. Cases:
- QR off: renders the "Aktifkan Absen QR" toggle unchecked; no kiosk URL shown.
- toggling on calls `setBranchQr(branchId, fd)` with `fd.get("enabled")` truthy; on `ok` → `toast.success`.
- QR on + `kioskUrl` given: the URL is shown (in a readonly input or `<code>`), a "Salin link" button, a "Buka kiosk" anchor with `href={kioskUrl}` `target="_blank"`, and a "Ganti link" button that calls `resetKioskKey(branchId)`.
- a failed `setBranchQr` shows the error via `toast.error` or an inline `Alert`.

- [ ] **Step 2: Run — verify fail** → module not found.

- [ ] **Step 3: Implement `branch-qr-section.tsx`**

`"use client"`. Behavior:
- A `<form action={toggleAction}>` with a checkbox `name="enabled"` (`defaultChecked={qrEnabled}`) that submits `onChange` (`e.currentTarget.form?.requestSubmit()`), label "Aktifkan Absen QR". `toggleAction` → `setBranchQr(branchId, fd)`; `ok` → `toast.success(enabled ? "Absen QR diaktifkan." : "Absen QR dimatikan.")`; `!ok` → `toast.error(r.error)`.
- When `qrEnabled && kioskUrl`:
  - readonly `Input` (or `<code className="...">`) showing `kioskUrl`.
  - "Salin link" `Button` → `navigator.clipboard.writeText(kioskUrl)` + `toast.success("Link disalin.")` (guard `navigator.clipboard`).
  - "Buka kiosk" — an `<a href={kioskUrl} target="_blank" rel="noopener">` styled as a `Button` (`buttonVariants` or a ghost link).
  - "Ganti link" `Button variant="ghost"` → `resetKioskKey(branchId)`; `ok` → `toast.success("Link kiosk baru dibuat. Perbarui layar kiosk.")` (the parent re-renders with the new URL via `revalidatePath`); `!ok` → `toast.error`.
  - helper `<p className="text-xs text-muted-foreground">`: "Tampilkan link ini di layar dekat pintu kantor. Kode berganti tiap 30 detik. Karyawan pilih 'Scan QR' di halaman Absen."
- Keep it ~110 lines.

- [ ] **Step 4: Wire into `location-form.tsx`**

Wrap the existing geofence editor JSX in `<FieldSection icon={MapPin} title="Titik & Radius">…</FieldSection>` and add below it `<FieldSection icon={QrCode} title="Absen QR"><BranchQrSection … /></FieldSection>`. `LocationForm`'s props gain `qrEnabled`, `kioskUrl`, `setBranchQr`, `resetKioskKey` (pass-through). `import { QrCode } from "lucide-react"`.

- [ ] **Step 5: Wire into `page.tsx`**

The branches query adds `qr_enabled, kiosk_key`. Build the kiosk origin once: `const origin = (await headers()).get("origin") ?? (await headers()).get("x-forwarded-host") ...` — simplest reliable: `const h = await headers(); const proto = h.get("x-forwarded-proto") ?? "https"; const host = h.get("host"); const origin = host ? \`${proto}://${host}\` : "";`. Pass `qrEnabled: b.qr_enabled`, `kioskUrl: b.kiosk_key && origin ? \`${origin}/kiosk/${b.kiosk_key}\` : null`, and the two actions to each `LocationForm`.

- [ ] **Step 6: Run — verify**

Run: `npx vitest run "src/app/(admin)/pengaturan/lokasi/" src/no-legacy-classes.test.ts` → PASS. `npm test` no new failures. `npx tsc --noEmit` + `npx eslint "src/app/(admin)/pengaturan/lokasi"` clean.
Run the detector: `node .agents/skills/impeccable/scripts/detect.mjs --json "src/app/(admin)/pengaturan/lokasi/branch-qr-section.tsx" "src/app/(admin)/pengaturan/lokasi/location-form.tsx"` — fix, re-run once.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/pengaturan/lokasi/"
git commit -m "feat: Absen QR admin section on /pengaturan/lokasi

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `clock-in.ts` / `clock-out.ts` / `absen/actions.ts` — QR path

**Files:**
- Modify: `src/lib/attendance/clock-in.ts` + `.test.ts`
- Modify: `src/lib/attendance/clock-out.ts` + `.test.ts`
- Modify: `src/app/(employee)/absen/actions.ts`

**Interfaces:**
- Consumes: `verifyQrToken` (Task 2).
- Produces: `ClockInInput` / `ClockOutInput` gain `qrToken?: string`.

- [ ] **Step 1: Write the failing tests**

Extend `clock-in.test.ts`'s `makeMockDb` so the mocked `branches` row includes `qr_enabled` + `qr_secret` (default `qr_enabled: false`, `qr_secret: null`). Add cases:

```
- QR path: branch qr_enabled with a real secret; qrToken = `${branch.id}|${validToken}` ->
  clock-in succeeds with NO geofence gate even for far coords / no coords, and the inserted
  row has metode_masuk: "qr"
- QR enabled but token expired/garbage -> { ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." }, no insert
- QR token for a DIFFERENT branch id -> same rejection
- qrToken present but branch qr_enabled = false -> ignored, GPS path runs, metode_masuk: "gps"
- GPS path (no qrToken) -> metode_masuk: "gps"
```

Use a fixed `now` and compute `validToken` with the real `qrToken(secret, now)`.

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/lib/attendance/clock-in.test.ts` → the new QR cases FAIL.

- [ ] **Step 3: Implement**

In `clock-in.ts`:
- `import { verifyQrToken } from "./qr-token";`
- `ClockInInput`: add `qrToken?: string;`
- branch select: add `qr_enabled, qr_secret`.
- After the branch + schedule are loaded, before the `geofenceState` block:

```ts
  let metode: "gps" | "qr" = "gps";
  let qrVerified = false;
  if (input.qrToken !== undefined && branch.qr_enabled) {
    const [payloadBranchId, payloadToken] = String(input.qrToken).split("|");
    const okQr =
      payloadBranchId === branch.id &&
      typeof branch.qr_secret === "string" &&
      verifyQrToken(branch.qr_secret, payloadToken ?? "", now.getTime());
    if (!okQr) {
      return { ok: false, error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang." };
    }
    qrVerified = true;
    metode = "qr";
  }
```

- The geofence block becomes: when `qrVerified`, treat `withinRadius = true`, skip the "out of radius → reason" gate entirely. Otherwise run the existing `geofenceState` logic.
- The `resolveClockInStatus` call gets `withinRadius: qrVerified ? true : geo.withinRadius`.
- The `.insert({...})` payload gains `metode_masuk: metode`.

Mirror all of this in `clock-out.ts` (`metode_pulang`, `resolveClockOutStatus`).

In `src/app/(employee)/absen/actions.ts`:
- `submitClockIn` / `submitClockOut`: `const qrRaw = formData.get("qrToken"); const qrToken = typeof qrRaw === "string" && qrRaw ? qrRaw : undefined;` — pass `qrToken` to `clockIn`/`clockOut`.
- When `qrToken` is set, a coordinate-validation failure must NOT return early — instead pass `lat`/`long` as-is only when valid, else skip them (the lib treats them as optional on the QR path). Concretely: compute `const coordsOk = isValidCoordinate(lat, long); if (!coordsOk && !qrToken) return { ok: false, error: "Lokasi tidak valid." };` and pass `lat: coordsOk ? lat : 0, long: coordsOk ? long : 0` (the lib ignores coords on the QR path). Photo check unchanged.

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/attendance/clock-in.test.ts src/lib/attendance/clock-out.test.ts` → PASS. `npm test` → no new failures. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/clock-in.ts src/lib/attendance/clock-in.test.ts src/lib/attendance/clock-out.ts src/lib/attendance/clock-out.test.ts "src/app/(employee)/absen/actions.ts"
git commit -m "feat: accept a scanned QR as a geofence alternative on clock-in/out

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `QrScanner` component + `jsqr`

**Files:**
- Create: `src/app/(employee)/absen/qr-scanner.tsx` + `.test.tsx`
- Modify: `package.json` (`jsqr`)

**Interfaces — Produces:**
```ts
export function QrScanner(props: { onDecode: (payload: string) => void; className?: string }): JSX.Element;
```

- [ ] **Step 1: Install `jsqr`**

Run: `npm install jsqr`

- [ ] **Step 2: Write the failing test**

Create `qr-scanner.test.tsx`. Mock `navigator.mediaDevices.getUserMedia` to resolve with a fake `MediaStream` (`{ getTracks: () => [{ stop: vi.fn() }] }`). Mock `jsqr` (`vi.mock("jsqr", () => ({ default: vi.fn() }))`). Cases:
- renders a "Buka kamera" button initially.
- clicking it calls `getUserMedia({ video: { facingMode: "environment" } })` and shows a `<video>`.
- when `jsQR` returns `{ data: "<uuid>|<16hex>" }` matching the payload regex → `onDecode` is called once with that string and the "QR terbaca" state shows.
- when `jsQR` returns data that does NOT match the regex → `onDecode` is not called.
- when `getUserMedia` rejects → the denied state ("Izin kamera ditolak — pakai Lokasi GPS.") shows.
(You'll need to drive the rAF loop — expose the frame-check as a function the test can call, or use `vi.useFakeTimers` + a `setTimeout`-based loop instead of rAF for testability. Prefer a `setInterval(check, 250)` loop — easier to test and 4 fps is plenty for a QR on a screen.)

- [ ] **Step 3: Implement**

`"use client"`. Behavior:
- state: `phase: "idle" | "starting" | "scanning" | "denied" | "done"`, `stream` ref, `intervalRef`.
- "Buka kamera" → `phase = "starting"` → `getUserMedia({ video: { facingMode: "environment" } })`; on success attach to a `<video autoPlay muted playsInline>`, `phase = "scanning"`, start `setInterval(scan, 250)`; on failure `phase = "denied"`.
- `scan()`: draw the `<video>` current frame to an offscreen `<canvas>`, `const img = ctx.getImageData(...)`, `const res = jsQR(img.data, img.width, img.height)`. If `res && /^[0-9a-f-]{36}\|[0-9a-f]{16}$/.test(res.data)` → `stopCamera()`, `phase = "done"`, `onDecode(res.data)`.
- `stopCamera()`: `clearInterval`, `stream.getTracks().forEach(t => t.stop())`. Called on unmount and on decode.
- render per phase: idle → the button; starting → "Membuka kamera…"; scanning → the `<video>` in a rounded frame + "Arahkan ke QR di layar kantor"; denied → the message + (the parent shows the GPS option); done → "QR terbaca ✓" + a "Scan ulang" link that resets to idle.
- `className` passthrough on the wrapper.

- [ ] **Step 4: Run — verify**

Run: `npx vitest run "src/app/(employee)/absen/qr-scanner.test.tsx"` → PASS. `npm test` no new failures. `npx tsc --noEmit` + `npx eslint` clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/absen/qr-scanner.tsx" "src/app/(employee)/absen/qr-scanner.test.tsx" package.json package-lock.json
git commit -m "feat: add in-app QR camera scanner

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Absen method switcher — `clock-panel.tsx` + `page.tsx`

**Files:**
- Modify: `src/app/(employee)/absen/page.tsx`
- Modify: `src/app/(employee)/absen/clock-panel.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: `QrScanner` (Task 7); `Tabs` from `@/components/ui/tabs`.
- Produces: `ClockPanel` props gain `qrEnabled: boolean`.

- [ ] **Step 1: `page.tsx`**

The branch geofence query adds `qr_enabled`. Pass `qrEnabled={branch?.qr_enabled ?? false}` to `<ClockPanel>`.

- [ ] **Step 2: Rewrite the relevant `clock-panel.test.tsx` cases**

Mock `./qr-scanner` (`vi.mock("./qr-scanner", () => ({ QrScanner: ({ onDecode }) => { (globalThis as any).__decodeQr = onDecode; return <div data-testid="qr-scanner" />; } }))`) alongside the existing `ProximityPanel` mock. Cases:
- `qrEnabled={false}` → no method switcher; GPS flow as today.
- `qrEnabled={true}` → a switcher with "Scan QR" (default) and "Lokasi GPS"; the QR tab shows `<QrScanner>`, no reason field ever.
- on the QR tab: submit disabled until a photo AND a decoded payload (`__decodeQr("<uuid>|<hex>")`); after both, enabled.
- successful QR clock-in calls `submitClockIn` with `FormData` carrying `qrToken` (the decoded payload) + `photo`.
- switching to "Lokasi GPS" restores the existing behavior (reason field appears when out-of-radius geo is pushed).

- [ ] **Step 3: Implement**

In `clock-panel.tsx`:
- props: add `qrEnabled: boolean`.
- state: `method: "qr" | "gps"` (initial `qrEnabled ? "qr" : "gps"`), `qrPayload: string | null`.
- When `qrEnabled`, render `<Tabs value={method} onValueChange={(v) => setMethod(v as "qr" | "gps")}>` with two `TabsTrigger` ("Scan QR" / "Lokasi GPS") above the capture area. When `!qrEnabled`, render the GPS content directly (no Tabs).
- `method === "qr"`: render `<QrScanner onDecode={setQrPayload} />`; when `qrPayload` set, a green line "Lokasi terverifikasi via QR". No `ProximityPanel`, no reason field.
- `method === "gps"`: the existing `ProximityPanel` + reason logic.
- `reasonRequired` is forced `false` when `method === "qr"`.
- `submitDisabled`: `method === "qr"` → `submitting || !photo || !qrPayload`; else the existing rule.
- `handleClock`: if `method === "qr"` → `fd.set("qrToken", qrPayload!)`; still attempt a best-effort `getPosition()` in a `try` and set `lat`/`long` if it resolves quickly, but never block on it. If `method === "gps"` → current path (with the one-shot position).
- On `ok`: clear `photo`, `reason`, `qrPayload`.

- [ ] **Step 4: Run — verify**

Run: `npx vitest run "src/app/(employee)/absen/"` → PASS. `npm test` → no new failures. `npx tsc --noEmit` + `npx eslint "src/app/(employee)/absen"` → clean.
Detector: `node .agents/skills/impeccable/scripts/detect.mjs --json "src/app/(employee)/absen/clock-panel.tsx" "src/app/(employee)/absen/qr-scanner.tsx"` — fix, re-run once.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/absen/"
git commit -m "feat: QR / GPS method switcher on the Absen page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Build, detector, manual verification

- [ ] **Step 1: Full checks**

Run: `npx tsc --noEmit && npx eslint src && npm test && npx next build`
Expected: all clean / green / passes. `npm test` shows only the count it had before this plan plus the new tests, zero failures.

- [ ] **Step 2: Detector over every changed UI file**

Run: `node .agents/skills/impeccable/scripts/detect.mjs --json "src/app/kiosk/[key]/kiosk-display.tsx" "src/app/(employee)/absen/qr-scanner.tsx" "src/app/(employee)/absen/clock-panel.tsx" "src/app/(admin)/pengaturan/lokasi/branch-qr-section.tsx"`
Fix findings in one batch, re-run once.

- [ ] **Step 3: Manual verification (dev server)**

`npm run dev`. As the admin: `/pengaturan/lokasi` → enable "Absen QR" for the branch → copy the kiosk link → open it in a second browser/window → confirm a QR renders and visibly changes ~every 30 s. On a phone (mobile UA): `/absen` → "Scan QR" tab → scan the kiosk QR → take a selfie → "Absen Masuk" → succeeds with no reason prompt. Check the DB: the `attendances` row has `metode_masuk = 'qr'`. Then disable QR and confirm `/absen` reverts to GPS-only.

- [ ] **Step 4: Commit any detector fixes**

```bash
git add -A
git commit -m "chore: address design-detector findings on QR attendance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1 — migration 0031 (branches + attendances cols) | Task 1 |
| 2 — `qr-token.ts` | Task 2 |
| 3 — `setBranchQr` / `resetKioskKey` + audit labels + filter | Task 3 |
| 3 — `LocationForm` QR section + `page.tsx` wiring | Task 5 |
| 4 — kiosk route, `getKioskQr`, `KioskDisplay`, `PUBLIC_PATHS` | Task 4 |
| 5 — `clock-in`/`clock-out` QR precedence + `metode` + `absen/actions.ts` | Task 6 |
| 6 — `QrScanner` + `jsqr` | Task 7 |
| 7 — Absen method switcher | Task 8 |
| 8 — deps (`qrcode` Task 4, `jsqr` Task 7) | Tasks 4, 7 |
| 9 — error/edge cases | Tasks 4, 6, 7 (per-component) |
| 10 — all test groups | Tasks 1–8 |
| 11 — rollout order | Task order matches |

No gaps.

**Placeholder scan:** Tasks 5, 7, 8 (`branch-qr-section.tsx`, `qr-scanner.tsx`, `clock-panel.tsx` changes) are behavior contracts, not verbatim JSX — each enumerates every state, prop, copy string, and conditional, and names the sibling/primitive to build on. Pure functions (Task 2) and the server actions (Tasks 3, 4, 6) carry full code.

**Type consistency:** `qrToken(secret, now?) → string`, `verifyQrToken(secret, token, now?) → boolean`, `windowRemainingMs(now?) → number` — identical across Tasks 2, 4, 6. `getKioskQr(key) → { ok:true; dataUrl; remainingMs } | { ok:false }` — Tasks 4, and consumed in `kiosk-display.tsx`. QR payload shape `"<branchId>|<token>"` and the regex `/^[0-9a-f-]{36}\|[0-9a-f]{16}$/` — Tasks 6 (server split + validate), 7 (scanner filter), 8 (test fixtures). `ClockInInput.qrToken?: string` — Tasks 6, 8. `ClockPanel` `qrEnabled: boolean` — Tasks 8. Audit `aksi` strings `"branch_qr_update"` / `"branch_kiosk_reset"` — Task 3 (write + badge + filter).
