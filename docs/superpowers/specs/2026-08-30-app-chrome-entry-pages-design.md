# App Chrome + Entry Pages — Design

**Status:** Approved (brainstorming) — ready for implementation planning.

**This is sub-project 2 of the white-label branding + UI redesign initiative.** Revised decomposition:

| # | Sub-project | Depends on |
|---|---|---|
| 1 | Branding + Design System foundation (done — `docs/superpowers/specs/2026-08-28-branding-design-system-design.md`) | — |
| **2** | **App chrome + entry pages** (this spec) | 1 |
| 3 | Employee profile (`/profil` + `profile-photos` bucket + edit photo/phone) | 1, 2 |
| 4 | Admin pages redesign (dashboard, karyawan, persetujuan-cuti, laporan, payroll, pengaturan hub + sub-pages) | 1, 2 |
| 5 | Employee pages redesign (absen, consent, cuti, riwayat, slip-gaji) | 1, 2 |

`/profil` was split out of SP2 during brainstorming — it is a full feature slice (storage bucket, migration, RLS, two actions, signed-URL rendering, form) that depends on SP2's redesigned EmployeeShell and topbar pattern.

## Goal

Redesign the two app shells and the three entry pages onto the SP1 design system: branded, dark-aware, calm and professional. Give users a way to sign out. Put the org logo + name on the payslip and recap PDFs. Flip the theme provider back to `system` now that the shells are theme-aware, and clear the SP1 handoff minors that live in shell/token code.

## Non-goals (this sub-project)

- `/profil` and the `profile-photos` bucket — SP3.
- Any redesign of an admin or employee *page body* — SP4/SP5. SP2 only touches the shells (chrome), the 3 entry pages, and shared token/primitive files.
- Marketing content on the landing page beyond a branded panel + "Masuk" button.
- Changing auth flows, route-access rules, or server actions other than adding `signOut`.

## Visual direction

**Clean & calm.** Sidebar with icon + label, thin topbar, generous whitespace, accent used sparingly (active nav item, primary buttons), medium density, soft radius (shadcn `--radius`), subtle shadows. It is an internal work tool used for hours; legibility and quiet beat flash. During implementation each surface goes through the design skills (`impeccable`, `anti-ui-slop`, `ui-ux-pro-max`, `web-design-guidelines`) for the finish pass.

## Tech context

- Next.js 16.3, React 19.2, TypeScript strict, Tailwind v4, shadcn/ui (`radix-nova` preset — the CLI dropped `new-york`), `next-themes`, `lucide-react`, `sonner`, `@react-pdf/renderer` (existing).
- SP1 shipped: `app_settings` (single row) + `is_super_admin()` + `branding` bucket; `getAppSettings()` (`src/lib/branding/get-app-settings.ts`, cached, never throws except the deliberate `DYNAMIC_SERVER_USAGE` re-throw); `deriveAccent`/`accentWarning` (`src/lib/branding/accent.ts`); `CREDIT` constant (`src/lib/branding/credit.ts`); `<BrandStyle>` (accent injection, in `layout.tsx`); `<ThemeProvider>` (currently forced light — SP2 flips it); primitives `<Field>` `<PageHeader>` `<EmptyState>` `<BrandMark>` `<AppFooter>` `<ThemeToggle>`; the 4 status badges on shadcn `Badge`; `src/components/ui/*` (22 shadcn primitives). Migrations through `0028`.
- **Existing shells** (`src/components/admin-shell.tsx`, `employee-shell.tsx`): hand-rolled inline-SVG icons, hardcoded `"A"` monogram + `"Absensi HR"`, no dark support, AdminShell has NO mobile treatment (`w-60` sidebar always). `EmployeeShell` bottom nav has 5 items including `/profil` which does not exist.
- **Existing entry pages**: `src/app/page.tsx` is still the Next scaffold. `src/app/(auth)/login/page.tsx` (server component, `login` action, `?error`/`?reason`). `src/app/(auth)/set-password/page.tsx` (client, session-establishment `useEffect`, `SetPasswordForm`). No `(auth)/layout.tsx`.
- **Existing sign-out**: none user-facing. `login/actions.ts:26` calls `db.auth.signOut()` internally for cleanup only.
- **PDF**: `src/components/payslip-document.tsx`, `src/components/recap-document.tsx` — `@react-pdf/renderer`, `runtime = "nodejs"`. Routes: `src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx`, `src/app/(admin)/laporan/pdf/route.tsx`.
- `resolveRouteAccess(pathname, role)` in `src/lib/auth/route-access.ts` → `"allow" | "redirect-login" | "redirect-employee-home" | "redirect-admin-home"`.
- 327 unit tests green; `tsc --noEmit` clean; `npm run build` 25 routes. Must stay so.
- **Note carried from SP1 final review:** the shadcn base layer already shifted existing pages' visuals (universal `border-border` reset, `body` background → white, badge sizing). SP2's visual work builds on that; don't treat those as SP2 regressions.

