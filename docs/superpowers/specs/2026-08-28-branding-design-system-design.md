# Branding + Design System Foundation — Design

**Status:** Approved (brainstorming) — ready for implementation planning.

**This is sub-project 1 of 4** in the white-label branding + full UI redesign initiative:

| # | Sub-project | Depends on |
|---|---|---|
| **1** | **Branding + Design System foundation** (this spec) | — |
| 2 | Shells + entry pages (AdminShell, EmployeeShell, landing, login, set-password, root metadata, PDF headers) | 1 |
| 3 | Admin pages redesign (dashboard, karyawan, persetujuan-cuti, laporan, payroll, pengaturan hub + sub-pages) | 1, 2 |
| 4 | Employee pages redesign (absen, consent, cuti, riwayat, slip-gaji, profil) | 1, 2 |

Sub-projects 2–4 each get their own brainstorm → spec → plan cycle after this one ships.

## Goal

Make the app white-label: a super admin edits the organization's name, logo, contact info, and accent color from inside the app, and every surface (shells, login, landing, favicon, page title, PDFs) reflects it. Establish a shadcn/ui-based design system as the foundation the later redesign sub-projects build on. Put a `© <year> <Instansi> · Dibuat oleh Rahmat Iqbal R.P.` credit in the footer of every page.

## Non-goals (this sub-project)

- Redesigning any existing page's layout or the two shells (sub-projects 2–4).
- Changing PDF document headers (sub-project 2).
- Per-branch branding — there is one global identity; `branches` keep their own name/address for geofencing and reports only.
- Migrating every existing page onto the new tokens/components. SP1 adds the new layer beside the old one; old pages keep working and render fixed-blue until their redesign sub-project.

## Tech context

- Next.js 16.3.2 (App Router, Server Actions, Route Handlers), React 19.2, TypeScript strict.
- Tailwind **v4** — no `tailwind.config.js`; `@import "tailwindcss"` + `@theme inline` in `src/app/globals.css`; PostCSS via `@tailwindcss/postcss`.
- Supabase cloud. Migrations apply via `npx supabase db push` (last migration `0025`; this sub-project adds `0026`, `0027`). Token in `.env.local` as `SUPABASE_ACCESS_TOKEN`.
- Vitest + Testing Library. `npm test` = `vitest run src/`; `npm run test:integration` = `vitest run tests/integration/`.
- `@/*` → `./src/*`.
- Existing role helpers (SQL, `security definer`): `is_admin_role()` (admin + atasan), `is_hr_admin_role()` (hr_admin + super_admin). This sub-project adds `is_super_admin()`.
- Existing custom tokens in `globals.css`: `--color-brand`, `--color-brand-hover`, `--color-brand-soft`, `--color-neutral-50..900`, `--color-danger*`, `--color-success`, `--radius-card`, `--radius-control`, `--shadow-card`. Existing pages mostly use Tailwind's **built-in** palette utilities (`bg-neutral-50`, `bg-blue-600`, `text-neutral-900`, `border-neutral-200`) and the `shadow-[...]` arbitrary value — not the custom tokens directly.
- 292 unit tests currently green; must stay green.

---

## 1. Data model

### 1.1 Migration `0026_app_settings.sql`

```sql
create table app_settings (
  id            integer primary key default 1 check (id = 1),
  nama_instansi text not null default 'Absensi HR',
  nama_singkat  text not null default 'Absensi HR',
  tagline       text,
  logo_url      text,
  alamat        text,
  telepon       text,
  email         text,
  warna_aksen   text not null default '#2563EB'
                check (warna_aksen ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references employees(id) on delete set null
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;

-- Branding is public: login and landing render it before auth.
create policy app_settings_select on app_settings
  for select using (true);

create policy app_settings_write on app_settings
  for all using (is_super_admin()) with check (is_super_admin());
```

### 1.2 `is_super_admin()` — in `0026`, defined **before** the `app_settings` policies

`app_settings_write` (§1.1) calls `is_super_admin()`, so the function is created first in the same `0026` migration, then the table + policies.

```sql
create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees
    where id = auth.uid() and role = 'super_admin' and status = 'aktif'
  );
$$;
```

