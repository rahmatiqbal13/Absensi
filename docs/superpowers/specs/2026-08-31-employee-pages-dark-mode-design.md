# Employee Pages + Dark Mode — Redesign (SP5, final)

## Goal

Two things, in this order:

**(a) Reskin the 5 employee pages** — `/absen` (+ `clock-panel`), `/absen/consent`, `/cuti` (+ `leave-form`), `/riwayat` (+ `history-list`), `/slip-gaji` — onto the SP1 shadcn/token design system, reusing the SP4a/SP4b kit. These are the last pages in `src/app` still on legacy `text-neutral-*` / `bg-white` / `bg-blue-*` classes and hand-rolled inline SVGs.

**(b) Retire the dark-mode debt** — once every page body is token-based: delete the now-unused `--color-neutral-*` block from `globals.css`, flip `theme-provider.tsx` from `forcedTheme="light"` back to `system` + re-mount `<ThemeToggle>` (AdminShell topbar, EmployeeShell header, `/profil`), give `AttendanceTrendChart` dark-aware grid/axis colors, add a Vitest guard against new legacy classes in `src/app`, and run a full dark-mode smoke of every route.

This is **sub-project 5 of 5** — the final one. SP1/SP2/SP3/SP4a/SP4b are complete. After SP5, every page is on the design system, dark mode is live, and a regression guard is in place.

## Non-goals

- Any server-action, RLS, payroll-calc, or data-model change. **Pure presentation** + one config flip + one CSS deletion. No new backend code, no migrations.
- The SP4a-deferred dashboard-lib items (`status = 'aktif'` filter on `getTodaySummary.cuti` / `getBranchBreakdown`, org-wide non-working-day check for the Alpa tile, `initials()` hoist to `src/lib/utils.ts`) — still open; noted in the hand-off, not fixed here.
- `brand-preview.tsx` — its `bg-white` (light swatch) + `dark bg-neutral-950` (dark swatch) are **deliberate literal preview surfaces** so a super_admin sees their accent colour on both a light and a dark background regardless of the current theme. Do not touch it. `neutral-950` is a Tailwind built-in, not one of the legacy `--color-neutral-*` vars.
- The custom recharts data-line colours in `AttendanceTrendChart` (`#2a78d6` blue, `#eb6834` orange) — the dataviz skill validated them for **both** themes; only the chart *chrome* (grid, axis, dot halo, tooltip) changes.

## Tech context

- Next.js 16.3 App Router (`searchParams` / `params` are Promises), React 19.2, TypeScript strict, Tailwind v4, shadcn/ui (`radix-nova`), `lucide-react`, `recharts`, `next-themes`, Supabase cloud.
- shadcn primitives in `src/components/ui/`: `card`, `table`, `tabs`, `select`, `input`, `label`, `textarea`, `checkbox`, `badge`, `button`, `separator`, `skeleton`, `alert` (variants `default` / `destructive` / `warning`), `alert-dialog`, `dropdown-menu`, `dialog`, `avatar`, `tooltip`, `popover`, `sheet`, `sonner`.
- SP4a/SP4b shared components (`src/components/`): `PageHeader`, `EmptyState` (`{ icon: LucideIcon, message, action? }`), `Field` (clones a single valid-element child → `id` / `aria-describedby` / `aria-invalid`; renders `<div className="space-y-1.5"><Label htmlFor={id}>…</Label>{child}</div>`), `NativeSelect` (styled `<select>`, forwardRef, keeps `FormData` + `fireEvent.change` working), `FilterBar`, `ResponsiveTable`, `StatusPill`, `ConfirmDeleteButton`, `AttendanceStatusBadge`, `LeaveStatusBadge`, `PayrollStatusBadge`, `RoleBadge`, `AuditAksiBadge`, `AttendanceTrendChart`, `ThemeToggle` (built in SP2, currently unmounted — `size="icon"` `<Button>` + light/dark/system `<DropdownMenu>`, `aria-label="Ubah tema"`).
- `theme-provider.tsx` is currently `defaultTheme="light" forcedTheme="light" enableSystem={false}` (SP2 fix-wave, pending this task).
- `globals.css`: shadcn token layer at `:root` + `.dark` (oklch), `@theme inline` map, `@custom-variant dark (&:is(.dark *))`. The legacy `--color-brand*` / `--radius-card` / `--shadow-card` / `--radius-control` vars are **already gone** (SP2–SP4). Only remaining legacy: a `/* --- Legacy neutral scale --- */` `:root { --color-neutral-50 … --color-neutral-900 }` block (7 vars: 50/100/200/300/500/700/900), consumed **only** by the 8 employee files this SP reskins.
- `getCurrentEmployee(db)` → `{ id, nama, email, role, branchId, fotoPath } | null`, wrapped in React `cache()`.
- Formatters: `formatRupiah` (`@/lib/format/rupiah`), `monthLabel` (`@/lib/format/month`).
- `<html suppressHydrationWarning>` is already in `layout.tsx`.
- Unit tests: Vitest + Testing Library (`npm test` = `vitest run src/`). `./node_modules/.bin/tsc --noEmit` — never `npx tsc`. `npm run build` currently 26 routes; SP5 keeps 26 (no route paths change).

