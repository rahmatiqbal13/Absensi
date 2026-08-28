# Branding + Design System Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app white-label — a super admin edits the organization name, logo, contact info, and accent color in-app and every surface reflects it — on a shadcn/ui design-system foundation, with a non-editable "Dibuat oleh Rahmat Iqbal R.P." credit in every footer.

**Architecture:** A single-row `app_settings` table + public `branding` storage bucket, guarded by a new `is_super_admin()` SQL helper. shadcn/ui (Tailwind v4) provides the token layer and primitives; the super admin's accent hex is derived server-side (WCAG-checked) and injected as a `<style>` overriding `--primary` — no flash, no client JS. A cached `getAppSettings()` feeds the shells, metadata, and PDFs (wired in later sub-projects). Legacy `globals.css` tokens are kept beside the new ones so no existing page breaks.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions) · React 19.2 · TypeScript strict · Tailwind **v4** (no config file; `@import "tailwindcss"` in `src/app/globals.css`) · shadcn/ui (`new-york`, neutral base, CSS variables) · `next-themes` · `lucide-react` · `sonner` · Supabase cloud · Vitest + Testing Library.

This is **sub-project 1 of 4** (spec: `docs/superpowers/specs/2026-08-28-branding-design-system-design.md`). Sub-projects 2–4 (shells, admin pages, employee pages) follow in their own cycles.

## Global Constraints

- TypeScript strict. Package manager **npm**. `npm test` = `vitest run src/` (unit); `npm run test:integration` = `vitest run tests/integration/` (live cloud); `npm run test:all` = both.
- **Never return or render raw Postgres/PostgREST error text.** Every DB-touching Server Action / function: `console.error` the raw error, return a fixed Indonesian message. Pattern: `src/app/(admin)/pengaturan/departemen/actions.ts`.
- **Every mutation Server Action gates the caller at the top** before any DB write: `const db = await createServerSupabaseClient(); const me = await getCurrentEmployee(db); if (!me || me.role !== "super_admin") return { ok: false, error: "Tidak diizinkan." };`. RLS is the second layer.
- **Supabase is a linked cloud project.** Migrations apply via `npx supabase db push` after `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. NEVER `db reset` / `truncate` / `delete from` on live data. Last applied migration: `0025`. This plan adds `0026`, `0027`. If `db push` flags the `0020` ordering artifact, inspect the diff then re-run with `--include-all`.
- **Migration idempotency:** a prior partial apply can leave objects behind (Plan 6 Task 1). Use `create policy` only after `drop policy if exists`; guard `alter table ... add constraint` / bucket inserts with `if not exists` / `on conflict do nothing`.
- **SQL role helpers** are `security definer set search_path = public stable`, schema-qualified when used on the `storage` schema (`public.is_super_admin()`). Existing: `current_employee_role()`, `is_admin_role()` (atasan+), `is_hr_admin_role()` (hr_admin/super_admin).
- **RLS-filtered UPDATE returns no error + 0 rows** (not `42501`). Tests for "role X can't update" must assert the row is unchanged, not an error code (Plan 6 Task 1).
- `./node_modules/.bin/tsc --noEmit` — NEVER `npx tsc` (an npm wrapper intercepts it).
- Icons: `lucide-react`. Never emoji. (Existing hand-rolled inline SVGs stay until their page is redesigned in SP2–4.)
- Indonesian UI copy throughout. `lang="id"`.
- Accent hex format everywhere: `/^#[0-9A-Fa-f]{6}$/`, stored/emitted upper-case.
- **No existing page's JSX changes in this sub-project** except: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(admin)/pengaturan/page.tsx` (one card), `AGENTS.md`, the 4 status-badge components, and the new `/pengaturan/instansi` route.
- Existing 292 unit tests stay green. `npm run build` + `tsc --noEmit` clean at every commit.
- **Deliberate deviations from the spec** (approved as the codebase-consistent choice): (a) server-action validation is hand-rolled (matching `validateScheduleInput` / the departemen actions) rather than Zod — the project has no Zod dependency and adds none here; (b) `src/lib/charts/palette.ts` is NOT created in this sub-project — the existing `attendance-trend-chart.tsx` keeps its colours and the fixed categorical palette is an SP3 concern (creating an unused file now violates YAGNI). Both are noted in the SP2/SP3 hand-off.
- `@testing-library/user-event` is added as a devDependency in Task 8 (`npm i -D @testing-library/user-event`) and used by the interactive component tests.

---

## File Structure

**Migrations**
- `supabase/migrations/0026_app_settings.sql` — `is_super_admin()`, `app_settings` table + RLS, seed row.
- `supabase/migrations/0027_branding_bucket.sql` — public `branding` bucket + `storage.objects` policies.

**Branding lib** (`src/lib/branding/`)
- `accent.ts` — `deriveAccent`, `contrastRatio`, `accentWarning` (pure).
- `get-app-settings.ts` — `AppSettings` type + cached `getAppSettings()`.
- `credit.ts` — the `CREDIT` constant.

**Design-system config**
- `components.json`, `src/lib/utils.ts` (`cn`) — shadcn init.
- `src/app/globals.css` — shadcn token layer + re-appended legacy tokens.
- `src/components/ui/*` — generated shadcn primitives (vendored).

**Components** (`src/components/`)
- `brand-style.tsx` — server component injecting the accent `<style>`.
- `theme-provider.tsx` — `next-themes` wrapper (client).
- `theme-toggle.tsx` — light/dark/system dropdown (client).
- `field.tsx` — label + control + hint + error.
- `page-header.tsx` — title + description + actions.
- `empty-state.tsx` — icon + message + action.
- `brand-mark.tsx` — logo/name with monogram fallback.
- `app-footer.tsx` — the credit line (server).
- `attendance-status-badge.tsx` / `leave-status-badge.tsx` / `payroll-status-badge.tsx` / `role-badge.tsx` — rewritten on shadcn `badge`.

**Settings screen** (`src/app/(admin)/pengaturan/instansi/`)
- `page.tsx`, `actions.ts`, `instansi-form.tsx`, `brand-preview.tsx`.

**Root**
- `src/app/layout.tsx` — `generateMetadata` from branding, `<ThemeProvider>`, `<BrandStyle>`, `<Toaster>`.
- `src/app/(admin)/pengaturan/page.tsx` — one super_admin-only "Instansi" card.
- `AGENTS.md` — icon rule line.

**Integration test**
- `tests/integration/app-settings-rls.test.ts`.

---

## Task 1: Migration 0026 — `is_super_admin()` + `app_settings`

**Files:**
- Create: `supabase/migrations/0026_app_settings.sql`
- Create: `tests/integration/app-settings-rls.test.ts`

**Interfaces:**
- Produces: SQL `public.is_super_admin() → boolean`; table `app_settings` (columns per §1.1 of the spec); RLS `app_settings_select` (public), `app_settings_write` (`is_super_admin()`).
- Consumed by: Task 2 (bucket policies reuse `is_super_admin()`), Task 6 (`getAppSettings` reads the row), Task 15 (actions write the row).

