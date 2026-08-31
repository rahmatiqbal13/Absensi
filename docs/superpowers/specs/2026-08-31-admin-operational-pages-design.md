# Admin Operational Pages — Redesign (SP4a)

## Goal

Redesign the six daily-driver admin screens — **dashboard, karyawan list, karyawan detail, karyawan create, persetujuan-cuti, laporan** — and their client sub-components onto the SP1 design system (shadcn/ui primitives, semantic tokens, `PageHeader` / `EmptyState` / `Field`), replacing the legacy `text-neutral-*` / `bg-white` / `bg-blue-*` / hand-rolled `<table>` markup. The dashboard is genuinely reworked (six stat tiles, a pending-approvals action tile, a per-branch breakdown, a today's-exceptions list, a recent-activity feed) rather than merely reskinned. Also fixes the SP3 leftover: `/profil` gets a role-aware shell.

This is **sub-project 4a of 5** in the branding/redesign initiative. SP1 (design system) + SP2 (shells + entry pages) + SP3 (employee profile) are complete.

## Non-goals (this sub-project)

- Payroll pages (`/payroll`, `/payroll/[periodId]`) and the pengaturan cluster (`/pengaturan` hub + instansi/departemen/jadwal/libur/audit) — those are **SP4b**.
- Employee pages (`/absen`, `/cuti`, `/riwayat`, `/slip-gaji`) — **SP5**.
- Dark mode. `theme-provider.tsx` stays `forcedTheme="light"`. New code uses semantic + `dark:`-ready utilities (no `bg-white` / `text-neutral-*`) so SP5's dark-mode-debt task inherits clean code, but no `.dark` verification happens here.
- The recharts `AttendanceTrendChart` internals — its hard-coded `dataviz`-palette colors stay; SP5 handles dark-mode chart chrome. SP4a only wraps it in a `Card`.
- Any server-action, RLS, or data-model change. The only new backend code is **four additive, read-only dashboard aggregation functions** in `src/lib/dashboard/` plus additive fields on `getTodaySummary`.
- Deleting the legacy `--color-neutral-*` / `--radius-card` / `--shadow-card` token block from `globals.css` — SP4b and SP5 pages still use it. SP4a removes only the now-unused `SummaryCard` component.
- The lint/test guard against new `text-neutral-[789]00` / `bg-white` under `src/app` (SP2 review recommendation) — lands in SP5's final task, not here.

## Tech context

- Next.js 16.3 App Router (`searchParams` / `params` are Promises), React 19.2, TypeScript strict, Tailwind v4, shadcn/ui (`radix-nova` preset), `lucide-react`, `recharts`, Supabase cloud.
- shadcn primitives already generated in `src/components/ui/`: `card`, `table`, `tabs`, `select`, `input`, `label`, `textarea`, `checkbox`, `badge`, `button`, `separator`, `skeleton`, `alert`, `dropdown-menu`, `dialog`, `alert-dialog`, `avatar`, `tooltip`, `popover`, `sheet`, `sonner`.
- Shared components already built: `PageHeader` (`{ title, description?, actions? }`), `EmptyState` (`{ icon: LucideIcon, message, action? }`), `Field` (`{ id, label, hint?, error?, required?, className?, children }` — clones a single valid-element child to wire `id` / `aria-describedby` / `aria-invalid`), `RoleBadge`, `LeaveStatusBadge`, `PayrollStatusBadge`, `AuditAksiBadge`, `AttendanceStatusBadge` (5 distinct variants: `tepat_waktu`=success, `terlambat`=warning, `pulang_cepat`=neutral, `alpa`=destructive, `di_luar_lokasi`=info), `AttendanceTrendChart`.
- `AdminShell` (SP2/SP3): `{ employee: CurrentEmployee, avatarUrl?: string, brand: ReactNode, footer: ReactNode, children }` — client component; the server `layout.tsx` injects `brand`/`footer`/`avatarUrl`.
- `getCurrentEmployee(db)` → `CurrentEmployee | null` with `{ id, nama, email, role, branchId, fotoPath }`.
- `signProfilePhotoUrl(db, path | null)` / `signProfilePhotoUrls(db, paths[])` from `src/lib/profile/photo.ts` — never throw, null-degrade.
- `Card` is `bg-card` + `ring-1 ring-foreground/10` + `rounded-xl` + `[--card-spacing:--spacing(4)]`; `size="sm"` → `--spacing(3)`. `Table` wraps itself in an `overflow-x-auto` container and hover-tints rows.
- Icons: `lucide-react` only, never emoji, never new hand-rolled inline SVG (migrate any that a redesigned component still carries — e.g. the `approval-table` empty-state SVG).
- Indonesian UI copy. `lang="id"`.
- Unit tests: Vitest + Testing Library (`npm test` = `vitest run src/`). `./node_modules/.bin/tsc --noEmit` — never `npx tsc`. `npm run build` currently 26 routes; SP4a keeps 26 (route paths unchanged; `/profil` just moves route groups).

---

## 1. Shared components

All in `src/components/`, token-based, `dark:`-ready, each with an RTL test.

### 1.1 `<StatCard>` — `src/components/stat-card.tsx`

Replaces the legacy `SummaryCard` (which uses `bg-white` / `text-neutral-*` and is only consumed by the dashboard).

```ts
type StatCardTone = "default" | "warning" | "destructive" | "accent";

function StatCard(props: {
  label: string;
  value: number | string;
  sublabel?: string;          // e.g. "89%"
  tone?: StatCardTone;        // tints the value (and, for "accent", the whole card border + a trailing arrow)
  icon?: LucideIcon;
  href?: string;              // when set, the whole card is a <Link> with a hover state
}): JSX.Element
```

- Base: `<Card size="sm">` (or a `<Link>` wrapping the same markup when `href`). `label` → `text-xs text-muted-foreground`; `value` → `text-2xl font-semibold` with the tone color (`text-foreground` / `text-warning?` — use `text-amber-600 dark:text-amber-500` if no `--warning` token exists, `text-destructive`, `text-primary`); `sublabel` → `text-xs text-muted-foreground`.
- `tone="accent"` + `href`: card gets `ring-primary/30 hover:ring-primary/50` and a trailing `ArrowRight` icon; used for "Menunggu persetujuan".
- `href` without accent: subtle `hover:bg-muted/40` and pointer.

**Test** (`stat-card.test.tsx`): renders label + value + sublabel; `href` → an `<a>` with that href wrapping the content; `tone="destructive"` → the value element carries the destructive class; no `href` → no link.

### 1.2 `<ResponsiveTable>` — `src/components/responsive-table.tsx`

Generic list that is a real table on `md`+ and a card-stack below.

```ts
type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";       // default left; right for numerics
  headerClassName?: string;
  cellClassName?: string;
  hideOnMobile?: boolean;         // omit this column from the mobile card
  mobileLabel?: string;           // label text in the mobile card (defaults to `header` if it's a string)
};

function ResponsiveTable<T>(props: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;   // wraps the row / card in a <Link>
  caption?: string;               // sr-only <caption> / mobile heading
  emptyState: React.ReactNode;    // rendered (instead of the table) when rows.length === 0
  footer?: React.ReactNode;       // a <TableFooter> row on desktop; a summary <Card> on mobile (caller passes both via `footerMobile`)
  footerMobile?: React.ReactNode;
}): JSX.Element
```

- **`md`+**: `<Table><TableHeader>` from `columns`, `<TableBody>` one `<TableRow>` per row (wrapped in `<Link>` when `rowHref` — use a row-level click handler + `<td>`-anchored links pattern that keeps a real `<a>` for accessibility; simplest: render the first cell's content inside an `<a>` that stretches via `after:absolute after:inset-0` on a `relative` row). `align: "right"` → `text-right tabular-nums`. `footer` → `<TableFooter>`.
- **below `md`** (`md:hidden`): a `flex flex-col gap-2`; each row → `<Card size="sm">` (wrapped in `<Link>` when `rowHref`). The **first** column's `cell` is the card's prominent line (`text-sm font-medium`); the remaining non-`hideOnMobile` columns render as a `dl`-ish `grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs` of `mobileLabel` → `cell`. `footerMobile` after the last card.
- `rows.length === 0` → render `emptyState`, nothing else.
- The desktop table lives inside `Table`'s own `overflow-x-auto`, so wide numeric tables (laporan) still scroll horizontally on a narrow-but-≥md viewport.

**Test** (`responsive-table.test.tsx`): with rows → asserts BOTH a `<table>` with the right `<th>`s / a data cell value AND (mobile markup is in the DOM too, just `md:hidden`) the card markup with a `mobileLabel`; `hideOnMobile` column absent from the card; `rowHref` → `<a href>` present; empty rows → `emptyState` shown and no `<table>`; `footer` + `footerMobile` render in their slots.

### 1.3 `<FilterBar>` — `src/components/filter-bar.tsx`

Layout-only shell. `function FilterBar({ children, className }: { children: React.ReactNode; className?: string })` → a `<div className={cn("flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3", className)}>`. Each page keeps its own `<form>` semantics, fields, and router logic; they render their fields inside `<FilterBar>`. A field is a `<div className="flex flex-col gap-1.5">` + `<Label>` + a shadcn `<Select>` / `<Input>`.

**Test** (`filter-bar.test.tsx`): renders children; applies the base classes; merges `className`.

### 1.4 Remove `SummaryCard`

Delete `src/components/summary-card.tsx` + `src/components/summary-card.test.tsx`. Grep-confirm no remaining import (only `dashboard/page.tsx` uses it, and Section 2 rewrites that page).

---

## 2. Dashboard — `src/app/(admin)/dashboard/`

### 2.1 New / extended lib functions (`src/lib/dashboard/`)

Each is a pure `async (db, …) => Result` following the existing `attendance-summary.ts` house style (mock-`db` unit-testable, `console.error` + a typed `{ ok: false; error }` on failure). All read-only.

**a) `getTodaySummary` — extend** (`attendance-summary.ts`). The `AttendanceSummary` type gains `pulangCepat: number`, `diLuarLokasi: number`, `cuti: number`. `pulangCepat` / `diLuarLokasi` are counts of today's attendance rows whose `status` is exactly that value — they are **sub-flags that overlap `hadir`** (an employee who left early still counts in `hadir`); the dashboard labels make this reading clear. `cuti` = count of distinct active employees (branch-scoped when `branchId` given) with an **approved** `leave_requests` row whose `[tanggal_mulai, tanggal_selesai]` span includes today. (The plan must confirm the approved-status string against the `leave_requests.status` enum — `disetujui` / `approved` — from a migration or `leave-status-badge.tsx`.) The existing `hadir` / `terlambat` / `alpa` / `other` / `total` semantics are unchanged. Existing `attendance-summary.test.ts` cases stay green; new cases cover the three new fields.

**b) `getPendingApprovalCount(db, employee)` — new** (`pending-approval-count.ts`). Returns `{ ok: true; count: number } | { ok: false; error: string }`. Query mirrors the persetujuan-cuti page's scoping: `leave_requests` `status = "pending"`, `count: "exact", head: true`; for `hr_admin` / `super_admin` no extra filter, otherwise `.eq("approver_id", employee.id)`.