## Global constraints

- **No server-action / RLS / payroll-calc / data-model change. No migrations.** Every page keeps its auth guard + query + inline server-action wiring verbatim — only the returned JSX (and, for client components, only the render tree) changes.
- **Never render raw Postgres/PostgREST error text.** The existing pages already return fixed Indonesian strings — keep them, move them into `<Alert>`. `consent/page.tsx`'s `ERROR_MESSAGES` map (attacker-param-safe) stays exactly as is.
- **Semantic + `dark:`-ready utilities only** in new/touched code: `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `bg-primary/5`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `text-primary`, `border-border`, `border-input`, `divide-border`, `ring-foreground/10`. Success/positive accents: `text-emerald-600 dark:text-emerald-500`. **Never** `bg-white`, `bg-neutral-*`, `text-neutral-*`, `bg-blue-*`, `text-blue-*`, `border-neutral-*`, `divide-neutral-*`, `text-red-600`, `text-green-*`, `bg-red-50`, `border-red-200`, `bg-green-50`, `border-green-200`, `hover:border-blue-*`, `hover:bg-blue-*`, and the arbitrary `shadow-[0_1px_2px_rgba(15,23,42,…)]` values (use `<Card>`'s own `ring-1 ring-foreground/10`).
- Icons: `lucide-react` only. Never emoji. **Every hand-rolled inline `<svg>` in the 8 employee files is replaced with a lucide component.**
- Indonesian UI copy. `lang="id"`.
- `<Card>` = `bg-card ring-1 ring-foreground/10 rounded-xl` + `[--card-spacing:--spacing(4)]`; `size="sm"` → `--spacing(3)`.
- Current unit suite: 436 green. Must stay green at every commit; `tsc` clean; `npm run build` 26 routes.

---

## 1. `/absen` + `clock-panel.tsx`

### 1.1 `src/app/(employee)/absen/page.tsx`

Keep the guard, `hasActiveConsent` check + `redirect("/absen/consent")`, the `attendances` query, `todaysAttendance` mapping, and `formattedToday` verbatim. Replace only the header markup:

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

### 1.2 `src/app/(employee)/absen/clock-panel.tsx`

Keep `"use client"`, all state (`error`, `submitting`, `photo`), `getPosition`, `handleClock`, the `ActionResult` / `TodaysAttendance` types verbatim. Reskin the render tree:

- Imports: `Card, CardContent` from `@/components/ui/card`; `Button` from `@/components/ui/button`; `Alert, AlertDescription` from `@/components/ui/alert`; `Camera, CheckCircle2` from `lucide-react`; `cn` from `@/lib/utils` (for the conditional Camera colour).
- **Done state** (`todaysAttendance?.jamPulang`): `<Card><CardContent className="flex flex-col items-center gap-3 py-8 text-center">` — `<CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />` (replaces the inline check SVG), `<p className="text-base font-medium text-foreground">Absensi hari ini selesai.</p>`, `<AttendanceStatusBadge status={todaysAttendance.status} />`.
- **Clocked-in state** (`todaysAttendance?.jamMasuk`): `<Card><CardContent className="flex flex-col items-center gap-5 py-6">` — `<AttendanceStatusBadge>` + `<PhotoCaptureButton label="Absen Pulang" … />` + `{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}`.
- **Not-clocked-in state**: same `<Card>` with `<PhotoCaptureButton label="Absen Masuk" … />` + the error `<Alert>`.
- **`PhotoCaptureButton`** — keep the props + the hidden `<input type="file" accept="image/*" capture="user" aria-label="Foto selfie">` (unchanged — the tests depend on `aria-label="Foto selfie"`). Reskin:
  - the drop-zone `<label>` → `relative flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5`
  - the camera SVG → `<Camera className={cn("size-6", photo ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground")} aria-hidden="true" />`
  - the filename `<span className="text-sm font-medium text-foreground">{photo ? photo.name : "Ambil foto selfie"}</span>`
  - the submit → `<Button type="button" size="lg" disabled={disabled || !photo} onClick={onSubmit} className="min-h-16 w-full text-lg">{label}</Button>` (keeps the oversized touch target; `<Button>`'s `disabled:` styling replaces the hand-rolled `disabled:bg-neutral-300`)

**Test** (`clock-panel.test.tsx`, 6 cases) — retarget selectors. The 6 cases assert: Clock-In button present (no record); Clock-Out button + status once clocked in; completed state; geolocation captured + `submitClockIn` called on "Absen Masuk"; submit disabled until a photo is selected; error shown on `{ ok: false }`. Button text ("Absen Masuk" / "Absen Pulang"), `aria-label="Foto selfie"`, and the `navigator.geolocation` mock are unchanged. The error is now in `<Alert>` — `getByText` still works. Keep every assertion; fix only a selector that genuinely breaks (`getByRole("button", { name: /absen masuk/i })` still resolves).

---

## 2. `/absen/consent` — `src/app/(employee)/absen/consent/page.tsx`

Self-contained full-screen page (outside both shells). Keep the `ERROR_MESSAGES` map + its security comment + the `searchParams` handling + `acceptConsent` import verbatim.

```tsx
import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { acceptConsent } from "./actions";

// ... ERROR_MESSAGES + comment unchanged ...

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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
            <Button type="submit" size="lg" className="w-full">Saya Setuju</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

No test file for this page — covered by `npm run build` + the light + dark smoke.

---

## 3. `/cuti` + `leave-form.tsx`

### 3.1 `src/app/(employee)/cuti/page.tsx`

Keep the guard, `leave_requests` query, the `error` log, and `formatDate` verbatim. Replace the JSX:

- `<main className="mx-auto max-w-md space-y-6 p-4 pt-8">` stays.
- `<h1 className="text-2xl font-semibold text-foreground">Ajukan Cuti</h1>` + `<LeaveForm submitLeave={submitLeave} />`.
- `<h2 className="text-lg font-semibold text-foreground">Riwayat Pengajuan</h2>`.
- `error` → `<Alert variant="destructive"><AlertDescription>Gagal memuat riwayat cuti. Silakan muat ulang halaman.</AlertDescription></Alert>`.
- `requests.length === 0` → `<EmptyState icon={CalendarDays} message="Belum ada pengajuan cuti." />`.
- else `<ul className="flex flex-col gap-2">` of `<li key={row.id}>` → `<Card size="sm"><CardContent className="flex flex-col gap-1.5">`: a row with `<span className="text-sm font-medium text-foreground">{formatDate(row.tanggal_mulai)} – {formatDate(row.tanggal_selesai)}</span>` + `<LeaveStatusBadge status={row.status as LeaveStatus} />`; then `{row.catatan_approval && <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">{row.catatan_approval}</p>}`.

Imports: `Card, CardContent`; `Alert, AlertDescription`; `EmptyState`; `CalendarDays` from `lucide-react`.

### 3.2 `src/app/(employee)/cuti/leave-form.tsx`

Keep `"use client"`, all state + `handleSubmit` + the `JENIS_OPTIONS` array verbatim. Replace the JSX (drop the local `inputClasses` const):

- Wrap in `<Card><CardContent><form action={handleSubmit} className="space-y-4">`.
- `<Field id="jenis" label="Jenis Cuti"><NativeSelect name="jenis" required>{JENIS_OPTIONS.map(...)}</NativeSelect></Field>`.
- `<Field id="tanggalMulai" label="Tanggal Mulai"><Input name="tanggalMulai" type="date" /></Field>` (+ `tanggalSelesai` "Tanggal Selesai").
- `<Field id="alasan" label="Alasan"><Textarea name="alasan" rows={3} /></Field>`.
- error → `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`; success → `<Alert><AlertDescription>{success message}</AlertDescription></Alert>` (keep whatever the current success text is).
- `<Button type="submit" disabled={submitting} className="w-full">{submitting ? "Mengirim…" : "Ajukan Cuti"}</Button>` (keep the current label; `<Button>`'s `disabled:` replaces the hand-rolled disabled styling).

Imports: `Field`; `NativeSelect`; `Input`; `Textarea` from `@/components/ui/textarea`; `Button`; `Alert, AlertDescription`; `Card, CardContent`.

**Test** (`leave-form.test.tsx`, 3 cases) — retarget. Asserts: jenis/date/alasan fields present (`getByLabelText`); `submitLeave` called with FormData on submit; error on `{ ok: false }`. Labels unchanged → `getByLabelText` works. `<Field>` + `<NativeSelect>` / `<Input>` / `<Textarea>` keep `name` + labels wired. Keep every assertion.

---

## 4. `/riwayat` + `history-list.tsx`

### 4.1 `src/app/(employee)/riwayat/page.tsx`

Keep the guard + `attendances` query + `records` mapping verbatim. `<h1 className="mb-4 text-2xl font-semibold text-foreground">Riwayat Absensi</h1>`.

### 4.2 `src/app/(employee)/riwayat/history-list.tsx`

Keep the `formatTime` / `formatDate` helpers **and their timezone comment** verbatim. Replace the JSX:

- Empty → `<EmptyState icon={ClipboardList} message="Belum ada riwayat absensi." />`.
- `<ul className="flex flex-col gap-2">` of `<li key={record.tanggal}>` → `<Card size="sm"><CardContent className="flex flex-col gap-1.5">`:
  - row: `<span className="text-sm font-medium text-foreground">{formatDate(record.tanggal)}</span>` + `<AttendanceStatusBadge status={record.status} />`
  - `<span className="text-sm text-muted-foreground">{formatTime(record.jamMasuk)} – {formatTime(record.jamPulang)}</span>`
  - `{record.catatan && <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm text-muted-foreground">{record.catatan}</p>}`

Imports: `Card, CardContent`; `EmptyState`; `ClipboardList` from `lucide-react`.

**Test** (`history-list.test.tsx`, 4 cases) — retarget. Asserts: empty state; one row per record with date/times/badge; times in Asia/Jakarta (the timezone test); `catatan` shown when present. `getByText` on the date/time/catatan strings + the badge still work inside `<Card>`. Keep every assertion including the timezone one.

---

## 5. `/slip-gaji` — `src/app/(employee)/slip-gaji/page.tsx`

Keep the guard, the `payslips!inner` query + its comment, the `error` log, and the JS `sort` + its `created_at` comment verbatim. Replace the JSX:

- `<main className="mx-auto max-w-md space-y-4 p-4 pt-8">` stays. `<h1 className="text-2xl font-semibold text-foreground">Slip Gaji</h1>`.
- `error` → `<Alert variant="destructive"><AlertDescription>Gagal memuat slip gaji.</AlertDescription></Alert>`.
- `!error && rows.length === 0` → `<EmptyState icon={ReceiptText} message="Belum ada slip gaji yang difinalisasi." />`.
- `<ul className="divide-y divide-border">` of `<li key={s.id} className="flex items-center justify-between py-3">`:
  - `<div><p className="text-sm font-medium text-foreground">{monthLabel(p.bulan)} {p.tahun}</p><p className="text-sm text-muted-foreground">{formatRupiah(Number(s.gaji_akhir))}</p></div>`
  - `<Button asChild variant="outline" size="sm"><a href={\`/slip-gaji/${s.id}/pdf\`}><Download className="size-4" /> Unduh PDF</a></Button>` (plain `<a>` — file download)

Imports: `Alert, AlertDescription`; `EmptyState`; `Button` from `@/components/ui/button`; `Download, ReceiptText` from `lucide-react`.

No test file — covered by `npm run build` + smoke.

---

## 6. Legacy-class guard — `src/no-legacy-classes.test.ts`

A Vitest test (in `src/` so `npm test` runs it) that scans every `src/app/**/*.{tsx,ts}` (excluding `**/*.test.*`) for banned Tailwind class patterns and fails with `file:line — matched "<pattern>"`.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "src", "app");

// Deliberate exception: brand-preview.tsx renders literal light/dark preview
// swatches (bg-white + dark bg-neutral-950) so a super_admin sees their accent
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
  const files = walk(APP_DIR).filter((f) => /\.tsx?$/.test(f));

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
      expect(BANNED.some(([re]) => re.test(src)), `${rel} no longer needs allowlisting`).toBe(true);
    }
  });
});
```

(The `dark bg-neutral-950` in `brand-preview.tsx` matches `bg-neutral-\d` → the allowlist covers it and the second test keeps the entry honest.)

---

## 7. Delete the legacy neutral scale — `src/app/globals.css`

After Sections 1–6, `grep -rn "text-neutral-\|bg-neutral-\|border-neutral-\|divide-neutral-" src/ | grep -v "\.test\." | grep -v "brand-preview"` returns **nothing**. Delete the entire block:

```css
/* --- Legacy neutral scale. ... --- */
:root {
  --color-neutral-50: #f8fafc;
  ...
  --color-neutral-900: #0f172a;
}
```

`./node_modules/.bin/tsc --noEmit` + `npm run build` + a full route load confirms nothing regressed.

---

## 8. `AttendanceTrendChart` dark colours — `src/components/attendance-trend-chart.tsx` + `globals.css`

Add three vars to `globals.css`, in `:root` (keep the current light values) and `.dark`:

```css
/* :root */
  --chart-grid: #e1e0d9;
  --chart-axis: #898781;
  --chart-dot-halo: #fcfcfb;
