# Employee Pages + Dark Mode Implementation Plan (SP5, final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the 5 employee pages (+ 3 client components) onto the shadcn/token design system, then retire the dark-mode debt — delete the unused legacy neutral scale, make the trend chart dark-aware, flip `theme-provider` back to `system` + re-mount `<ThemeToggle>`, and add a Vitest guard against legacy-class regression.

**Architecture:** Tasks 1–5 reskin one employee page + its client component each (auth guards / queries / server-action wiring stay verbatim — only the render tree changes). Task 6 adds the guard test (passes once 1–5 land). Tasks 7–9 are the dark-mode debt: delete `--color-neutral-*` from `globals.css`, add themed chart CSS vars, flip the theme provider + re-mount the toggle. Task 10 is the full light+dark smoke gate.

**Tech Stack:** Next.js 16.3 (App Router, async server components, `searchParams`/`params` are Promises) · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui (`radix-nova`) · `lucide-react` · `recharts` · `next-themes` · Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-08-31-employee-pages-dark-mode-design.md`. **Sub-project 5 of 5 — the final one.**

## Global Constraints

- TypeScript strict. `npm test` = `vitest run src/`. `./node_modules/.bin/tsc --noEmit` — **NEVER** `npx tsc`. `npm run build` stays **26 routes** (no route paths change).
- **No server-action / RLS / payroll-calc / data-model change. No migrations.** Every page keeps its auth guard + query + inline server-action wiring verbatim — only the returned JSX (client components: only the render tree) changes.
- **Never render raw Postgres error text.** The existing pages return fixed Indonesian strings — keep them, move them into `<Alert>`. `consent/page.tsx`'s `ERROR_MESSAGES` map + its security comment stay exactly as is.
- **Semantic + `dark:`-ready utilities only** in new/touched code: `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `bg-primary/5`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `text-primary`, `border-border`, `border-input`, `divide-border`. Success/positive accent: `text-emerald-600 dark:text-emerald-500`. **Never** `bg-white`, `bg-neutral-*`, `text-neutral-*`, `bg-blue-*`, `text-blue-*`, `border-neutral-*`, `divide-neutral-*`, `text-red-600`, `text-green-*`, `bg-red-50`, `border-red-200`, `bg-green-50`, `border-green-200`, `hover:border-blue-*`, `hover:bg-blue-*`, and the arbitrary `shadow-[0_1px_2px_rgba(15,23,42,…)]` values (use `<Card>`'s own `ring-1 ring-foreground/10`).
- Icons: `lucide-react` only. Every hand-rolled inline `<svg>` in the 8 employee files → a lucide component. Never emoji.
- Indonesian UI copy. `lang="id"`.
- `<Card>` = `bg-card ring-1 ring-foreground/10 rounded-xl` + `[--card-spacing:--spacing(4)]`; `size="sm"` → `--spacing(3)`.
- `<Field id label>` renders `<div className="space-y-1.5"><Label htmlFor={id}>…</Label>{clonedChild}</div>` and clones its single child to set `id` — so `getByLabelText` resolves to the `<Input>` / `<NativeSelect>`'s inner `<select>` / `<Textarea>`. Pass NO layout className to `<Field>`.
- `NativeSelect` spreads `{...props}` onto its inner `<select>` — the cloned `id` + the `name` both land there.
- Current unit suite: 436 green. Must stay green at every commit; `tsc` clean; `npm run build` 26 routes.

---

## File Structure

**Reskinned pages / client components**
- `src/app/(employee)/absen/page.tsx` + `clock-panel.tsx` (+ `clock-panel.test.tsx` retarget)
- `src/app/(employee)/absen/consent/page.tsx`
- `src/app/(employee)/cuti/page.tsx` + `leave-form.tsx` (+ `leave-form.test.tsx` retarget)
- `src/app/(employee)/riwayat/page.tsx` + `history-list.tsx` (+ `history-list.test.tsx` retarget)
- `src/app/(employee)/slip-gaji/page.tsx`

**New**
- `src/no-legacy-classes.test.ts` — grep guard over `src/app`

**Dark-mode debt**
- `src/app/globals.css` — delete `--color-neutral-*` block; add 3 `--chart-*` vars (`:root` + `.dark`)
- `src/components/attendance-trend-chart.tsx` — chrome → CSS vars
- `src/components/theme-provider.tsx` — `forcedTheme` → `system`
- `src/components/admin-shell.tsx` + `employee-shell.tsx` — re-mount `<ThemeToggle>` (+ `admin-shell.test.tsx` / `employee-shell.test.tsx` re-add)
- `src/app/(account)/profil/page.tsx` — a `<ThemeToggle>` settings row

**Unchanged tests:** `theme-toggle.test.tsx` (doesn't depend on being mounted).

---

## Task 1: `/absen` + `clock-panel.tsx`

**Files:**
- Modify: `src/app/(employee)/absen/page.tsx`, `src/app/(employee)/absen/clock-panel.tsx`, `src/app/(employee)/absen/clock-panel.test.tsx`

**Interfaces:**
- Consumes: `Card, CardContent` (`@/components/ui/card`), `Button` (`@/components/ui/button`), `Alert, AlertDescription` (`@/components/ui/alert`), `cn` (`@/lib/utils`), `Camera, CheckCircle2` (`lucide-react`), `AttendanceStatusBadge` (existing).
- Produces: `ClockPanel` keeps its exact prop signature + the `TodaysAttendance` / `ActionResult` exported types.

- [ ] **Step 1: Reskin `absen/page.tsx`**

Keep the guard, `hasActiveConsent` check + `redirect("/absen/consent")`, the `attendances` query, `todaysAttendance` mapping, `formattedToday` **verbatim**. Replace only the returned JSX's header block:

```tsx
  return (
    <main className="mx-auto max-w-md p-4 pt-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{formattedToday}</p>
        <h1 className="text-2xl font-semibold text-foreground">Halo, {employee.nama}</h1>
      </div>
      <ClockPanel
        todaysAttendance={todaysAttendance}
        submitClockIn={submitClockIn}
        submitClockOut={submitClockOut}
      />
    </main>
  );
```

(The only `-`/`+` is `text-neutral-500` → `text-muted-foreground` and `text-neutral-900` → `text-foreground`.)

- [ ] **Step 2: Reskin `clock-panel.tsx`**

Keep `"use client"`, all state (`error`, `submitting`, `photo`), `getPosition`, `handleClock`, the `ActionResult` / `TodaysAttendance` types **verbatim**. New imports at the top:

```tsx
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
```

Replace the three returned states + `PhotoCaptureButton`'s markup:

```tsx
  if (todaysAttendance?.jamPulang) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
          <p className="text-base font-medium text-foreground">Absensi hari ini selesai.</p>
          <AttendanceStatusBadge status={todaysAttendance.status} />
        </CardContent>
      </Card>
    );
  }

  if (todaysAttendance?.jamMasuk) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-5 py-6">
          <AttendanceStatusBadge status={todaysAttendance.status} />
          <PhotoCaptureButton
            label="Absen Pulang"
            disabled={submitting}
            photo={photo}
            onPhotoChange={setPhoto}
            onSubmit={() => handleClock("pulang")}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-6">
        <PhotoCaptureButton
          label="Absen Masuk"
          disabled={submitting}
          photo={photo}
          onPhotoChange={setPhoto}
          onSubmit={() => handleClock("masuk")}
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

`PhotoCaptureButton` — keep the props + the hidden `<input type="file" accept="image/*" capture="user" aria-label="Foto selfie" disabled={disabled} onChange={...} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />` **verbatim** (the tests depend on `aria-label="Foto selfie"`). Replace the surrounding markup:

```tsx
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <label className="relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5">
        <input
          type="file"
          accept="image/*"
          capture="user"
          aria-label="Foto selfie"
          disabled={disabled}
          onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <Camera
          className={cn("size-6", photo ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-foreground">
          {photo ? photo.name : "Ambil foto selfie"}
        </span>
      </label>
      <Button
        type="button"
        size="lg"
        disabled={disabled || !photo}
        onClick={onSubmit}
        className="min-h-16 w-full text-lg"
      >
        {label}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Retarget `clock-panel.test.tsx`**

Run `npm test -- clock-panel`. The 6 cases: Clock-In button present; Clock-Out button + status; completed state; geolocation + `submitClockIn` on "Absen Masuk"; submit disabled until a photo; error on `{ ok: false }`. Selectors: `getByRole("button", { name: /absen masuk/i })` / `/absen pulang/i` still resolve; `getByLabelText("Foto selfie")` unchanged; the `navigator.geolocation` mock unchanged; the error is now in `<Alert>` — `getByText` still finds it. Fix ONLY a selector that genuinely breaks — do not weaken. (The completed-state test asserts "Absensi hari ini selesai." — same text.)

- [ ] **Step 4: Verify**

```bash
npm test -- clock-panel && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 6 tests pass; tsc clean; build compiles, `/absen` present, 26 routes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/absen/page.tsx" "src/app/(employee)/absen/clock-panel.tsx" "src/app/(employee)/absen/clock-panel.test.tsx"
git commit -m "feat(absen): reskin clock panel to shadcn — Card, Button, Alert, lucide"
```

---

## Task 2: `/absen/consent`

**Files:**
- Modify: `src/app/(employee)/absen/consent/page.tsx`

**Interfaces:**
- Consumes: `Card, CardContent`, `Button`, `Alert, AlertDescription`, `MapPin` (`lucide-react`), `acceptConsent` (existing import).

- [ ] **Step 1: Rewrite the page**

Keep the `ERROR_MESSAGES` map + its security comment + the `searchParams` handling + the `acceptConsent` import **verbatim**. Replace the component body:

```tsx
import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { acceptConsent } from "./actions";

// The `error` query param is attacker-controllable (anyone can hand an employee
// a /absen/consent?error=... link), so it is never rendered as free text. Only
// these known codes produce a message, and the message is hardcoded here.
const ERROR_MESSAGES: Record<string, string> = {
  gagal: "Gagal menyimpan persetujuan. Silakan coba lagi.",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <MapPin className="size-9 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">Persetujuan Lokasi &amp; Foto</h1>
          <p className="text-sm text-muted-foreground">
            Untuk mencatat absensi, aplikasi ini perlu mengakses lokasi GPS dan mengambil foto
            selfie Anda saat clock-in dan clock-out. Data ini disimpan sesuai kebijakan privasi
            perusahaan dan akan ditandai kedaluwarsa setelah 90 hari.
          </p>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <form action={acceptConsent} className="w-full">
            <Button type="submit" size="lg" className="w-full">
              Saya Setuju
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: tsc clean; full suite unchanged (no test for this page); build compiles, `/absen/consent` present, 26 routes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(employee)/absen/consent/page.tsx"
git commit -m "feat(consent): reskin consent screen to Card + Button + lucide MapPin"
```

---

## Task 3: `/cuti` + `leave-form.tsx`

**Files:**
- Modify: `src/app/(employee)/cuti/page.tsx`, `src/app/(employee)/cuti/leave-form.tsx`, `src/app/(employee)/cuti/leave-form.test.tsx`

**Interfaces:**
- Consumes: `Card, CardContent`, `Alert, AlertDescription`, `EmptyState`, `Field`, `NativeSelect`, `Input`, `Textarea` (`@/components/ui/textarea`), `Button`, `CalendarDays` (`lucide-react`), `LeaveStatusBadge` + `type LeaveStatus` (existing).

- [ ] **Step 1: Reskin `cuti/page.tsx`**

Keep the guard, `leave_requests` query, the `error` log, `formatDate` **verbatim**. Replace the returned JSX:

```tsx
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pt-8">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-foreground">Ajukan Cuti</h1>
        <LeaveForm submitLeave={submitLeave} />
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Riwayat Pengajuan</h2>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>Gagal memuat riwayat cuti. Silakan muat ulang halaman.</AlertDescription>
          </Alert>
        ) : requests.length === 0 ? (
          <EmptyState icon={CalendarDays} message="Belum ada pengajuan cuti." />
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((row) => (
              <li key={row.id}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(row.tanggal_mulai)} &ndash; {formatDate(row.tanggal_selesai)}
                      </span>
                      <LeaveStatusBadge status={row.status as LeaveStatus} />
                    </div>
                    {row.catatan_approval && (
                      <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">
                        {row.catatan_approval}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
```

Imports: `Card, CardContent` from `@/components/ui/card`; `Alert, AlertDescription` from `@/components/ui/alert`; `EmptyState` from `@/components/empty-state`; `CalendarDays` from `lucide-react`. (`LeaveStatusBadge` + `LeaveStatus` already imported.)

- [ ] **Step 2: Reskin `leave-form.tsx`**

Keep `"use client"`, `useState` (`error`, `success`, `submitting`), `handleSubmit`, the `JENIS_OPTIONS` array, the `ActionResult` type **verbatim**. Delete the local `inputClasses` const. New imports + body:

```tsx
"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

const JENIS_OPTIONS = [
  // ... unchanged ...
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
    <Card>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <Field id="jenis" label="Jenis Cuti">
            <NativeSelect name="jenis" required>
              {JENIS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="tanggalMulai" label="Tanggal Mulai">
            <Input name="tanggalMulai" type="date" />
          </Field>
          <Field id="tanggalSelesai" label="Tanggal Selesai">
            <Input name="tanggalSelesai" type="date" />
          </Field>
          <Field id="alasan" label="Alasan">
            <Textarea name="alasan" rows={3} />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>Pengajuan cuti berhasil dikirim.</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            Ajukan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Retarget `leave-form.test.tsx`**

Run `npm test -- leave-form`. 3 cases: jenis/date/alasan fields present (`getByLabelText(/jenis cuti|tanggal mulai|tanggal selesai|alasan/i)`); `submitLeave` called with FormData on submit (`getByRole("button", { name: /ajukan/i })`); error on `{ ok: false }`. `<Field>` clones `id` onto the child; labels unchanged → `getByLabelText` works. `name` attrs preserved. The error `<Alert>` — `getByText` still finds it. Keep every assertion; fix only a genuinely broken selector.

- [ ] **Step 4: Verify**

```bash
npm test -- leave-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 3 tests pass; tsc clean; build compiles, `/cuti` present, 26 routes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/cuti/"
git commit -m "feat(cuti): reskin page + leave form to shadcn Field/Card/Alert"
```

---

## Task 4: `/riwayat` + `history-list.tsx`

**Files:**
- Modify: `src/app/(employee)/riwayat/page.tsx`, `src/app/(employee)/riwayat/history-list.tsx`, `src/app/(employee)/riwayat/history-list.test.tsx`

**Interfaces:**
- Consumes: `Card, CardContent`, `EmptyState`, `ClipboardList` (`lucide-react`), `AttendanceStatusBadge` (existing).

- [ ] **Step 1: Reskin `riwayat/page.tsx`**

Keep the guard, `attendances` query, `records` mapping **verbatim**. `<h1 className="mb-4 text-2xl font-semibold text-foreground">Riwayat Absensi</h1>` (the only change: `text-neutral-900` → `text-foreground`).

- [ ] **Step 2: Reskin `history-list.tsx`**

Keep the `formatTime` / `formatDate` helpers **and their full timezone comment** verbatim, and the `AttendanceRecord` type. Replace the returned JSX:

```tsx
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AttendanceStatus } from "@/lib/attendance/status";

// ... AttendanceRecord type + formatTime (with its comment) + formatDate unchanged ...

export function HistoryList({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return <EmptyState icon={ClipboardList} message="Belum ada riwayat absensi." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {records.map((record) => (
        <li key={record.tanggal}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{formatDate(record.tanggal)}</span>
                <AttendanceStatusBadge status={record.status} />
              </div>
              <span className="text-sm text-muted-foreground">
                {formatTime(record.jamMasuk)} – {formatTime(record.jamPulang)}
              </span>
              {record.catatan && (
                <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">
                  {record.catatan}
                </p>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
```

**Keep the `–` (en-dash) between the two `formatTime` calls** — the timezone test asserts `getByText("09.00 – 17.00")` as one node.

- [ ] **Step 3: Retarget `history-list.test.tsx`**

Run `npm test -- history-list`. 4 cases: empty state (`getByText(/belum ada riwayat absensi/i)`); one row per record with badge (`getByText("Tepat Waktu")` / `"Terlambat"`); **times in Asia/Jakarta** (`getByText("09.00 – 17.00")` — the `<span>` still renders the full string as one text node); `catatan` shown. All `getByText` selectors keep working inside `<Card>`. Keep every assertion, especially the timezone one.

- [ ] **Step 4: Verify**

```bash
npm test -- history-list && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 4 tests pass; tsc clean; build compiles, `/riwayat` present, 26 routes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/riwayat/"
git commit -m "feat(riwayat): reskin history list to Card + EmptyState"
```

---

## Task 5: `/slip-gaji`

**Files:**
- Modify: `src/app/(employee)/slip-gaji/page.tsx`

**Interfaces:**
- Consumes: `Alert, AlertDescription`, `EmptyState`, `Button` (`@/components/ui/button`), `Download, ReceiptText` (`lucide-react`), `formatRupiah`, `monthLabel` (existing imports).

- [ ] **Step 1: Reskin the returned JSX**

Keep the guard, the `payslips!inner` query + its comment, the `error` log, and the JS `sort` + its `created_at` comment **verbatim**. Replace only the `return (...)`:

```tsx
  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pt-8">
      <h1 className="text-2xl font-semibold text-foreground">Slip Gaji</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat slip gaji.</AlertDescription>
        </Alert>
      )}
      {!error && rows.length === 0 && (
        <EmptyState icon={ReceiptText} message="Belum ada slip gaji yang difinalisasi." />
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((s) => {
            const p = s.payroll_periods as unknown as { bulan: number; tahun: number };
            return (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {monthLabel(p.bulan)} {p.tahun}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatRupiah(Number(s.gaji_akhir))}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={`/slip-gaji/${s.id}/pdf`}>
                    <Download className="size-4" /> Unduh PDF
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
```

Imports: `Alert, AlertDescription` from `@/components/ui/alert`; `EmptyState` from `@/components/empty-state`; `Button` from `@/components/ui/button`; `Download, ReceiptText` from `lucide-react`. Wrap the list in `{rows.length > 0 && (...)}` (the old code rendered an empty `<ul>` — the new empty-state handles it, so guard the `<ul>`).

- [ ] **Step 2: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: tsc clean; full suite unchanged; build compiles, `/slip-gaji` present, 26 routes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(employee)/slip-gaji/page.tsx"
git commit -m "feat(slip-gaji): reskin list to tokens + shadcn Button/EmptyState"
```

---

## Task 6: Legacy-class guard — `src/no-legacy-classes.test.ts`

**Files:**
- Create: `src/no-legacy-classes.test.ts`

**Interfaces:** none — test-only.

- [ ] **Step 1: Confirm the ground is clean first**

```bash
grep -rn "text-neutral-\|bg-neutral-\|border-neutral-\|divide-neutral-\|bg-white\|bg-blue-\|text-blue-\|text-red-600\|text-green-6\|bg-red-50\|border-red-200\|bg-green-50\|border-green-200" src/app | grep -v "\.test\."
```

Expected: **only** `src/app/(admin)/pengaturan/instansi/brand-preview.tsx` lines. If any `(employee)` file still matches, Tasks 1–5 aren't done — STOP and report.

- [ ] **Step 2: Write the test**

```ts
// src/no-legacy-classes.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "src", "app");

// Deliberate exception: brand-preview.tsx renders literal light/dark preview
// swatches (bg-white + `dark bg-neutral-950`) so a super_admin sees their accent
// on both backgrounds regardless of the current theme.
const ALLOWLIST = new Set(["(admin)/pengaturan/instansi/brand-preview.tsx"]);

const BANNED: [RegExp, string][] = [
  [/\btext-neutral-[3-9]00\b/, "text-neutral-[3-9]00"],
  [/\bbg-neutral-\d/, "bg-neutral-*"],
  [/\bborder-neutral-\d/, "border-neutral-*"],
  [/\bdivide-neutral-\d/, "divide-neutral-*"],
  [/\bbg-white\b/, "bg-white"],
  [/\bbg-blue-\d/, "bg-blue-*"],
  [/\btext-blue-\d/, "text-blue-*"],
  [/\bhover:(?:bg|border)-blue-\d/, "hover:*-blue-*"],
  [/\btext-red-[56]00\b/, "text-red-[56]00"],
  [/\btext-green-[56]00\b/, "text-green-[56]00"],
  [/\bbg-(?:red|green|amber|blue)-50\b/, "bg-<color>-50"],
  [/\bborder-(?:red|green|amber|blue)-200\b/, "border-<color>-200"],
];

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(abs, r));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(r);
  }
  return out;
}

describe("no legacy Tailwind classes in src/app", () => {
  const files = walk(APP_DIR);

  it("has no banned class in any non-test file", () => {
    const violations: string[] = [];
    for (const rel of files) {
      if (ALLOWLIST.has(rel)) continue;
      const lines = readFileSync(join(APP_DIR, rel), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const [re, name] of BANNED) {
          if (re.test(line)) violations.push(`src/app/${rel}:${i + 1} — matched "${name}"`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("keeps the allowlist minimal — every allowlisted file still needs it", () => {
    for (const rel of ALLOWLIST) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      expect(
        BANNED.some(([re]) => re.test(src)),
        `${rel} no longer needs allowlisting — remove it from ALLOWLIST`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run — expect GREEN**

```bash
npm test -- no-legacy-classes
```

Expected: 2 tests PASS. If the first fails, it prints the exact `file:line` — fix those files (they should all be `(employee)` files Tasks 1–5 missed) and re-run. If the second fails, `brand-preview.tsx` no longer has a match — remove it from `ALLOWLIST`.

- [ ] **Step 4: Commit**

```bash
git add src/no-legacy-classes.test.ts
git commit -m "test: guard against legacy Tailwind classes creeping into src/app"
```

---

## Task 7: Delete the legacy neutral scale

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Confirm zero remaining consumers**

```bash
grep -rn "text-neutral-[0-9]\|bg-neutral-[1-9]\|border-neutral-[0-9]\|divide-neutral-[0-9]" src/ | grep -v "\.test\." | grep -v "brand-preview"
```

Expected: **nothing** (the `no-legacy-classes` test also enforces this for `src/app`; `src/components` — grep it too, expect nothing). If anything remains, STOP.

- [ ] **Step 2: Delete the block**

In `src/app/globals.css`, remove the entire block (comment + `:root { … }`):

```css
/* --- Legacy neutral scale. Still referenced by admin/employee page BODIES not
   yet redesigned (SP4/SP5). Delete each var when its last `*-color-neutral-*`
   usage in src/ is gone. Do not add new usages. --- */
:root {
  --color-neutral-50: #f8fafc;
  --color-neutral-100: #f1f5f9;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-500: #64748b;
  --color-neutral-700: #334155;
  --color-neutral-900: #0f172a;
}
```

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: tsc clean; full suite green; build compiles, 26 routes. (Tailwind v4 no longer resolves `neutral-*` to a custom var, but nothing uses those classes now — `brand-preview.tsx`'s `bg-neutral-950` uses Tailwind's built-in default palette, unaffected.)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "chore(css): delete the unused legacy --color-neutral-* scale"
```

---

## Task 8: `AttendanceTrendChart` dark-aware chrome

**Files:**
- Modify: `src/app/globals.css`, `src/components/attendance-trend-chart.tsx`

- [ ] **Step 1: Add the chart vars to `globals.css`**

In the `:root { … }` shadcn token block, add (keeping the current light hexes):

```css
  --chart-grid: #e1e0d9;
  --chart-axis: #898781;
  --chart-dot-halo: #fcfcfb;
```

In the `.dark { … }` block, add:

```css
  --chart-grid: oklch(1 0 0 / 12%);
  --chart-axis: oklch(0.708 0 0);
  --chart-dot-halo: oklch(0.205 0 0);
```

- [ ] **Step 2: Swap the hard-coded chrome in the chart**

In `src/components/attendance-trend-chart.tsx`:
- `const COLOR_GRID = "#e1e0d9";` → `const COLOR_GRID = "var(--chart-grid)";`
- `const COLOR_AXIS = "#898781";` → `const COLOR_AXIS = "var(--chart-axis)";`
- Both `<Line … dot={{ r: 4, fill: COLOR_X, strokeWidth: 2, stroke: "#fcfcfb" }} />` → `stroke: "var(--chart-dot-halo)"`.
- `<Tooltip contentStyle={{ borderRadius: 8, ... }} />` → set `contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}` and add `labelStyle={{ color: "var(--foreground)" }}` (keep any existing `itemStyle` / other props; just fix the colors).
- `<Legend … />` → add `wrapperStyle={{ color: "var(--muted-foreground)", fontSize: 12 }}` (merge with any existing `wrapperStyle`).
- **Do NOT change** `COLOR_HADIR` (`#2a78d6`) or `COLOR_TERLAMBAT` (`#eb6834`) — dataviz-validated for both themes.

Keep the "Colors follow the dataviz skill's validated categorical palette" comment; add one line noting the chrome vars are theme-reactive via CSS custom properties.

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: tsc clean; full suite green (no chart test — recharts needs layout jsdom lacks); build compiles, 26 routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/attendance-trend-chart.tsx
git commit -m "feat(chart): dark-aware grid/axis/tooltip via CSS custom properties"
```

---

## Task 9: The theme flip — provider + re-mount `<ThemeToggle>`

**Files:**
- Modify: `src/components/theme-provider.tsx`, `src/components/admin-shell.tsx`, `src/components/employee-shell.tsx`, `src/app/(account)/profil/page.tsx`, `src/components/admin-shell.test.tsx`, `src/components/employee-shell.test.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` (`@/components/theme-toggle`) — `() => JSX.Element`, `size="icon"` `<Button aria-label="Ubah tema">` + a light/dark/system `<DropdownMenu>`.

- [ ] **Step 1: Rewrite `theme-provider.tsx`**

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

Drop `forcedTheme` + `defaultTheme="light"` + `enableSystem={false}` + the SP2 comment.

- [ ] **Step 2: Re-mount in `admin-shell.tsx`**

Restore `import { ThemeToggle } from "@/components/theme-toggle";`. In the topbar right-side group:

```tsx
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu employee={employee} avatarUrl={avatarUrl} />
          </div>
```

- [ ] **Step 3: Re-mount in `employee-shell.tsx`**

Restore `import { ThemeToggle } from "@/components/theme-toggle";`. Change the header:

```tsx
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        {brand}
        <ThemeToggle />
      </header>
```

(`justify-start` → `justify-between`.)

- [ ] **Step 4: Add a `<ThemeToggle>` row to `/profil`**

In `src/app/(account)/profil/page.tsx`, add — just before or after the `<SignOutButton>` block:

```tsx
      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-foreground">Tema</span>
        <ThemeToggle />
      </div>
```

Import `ThemeToggle` from `@/components/theme-toggle`. (`profil/page.tsx` is a server component — `ThemeToggle` is a client component, which renders fine as a child of a server component.)

- [ ] **Step 5: Re-add the shell test assertions**

`admin-shell.test.tsx` — SP2's fix-wave removed the theme mock + assertion. At the top with the other `vi.mock`s:

```tsx
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button aria-label="Ubah tema">tema</button>,
}));
```

Add a case inside `describe("AdminShell", …)`:

```tsx
it("renders the theme toggle in the topbar", () => {
  renderShell("hr_admin");
  expect(screen.getByRole("button", { name: /ubah tema/i })).toBeInTheDocument();
});
```

`employee-shell.test.tsx` — same `vi.mock` + a case (adapt to the file's `renderShell` helper):

```tsx
it("renders the theme toggle in the header", () => {
  renderShell();
  expect(screen.getByRole("button", { name: /ubah tema/i })).toBeInTheDocument();
});
```

Keep every existing assertion in both files.

- [ ] **Step 6: Verify**

```bash
npm test && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: full suite green (+2 shell cases); `theme-toggle.test.tsx` still passes (it mocks `next-themes` itself); tsc clean; build 26 routes.

- [ ] **Step 7: Commit**

```bash
git add src/components/theme-provider.tsx src/components/admin-shell.tsx src/components/employee-shell.tsx src/components/admin-shell.test.tsx src/components/employee-shell.test.tsx "src/app/(account)/profil/page.tsx"
git commit -m "feat(theme): enable system dark mode + re-mount ThemeToggle (shells + profil)"
```

---

## Task 10: Full light + dark smoke gate

**Files:** none (verification task — produces a documented pass).

- [ ] **Step 1: Full automated gate**

```bash
npm test                     # all green
./node_modules/.bin/tsc --noEmit
npm run build                # 26 routes
grep -rn "text-neutral-\|bg-neutral-[1-9]\|border-neutral-\|divide-neutral-\|bg-white\|bg-blue-\|text-blue-\|text-red-600\|text-green-6" src/app | grep -v "\.test\." | grep -v "brand-preview"
#   ^ expect ZERO matches
```

- [ ] **Step 2: Dark-mode dev smoke**

`npm run dev`, set the OS appearance to **dark** (or use the `<ThemeToggle>` → "Gelap"). Log in and load every route, confirming: no invisible text (dark text on dark), no white flashes on navigation, readable contrast on cards/badges/alerts, the trend chart's grid + axis + tooltip legible, form inputs visible.

Routes:
```
/  /login  /set-password
/dashboard  /karyawan  /karyawan/[id]  /karyawan/baru  /persetujuan-cuti  /laporan
/payroll  /payroll/[periodId]
/pengaturan  /pengaturan/instansi  /pengaturan/departemen  /pengaturan/jadwal  /pengaturan/libur  /pengaturan/audit
/profil
/absen  /absen/consent  /cuti  /riwayat  /slip-gaji
```

- [ ] **Step 3: Light-mode dev smoke**

Switch to **light** (`<ThemeToggle>` → "Terang") and re-load the same routes — confirm no regression from the pre-SP5 look (the redesigned pages should be visually identical; the 8 SP5 pages should now match the design system).

- [ ] **Step 4: Toggle behavior**

On `/dashboard` (admin) and `/absen` (employee): open the `<ThemeToggle>`, switch Terang ↔ Gelap ↔ Sistem — the whole page re-themes with no flash, and the choice persists across a reload.

- [ ] **Step 5: Record the result**

Write the smoke outcome (per-route: OK / issue) to `.superpowers/sdd/sp5-smoke.md`. If any route has a dark-mode contrast issue, fix it (token swap) and re-smoke that route before committing.

- [ ] **Step 6: Commit (only if Step 5 fixed anything)**

```bash
git add -A
git commit -m "fix(dark): <route> contrast fixes from the SP5 smoke"
```

If the smoke was clean, no commit — just note it in the final report.

---

## Post-plan verification

```bash
npm test                       # green (retargeted employee tests + no-legacy-classes + 2 shell cases)
./node_modules/.bin/tsc --noEmit
npm run build                  # 26 routes
```

Then the final whole-branch review, then `finishing-a-development-branch`.

## Hand-off — the redesign initiative is complete after SP5

- **Still open (SP4a-deferred, never in SP5's scope):** `getTodaySummary.cuti` + `getBranchBreakdown` not filtered to `employees.status = 'aktif'`; the branch-scoped `cuti` path has no test with real leave rows; `initials()` is duplicated between `profil-form.tsx` and `karyawan/page.tsx` (hoist to `src/lib/utils.ts` when either is next touched); the dashboard's org-wide Alpa tile still counts everyone on a company-wide non-working day.
- **RSC-boundary reminder (SP4b finding):** any `action={() => serverAction()}` / function prop crossing a server→client boundary must be a server reference (`.bind()` of a `"use server"` action) — a plain closure throws at render and `tsc` / `build` / unit tests don't catch it.
- After SP5: every page on the shadcn design system, dark mode live with a user toggle, legacy `--color-neutral-*` deleted, `no-legacy-classes.test.ts` guarding regression.