**c) `getBranchBreakdown(db)` — new** (`branch-breakdown.ts`). Returns `{ ok: true; rows: { branchId: string; nama: string; hadir: number; terlambat: number; alpa: number }[] } | { ok: false; error }`. One row per branch: today's attendance rows grouped by `employees.branch_id`, plus `alpa` = (active headcount in branch) − (rows for branch). Implementation may be one `attendances` select with `employees!inner(branch_id)` + a `branches` list + an active-headcount-per-branch count, reduced in JS. Called only when **no** branch filter is active; the page also hides the block when the org has `<= 1` branch (nothing to compare).

**d) `getTodayExceptions(db, branchId?)` — new** (`today-exceptions.ts`). Returns `{ ok: true; rows: { employeeId: string; nama: string; status: "terlambat" | "alpa" | "di_luar_lokasi" | "pulang_cepat"; menitTerlambat: number | null }[] } | { ok: false; error }`. Today's attendance rows whose `status` ∈ {`terlambat`, `di_luar_lokasi`, `pulang_cepat`} + employee `nama` (+ `menit_terlambat` when present), plus employees with **no** row today as `status: "alpa"`. Branch-scoped via `employees!inner(branch_id)` when `branchId`. Sorted alpa → terlambat (desc by minutes) → di_luar_lokasi → pulang_cepat. The page caps display at 8 and shows "+ N lainnya".