---

## 1. `signOut` server action

**File:** `src/app/(auth)/actions.ts` (new)

```ts
"use server";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOut() {
  const db = await createServerSupabaseClient();
  await db.auth.signOut();
  redirect("/login");
}
```

**`<SignOutButton>`** — `src/components/sign-out-button.tsx`, client. Renders a shadcn `Button`/`DropdownMenuItem`-compatible trigger (accept a `variant` + `asChild`-ish `render` prop, or just two small components) that calls `signOut` inside a `useTransition` and shows a pending state. Used by the AdminShell user menu and (SP3) `/profil`.

**Tests:** `signOut` — mock `createServerSupabaseClient` + `next/navigation`; assert `auth.signOut()` called then `redirect("/login")`. `<SignOutButton>` — click → action invoked, button disabled while pending.

---

## 2. AdminShell redesign

**File:** `src/components/admin-shell.tsx` (rewrite) + `src/components/admin-shell.test.tsx` (update)

Layout: `<div class="flex min-h-screen bg-background text-foreground">` → sidebar + a `flex-1 flex-col` column holding topbar, `<main class="flex-1 …">`, `<AppFooter>`.

### 2.1 Sidebar

- Desktop (`md:` and up): `aside w-60 shrink-0 border-r border-border bg-card`, `flex-col`.
  - Top: `<BrandMark size="md" />` (SP1 component — logo or monogram + `namaSingkat`), `p-4`.
  - Nav: `lucide-react` icons + labels. Map: `/dashboard`→`LayoutDashboard`, `/karyawan`→`Users`, `/persetujuan-cuti`→`CalendarCheck`, `/laporan`→`BarChart3`, `/payroll`→`Wallet`, `/pengaturan`→`Settings`. Active (`pathname === href || startsWith(href + "/")`): `bg-primary/10 text-primary font-medium` + a `2px` left accent bar (`before:` pseudo or a positioned span). Inactive: `text-muted-foreground hover:bg-muted hover:text-foreground`. Min height 44px per item.
  - Role filter unchanged: items with `hrAdminOnly` shown only for `hr_admin` / `super_admin` (prop `role: Role | null`, same as today).
- Mobile (`< md:`): the `aside` is hidden; the same nav content renders inside a shadcn `<Sheet>` (side left), opened by a hamburger `<Button variant="ghost" size="icon">` in the topbar. The Sheet closes on nav-item click (`onOpenChange` / `SheetClose asChild` on each `<Link>`).

### 2.2 Topbar

`header h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur`, `flex items-center justify-between px-4`.
- Left: hamburger (`md:hidden`).
- Right: `<ThemeToggle />` then a **user menu** — shadcn `<DropdownMenu>` triggered by a `<Button variant="ghost">` containing a small `<Avatar>` (fallback = initials of `employee.nama`) + `employee.nama` (`hidden sm:inline`) + a `<RoleBadge role={employee.role} />`. Menu content: the employee's email (muted, non-interactive) + a `<DropdownMenuSeparator>` + **Keluar** (`<SignOutButton>` as a menu item, `LogOut` icon).
- The shell receives the full `employee` object (needs `nama`, `email`, `role`) — the `(admin)/layout.tsx` already loads `getCurrentEmployee`; pass it through instead of just `role`.