/* .dark */
  --chart-grid: oklch(1 0 0 / 12%);
  --chart-axis: oklch(0.708 0 0);
  --chart-dot-halo: oklch(0.205 0 0);
```

In the chart component:
- `COLOR_GRID` const → `"var(--chart-grid)"`; `COLOR_AXIS` → `"var(--chart-axis)"`. Used as `<CartesianGrid stroke={...}>`, `<XAxis axisLine={{ stroke: COLOR_AXIS }} tick={{ fill: COLOR_AXIS }}>`, `<YAxis tick={{ fill: COLOR_AXIS }}>` — recharts passes these straight to SVG `stroke` / `fill` which accept `var()`, so they're theme-reactive with no JS.
- The two `<Line>` `dot` props' `stroke: "#fcfcfb"` → `stroke: "var(--chart-dot-halo)"`.
- `COLOR_HADIR` / `COLOR_TERLAMBAT` (`#2a78d6` / `#eb6834`) — **unchanged** (dataviz-validated for both themes).
- `<Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "0.5rem", color: "var(--popover-foreground)" }} labelStyle={{ color: "var(--foreground)" }} />`.
- `<Legend wrapperStyle={{ color: "var(--muted-foreground)", fontSize: 12 }} />`.

No test for the chart (it's a recharts wrapper — jsdom has no layout). Covered by the dark smoke.

---

## 9. The theme flip

### 9.1 `src/components/theme-provider.tsx`

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

Drop `forcedTheme` + `defaultTheme="light"` + `enableSystem={false}` + the SP2 comment. `<html suppressHydrationWarning>` stays.

### 9.2 Re-mount `<ThemeToggle>`

- **`src/components/admin-shell.tsx`** — in the topbar's right-side group (with `<UserMenu>`), before or after it: `<ThemeToggle />`. Restore the import.
- **`src/components/employee-shell.tsx`** — in the header, right of the brand: a `flex items-center` wrapper with `<ThemeToggle />` on the right (`ml-auto`). Restore the import.
- **`src/app/(account)/profil/page.tsx`** — a settings row in the identity area or below the sign-out: `<div className="flex items-center justify-between border-t border-border pt-4"><span className="text-sm text-foreground">Tema</span><ThemeToggle /></div>`.

### 9.3 Tests

- `theme-toggle.test.tsx` — already passes (doesn't depend on being mounted). No change.
- `admin-shell.test.tsx` — SP2's fix-wave removed the `vi.mock("@/components/theme-toggle")` + the "tema"/theme-button assertion. Re-add: mock the component to a stub (`vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>tema</button> }))`) and assert it renders. Keep every other assertion.
- `employee-shell.test.tsx` — same re-add.
- `profil-form.test.tsx` / `(account)/profil` — if the `/profil` page has a test, add a "renders a theme toggle row" assertion; otherwise covered by build + smoke.

---

## 10. Testing summary & dark-mode smoke

### 10.1 New / changed tests

| File | What |
| --- | --- |
| `src/no-legacy-classes.test.ts` | **new** — §6 |
| `clock-panel.test.tsx` | retarget to shadcn `<Button>` / `<Alert>` / lucide (6 cases kept) |
| `leave-form.test.tsx` | retarget to `<Field>` / `<NativeSelect>` / `<Textarea>` / `<Alert>` (3 cases kept) |
| `history-list.test.tsx` | retarget to `<Card>` (4 cases kept incl. the timezone test) |
| `admin-shell.test.tsx` / `employee-shell.test.tsx` | re-add the ThemeToggle stub + assertion (SP2 removed it) |
| `theme-toggle.test.tsx` | unchanged |

Server pages (`absen`, `absen/consent`, `riwayat`, `slip-gaji`, `cuti`) covered by `npm run build` + the smoke.

### 10.2 Compatibility gate

- `npm test` green (436 + `no-legacy-classes` + the re-added shell assertions), `./node_modules/.bin/tsc --noEmit` clean, `npm run build` = 26 routes.
- `grep -rn "text-neutral-\|bg-white\|bg-neutral-\|border-neutral-\|divide-neutral-\|bg-blue-\|text-blue-\|text-red-600\|text-green-6" src/app` → **no matches** except `brand-preview.tsx`.
- **Dark-mode smoke (the explicit gate)** — set the OS or the `<ThemeToggle>` to **dark**, then load **every** route and confirm no invisible text, no white flashes, readable contrast, and the trend chart's grid/axis/tooltip legible:
  `/`, `/login`, `/set-password`, `/dashboard`, `/karyawan`, `/karyawan/[id]`, `/karyawan/baru`, `/persetujuan-cuti`, `/laporan`, `/payroll`, `/payroll/[periodId]`, `/pengaturan`, `/pengaturan/instansi`, `/pengaturan/departemen`, `/pengaturan/jadwal`, `/pengaturan/libur`, `/pengaturan/audit`, `/profil`, `/absen`, `/absen/consent`, `/cuti`, `/riwayat`, `/slip-gaji`.
  Then repeat the pass in **light**.
- No visual regression on any already-redesigned page.

### 10.3 Hand-off (redesign initiative complete after SP5)

- **Still open (SP4a-deferred, not SP5's scope):** `getTodaySummary.cuti` + `getBranchBreakdown` not filtered to `employees.status = 'aktif'`; the branch-scoped `cuti` path has no test with real leave rows; `initials()` is duplicated between `profil-form.tsx` and `karyawan/page.tsx` (hoist to `src/lib/utils.ts` when either is next touched); the dashboard's org-wide Alpa tile still counts everyone on a company-wide non-working day.
- **RSC-boundary reminder:** any `action={() => serverAction()}` / function prop crossing a server→client boundary must be a server reference (`.bind()` of a `"use server"` action) — a plain closure throws at render and `tsc` / `build` / unit tests don't catch it (SP4b final-review finding).
- After SP5: every page on the shadcn design system, dark mode live with a user toggle, the legacy `--color-neutral-*` block deleted, and `no-legacy-classes.test.ts` guarding against regression. The branding/redesign initiative is done.