**Prerequisite:** `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0026_app_settings.sql
--
-- Sub-project 1 (branding). Global, single-row organization identity + a
-- super-admin-only role helper. The write policy calls is_super_admin(), so
-- the function is defined first.

create or replace function is_super_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from employees
    where id = auth.uid() and role = 'super_admin' and status = 'aktif'
  );
$$;

create table if not exists app_settings (
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

drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select using (true);

drop policy if exists app_settings_write on app_settings;
create policy app_settings_write on app_settings
  for all using (is_super_admin()) with check (is_super_admin());
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/app-settings-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

async function signInAs(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  return client;
}

describe("app_settings RLS (0026)", () => {
  let branchId: string;
  let superEmail: string;
  let hrEmail: string;

  type BrandingRow = {
    nama_instansi: string; nama_singkat: string; tagline: string | null;
    logo_url: string | null; alamat: string | null; telepon: string | null;
    email: string | null; warna_aksen: string;
  };
  let original: BrandingRow;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: b } = await db.from("branches")
      .insert({ nama: `Cabang AppSettings ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = b!.id;
    const seeds = [
      { key: "s", email: `super.appset.${suffix}@test.local`, role: "super_admin" },
      { key: "h", email: `hr.appset.${suffix}@test.local`, role: "hr_admin" },
    ] as const;
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      await db.from("employees").insert({
        id: u!.user!.id, nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
      });
    }
    superEmail = seeds[0].email;
    hrEmail = seeds[1].email;
    const { data: row } = await db
      .from("app_settings")
      .select("nama_instansi, nama_singkat, tagline, logo_url, alamat, telepon, email, warna_aksen")
      .eq("id", 1)
      .single();
    original = row as BrandingRow;
  });

  afterAll(async () => {
    const db = createServiceRoleSupabaseClient();
    await db.from("app_settings").update({
      nama_instansi: original.nama_instansi, nama_singkat: original.nama_singkat,
      tagline: original.tagline, logo_url: original.logo_url, alamat: original.alamat,
      telepon: original.telepon, email: original.email, warna_aksen: original.warna_aksen,
    }).eq("id", 1);
  });

  it("rejects a second row (PK) and id != 1 (check)", async () => {
    const db = createServiceRoleSupabaseClient();
    const dup = await db.from("app_settings").insert({ id: 1 });
    expect(dup.error?.code).toBe("23505");
    const bad = await db.from("app_settings").insert({ id: 2 });
    expect(bad.error?.code).toBe("23514");
  });

  it("blocks an hr_admin from updating branding (RLS-filtered no-op)", async () => {
    const client = await signInAs(hrEmail);
    const { data: updated, error } = await client.from("app_settings")
      .update({ nama_instansi: "HR Tried This" }).eq("id", 1).select();
    expect(error).toBeNull();
    expect(updated ?? []).toHaveLength(0);
    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db.from("app_settings").select("nama_instansi").eq("id", 1).single();
    expect(row!.nama_instansi).not.toBe("HR Tried This");
  });

  it("lets a super_admin update branding", async () => {
    const client = await signInAs(superEmail);
    const { data: updated, error } = await client.from("app_settings")
      .update({ nama_instansi: `Instansi ${suffix}` }).eq("id", 1).select();
    expect(error).toBeNull();
    expect(updated ?? []).toHaveLength(1);
  });

  it("lets anyone read branding (public select)", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.from("app_settings").select("nama_instansi").eq("id", 1).single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm run test:integration -- app-settings-rls
```

Expected: FAIL — `app_settings` relation does not exist.

- [ ] **Step 4: Apply the migration**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
```

Expected: `Applying migration 0026_app_settings.sql...` then finishes. (If `db push` also tries `0027` and it doesn't exist yet, that's fine — only `0026` is on disk at this task.)

- [ ] **Step 5: Run to verify it passes**

```bash
npm run test:integration -- app-settings-rls
```

Expected: PASS (4 tests). (`rls-security.test.ts` can hit transient GoTrue rate-limits on long runs — re-run isolated if so.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0026_app_settings.sql tests/integration/app-settings-rls.test.ts
git commit -m "feat(db): is_super_admin() + single-row app_settings with public-read RLS"
```

---

## Task 2: Migration 0027 — public `branding` storage bucket

**Files:**
- Create: `supabase/migrations/0027_branding_bucket.sql`
- Modify: `tests/integration/app-settings-rls.test.ts`

**Interfaces:**
- Produces: public bucket `branding`; `storage.objects` policies — public read, `is_super_admin()` insert/update/delete scoped to `bucket_id = 'branding'`.
- Consumed by: Task 15 (`uploadLogo` / `removeLogo`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0027_branding_bucket.sql
--
-- Public bucket for the org logo. Mirrors the attendance-photos policy
-- conventions (0008/0012): policies named as strings, functions schema-
-- qualified (public.is_super_admin) so they resolve on the storage schema.

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists "branding super admin insert" on storage.objects;
create policy "branding super admin insert" on storage.objects
  for insert with check (bucket_id = 'branding' and public.is_super_admin());

drop policy if exists "branding super admin update" on storage.objects;
create policy "branding super admin update" on storage.objects
  for update using (bucket_id = 'branding' and public.is_super_admin());

drop policy if exists "branding super admin delete" on storage.objects;
create policy "branding super admin delete" on storage.objects
  for delete using (bucket_id = 'branding' and public.is_super_admin());
```

- [ ] **Step 2: Add the failing test case**

Append inside the `describe` block in `tests/integration/app-settings-rls.test.ts`:

```typescript
  it("blocks an hr_admin from uploading to the branding bucket", async () => {
    const client = await signInAs(hrEmail);
    const { error } = await client.storage.from("branding")
      .upload(`test-${suffix}.png`, new Blob(["x"], { type: "image/png" }));
    expect(error).not.toBeNull();
  });

  it("lets a super_admin upload to and delete from the branding bucket", async () => {
    const client = await signInAs(superEmail);
    const path = `test-super-${suffix}.png`;
    const up = await client.storage.from("branding")
      .upload(path, new Blob(["x"], { type: "image/png" }), { upsert: true });
    expect(up.error).toBeNull();
    const del = await client.storage.from("branding").remove([path]);
    expect(del.error).toBeNull();
  });
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm run test:integration -- app-settings-rls
```

Expected: FAIL — super_admin upload errors (bucket `branding` does not exist).

- [ ] **Step 4: Apply + re-run**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
npm run test:integration -- app-settings-rls
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0027_branding_bucket.sql tests/integration/app-settings-rls.test.ts
git commit -m "feat(db): public branding storage bucket, super-admin-only writes"
```

---

## Task 3: Initialize shadcn/ui + preserve legacy tokens

**Files:**
- Create: `components.json`, `src/lib/utils.ts`
- Modify: `src/app/globals.css`, `package.json` (deps via CLI), `AGENTS.md`

**Interfaces:**
- Produces: `cn(...classes)` from `@/lib/utils`; shadcn token layer in `globals.css` (`--background --foreground --card --primary --primary-foreground --muted --muted-foreground --border --input --ring --radius` + `.dark` block + `@theme inline` mapping); Tailwind utilities `bg-background`, `text-foreground`, `bg-primary`, `border-border`, `rounded-lg`, etc.
- Consumed by: every later task.

- [ ] **Step 1: Run the shadcn init**

```bash
npx shadcn@latest init
```

Answer prompts: style **new-york**, base color **neutral**, CSS variables **yes**. If it prompts about React 19 peer deps, allow `--legacy-peer-deps` / `--force` as it suggests. It will: create `components.json`, create `src/lib/utils.ts`, rewrite `src/app/globals.css`, install `class-variance-authority clsx tailwind-merge` + an animation package (`tw-animate-css` or `tailwindcss-animate` — whichever it picks) + `lucide-react`.

Verify `components.json` has `"rsc": true`, `"tsx": true`, aliases `"components": "@/components"`, `"utils": "@/lib/utils"`, `"ui": "@/components/ui"`.

- [ ] **Step 2: Re-append the legacy token block to `globals.css`**

The init overwrote `globals.css`. Append the project's existing custom tokens back at the end so pages that use them keep rendering (they were removed by the init):

```css
/* --- Legacy tokens (pre-shadcn). Kept until every page migrates to shadcn
   utilities in sub-projects 2-4, then deleted. Do not add new usages. --- */
:root {
  --color-brand: #2563eb;
  --color-brand-hover: #1d4ed8;
  --color-brand-soft: #eff6ff;
  --color-neutral-50: #f8fafc;
  --color-neutral-100: #f1f5f9;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-500: #64748b;
  --color-neutral-700: #334155;
  --color-neutral-900: #0f172a;
  --color-danger: #dc2626;
  --color-danger-soft: #fef2f2;
  --color-success: #16a34a;
  --radius-card: 1rem;
  --radius-control: 0.625rem;
  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12);
}
@theme inline {
  --color-brand: var(--color-brand);
  --color-brand-hover: var(--color-brand-hover);
  --color-brand-soft: var(--color-brand-soft);
}
```

Then confirm `body` still has an explicit background/color (shadcn's `@layer base` sets `bg-background text-foreground` on `body` — keep that; remove any duplicate `body { background: var(--background) }` left from the old file only if it now conflicts).

- [ ] **Step 3: Update the icon rule in `AGENTS.md`**

Find the line about icons (it reads roughly `Icons: inline stroke-based SVG, never emoji.`) and change it to:

```
Icons: `lucide-react`. Never emoji. (Pre-existing hand-rolled inline SVGs are migrated as their page/shell is redesigned.)
```

If `AGENTS.md` has no such line, add it under the conventions section. Do NOT touch the `next dev` agent-files block at the top.

- [ ] **Step 4: Verify build + full route pass**

```bash
npm run build
./node_modules/.bin/tsc --noEmit
npm test
```

Expected: build `Compiled successfully`; tsc exit 0; 292 tests pass. Then start the dev server and load each route, confirming **no visual regression** (colors, spacing, layout unchanged):

`/`, `/login`, `/set-password`, `/dashboard`, `/karyawan`, `/karyawan/baru`, `/persetujuan-cuti`, `/laporan`, `/payroll`, `/pengaturan`, `/pengaturan/libur`, `/pengaturan/audit`, `/pengaturan/departemen`, `/pengaturan/jadwal`, `/absen`, `/cuti`, `/riwayat`, `/slip-gaji`

If a page regressed, the legacy token re-append in Step 2 is incomplete — diff `globals.css` against the pre-init version (git) and restore any missing `:root` var or `@theme` entry.

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/utils.ts src/app/globals.css package.json package-lock.json AGENTS.md
git commit -m "chore(design): init shadcn/ui, keep legacy tokens side-by-side"
```

---

## Task 4: Generate shadcn primitive components + Toaster

**Files:**
- Create: `src/components/ui/*` (generated)
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `@/components/ui/{button,card,input,label,textarea,select,checkbox,radio-group,dialog,alert-dialog,dropdown-menu,badge,table,tabs,avatar,separator,skeleton,sonner,alert,tooltip,sheet,popover}`.
- Consumed by: Tasks 8–16.

- [ ] **Step 1: Generate the components**

```bash
npx shadcn@latest add button card input label textarea select checkbox radio-group dialog alert-dialog dropdown-menu badge table tabs avatar separator skeleton sonner alert tooltip sheet popover
```

Allow any peer-dep prompts (`--legacy-peer-deps`). This installs `@radix-ui/*` packages and creates the files under `src/components/ui/`.

- [ ] **Step 2: Mount the Toaster**

In `src/app/layout.tsx`, import and render `<Toaster />` from `@/components/ui/sonner` just before `</body>` (inside the existing `<body>`), leaving all other layout content unchanged for now:

```tsx
import { Toaster } from "@/components/ui/sonner";
// ...
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
```

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm run build && npm test
```

Expected: tsc clean, build compiles, 292 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui src/app/layout.tsx package.json package-lock.json
git commit -m "feat(design): generate shadcn primitives + mount sonner Toaster"
```

---

## Task 5: `accent.ts` — WCAG-checked accent derivation

**Files:**
- Create: `src/lib/branding/accent.ts`, `src/lib/branding/accent.test.ts`

**Interfaces:**
- Produces:
  - `type DerivedAccent = { primary: string; primaryForeground: string; ring: string }`
  - `deriveAccent(hex: string): DerivedAccent`
  - `contrastRatio(hexA: string, hexB: string): number`
  - `accentWarning(hex: string): string | null`
  - `normalizeHex(hex: string): string` (upper-case `#RRGGBB`; throws on invalid)
- Consumed by: Task 7 (`<BrandStyle>`), Task 15 (`saveAppSettings` validation is regex-only; the warning is UI-side), Task 16 (`<BrandPreview>`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/branding/accent.test.ts
import { describe, it, expect } from "vitest";
import { deriveAccent, contrastRatio, accentWarning, normalizeHex } from "./accent";

describe("normalizeHex", () => {
  it("upper-cases and keeps the hash", () => {
    expect(normalizeHex("#2563eb")).toBe("#2563EB");
  });
  it("throws on a bad hex", () => {
    expect(() => normalizeHex("2563eb")).toThrow();
    expect(() => normalizeHex("#12345")).toThrow();
    expect(() => normalizeHex("#gggggg")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black vs white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
  it("is 1 for a colour against itself", () => {
    expect(contrastRatio("#2563EB", "#2563EB")).toBeCloseTo(1, 5);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#2563EB", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#2563EB"), 5);
  });
});

describe("deriveAccent", () => {
  it("picks white foreground for a dark accent (blue-600)", () => {
    const d = deriveAccent("#2563EB");
    expect(d.primary).toBe("#2563EB");
    expect(d.primaryForeground).toBe("#FFFFFF");
    expect(d.ring).toBe("#2563EB");
  });
  it("picks near-black foreground for a light accent (amber-300)", () => {
    expect(deriveAccent("#FCD34D").primaryForeground).toBe("#0A0A0A");
  });
  it("normalizes the input", () => {
    expect(deriveAccent("#2563eb").primary).toBe("#2563EB");
  });
});

describe("accentWarning", () => {
  it("returns null when one of black/white clears 4.5:1", () => {
    expect(accentWarning("#2563EB")).toBeNull();
    expect(accentWarning("#FCD34D")).toBeNull();
  });
  it("warns for a mid-tone where neither text colour clears 4.5:1", () => {
    // #767676 is the canonical AA boundary vs white; a step lighter fails both.
    expect(accentWarning("#808080")).toMatch(/kontras/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- accent.test.ts
```

Expected: FAIL — `Cannot find module './accent'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/branding/accent.ts

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export type DerivedAccent = { primary: string; primaryForeground: string; ring: string };

export function normalizeHex(hex: string): string {
  if (!HEX_RE.test(hex)) throw new Error(`Invalid hex color: ${hex}`);
  return hex.toUpperCase();
}

function channelLuminance(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE = "#FFFFFF";
const NEAR_BLACK = "#0A0A0A";

export function deriveAccent(hex: string): DerivedAccent {
  const primary = normalizeHex(hex);
  const onWhite = contrastRatio(primary, WHITE);
  const onBlack = contrastRatio(primary, NEAR_BLACK);
  const primaryForeground = onWhite >= onBlack ? WHITE : NEAR_BLACK;
  return { primary, primaryForeground, ring: primary };
}

export function accentWarning(hex: string): string | null {
  const best = Math.max(contrastRatio(hex, WHITE), contrastRatio(hex, NEAR_BLACK));
  return best < 4.5
    ? "Warna ini kontras rendah dengan teks — tombol mungkin sulit dibaca."
    : null;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- accent.test.ts
```

Expected: PASS (11 assertions across the describes). If the `#808080` case is off, adjust the test fixture to a hex that genuinely fails both (compute: `contrastRatio("#808080","#FFFFFF")` ≈ 3.9, `contrastRatio("#808080","#0A0A0A")` ≈ 4.9 — pick a value in the true dead zone like `#949494` if needed) — but do NOT weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branding/accent.ts src/lib/branding/accent.test.ts
git commit -m "feat(branding): WCAG-checked accent-colour derivation"
```

---

## Task 6: `get-app-settings.ts` — cached branding read

**Files:**
- Create: `src/lib/branding/get-app-settings.ts`, `src/lib/branding/get-app-settings.test.ts`, `src/lib/branding/credit.ts`

**Interfaces:**
- Produces:
  - `type AppSettings = { namaInstansi: string; namaSingkat: string; tagline: string | null; logoUrl: string | null; alamat: string | null; telepon: string | null; email: string | null; warnaAksen: string }`
  - `const APP_SETTINGS_DEFAULTS: AppSettings`
  - `getAppSettings(): Promise<AppSettings>` (React `cache`d)
  - `credit.ts`: `export const CREDIT = "Dibuat oleh Rahmat Iqbal R.P.";`
- Consumed by: Task 7, Task 11 (`BrandMark`), Task 12 (`AppFooter`), Task 14 (metadata).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/branding/get-app-settings.test.ts
import { describe, it, expect, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("../supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  }),
}));

import { getAppSettings, APP_SETTINGS_DEFAULTS } from "./get-app-settings";

describe("getAppSettings", () => {
  it("maps a row to camelCase and resolves the logo public URL", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        nama_instansi: "PT Contoh", nama_singkat: "Contoh", tagline: "Hadir tepat waktu",
        logo_url: "logo-123.png", alamat: "Jl. Mawar 1", telepon: "021-1", email: "hi@contoh.id",
        warna_aksen: "#0F766E",
      },
      error: null,
    });
    const s = await getAppSettings();
    expect(s.namaInstansi).toBe("PT Contoh");
    expect(s.namaSingkat).toBe("Contoh");
    expect(s.logoUrl).toBe("https://cdn.test/logo-123.png");
    expect(s.warnaAksen).toBe("#0F766E");
  });

  it("returns defaults (never throws) on a query error", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const s = await getAppSettings();
    expect(s).toEqual(APP_SETTINGS_DEFAULTS);
  });

  it("returns defaults when the row is missing", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const s = await getAppSettings();
    expect(s.namaInstansi).toBe(APP_SETTINGS_DEFAULTS.namaInstansi);
    expect(s.logoUrl).toBeNull();
  });
});
```

Note: `getAppSettings` is `cache()`d per-request; in a plain vitest run there is no request scope so it does not memoize across `it`s — each `it` gets its own `mockResolvedValueOnce`. If a stale value bleeds across tests, wrap the call under test in `await vi.importActual`-fresh module or move the `cache` wrapper so the test imports the inner function; simplest: export both `getAppSettingsUncached` (the real impl) and `getAppSettings = cache(getAppSettingsUncached)`, and have the test import `getAppSettingsUncached`.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- get-app-settings.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/branding/credit.ts
export const CREDIT = "Dibuat oleh Rahmat Iqbal R.P.";
```

```typescript
// src/lib/branding/get-app-settings.ts
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AppSettings = {
  namaInstansi: string;
  namaSingkat: string;
  tagline: string | null;
  logoUrl: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  warnaAksen: string;
};

export const APP_SETTINGS_DEFAULTS: AppSettings = {
  namaInstansi: "Absensi HR",
  namaSingkat: "Absensi HR",
  tagline: null,
  logoUrl: null,
  alamat: null,
  telepon: null,
  email: null,
  warnaAksen: "#2563EB",
};

export async function getAppSettingsUncached(): Promise<AppSettings> {
  try {
    const db = await createServerSupabaseClient();
    const { data, error } = await db
      .from("app_settings")
      .select("nama_instansi, nama_singkat, tagline, logo_url, alamat, telepon, email, warna_aksen")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("getAppSettings: query failed", error);
      return APP_SETTINGS_DEFAULTS;
    }
    const logoUrl = data.logo_url
      ? db.storage.from("branding").getPublicUrl(data.logo_url).data.publicUrl
      : null;
    return {
      namaInstansi: data.nama_instansi,
      namaSingkat: data.nama_singkat,
      tagline: data.tagline,
      logoUrl,
      alamat: data.alamat,
      telepon: data.telepon,
      email: data.email,
      warnaAksen: (data.warna_aksen as string).toUpperCase(),
    };
  } catch (err) {
    console.error("getAppSettings: unexpected", err);
    return APP_SETTINGS_DEFAULTS;
  }
}

export const getAppSettings = cache(getAppSettingsUncached);
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- get-app-settings.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/branding/get-app-settings.ts src/lib/branding/get-app-settings.test.ts src/lib/branding/credit.ts
git commit -m "feat(branding): cached getAppSettings with defaults-on-error + CREDIT constant"
```

---

## Task 7: `<BrandStyle>` — inject the accent

**Files:**
- Create: `src/components/brand-style.tsx`, `src/components/brand-style.test.tsx`

**Interfaces:**
- Consumes: `deriveAccent` (Task 5), `getAppSettings` (Task 6).
- Produces: `<BrandStyle />` — an async server component rendering a `<style>` that overrides `--primary`, `--primary-foreground`, `--ring` on `:root` and `.dark`.
- Consumed by: Task 14 (mounted in `layout.tsx`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/brand-style.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/branding/get-app-settings", () => ({
  getAppSettings: async () => ({
    namaInstansi: "X", namaSingkat: "X", tagline: null, logoUrl: null,
    alamat: null, telepon: null, email: null, warnaAksen: "#0F766E",
  }),
}));

import { BrandStyle } from "./brand-style";

describe("BrandStyle", () => {
  it("emits a style tag setting --primary from the derived accent", async () => {
    const ui = await BrandStyle();
    const { container } = render(ui);
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("--primary: #0F766E");
    expect(style!.textContent).toContain(":root");
    expect(style!.textContent).toContain(".dark");
    // #0F766E is dark -> white foreground
    expect(style!.textContent).toContain("--primary-foreground: #FFFFFF");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- brand-style.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/brand-style.tsx
import { deriveAccent } from "@/lib/branding/accent";
import { getAppSettings } from "@/lib/branding/get-app-settings";

export async function BrandStyle() {
  const { warnaAksen } = await getAppSettings();
  let d;
  try {
    d = deriveAccent(warnaAksen);
  } catch {
    d = deriveAccent("#2563EB");
  }
  const vars = `--primary: ${d.primary}; --primary-foreground: ${d.primaryForeground}; --ring: ${d.ring};`;
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: `:root{${vars}}\n.dark{${vars}}` }}
    />
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- brand-style.test.tsx && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (1 test), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/brand-style.tsx src/components/brand-style.test.tsx
git commit -m "feat(branding): BrandStyle server component injects the accent"
```

---

## Task 8: Theme provider + toggle

**Files:**
- Create: `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`, `src/components/theme-toggle.test.tsx`

**Interfaces:**
- Consumes: `next-themes`, `@/components/ui/dropdown-menu`, `@/components/ui/button`, `lucide-react`.
- Produces: `<ThemeProvider>` (client wrapper), `<ThemeToggle />` (client — light/dark/system menu).
- Consumed by: Task 14 (`<ThemeProvider>` in layout); `<ThemeToggle>` mounted in shells in SP2.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/theme-toggle.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme, resolvedTheme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("opens a menu and sets the theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: /tema/i }));
    await user.click(await screen.findByRole("menuitem", { name: /gelap/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
```

First add the dep (used here and in Task 16):

```bash
npm i -D @testing-library/user-event
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- theme-toggle.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementations**

```tsx
// src/components/theme-provider.tsx
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

```tsx
// src/components/theme-toggle.tsx
"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ubah tema">
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Terang
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Gelap
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" /> Sistem
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- theme-toggle.test.tsx && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS. If the Radix dropdown doesn't open under jsdom with `userEvent`, add `import "@testing-library/jest-dom"` is already global; ensure `PointerEvent` shim — add to `vitest.setup.ts` if needed:
```typescript
if (!("hasPointerCapture" in Element.prototype)) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/theme-provider.tsx src/components/theme-toggle.tsx src/components/theme-toggle.test.tsx vitest.setup.ts package.json package-lock.json
git commit -m "feat(design): next-themes provider + light/dark/system toggle"
```

---

## Task 9: `<Field>` primitive

**Files:**
- Create: `src/components/field.tsx`, `src/components/field.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/label`, `cn`.
- Produces: `<Field label id hint error required>{control}</Field>` — renders `<Label htmlFor={id}>`, the control (cloned to receive `id`, `aria-invalid`, `aria-describedby`), a hint `<p>` and/or an error `<p role="alert">`.
- Consumed by: Task 16 (`instansi-form`), SP2–4.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/field.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./field";

describe("Field", () => {
  it("links the label to the control by id", () => {
    render(<Field id="nama" label="Nama Instansi"><input id="nama" /></Field>);
    expect(screen.getByLabelText("Nama Instansi")).toBeInTheDocument();
  });

  it("shows a hint and wires aria-describedby", () => {
    render(<Field id="x" label="X" hint="Maks 512 KB"><input id="x" /></Field>);
    const input = screen.getByLabelText("X");
    expect(screen.getByText("Maks 512 KB")).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toContain("x-hint");
  });

  it("shows an error with role=alert and sets aria-invalid", () => {
    render(<Field id="y" label="Y" error="Wajib diisi"><input id="y" /></Field>);
    const input = screen.getByLabelText("Y");
    expect(screen.getByRole("alert")).toHaveTextContent("Wajib diisi");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("y-error");
  });

  it("marks required fields", () => {
    render(<Field id="z" label="Z" required><input id="z" /></Field>);
    expect(screen.getByText("Z").textContent).toContain("*");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- field.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/field.tsx
import { Children, cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = Children.only(children);
  const enhanced = isValidElement(control)
    ? cloneElement(control as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : control;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {enhanced}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- field.test.tsx && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/field.tsx src/components/field.test.tsx
git commit -m "feat(design): Field primitive (label + control + hint/error a11y)"
```

---

## Task 10: `<PageHeader>` + `<EmptyState>`

**Files:**
- Create: `src/components/page-header.tsx`, `src/components/page-header.test.tsx`, `src/components/empty-state.tsx`, `src/components/empty-state.test.tsx`

**Interfaces:**
- Produces:
  - `<PageHeader title description? actions? />` — `<h1>` + optional `<p>` + optional right-aligned actions node.
  - `<EmptyState icon message action? />` — centered `lucide` icon (passed as a component or node), message, optional action node.
- Consumed by: SP2–4 (not used inside SP1 beyond tests).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/page-header.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as an h1", () => {
    render(<PageHeader title="Laporan Kehadiran" />);
    expect(screen.getByRole("heading", { level: 1, name: "Laporan Kehadiran" })).toBeInTheDocument();
  });
  it("renders the description and actions", () => {
    render(<PageHeader title="X" description="Ringkasan" actions={<button>Unduh</button>} />);
    expect(screen.getByText("Ringkasan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unduh" })).toBeInTheDocument();
  });
});
```

```tsx
// src/components/empty-state.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the message and optional action", () => {
    render(<EmptyState icon={Inbox} message="Belum ada data" action={<button>Tambah</button>} />);
    expect(screen.getByText("Belum ada data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- page-header.test.tsx empty-state.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```tsx
// src/components/page-header.tsx
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

```tsx
// src/components/empty-state.tsx
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npm test -- page-header.test.tsx empty-state.test.tsx && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/page-header.tsx src/components/page-header.test.tsx src/components/empty-state.tsx src/components/empty-state.test.tsx
git commit -m "feat(design): PageHeader + EmptyState primitives"
```

---

## Task 11: `<BrandMark>`

**Files:**
- Create: `src/components/brand-mark.tsx`, `src/components/brand-mark.test.tsx`

**Interfaces:**
- Consumes: `getAppSettings` (Task 6), `cn`, `next/image`.
- Produces: `<BrandMark size? showName? />` — async server component. `logoUrl` → `<Image>`; else a rounded monogram (`namaSingkat[0]`, upper-case) on `bg-primary text-primary-foreground`. `showName` (default true) appends `namaSingkat` as text. `size` ∈ `"sm" | "md" | "lg"`.
- Consumed by: SP2 (shells, login, landing).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/brand-mark.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const settings = {
  namaInstansi: "PT Contoh", namaSingkat: "Contoh", tagline: null,
  logoUrl: null as string | null, alamat: null, telepon: null, email: null, warnaAksen: "#2563EB",
};
vi.mock("@/lib/branding/get-app-settings", () => ({ getAppSettings: async () => settings }));
vi.mock("next/image", () => ({ default: (p: Record<string, unknown>) => <img {...p} /> }));

import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  it("renders a monogram + name when there is no logo", async () => {
    settings.logoUrl = null;
    render(await BrandMark({}));
    expect(screen.getByText("C")).toBeInTheDocument(); // monogram
    expect(screen.getByText("Contoh")).toBeInTheDocument();
  });

  it("renders the logo image when logoUrl is set", async () => {
    settings.logoUrl = "https://cdn.test/logo.png";
    render(await BrandMark({ showName: false }));
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://cdn.test/logo.png");
    expect(img).toHaveAttribute("alt", "PT Contoh");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- brand-mark.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/brand-mark.tsx
import Image from "next/image";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-7 w-7", text: "text-sm", name: "text-sm" },
  md: { box: "h-9 w-9", text: "text-base", name: "text-base" },
  lg: { box: "h-12 w-12", text: "text-lg", name: "text-lg" },
} as const;

export async function BrandMark({
  size = "md",
  showName = true,
  className,
}: {
  size?: keyof typeof SIZES;
  showName?: boolean;
  className?: string;
}) {
  const { namaInstansi, namaSingkat, logoUrl } = await getAppSettings();
  const s = SIZES[size];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={namaInstansi}
          width={48}
          height={48}
          className={cn(s.box, "rounded-lg object-contain")}
        />
      ) : (
        <div
          className={cn(
            s.box,
            s.text,
            "flex items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground",
          )}
        >
          {(namaSingkat[0] ?? "A").toUpperCase()}
        </div>
      )}
      {showName && <span className={cn(s.name, "font-semibold text-foreground")}>{namaSingkat}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- brand-mark.test.tsx && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/brand-mark.tsx src/components/brand-mark.test.tsx
git commit -m "feat(branding): BrandMark (logo or monogram + name)"
```

---

## Task 12: `<AppFooter>`

**Files:**
- Create: `src/components/app-footer.tsx`, `src/components/app-footer.test.tsx`

**Interfaces:**
- Consumes: `getAppSettings` (Task 6), `CREDIT` (Task 6).
- Produces: `<AppFooter />` — async server component rendering `© <year> <namaInstansi> · <CREDIT>` as centered `text-xs text-muted-foreground`.
- Consumed by: SP2 (mounted in shells + login + landing).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/app-footer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CREDIT } from "@/lib/branding/credit";

const settings = {
  namaInstansi: "PT Contoh", namaSingkat: "Contoh", tagline: null, logoUrl: null,
  alamat: null, telepon: null, email: null, warnaAksen: "#2563EB",
};
vi.mock("@/lib/branding/get-app-settings", () => ({
  getAppSettings: async () => settings,
  APP_SETTINGS_DEFAULTS: settings,
}));

import { AppFooter } from "./app-footer";

describe("AppFooter", () => {
  it("shows the year, instansi name, and the exact credit", async () => {
    render(await AppFooter());
    const year = String(new Date().getFullYear());
    expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
    expect(screen.getByText(/PT Contoh/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(CREDIT.replace(/\./g, "\\.")))).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- app-footer.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/app-footer.tsx
import { CREDIT } from "@/lib/branding/credit";
import { getAppSettings } from "@/lib/branding/get-app-settings";

export async function AppFooter() {
  const { namaInstansi } = await getAppSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
      © {year} {namaInstansi} · {CREDIT}
    </footer>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- app-footer.test.tsx && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/app-footer.tsx src/components/app-footer.test.tsx
git commit -m "feat(branding): AppFooter with non-editable maker credit"
```

---

## Task 13: Rewrite the status badges on shadcn `badge`

**Files:**
- Modify: `src/components/attendance-status-badge.tsx`, `src/components/leave-status-badge.tsx`, `src/components/payroll-status-badge.tsx`, `src/components/role-badge.tsx`
- Modify (only if DOM legitimately changed): the four matching `*.test.tsx`

**Interfaces:**
- Unchanged public API: each component keeps its current prop (`status` / `role`) and its exported status-type. Internals move to `<Badge variant=…>` + a `lucide` icon.
- Consumed by: existing pages (unchanged call sites).

- [ ] **Step 1: Read the four current components and their tests**

```bash
sed -n '1,80p' src/components/attendance-status-badge.tsx
sed -n '1,60p' src/components/role-badge.tsx
```

Note each component's exported type name and prop, and what each existing test asserts (label text, an icon via `getByRole("img", { hidden: true })`, distinct color classes).

- [ ] **Step 2: Extend the shadcn `badge` variants**

In `src/components/ui/badge.tsx`, add semantic variants to the `cva` config alongside the generated ones (keep `default`, `secondary`, `destructive`, `outline`):

```tsx
        success:
          "border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        warning:
          "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        info:
          "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
        neutral:
          "border-transparent bg-muted text-muted-foreground",
```

- [ ] **Step 3: Rewrite each badge** (example — `leave-status-badge.tsx`)

```tsx
// src/components/leave-status-badge.tsx
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type LeaveStatus = "pending" | "approved" | "rejected";

const CONFIG: Record<
  LeaveStatus,
  { label: string; variant: "warning" | "success" | "destructive"; Icon: typeof Clock }
> = {
  pending: { label: "Menunggu", variant: "warning", Icon: Clock },
  approved: { label: "Disetujui", variant: "success", Icon: CheckCircle2 },
  rejected: { label: "Ditolak", variant: "destructive", Icon: XCircle },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { label, variant, Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
```

Apply the same shape to the other three, preserving each one's existing labels and status/role values. Map:
- attendance statuses → `success` (tepat_waktu), `warning` (terlambat / pulang_cepat), `info` (di_luar_lokasi), `destructive` (alpa), `neutral` (cuti / other) — match the current colour intent from the existing file.
- payroll statuses → keep the current intent (draft `neutral`, final/paid `success`, etc. per the existing file).
- role badges → `default` for super_admin, `info` for hr_admin, `secondary` for atasan, `neutral` for karyawan (or match the existing file's colour choices).

- [ ] **Step 4: Fix the tests where the DOM legitimately changed**

The existing tests assert: label text (still valid), `getByRole("img", { hidden: true })` for the icon (lucide renders `<svg>` — add `aria-hidden` which makes it `role="img"` hidden; if a test used `role="img"` without `hidden`, keep it working by leaving lucide's default `<svg>` — check `screen.getByRole("img", { hidden: true })` still resolves; lucide sets no role, so change those assertions to `container.querySelector("svg")`), and "distinct background class" (still valid — variants differ). Update only the icon-query assertions, minimally.

```bash
npm test -- attendance-status-badge leave-status-badge payroll-status-badge role-badge
```

Iterate until green. Do NOT delete assertions to pass — adjust the query to match the new (valid) DOM.

- [ ] **Step 5: Full verify + commit**

```bash
npm test && ./node_modules/.bin/tsc --noEmit && npm run build
git add src/components/ui/badge.tsx src/components/attendance-status-badge.tsx src/components/leave-status-badge.tsx src/components/payroll-status-badge.tsx src/components/role-badge.tsx src/components/attendance-status-badge.test.tsx src/components/leave-status-badge.test.tsx src/components/payroll-status-badge.test.tsx src/components/role-badge.test.tsx
git commit -m "refactor(design): status badges on shadcn Badge + lucide icons"
```

Expected: all tests green, build compiles, existing pages render the badges unchanged in meaning.

---

## Task 14: Root layout — metadata, theme provider, brand style

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `getAppSettings` (Task 6), `<ThemeProvider>` (Task 8), `<BrandStyle>` (Task 7), `<Toaster>` (Task 4).
- Produces: `generateMetadata()` sourcing `title` / `description` / `icons` from branding; `<html>` gets `suppressHydrationWarning` (next-themes); `<ThemeProvider>` wraps `children`.

- [ ] **Step 1: Rewrite `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandStyle } from "@/components/brand-style";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getAppSettings } from "@/lib/branding/get-app-settings";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getAppSettings();
  return {
    title: { default: s.namaInstansi, template: `%s · ${s.namaInstansi}` },
    description: s.tagline ?? "Sistem absensi, cuti, dan payroll karyawan",
    icons: s.logoUrl ? { icon: s.logoUrl } : undefined,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <BrandStyle />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Notes: `<BrandStyle />` is an async server component rendered inside `<head>` — Next 16 supports async components in the root layout head. If the build complains about `<head>` in the root layout (check `node_modules/next/dist/docs/` for the current guidance), move `<BrandStyle />` to the top of `<body>` instead — its `<style>` still applies globally.

- [ ] **Step 2: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm run build && npm test
```

Expected: tsc clean; build compiles; 292 + new tests pass. Load `/` and `/dashboard` in dev: no theme-flash, the tab title is the instansi name, and existing pages look unchanged (light mode, since they have no `dark:` classes).

- [ ] **Step 3: Manual dark-mode smoke**

Toggle the OS to dark. The `<html>` gets `class="dark"` (next-themes). Existing pages stay light-styled (no `dark:` variants — expected). Confirm no crash / hydration error in the console.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(branding): root metadata + theme provider + accent injection"
```

---

## Task 15: `/pengaturan/instansi` server actions

**Files:**
- Create: `src/app/(admin)/pengaturan/instansi/actions.ts`, `src/app/(admin)/pengaturan/instansi/actions.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient`, `getCurrentEmployee`, `normalizeHex` (Task 5).
- Produces:
  - `type Result = { ok: true } | { ok: false; error: string }`
  - `saveAppSettings(formData: FormData): Promise<Result>`
  - `uploadLogo(formData: FormData): Promise<Result>` (field `logo`: `File`)
  - `removeLogo(): Promise<Result>`
- Consumed by: Task 16 (`instansi-form`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/(admin)/pengaturan/instansi/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { role: string } = { role: "super_admin" };
const updateResult = { error: null as unknown };
const upsertSpy = vi.fn(() => Promise.resolve(updateResult));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ update: (v: unknown) => { upsertSpy(v); return { eq: () => Promise.resolve(updateResult) }; } }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: "logo-1.png" }, error: null }),
        remove: () => Promise.resolve({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      }),
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentEmployee: async () => (state.role ? { id: "u1", role: state.role } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveAppSettings, uploadLogo } from "./actions";

function fd(entries: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => { state.role = "super_admin"; upsertSpy.mockClear(); });

describe("saveAppSettings", () => {
  it("refuses a non-super_admin before writing", async () => {
    state.role = "hr_admin";
    const r = await saveAppSettings(fd({ nama_instansi: "X", nama_singkat: "X", warna_aksen: "#2563EB" }));
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed accent hex", async () => {
    const r = await saveAppSettings(fd({ nama_instansi: "X", nama_singkat: "X", warna_aksen: "blue" }));
    expect(r).toEqual({ ok: false, error: "Format warna aksen harus #RRGGBB." });
  });

  it("rejects an empty nama_instansi", async () => {
    const r = await saveAppSettings(fd({ nama_instansi: "  ", nama_singkat: "X", warna_aksen: "#2563EB" }));
    expect(r.ok).toBe(false);
  });

  it("normalizes the hex and updates on a valid payload", async () => {
    const r = await saveAppSettings(fd({ nama_instansi: "PT Contoh", nama_singkat: "Contoh", warna_aksen: "#2563eb" }));
    expect(r).toEqual({ ok: true });
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ warna_aksen: "#2563EB", nama_instansi: "PT Contoh" }));
  });
});

describe("uploadLogo", () => {
  it("rejects a non-image file", async () => {
    const r = await uploadLogo(fd({ logo: new File(["x"], "a.txt", { type: "text/plain" }) }));
    expect(r).toEqual({ ok: false, error: "Logo harus PNG, JPG, WEBP, atau SVG." });
  });
  it("rejects a file over 512 KB", async () => {
    const big = new File([new Uint8Array(520 * 1024)], "a.png", { type: "image/png" });
    const r = await uploadLogo(fd({ logo: big }));
    expect(r).toEqual({ ok: false, error: "Ukuran logo maksimal 512 KB." });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- "pengaturan/instansi/actions"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/(admin)/pengaturan/instansi/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth/session";
import { normalizeHex } from "@/lib/branding/accent";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 512 * 1024;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

async function gate() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role !== "super_admin") {
    return { db, me: null, denied: { ok: false as const, error: "Tidak diizinkan." } };
  }
  return { db, me, denied: null };
}

export async function saveAppSettings(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const namaInstansi = String(formData.get("nama_instansi") ?? "").trim();
  const namaSingkat = String(formData.get("nama_singkat") ?? "").trim();
  const warnaAksen = String(formData.get("warna_aksen") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim() || null;
  const alamat = String(formData.get("alamat") ?? "").trim() || null;
  const telepon = String(formData.get("telepon") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!namaInstansi) return { ok: false, error: "Nama instansi wajib diisi." };
  if (!namaSingkat) return { ok: false, error: "Nama singkat wajib diisi." };
  if (!HEX_RE.test(warnaAksen)) return { ok: false, error: "Format warna aksen harus #RRGGBB." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Format email tidak valid." };
  }

  const { error } = await db
    .from("app_settings")
    .update({
      nama_instansi: namaInstansi,
      nama_singkat: namaSingkat,
      tagline,
      alamat,
      telepon,
      email,
      warna_aksen: normalizeHex(warnaAksen),
      updated_at: new Date().toISOString(),
      updated_by: me!.id,
    })
    .eq("id", 1);
  if (error) {
    console.error("saveAppSettings: update failed", error);
    return { ok: false, error: "Gagal menyimpan pengaturan instansi." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function uploadLogo(formData: FormData): Promise<Result> {
  const { db, denied } = await gate();
  if (denied) return denied;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pilih berkas logo." };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { ok: false, error: "Logo harus PNG, JPG, WEBP, atau SVG." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Ukuran logo maksimal 512 KB." };
  }

  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
  const path = `logo-${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage.from("branding").upload(path, file, { upsert: true });
  if (upErr) {
    console.error("uploadLogo: upload failed", upErr);
    return { ok: false, error: "Gagal mengunggah logo." };
  }

  const { data: current } = await db.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
  const oldPath = current?.logo_url;

  const { error: updErr } = await db.from("app_settings").update({ logo_url: path }).eq("id", 1);
  if (updErr) {
    console.error("uploadLogo: settings update failed", updErr);
    return { ok: false, error: "Gagal menyimpan logo." };
  }
  if (oldPath && oldPath !== path) {
    const { error: rmErr } = await db.storage.from("branding").remove([oldPath]);
    if (rmErr) console.error("uploadLogo: old logo cleanup failed", rmErr);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeLogo(): Promise<Result> {
  const { db, denied } = await gate();
  if (denied) return denied;

  const { data: current } = await db.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
  const oldPath = current?.logo_url;

  const { error } = await db.from("app_settings").update({ logo_url: null }).eq("id", 1);
  if (error) {
    console.error("removeLogo: update failed", error);
    return { ok: false, error: "Gagal menghapus logo." };
  }
  if (oldPath) {
    const { error: rmErr } = await db.storage.from("branding").remove([oldPath]);
    if (rmErr) console.error("removeLogo: file cleanup failed", rmErr);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- "pengaturan/instansi/actions" && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (6 tests). If the `db.from().update()` mock chain doesn't match (the impl does `.update().eq()` and also `.from().select().eq().maybeSingle()` in `uploadLogo`), extend the test mock so both chains resolve — keep every assertion.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/instansi/actions.ts" "src/app/(admin)/pengaturan/instansi/actions.test.ts"
git commit -m "feat(instansi): saveAppSettings / uploadLogo / removeLogo actions"
```

---

## Task 16: `/pengaturan/instansi` page + form + preview + hub card

**Files:**
- Create: `src/app/(admin)/pengaturan/instansi/page.tsx`, `src/app/(admin)/pengaturan/instansi/instansi-form.tsx`, `src/app/(admin)/pengaturan/instansi/brand-preview.tsx`, `src/app/(admin)/pengaturan/instansi/instansi-form.test.tsx`
- Modify: `src/app/(admin)/pengaturan/page.tsx`

**Interfaces:**
- Consumes: `getAppSettings` (Task 6), `deriveAccent` / `accentWarning` (Task 5), `saveAppSettings` / `uploadLogo` / `removeLogo` (Task 15), `<Field>` (Task 9), shadcn `input`/`button`/`card`, `sonner` `toast`.
- Produces: the settings screen; a super_admin-only "Instansi" card on `/pengaturan`.

- [ ] **Step 1: Write the failing form test**

```tsx
// src/app/(admin)/pengaturan/instansi/instansi-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InstansiForm } from "./instansi-form";

const DEFAULTS = {
  namaInstansi: "Absensi HR", namaSingkat: "Absensi HR", tagline: null, logoUrl: null,
  alamat: null, telepon: null, email: null, warnaAksen: "#2563EB",
};

describe("InstansiForm", () => {
  it("shows a format error for an invalid accent hex", async () => {
    const user = userEvent.setup();
    render(<InstansiForm defaults={DEFAULTS} saveAppSettings={vi.fn()} uploadLogo={vi.fn()} removeLogo={vi.fn()} />);
    const hex = screen.getByLabelText(/warna aksen/i);
    await user.clear(hex);
    await user.type(hex, "blue");
    expect(await screen.findByText(/#RRGGBB/i)).toBeInTheDocument();
  });

  it("shows a contrast warning for a low-contrast accent", async () => {
    const user = userEvent.setup();
    render(<InstansiForm defaults={DEFAULTS} saveAppSettings={vi.fn()} uploadLogo={vi.fn()} removeLogo={vi.fn()} />);
    const hex = screen.getByLabelText(/warna aksen/i);
    await user.clear(hex);
    await user.type(hex, "#949494");
    expect(await screen.findByText(/kontras rendah/i)).toBeInTheDocument();
  });

  it("submits the text fields to saveAppSettings", async () => {
    const user = userEvent.setup();
    const saveAppSettings = vi.fn().mockResolvedValue({ ok: true });
    render(<InstansiForm defaults={DEFAULTS} saveAppSettings={saveAppSettings} uploadLogo={vi.fn()} removeLogo={vi.fn()} />);
    await user.clear(screen.getByLabelText(/nama instansi/i));
    await user.type(screen.getByLabelText(/nama instansi/i), "PT Contoh");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    const submitted = saveAppSettings.mock.calls[0][0] as FormData;
    expect(submitted.get("nama_instansi")).toBe("PT Contoh");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- instansi-form.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `brand-preview.tsx`**

```tsx
// src/app/(admin)/pengaturan/instansi/brand-preview.tsx
"use client";

import { deriveAccent } from "@/lib/branding/accent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function BrandPreview({ hex, namaSingkat }: { hex: string; namaSingkat: string }) {
  let vars: React.CSSProperties = {};
  try {
    const d = deriveAccent(hex);
    vars = {
      ["--primary" as string]: d.primary,
      ["--primary-foreground" as string]: d.primaryForeground,
      ["--ring" as string]: d.ring,
    };
  } catch {
    /* invalid hex — show the inherited theme */
  }
  const initial = (namaSingkat[0] ?? "A").toUpperCase();
  return (
    <div className="space-y-3">
      {(["light", "dark"] as const).map((mode) => (
        <div
          key={mode}
          style={vars}
          className={`${mode === "dark" ? "dark bg-neutral-950" : "bg-white"} flex items-center gap-3 rounded-xl border border-border p-4`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
            {initial}
          </div>
          <Button size="sm">Tombol</Button>
          <Badge>Label</Badge>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `instansi-form.tsx`**

```tsx
// src/app/(admin)/pengaturan/instansi/instansi-form.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accentWarning } from "@/lib/branding/accent";
import type { AppSettings } from "@/lib/branding/get-app-settings";
import { BrandPreview } from "./brand-preview";

type Result = { ok: true } | { ok: false; error: string };

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function InstansiForm({
  defaults,
  saveAppSettings,
  uploadLogo,
  removeLogo,
}: {
  defaults: AppSettings;
  saveAppSettings: (fd: FormData) => Promise<Result>;
  uploadLogo: (fd: FormData) => Promise<Result>;
  removeLogo: () => Promise<Result>;
}) {
  const [hex, setHex] = useState(defaults.warnaAksen);
  const [namaSingkat, setNamaSingkat] = useState(defaults.namaSingkat);
  const [busy, setBusy] = useState(false);

  const hexInvalid = hex.length > 0 && !HEX_RE.test(hex);
  const warning = HEX_RE.test(hex) ? accentWarning(hex) : null;

  async function onSave(formData: FormData) {
    setBusy(true);
    try {
      const r = await saveAppSettings(formData);
      if (r.ok) toast.success("Pengaturan instansi tersimpan.");
      else toast.error(r.error);
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(formData: FormData) {
    setBusy(true);
    try {
      const r = await uploadLogo(formData);
      if (r.ok) toast.success("Logo diperbarui.");
      else toast.error(r.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <form action={onSave} className="space-y-5">
        <Field id="nama_instansi" label="Nama Instansi" required>
          <Input name="nama_instansi" defaultValue={defaults.namaInstansi} />
        </Field>
        <Field id="nama_singkat" label="Nama Singkat" hint="Dipakai di sidebar & tempat sempit" required>
          <Input
            name="nama_singkat"
            value={namaSingkat}
            onChange={(e) => setNamaSingkat(e.target.value)}
          />
        </Field>
        <Field id="tagline" label="Tagline">
          <Input name="tagline" defaultValue={defaults.tagline ?? ""} />
        </Field>
        <Field id="alamat" label="Alamat">
          <Input name="alamat" defaultValue={defaults.alamat ?? ""} />
        </Field>
        <Field id="telepon" label="Telepon">
          <Input name="telepon" defaultValue={defaults.telepon ?? ""} />
        </Field>
        <Field id="email" label="Email">
          <Input name="email" type="email" defaultValue={defaults.email ?? ""} />
        </Field>
        <div className="flex items-end gap-2">
          <Field
            id="warna_aksen"
            label="Warna Aksen"
            error={hexInvalid ? "Format warna harus #RRGGBB." : undefined}
            hint={warning ?? undefined}
            className="flex-1"
          >
            <Input
              name="warna_aksen"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-40 font-mono"
            />
          </Field>
          <input
            type="color"
            aria-label="Pilih warna aksen"
            value={HEX_RE.test(hex) ? hex : "#2563EB"}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="mb-1 h-9 w-9 shrink-0 rounded border border-input"
          />
        </div>
        <Button type="submit" disabled={busy || hexInvalid}>
          Simpan
        </Button>
      </form>

      <aside className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Pratinjau</p>
          <BrandPreview hex={HEX_RE.test(hex) ? hex : defaults.warnaAksen} namaSingkat={namaSingkat} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Logo</p>
          {defaults.logoUrl && (
            <img src={defaults.logoUrl} alt="Logo saat ini" className="mb-2 h-16 w-16 rounded object-contain" />
          )}
          <form action={onLogo} className="space-y-2">
            <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            <p className="text-xs text-muted-foreground">PNG/JPG/WEBP/SVG, maks 512 KB.</p>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                Unggah Logo
              </Button>
              {defaults.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await removeLogo();
                      if (r.ok) toast.success("Logo dihapus.");
                      else toast.error(r.error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Hapus Logo
                </Button>
              )}
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Write `page.tsx`**

```tsx
// src/app/(admin)/pengaturan/instansi/page.tsx
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveAppSettings, uploadLogo, removeLogo } from "./actions";
import { InstansiForm } from "./instansi-form";

export default async function InstansiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "super_admin") redirect("/pengaturan");

  const defaults = await getAppSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instansi"
        description="Identitas organisasi yang tampil di seluruh aplikasi, login, dan dokumen."
      />
      <InstansiForm
        defaults={defaults}
        saveAppSettings={saveAppSettings}
        uploadLogo={uploadLogo}
        removeLogo={removeLogo}
      />
    </div>
  );
}
```

- [ ] **Step 6: Add the hub card**

In `src/app/(admin)/pengaturan/page.tsx`, inside the `{(employee.role === "hr_admin" || employee.role === "super_admin") && (...)}` grid, add — but gated to super_admin only — a card **before** the "Hari Libur" card:

```tsx
          {employee.role === "super_admin" && (
            <Link
              href="/pengaturan/instansi"
              className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-blue-300"
            >
              <p className="text-sm font-medium text-neutral-900">Instansi</p>
              <p className="mt-1 text-xs text-neutral-500">
                Nama, logo, kontak, dan warna aksen aplikasi.
              </p>
            </Link>
          )}
```

(Keep the legacy `neutral`/`blue` classes here — this hub page is redesigned in SP3.)

- [ ] **Step 7: Verify**

```bash
npm test -- instansi-form.test.tsx
./node_modules/.bin/tsc --noEmit
npm run build
```

Expected: form tests pass; tsc clean; build lists `/pengaturan/instansi`. Then dev-server smoke: log in as super_admin → `/pengaturan` shows the Instansi card → the screen loads, changing the accent + Simpan re-colours shadcn components app-wide after the revalidate; uploading a logo updates the favicon and `<BrandMark>` (visible once SP2 mounts it — for now verify via the preview + the DB row). Log in as hr_admin → `/pengaturan/instansi` redirects to `/pengaturan`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(admin)/pengaturan/instansi" "src/app/(admin)/pengaturan/page.tsx"
git commit -m "feat(instansi): /pengaturan/instansi settings screen + hub card"
```

---

## Post-plan verification

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npm run test:integration -- app-settings-rls
```

Then the final whole-branch review, then `finishing-a-development-branch`.

## SP2 hand-off (do NOT do in this sub-project)

- Mount `<AppFooter />` + `<ThemeToggle />` in `AdminShell` and `EmployeeShell`; add `<AppFooter />` + `<BrandMark />` to `login` and the new landing page.
- Replace the hardcoded `"A"` monogram + `"Absensi HR"` in `AdminShell` / `EmployeeShell` / `login/page.tsx` with `<BrandMark>`.
- Give the shells `dark:` support; migrate them off legacy tokens.
- Payslip + recap PDF headers: logo + `namaInstansi` from `getAppSettings`.
- Delete a legacy token from `globals.css` only when the last page referencing it is redesigned (SP3/SP4).
- **SP3:** create `src/lib/charts/palette.ts` (6–8 fixed WCAG-AA categorical colours, per the `dataviz` skill) and move `attendance-trend-chart.tsx` onto it + `dark:` support. Chart colours are a designed set, never derived from the accent.
- **SP2/3:** if server actions grow more complex, revisit whether a shared validation helper (still hand-rolled) is worth extracting; do not introduce Zod without a separate decision.