### 2.3 Content + footer

`<main class="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>` then `<AppFooter />`.

### 2.4 `(admin)/layout.tsx`

Pass `employee` (not just `role`) to `<AdminShell>`. Keep the existing defense-in-depth `resolveRouteAccess` redirect logic exactly.

### 2.5 Tests

- renders all nav items for `super_admin`; hides `hrAdminOnly` items for `atasan`.
- active item gets the active class for the current pathname.
- the user menu shows the name + role badge; clicking **Keluar** invokes `signOut` (mock the action).
- `<ThemeToggle>` is present.
- mobile: the hamburger opens the Sheet, a nav click closes it (use `userEvent` + fake the `md` breakpoint isn't needed — the Sheet trigger is always in the DOM; assert open/close state).

---

## 3. EmployeeShell redesign

**File:** `src/components/employee-shell.tsx` (rewrite) + `src/components/employee-shell.test.tsx` (update)

`<div class="flex min-h-screen flex-col bg-background text-foreground">`.

### 3.1 Header

`header class="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur"`:
- Left: `<BrandMark size="sm" />`.
- Right: `<ThemeToggle />`.

### 3.2 Content + footer

The bottom nav is `fixed bottom-0`. Content and footer scroll above it; a bottom pad keeps the last of them clear of the fixed nav:

```tsx
<div class="flex flex-1 flex-col pb-16">   {/* pb-16 ≈ bottom-nav height */}
  <main class="flex-1">{children}</main>
  <AppFooter />
</div>
```

### 3.3 Bottom nav

`nav class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"`.
- **Four** items (drop `/profil` — re-added in SP3): `/absen`→`Clock`, `/cuti`→`CalendarDays`, `/riwayat`→`ListChecks`, `/slip-gaji`→`FileText`.
- Each: `flex-1 flex-col items-center gap-1 py-2.5 text-xs min-h-14`, active `text-primary` (icon `strokeWidth` bump ok), inactive `text-muted-foreground`. Touch target ≥44px.

### 3.4 Tests

- renders the 4 nav items with labels; does NOT render a "Profil" item.
- active item is `text-primary` for the current pathname.
- header shows a brand element and the theme toggle.

---

## 4. Entry pages

### 4.1 `(auth)/layout.tsx` (new)

A shared branded frame for `/login` and `/set-password`:

```tsx
// server component
<main class="flex min-h-screen flex-col items-center justify-center bg-background p-6">
  <div class="w-full max-w-sm space-y-6">
    <div class="flex justify-center"><BrandMark size="lg" /></div>
    <div class="rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>
  </div>
  <AppFooter />
</main>
```

Both pages then render just their inner content (heading + form/states), not their own `<main>`.

### 4.2 `login/page.tsx` (rewrite)

- Keep: server component, `login` action, `searchParams` `{ error, reason }`.
- Inside content: `<h1>Masuk</h1>` + a muted `tagline`-or-"Sistem Absensi HR" line; the `reason === "nonaktif"` and `error` messages as shadcn `<Alert variant="warning" | "destructive">`; the form on `<Field>` + shadcn `<Input>` (email, password) + a full-width `<Button type="submit">Masuk</Button>`. Inputs `text-base`, `min-h-11` (field use). No HTML `required` (server validates) — or keep `required` since this page isn't unit-tested for empty submit; **keep `required`** here (it's a real login form, not a test constraint).

### 4.3 `set-password/page.tsx` + `set-password-form.tsx` (restyle)