**e) `getRecentActivity(db)` — new** (`recent-activity.ts`). Returns `{ ok: true; rows: { id: string; aksi: string; actorNama: string; waktu: string }[] } | { ok: false; error }`. `audit_logs` select `id, aksi, waktu, actor:employees!audit_logs_actor_id_fkey(nama)`, order `waktu` desc, `limit(10)`. RLS on `audit_logs` already restricts reads to hr_admin/super_admin; the page still only calls this for those roles.

### 2.2 `dashboard/page.tsx` (server component)

- `getCurrentEmployee` guard → `redirect("/login")`.
- `branchId` from `searchParams.branch` (validated against the loaded branch list, like `laporan` does).
- Fire the queries with `Promise.all`: `getTodaySummary(db, branchId)`, `getPendingApprovalCount(db, employee)`, `getTodayExceptions(db, branchId)`, `getMonthlyTrend(db, ym, branchId)` (existing), plus — only when `!branchId` — `getBranchBreakdown(db)`, and — only when `employee.role` is `hr_admin` / `super_admin` — `getRecentActivity(db)`.
- Layout (matches the approved wireframe):
  1. `<PageHeader title="Dashboard" description={\`Ringkasan kehadiran hari ini${branchName ? " · " + branchName : ""}\`}>` with `<DashboardControls>` in `actions`.
  2. **Stat row** — `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6`: six `<StatCard>` — `Hadir` (`sublabel` = `${pct}%` of `total`), `Terlambat` (`tone="warning"`), `Pulang Cepat`, `Di Luar Lokasi`, `Alpa` (`tone="destructive"`), `Cuti`. If `getTodaySummary` fails → a single `<Alert variant="destructive">` in place of the row.
  3. **`grid gap-4 lg:grid-cols-3`**: trend `<Card>` spanning `lg:col-span-2` (`CardHeader` "Tren Kehadiran Bulan Ini" / "Hadir & terlambat per hari", `CardContent` → `<AttendanceTrendChart>` or an inline error), and a `<StatCard label="Menunggu persetujuan" value={count} tone="accent" href="/persetujuan-cuti" />` (the tile text: value + "Tinjau pengajuan cuti →" via `sublabel`).
  4. **`grid gap-4 lg:grid-cols-2`** (only the blocks that have data):
     - Per-branch `<Card>` — `CardHeader` "Per Cabang · hari ini", `CardContent` → `<ResponsiveTable>` (Cabang / Hadir / Terlambat / Alpa). Omitted entirely when a branch filter is active.
     - Exceptions `<Card>` — `CardHeader` "Perlu perhatian · hari ini", `CardContent` → a list: each row `nama` + an `<AttendanceStatusBadge status={...}>` (+ "N mnt" for terlambat). Cap 8 + "+ N lainnya". Empty → a muted "Semua karyawan hadir tepat waktu." line.
  5. **Recent activity `<Card>`** (hr_admin / super_admin only) — `CardHeader` "Aktivitas Terakhir" with a `CardAction` "Lihat semua" `<Link href="/pengaturan/audit">`; `CardContent` → list of `actorNama` · `aksi` · relative time (`Intl.RelativeTimeFormat("id")` or the existing date formatter). Empty → muted "Belum ada aktivitas.".