Model it exactly on the existing `is_hr_admin_role()` definition (check that file first for the precise `grant` / comment conventions).

### 1.3 Migration `0027_branding_bucket.sql` — public storage bucket

```sql
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Public read (bucket is public, but an explicit policy keeps intent clear).
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');

create policy "branding super admin write" on storage.objects
  for insert with check (bucket_id = 'branding' and is_super_admin());
create policy "branding super admin update" on storage.objects
  for update using (bucket_id = 'branding' and is_super_admin());
create policy "branding super admin delete" on storage.objects
  for delete using (bucket_id = 'branding' and is_super_admin());
```

Cross-check the existing `attendance-photos` bucket policies (`0008`, `0012`) for the project's exact policy-naming and `storage.objects` RLS conventions before writing this.

### 1.4 Logo file handling

- Path: `logo-<Date.now()>.<ext>` at the bucket root. One logo at a time.
- On replace: upload new, then `remove([oldPath])` where `oldPath` derives from the current `logo_url`. A failed remove is logged, not fatal (the new logo still wins).
- On "remove logo": delete the file, set `logo_url = null`.
- Accepted: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`. Max **512 KB**. Validated client-side (before upload) and in the server action (re-check `File.type` + `File.size`).
- Public URL: `db.storage.from('branding').getPublicUrl(path).data.publicUrl`.

### 1.5 Integration test — `tests/integration/app-settings-rls.test.ts`

Live cloud, mirrors `tests/integration/reporting-config-rls.test.ts`:
- A second `insert into app_settings (id) values (1)` (service role) → `23505` (PK) — and `(id) values (2)` → `23514` (check). Single-row enforced.
- `signInAs` an `hr_admin` → `update app_settings set nama_instansi = 'x'` → RLS-filtered no-op (no error, 0 rows; re-read confirms unchanged) — asserts the **effect**, not a `42501`, per the Plan 6 Task 1 lesson (a `USING`-filtered UPDATE returns no error).
- `signInAs` a `super_admin` → same update → 1 row, value changed.
- `signInAs` an `atasan` → `storage.from('branding').upload(...)` → `42501`.
- Cleanup in `afterAll` (reset the row to defaults; the suite must not leave the shared instance rebranded).

---

## 2. Token system, editable accent, dark mode

### 2.1 Adopt shadcn/ui

Initialize shadcn for the Tailwind v4 + React 19 setup. This produces:
- `components.json` (style: `new-york`; base color: `neutral`; CSS variables: yes; `rsc: true`; aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/hooks`).
- `src/lib/utils.ts` exporting `cn()` (clsx + tailwind-merge).
- A rewritten `src/app/globals.css` with shadcn's token layer: `:root` (light) and `.dark` blocks defining `--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --border --input --ring --radius` plus chart tokens, in `oklch`; and the `@theme inline` mapping so `bg-background`, `text-foreground`, `bg-primary`, `border-border`, `rounded-lg`, etc. resolve.
- New dependencies: `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate` (or `tw-animate-css` per the current shadcn v4 template — use whichever the CLI installs), `lucide-react`, `next-themes`, `sonner`, and `@radix-ui/*` packages pulled in per generated component.

**Preserve backward compatibility:** after the CLI rewrites `globals.css`, re-append the existing custom-token block (`--color-brand*`, `--color-neutral-*`, `--radius-card`, `--shadow-card`, and their `@theme inline` entries if any) verbatim, so pages using them keep rendering. `npm run build` must succeed and a manual pass over every current route must show no visual regression. Document (in the plan) that these legacy tokens are deleted only when the last page using them is redesigned in SP2–4.

### 2.2 Editable accent color

`app_settings.warna_aksen` is a 6-digit hex. The design system's `--primary` and its companions are **runtime-injected** from it:

- **`src/lib/branding/accent.ts`** — pure:
  - `deriveAccent(hex: string): { primary: string; primaryForeground: string; ring: string }`
    - `primary` = the hex (normalized upper-case `#RRGGBB`).
    - `primaryForeground` = `'#FFFFFF'` or `'#0A0A0A'` — whichever gives the higher WCAG contrast ratio against `primary` (compute relative luminance → contrast ratio; pick the winner).
    - `ring` = `primary`.
  - `contrastRatio(hexA: string, hexB: string): number` — standard WCAG 2.1 formula.
  - `accentWarning(hex: string): string | null` — returns a message when **neither** black nor white text reaches 4.5:1 on the accent (rare but possible for mid-tone yellows/greens): `"Warna ini kontras rendah dengan teks — tombol mungkin sulit dibaca."` Non-blocking (the save still succeeds); the settings screen shows it.
- **Injection:** a server component `src/components/brand-style.tsx` renders
  `<style>{`:root{--primary:${p};--primary-foreground:${pf};--ring:${r};} .dark{--primary:${p};--primary-foreground:${pf};--ring:${r};}`}</style>`
  and is placed in `src/app/layout.tsx` `<head>` (or top of `<body>`), fed by `getAppSettings()`. Server-rendered → no flash, no client JS. shadcn components consume `--primary` automatically; "soft" fills use Tailwind's `/10`–`/15` opacity utilities on `bg-primary`, so no extra derived token is needed.