- The `useEffect` session-establishment logic is **unchanged**.
- Content: `<h1>Buat Kata Sandi</h1>` + muted sub; the three states — "Memeriksa link…" (a shadcn `<Skeleton>` or muted text), `fatal` as `<Alert variant="destructive">`, and `<SetPasswordForm>` — restyled.
- `SetPasswordForm`: same validation (`< 8`, mismatch), rebuilt on `<Field>` + `<Input>` + `<Button>`; success state restyled. `autoComplete="new-password"` on both inputs (carried SP1-era minor).

### 4.4 `src/app/page.tsx` (rewrite — landing)

Server component:
```
const db = await createServerSupabaseClient();
const employee = await getCurrentEmployee(db);
if (employee) redirect(employee.role === "karyawan" ? "/absen" : "/dashboard");
```
Otherwise a centered branded panel: `<BrandMark size="lg">`, the `tagline` (muted), a primary `<Button asChild><Link href="/login">Masuk</Link></Button>`, `<AppFooter>`. `bg-background`, dark-aware.

### 4.5 Tests

- `login` page renders the heading, both inputs, the submit button; renders the nonaktif alert when `reason=nonaktif`; renders the error alert when `error=...`.
- `set-password-form`: `< 8` → error; mismatch → error; valid → `onSubmit` called; success state shown.
- landing redirect: extract the role→home decision into a tiny pure helper `homePathForRole(role)` in `route-access.ts` (`"karyawan" → "/absen"`, else `"/dashboard"`) + unit test it; the page itself is a thin server component (no unit test, covered by build).

---

## 5. PDF headers

**Files:** `payslip-document.tsx`, `recap-document.tsx`, both PDF route handlers.