- **Independent degradation:** each block reads its own `Result`; a failed one renders a small inline `<p className="text-sm text-destructive">` (or `<Alert>`) and the rest of the page still renders.

### 2.3 `dashboard-controls.tsx` (client)

Reskin: `<FilterBar>`-style row isn't needed (it sits in the `PageHeader` `actions`), but migrate to shadcn `<Select>` (Cabang) + `<Button variant="outline" size="sm">` ("Muat ulang", with a `RefreshCw` icon) + the "Diperbarui HH:MM:SS" text as `text-xs text-muted-foreground`. The 30-second `router.refresh()` interval + the `useState` timestamp logic are unchanged. Its test updates to query the shadcn control roles.

---

## 3. Karyawan list — `src/app/(admin)/karyawan/`

### 3.1 `karyawan/page.tsx` (server component)

- Guard + role check unchanged (`hr_admin` / `super_admin` only).
- Query unchanged (already selects `foto_profil_url` from SP3); `signProfilePhotoUrls` call unchanged.
- Render:
  - `<PageHeader title="Karyawan" description="Kelola data karyawan dan onboarding.">` with `actions={<Button asChild><Link href="/karyawan/baru"><UserPlus /> Tambah Karyawan</Link></Button>}`.
  - `<EmployeeFilters>` (reskinned — §3.2) inside its own `<FilterBar>`.
  - Error → `<Alert variant="destructive">Gagal memuat daftar karyawan.</Alert>`.
  - `<ResponsiveTable>`:
    - **Nama** — `cell`: `<span className="flex items-center gap-2">` avatar (`<Avatar className="size-7">` + signed photo / initials fallback) + name; `rowHref: (r) => \`/karyawan/${r.id}\``.
    - **Jabatan** — text.
    - **Cabang** — `branches?.nama ?? "-"`.
    - **Peran** — `<RoleBadge role={r.role}>`.
    - **Status** — a small badge: `<Badge variant={r.status === "aktif" ? "success" : "neutral"}>{Aktif|Nonaktif}</Badge>` (extract as `<StatusPill status>` if it's also needed on the detail page — it is, §4.3 — so build `src/components/status-pill.tsx` + test).
    - `emptyState`: `<EmptyState icon={Users} message="Tidak ada karyawan yang cocok dengan filter." />`.
    - Mobile card: avatar+name title, `Jabatan · Cabang` as one line (`mobileLabel` tricks or a custom first-cell), Peran + Status badges.

### 3.2 `employee-filters.tsx` (client)

Reskin to shadcn: `<Input id="q">` (search, `role="search"` form kept), three `<Select>` (Cabang / Peran / Status), a "Cari" `<Button type="submit">`. The `pushWith` / `URLSearchParams` logic is unchanged. Fields rendered as `<FilterBar>` children (the page wraps). Update `employee-filters.test.tsx` to the shadcn `<Select>` interaction (it's a Radix listbox, not a native `<select>` — use `userEvent` + `getByRole("combobox")` / `option`; `vitest.setup.ts` already shims pointer-capture).

### 3.3 `status-pill.tsx` — new shared

`function StatusPill({ status }: { status: "aktif" | "nonaktif" })` → `<Badge variant={status === "aktif" ? "success" : "neutral"}>{status === "aktif" ? "Aktif" : "Nonaktif"}</Badge>`. Test: both states render the label + a distinct class.

---

## 4. Karyawan detail + create

### 4.1 `employee-form-fields.tsx` (shared client, used by create + edit)

Reorganize the flat field list into **four titled sections**. Each section: `<section className="space-y-3">` + `<h2 className="text-sm font-medium text-foreground">{title}</h2>` + `<div className="grid gap-4 sm:grid-cols-2">` of `<Field>` + shadcn control:
- **Identitas** — nama, email, jabatan
- **Kepegawaian** — status kontrak (`<Select>`), tanggal mulai kerja (`<Input type="date">`), gaji pokok (`<Input inputMode="numeric">`), role (`<Select>`)
- **Struktur Organisasi** — cabang (`<Select>`), departemen (`<Select>`), atasan (`<Select>`)
- **Persetujuan** — designated approver (`<Select>`)

All existing prop names, validation, `name` attributes, and the parent forms' `FormData` handling stay identical — this is a presentational regroup. Native `<select>` → shadcn `<Select>` (which posts its value via a hidden input or the parent reads state — check the current pattern; if the forms currently rely on native `<select name>` in `FormData`, keep a hidden `<input>` synced to the `<Select>` value, or lift to `useState` + append in the submit handler). `employee-form-fields.test.tsx` updates to the new control roles + asserts the four section headings.

### 4.2 `karyawan/baru/page.tsx` + `create-employee-form.tsx`

`<PageHeader title="Tambah Karyawan" description="…">`; the form inside a `<Card><CardContent>`. `<CreateEmployeeForm>` keeps its server-action wiring; its layout becomes the sectioned `<EmployeeFormFields>` + a `<Button type="submit">` in a `CardFooter` or a trailing row. Reskin the success/error surface to `<Alert>` / `sonner` (match whatever it does now — presentational only).

### 4.3 `karyawan/[id]/page.tsx` (server component)

- Guard + queries unchanged.
- `error` → `<Alert variant="destructive">Gagal memuat data karyawan.</Alert>`; `!emp` → `notFound()`.
- `<PageHeader title={emp.nama} description={emp.email}>` with `actions={<><RoleBadge role={emp.role} /><StatusPill status={emp.status} /></>}`.
- Body is shadcn **`<Tabs defaultValue="detail">`** (client boundary — a tiny `<KaryawanDetailTabs>` wrapper, or `<Tabs>` directly since it's already `"use client"` internally and the two panels are server-rendered children passed in… `Tabs` is a client component, so the panels must be client or passed as `children`; simplest: a `"use client"` `<KaryawanTabs detailSlot={…} riwayatSlot={…}>` that takes two `ReactNode`s — the SP2 brand/footer prop-injection pattern):
  - **Detail** — `<EditEmployeeForm>` (the sectioned fields + the existing status-toggle / deactivate control, reskinned; keep `isSelf` guard behavior).
  - **Riwayat** — the audit list. Empty → `<EmptyState icon={History} message="Belum ada riwayat." />`. Non-empty → `<ResponsiveTable>` columns **Aksi** (`<AuditAksiBadge>` if the action maps, else text), **Oleh** (`actor.nama ?? "Sistem"`), **Waktu** (`Intl.DateTimeFormat("id-ID", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Jakarta" })`). Mobile cards.
- `edit-employee-form.tsx` reskin: `<Alert>` / `sonner` for outcomes, shadcn `<Button>` for save + the status action (`variant="destructive"` for deactivate, guarded by an `<AlertDialog>` confirm — the deactivate is destructive and irreversible-ish; if it currently has no confirm, add one). `edit-employee-form.test.tsx` updates.

---

## 5. Persetujuan Cuti — `src/app/(admin)/persetujuan-cuti/`

### 5.1 `page.tsx` (server component)

Guard unchanged. Error branch → `<PageHeader>` + `<Alert variant="destructive">`. Success → `<PageHeader title="Persetujuan Cuti" description="Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan.">` + `<ApprovalList requests={…} approveLeave={…} rejectLeave={…} />`.

### 5.2 `approval-list.tsx` (client — replaces `approval-table.tsx`)

Same props (`requests: PendingLeaveRequest[]`, `approveLeave(id, catatan|null)`, `rejectLeave(id, catatan)`) and the same per-request state (`catatanByRequest`, `errorByRequest`, `pendingId`) and rules (reject requires a non-empty `catatan`; inline error).

- **Empty** → `<EmptyState icon={CalendarCheck} message="Tidak ada pengajuan cuti yang menunggu persetujuan." />` (drop the hand-rolled SVG).
- **`md`+**: shadcn `<Table>` — Karyawan, Jenis (`JENIS_LABELS` map, kept), Tanggal (range via the existing `formatDate`), Alasan, and an actions `<TableCell>` with a rejection-reason `<Input>` + **Setujui** `<Button>` / **Tolak** `<Button variant="destructive">` + the inline error.
- **below `md`**: one `<Card>` per request — `CardHeader` = employee name + a `<Badge>` for jenis; `CardContent` = date range + alasan; then the reason `<Input>` + the two `<Button>`s + error.
- Extract a `<ApprovalActions request={…} …>` sub-component holding the reason input + buttons + error so the table cell and the card share it.
- On a successful action the row/card disappears on the server re-render (the actions already `revalidate`); keep that behavior.

`approval-table.test.tsx` → `approval-list.test.tsx`: keep the behavioral assertions (approve calls the action with trimmed note or null; reject with empty note shows the "Catatan wajib diisi untuk menolak." error and does NOT call the action; reject with a note calls it; a failing action surfaces its error), retargeted to the shadcn controls. Both the desktop and mobile markup are in the DOM — query within the visible structure or assert the shared `<ApprovalActions>` once.

---

## 6. Laporan Kehadiran — `src/app/(admin)/laporan/`

### 6.1 `page.tsx` (server component)

- All the param-validation / `loadRecap` / `queryString` logic is **unchanged** (security-sensitive — the branch-id allowlist guard stays exactly as is).
- `<PageHeader title="Laporan Kehadiran" description="Rekap per karyawan untuk rentang tanggal terpilih.">` with `actions` (only when `recap.ok`): **Unduh CSV** and **Unduh PDF** as `<Button variant="outline" asChild><a href={\`/laporan/csv?${queryString}\`}>` with a `Download` icon. (Plain `<a>` — these are file downloads, not client nav.)
- `<LaporanFilters>` (reskinned — §6.2) in a `<FilterBar>`.
- `!recap.ok` → `<Alert variant="destructive">{recap.error}</Alert>`.
- `recap.ok && rows.length === 0` → `<EmptyState icon={FileBarChart} message="Tidak ada karyawan aktif untuk filter ini." />`.
- `recap.ok && rows.length > 0` → `<ResponsiveTable>`:
  - Columns: **Nama** (first, prominent on mobile), then **Hadir**, **Terlambat**, **Pulang Cepat**, **Di Luar Lokasi**, **Alpa** (`align:"right"`, cell tinted `text-destructive` when `> 0`), **Cuti**, **Menit Terlambat** — all `align:"right" tabular-nums`.
  - `footer`: a `<TableFooter>` `<TableRow>` — "Total" in the Nama cell, then `sum` of each numeric column across `recap.rows`.
  - `footerMobile`: a `<Card size="sm">` titled "Total" with the same sums as `label → value` rows.

### 6.2 `laporan-filters.tsx` (client)

Reskin to shadcn `<Select>` (Cabang, Departemen — Departemen still branch-scoped via the existing `deptOptions` filter) + `<Input type="date">` (Dari, Sampai) + a "Terapkan" `<Button>`. `pushWith` / `URLSearchParams` logic unchanged. `laporan-filters.test.tsx` updates to the shadcn control interactions.

---

## 7. Role-aware `/profil` shell

### 7.1 Move the route

`src/app/(employee)/profil/` → `src/app/(account)/profil/` — move `page.tsx`, `actions.ts`, `actions.test.ts`, `profil-form.tsx`, `profil-form.test.tsx` verbatim (import paths that were `../` relative may need one adjustment; `@/`-absolute imports unaffected). The URL stays `/profil`. Every link to it is a string `href="/profil"` (EmployeeShell nav item, AdminShell UserMenu item) — no link changes.

### 7.2 `src/app/(account)/layout.tsx` (new, server component)

```tsx
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  const isAdmin = employee.role === "hr_admin" || employee.role === "super_admin" || employee.role === "atasan";
  if (isAdmin) {
    const avatarUrl = await signProfilePhotoUrl(db, employee.fotoPath);
    return (
      <AdminShell employee={employee} avatarUrl={avatarUrl ?? undefined}
        brand={<BrandMark size="md" />} footer={<AppFooter />}>
        {children}
      </AdminShell>
    );
  }
  return (
    <EmployeeShell brand={<BrandMark size="sm" />} footer={<AppFooter />}>
      {children}
    </EmployeeShell>
  );
}
```

- The `/profil` page keeps its own defensive `getCurrentEmployee` / `redirect` guard (it already has one).
- `(employee)/layout.tsx` and the EmployeeShell bottom nav are **untouched** — `/profil` stays the 5th nav item; it now resolves through `(account)/layout.tsx`.
- `route-access.ts`: `/profil` is not in `ADMIN_PATH_PREFIXES` / `HR_ADMIN_PATH_PREFIXES` / `PUBLIC_PATHS`, so `resolveRouteAccess` currently returns `"allow"` for any signed-in role and `redirect-login` for none — correct for a shared account page. No change needed; confirm with a quick read.
- **Admin `/profil` UX:** the identity `<dl>` + phone + photo + sign-out is the same; an admin now sees it inside the AdminShell with the sidebar, so "back to dashboard" is always available.

### 7.3 Tests

- The moved `profil-form.test.tsx` / `actions.test.ts` run unchanged from the new path.
- New `src/app/(account)/layout.test.tsx` — mock `getCurrentEmployee` + `signProfilePhotoUrl`; assert an `hr_admin` renders the AdminShell (query a sidebar nav landmark / a Dashboard link) and a `karyawan` renders the EmployeeShell (bottom-nav landmark); `null` employee → `redirect` called with `/login`.

---

## 8. Testing summary & compatibility

### 8.1 New / changed tests

| File | What |
| --- | --- |
| `stat-card.test.tsx` | label/value/sublabel, `href` link, tone class, no-href |
| `responsive-table.test.tsx` | table + card markup, `hideOnMobile`, `rowHref`, empty, footer slots |
| `filter-bar.test.tsx` | children, base classes, `className` merge |
| `status-pill.test.tsx` | both states |
| `attendance-summary.test.ts` | + pulangCepat / diLuarLokasi / cuti cases (existing cases stay) |
| `pending-approval-count.test.ts` | hr vs atasan scoping, error path |
| `branch-breakdown.test.ts` | per-branch reduction, alpa = headcount − rows, error path |
| `today-exceptions.test.ts` | status filter + no-row-as-alpa + sort + branch scope |
| `recent-activity.test.ts` | order/limit/shape, error path |
| `dashboard-controls.test.tsx` | shadcn Select + refresh button + timestamp (retarget) |
| `employee-filters.test.tsx` | shadcn Select/Input interaction (retarget) |
| `laporan-filters.test.tsx` | shadcn Select/date interaction (retarget) |
| `employee-form-fields.test.tsx` | 4 section headings + shadcn controls (retarget) |
| `create-employee-form.test.tsx` / `edit-employee-form.test.tsx` | retarget to shadcn controls; edit adds the deactivate `<AlertDialog>` confirm |
| `approval-list.test.tsx` (was `approval-table.test.tsx`) | keep behavioral assertions, retarget |
| `(account)/layout.test.tsx` | role → shell, null → redirect |
| `summary-card.test.tsx` | **deleted** |

Server pages (`dashboard`, `karyawan`, `karyawan/[id]`, `karyawan/baru`, `persetujuan-cuti`, `laporan`) are covered by `npm run build` + a manual light-theme dev-server smoke pass.

### 8.2 Compatibility gate

- `npm test` green, `./node_modules/.bin/tsc --noEmit` clean, `npm run build` = 26 routes (unchanged; `/profil` moves group but keeps its path).
- Manual smoke (light theme): `/dashboard` (all six blocks + degradation when a query is forced to fail), `/karyawan` (list + filters + mobile cards at a narrow width), `/karyawan/[id]` (both tabs), `/karyawan/baru`, `/persetujuan-cuti` (approve + reject-without-note + reject-with-note), `/laporan` (filters + totals row + CSV/PDF links), `/profil` as an `hr_admin` (AdminShell) and as a `karyawan` (EmployeeShell).
- No visual regression on the not-yet-redesigned pages (`/payroll`, `/pengaturan/*`, employee pages) — they still use the legacy token block, which is retained.

### 8.3 Hand-off to SP4b / SP5

- **SP4b** (payroll + pengaturan): reuse `StatCard` / `ResponsiveTable` / `FilterBar` / `StatusPill`; the pengaturan hub cards become `<Link>`-wrapped `<Card>`s; audit page reuses the Riwayat-tab table pattern.
- **SP5** final "dark-mode debt" task (unchanged): invert `--color-neutral-*` under `.dark` + `bg-white` → `bg-card` sweep across the still-legacy `src/app` bodies, then revert `theme-provider` to `system` + re-mount `<ThemeToggle>`; add the lint/test guard against new `text-neutral-[789]00` / `bg-white` in `src/app`; give `AttendanceTrendChart` dark-mode grid/axis colors; consider surfacing `<ThemeToggle>` on `/profil`.
- Legacy `--color-neutral-*` / `--radius-card` / `--shadow-card` deletion happens in SP5's final task once SP4b + SP5 remove the last consumers.