- **Charts:** `recharts` usage keeps a **fixed** categorical palette (define `src/lib/charts/palette.ts` — 6–8 hand-picked WCAG-AA colors, per the `dataviz` skill's "categorical colors are a designed system, not one derived hue"). Only a single-series / "primary metric" chart may use `var(--primary)`. Existing `attendance-trend-chart.tsx` keeps its current colors for now (redesigned in SP3).

### 2.3 Dark mode

- `next-themes` `<ThemeProvider>` in `src/app/layout.tsx` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. Its inline script prevents flash.
- `<ThemeToggle>` — `src/components/theme-toggle.tsx`, a shadcn `dropdown-menu` with Light / Dark / Sistem (lucide `Sun`/`Moon`/`Monitor` icons), `useTheme()` from next-themes. Built here; **mounted in the shells in SP2** (so no toggle is visible to users until SP2 ships — acceptable).
- The `.dark` token values come from the shadcn init; keep its defaults (neutral base) for now, tuned during SP2 if needed.

### 2.4 What existing pages see during the transition

Existing pages use built-in Tailwind palette utilities and hardcoded `bg-blue-600`. They are unaffected by SP1 and continue to render exactly as today (fixed blue, light only — `next-themes` only flips `.dark`, and these pages have no `dark:` variants so they stay light). Each page gains dark support + accent + new components when its redesign sub-project reaches it.

---

## 3. Component inventory

### 3.1 shadcn components to generate (`@/components/ui/*`)

`button`, `card`, `input`, `label`, `textarea`, `select`, `checkbox`, `radio-group`, `dialog`, `alert-dialog`, `dropdown-menu`, `badge`, `table`, `tabs`, `avatar`, `separator`, `skeleton`, `sonner`, `alert`, `tooltip`, `sheet`, `popover`.

Generate them in one plan task; commit the generated files as-is (they are ours to edit later). Add `<Toaster />` (sonner) to `src/app/layout.tsx`.

### 3.2 Custom components (`@/components/*`, built on shadcn)

| Component | Responsibility | Notes |
|---|---|---|
| `Field` | `<label>` + control + hint + error text, `aria-describedby`/`aria-invalid` wired | children = an `Input`/`Select`/`Textarea`; used everywhere forms appear in SP2–4 |
| `PageHeader` | h1 title + optional description + right-aligned `actions` slot | replaces the ad-hoc `<div><h1/><p/></div>` header on every admin page |
| `EmptyState` | centered lucide icon + message + optional action button | replaces bare `<p className="text-sm text-neutral-500">Belum ada…</p>` |
| `BrandMark` | `<img>` logo (when `logo_url`) + `nama` text; `size` = `sm`/`md`/`lg`; fallback = rounded monogram of `nama_singkat[0]` on `bg-primary` | one place that knows how the brand is drawn |
| `AppFooter` | the credit line (§5) | mounted in shells in SP2 |
| `ThemeToggle` | §2.3 | mounted in shells in SP2 |

### 3.3 Status badges

Re-implement the four existing badges (`attendance-status-badge`, `leave-status-badge`, `payroll-status-badge`, `role-badge`) as thin wrappers over the shadcn `badge` with semantic `variant`s + the required icon (accessibility: status is always icon + label + color). **Keep their existing `.test.tsx` files passing** — adjust the tests only where the rendered DOM legitimately changes, never to paper over a regression.

### 3.4 Icons

Adopt `lucide-react` as the icon set. Update `AGENTS.md` (the "Icons: inline stroke-based SVG, never emoji" line) to "Icons: `lucide-react`; never emoji." Existing hand-rolled inline SVGs stay until their page/shell is redesigned.

### 3.5 Tests

Every custom component gets a `.test.tsx` (render, each variant/size, a11y attributes, and for `ThemeToggle`/interactive ones a user-event interaction). The shadcn `ui/*` files are vendored — no tests required for them directly; they're covered transitively by the custom components and pages that use them.

---

## 4. `/pengaturan/instansi` screen

**Route:** `src/app/(admin)/pengaturan/instansi/page.tsx` + `actions.ts` + an `instansi-form.tsx` client component.

- **Access:** `route-access.ts` — `/pengaturan/instansi` stays under the admin prefix; the page adds `if (!employee) redirect("/login"); if (employee.role !== "super_admin") redirect("/pengaturan");`. RLS (`is_super_admin()`) is the second layer.
- **Form fields** (shadcn `Field`s): Nama Instansi, Nama Singkat, Tagline, Alamat, Telepon, Email, Warna Aksen (hex input + native `<input type="color">` swatch synced + live `accentWarning`), Logo (file input → client preview → "Hapus logo").
- **Live preview panel** (right column on desktop, below on mobile): a `<BrandMark size="lg">` + a sample primary `<Button>` + a sample `<Badge>` rendered against both a light and a dark surface, using the currently-typed accent (client-side `deriveAccent` on a scoped `style={{ '--primary': ... }}` wrapper).
- **Server actions** (`"use server"`, Zod validation, gate `is_super_admin` app-side via `getCurrentEmployee`, `console.error` raw errors + fixed Indonesian messages, `revalidatePath('/', 'layout')` on success):
  - `saveAppSettings(formData)` — validates text fields + hex (`/^#[0-9A-Fa-f]{6}$/`), updates the row, sets `updated_by`/`updated_at`.
  - `uploadLogo(formData)` — validates `File` type/size, uploads to `branding`, removes the previous file, sets `logo_url`.
  - `removeLogo()` — deletes the file, nulls `logo_url`.
- **`/pengaturan` hub:** add an "Instansi" `<Link>` card, shown only to `super_admin` (the hub already has an `hr_admin || super_admin` block; this card needs its own `super_admin`-only guard).
- **Tests:**
  - `instansi-form.test.tsx` — renders fields; typing an invalid hex shows the format error; typing a low-contrast hex shows the warning; the preview reflects the typed accent; submit calls the action with the right FormData.
  - `actions.test.ts` — `saveAppSettings` rejects a bad hex; a non-super_admin caller is refused before any DB write; a valid call updates and revalidates. `uploadLogo` rejects an oversized / wrong-type file.

---

## 5. Branding read path + the credit

### 5.1 `getAppSettings()`

`src/lib/branding/get-app-settings.ts`:

```ts
export type AppSettings = {
  namaInstansi: string; namaSingkat: string; tagline: string | null;
  logoUrl: string | null; alamat: string | null; telepon: string | null;
  email: string | null; warnaAksen: string;
};

export const getAppSettings = cache(async (): Promise<AppSettings> => { ... });
```

- Wrapped in React `cache()` so one request hits the DB once.
- Reads the single row with a **user-scoped** server client (`createServerSupabaseClient`) — the select policy is public, so this also works on the unauthenticated login/landing pages.
- On any error or an empty result: `console.error` + return a hard-coded default object (never throw — branding must never break a page). Defaults mirror the column defaults.
- `logoUrl` is resolved to a full public URL here (call `getPublicUrl` once).

### 5.2 Root metadata + favicon

- `src/app/layout.tsx` → `export async function generateMetadata(): Promise<Metadata>` returns `{ title: { default: s.namaInstansi, template: \`%s · ${s.namaInstansi}\` }, description: s.tagline ?? "Sistem absensi, cuti, dan payroll karyawan", icons: s.logoUrl ? { icon: s.logoUrl } : undefined }`.
- When no custom logo: keep the current default favicon (`src/app/favicon.ico` if present, else Next's default).
- `<BrandStyle>` (§2.2) added to the layout.

### 5.3 `<AppFooter>`

```
© <current year> <namaInstansi> · Dibuat oleh Rahmat Iqbal R.P.
```

- `src/components/app-footer.tsx` — server component, calls `getAppSettings()`.
- The string `"Dibuat oleh Rahmat Iqbal R.P."` is a module constant (`CREDIT`), rendered as plain text — **not** sourced from `app_settings`, **not** removable by a super admin.
- Optional: the `namaInstansi` portion links to nothing; the whole line is `text-xs text-muted-foreground`, centered, with comfortable top padding.
- **Mounted in SP2** in both shells + login + landing. SP1 only builds and tests the component (`app-footer.test.tsx`: shows the year, the instansi name, and the exact credit string; the credit string is present even when `getAppSettings` returns defaults).

---

## 6. Testing, compatibility, out-of-scope

### 6.1 Test summary (new)

| Area | File | Kind |
|---|---|---|
| `0026`/`0027` RLS + single-row + storage | `tests/integration/app-settings-rls.test.ts` | integration (live) |
| accent derivation + contrast | `src/lib/branding/accent.test.ts` | unit |
| `getAppSettings` defaults-on-error | `src/lib/branding/get-app-settings.test.ts` | unit |
| each custom component | `src/components/*.test.tsx` | unit (RTL) |
| status-badge rewrites | existing `src/components/*-badge.test.tsx` | unit (kept green) |
| settings form + actions | `src/app/(admin)/pengaturan/instansi/*.test.*` | unit |

`npm test` must end green (292 existing + new). `npm run build` + `./node_modules/.bin/tsc --noEmit` clean. Integration test skips nothing new that a normal run relied on.

### 6.2 Compatibility gate

- shadcn `init` rewrites `globals.css` and adds config — after it runs, re-append the legacy token block, then run `npm run build` and load **every** current route (`/`, `/login`, `/set-password`, `/dashboard`, `/karyawan`, `/karyawan/baru`, `/karyawan/[id]`, `/persetujuan-cuti`, `/laporan`, `/payroll`, `/payroll/[periodId]`, `/pengaturan` + sub-pages, `/absen`, `/absen/consent`, `/cuti`, `/riwayat`, `/slip-gaji`) — confirm no layout/color regression. This is a plan task with an explicit checklist.
- New deps are added via the shadcn CLI / `npm install`; the `AGENTS.md` note about the modified Next.js still holds — read `node_modules/next/dist/docs/` for anything App-Router-shaped.

### 6.3 Explicitly out of scope for SP1

- Any change to an existing page's JSX beyond: `globals.css`, `AGENTS.md`, `route-access.ts` (adding the `/pengaturan/instansi` rule if needed), the `/pengaturan` hub (one card), `src/app/layout.tsx` (metadata + providers + brand style), and the new `/pengaturan/instansi` route.
- Shell redesign, page redesigns, PDF headers, mounting `<AppFooter>`/`<ThemeToggle>` — all SP2+.

### 6.4 Deferred / SP2 hand-off notes

- SP2 mounts `<AppFooter>` and `<ThemeToggle>` in both shells and on login/landing.
- SP2 replaces the hardcoded `"A"` monogram + `"Absensi HR"` in `AdminShell`, `EmployeeShell`, and `login/page.tsx` with `<BrandMark>`.
- SP2 gives the shells `dark:` support and migrates them off legacy tokens.
- SP3/SP4 migrate each page onto shadcn components + `PageHeader`/`EmptyState`/`Field`, add `dark:` support, and delete legacy tokens once unused.