- Add to each document's data type: `orgNama: string; orgLogoUrl: string | null`.
- Render a header band before the existing title: a `<View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>` with — when `orgLogoUrl` — an `<Image src={orgLogoUrl} style={{ width: 28, height: 28 }} />`, then `<Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{orgNama}</Text>`. When no logo, just the name.
- **The route handler pre-fetches the logo bytes** (deterministic — do not rely on `@react-pdf`'s own fetch/error behaviour). New helper `src/lib/branding/fetch-logo.ts` → `fetchLogoDataUrl(logoUrl: string | null): Promise<string | null>`: returns `null` for a null input or any fetch/decode failure (`console.error` + `null`); otherwise `data:<mime>;base64,<...>`. The route does `const { namaInstansi, logoUrl } = await getAppSettings(); const orgLogoUrl = await fetchLogoDataUrl(logoUrl);` and passes `{ orgNama: namaInstansi, orgLogoUrl }`. `@react-pdf` `<Image>` renders a `data:` URL synchronously. A broken/absent logo → `orgLogoUrl` is `null` → the document renders the name only. Cap the fetch (`AbortSignal.timeout(3000)`, reject non-2xx, reject `content-length` > ~1 MB).
- Both route handlers already `console.error` + return a fixed 500 string on render failure — keep that; it now only triggers on a genuine render bug, never on the logo.
- **Tests for `fetchLogoDataUrl`:** null in → null out; a mocked 200 image response → `data:` URL; a mocked 404 / timeout / oversized response → `null` (+ no throw).

**Tests:** each document rendered (via `@react-pdf`'s `renderToBuffer` in a test, or a lighter React-tree assertion) contains the org name text; renders without a logo when `orgLogoUrl` is null. The existing route integration tests (`describe.skipIf`) get one added assertion that the PDF still 200s.

---

## 6. Theme flip + SP1 minor cleanup

### 6.1 `theme-provider.tsx`

```tsx
<NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```
Now safe: both shells and all 3 entry pages are dark-aware after this sub-project. Keep `suppressHydrationWarning` on `<html>`.

### 6.2 `globals.css`

Delete the trailing `@theme inline { --color-brand: … }` self-referential block and the unused legacy tokens (`--color-brand*`, `--color-danger*`, `--color-success`, `--radius-card`, `--radius-control`, `--shadow-card`). **Keep `--color-neutral-50..900`** — still referenced by not-yet-redesigned admin/employee page bodies (SP4/SP5); add a comment saying so. Verify with `grep -rn "color-brand\|shadow-card\|radius-card\|color-danger\|color-success" src/` returning zero before deleting each.

### 6.3 `Field` hardening

`src/components/field.tsx`: drop `Children.only` (it throws on a string/array/null child — the `isValidElement` branch is currently dead code). Use `isValidElement(children) ? cloneElement(...) : children`. When cloning, merge the child's own `aria-describedby` with the generated ids rather than overwriting; do not clobber a child-provided `id` unless absent. Update `field.test.tsx` if the DOM shifts (it should not for the existing cases).

### 6.4 `pulang_cepat` badge variant

`src/components/attendance-status-badge.tsx`: `pulang_cepat` → `variant: "info"` (the `info`/sky variant already exists in `ui/badge.tsx`), restoring the visual distinction from `terlambat` (`warning`/amber). Icon stays `LogOut`. No test change needed (no test asserts `pulang_cepat`'s specific class).

### 6.5 Accent contrast warning

`src/app/(admin)/pengaturan/instansi/instansi-form.tsx`: render `accentWarning(hex)` in its own `<p role="status" class="text-xs text-amber-600 dark:text-amber-400">` below the Field, not passed as the Field `hint` (where it is muted and suppressed when `hexInvalid`). Keep the format error in the Field `error` slot.

### 6.6 Input / Button default size

`src/components/ui/input.tsx`, `src/components/ui/button.tsx`: bump the default control height for this field-use app — `Input` default `h-10` (was `h-8`), `text-base md:text-sm` → keep readable on mobile; `Button` default `h-10`. Do this as a minimal edit to the `cva`/class string in the vendored files (they are ours to edit). Note it in the file with a comment so a future `shadcn add` re-generation is a conscious re-merge.

---

## 7. Testing summary & compatibility

| Area | File | Kind |
|---|---|---|
| `signOut` action | `src/app/(auth)/actions.test.ts` | unit |
| `<SignOutButton>` | `src/components/sign-out-button.test.tsx` | unit (RTL) |
| AdminShell | `src/components/admin-shell.test.tsx` (update) | unit (RTL) |
| EmployeeShell | `src/components/employee-shell.test.tsx` (update) | unit (RTL) |
| `homePathForRole` | `src/lib/auth/route-access.test.ts` (add cases) | unit |
| login page | `src/app/(auth)/login/page.test.tsx` (add or update) | unit (RTL) |
| set-password form | `src/app/(auth)/set-password/set-password-form.test.tsx` (update) | unit (RTL) |
| PDF docs | `src/components/payslip-document.test.tsx` / `recap-document.test.tsx` | unit |
| `fetchLogoDataUrl` | `src/lib/branding/fetch-logo.test.ts` | unit |
| Field hardening | `src/components/field.test.tsx` (add non-element-child case) | unit |
| badge variant / input size / globals cleanup | covered by existing tests + build | — |

- `npm test` green (327 + new); `tsc --noEmit` clean; `npm run build` 25 routes.
- Integration: the two PDF route `describe.skipIf` suites get a "still 200s with branding" assertion; run in isolation (full integration suite rate-limits GoTrue — known).
- Every existing admin/employee page still renders (the shells wrap them; a broken shell = a broken app). A dev-server pass over `/dashboard`, `/absen`, `/login`, `/set-password`, `/`, and one page of each admin section is a plan task.

## 8. SP3 hand-off

- SP3 re-adds the `/profil` bottom-nav item to `EmployeeShell` and adds the profile route.
- SP3 builds `profile-photos` (private bucket, path-RLS mirroring `attendance-photos` 0012), `updateOwnProfile` (phone) + `uploadProfilePhoto` / `removeProfilePhoto`, a signed-URL helper, `/profil` page + form, and wires the avatar into the EmployeeShell header + the admin `/karyawan` list.
- The AdminShell topbar `<Avatar>` uses initials only in SP2; SP3 can feed it a signed photo URL.
