# Admin Config Pages — Redesign (SP4b)

## Goal

Systematically reskin the eight admin **config** screens — payroll list + payroll period detail, the `/pengaturan` hub, and `instansi` / `departemen` / `jadwal` / `libur` / `audit` — onto the SP1 shadcn/token design system, reusing the SP4a shared kit (`PageHeader`, `Card`, `ResponsiveTable`, `FilterBar`, `StatusPill`, `NativeSelect`, `Alert`, `EmptyState`). Replace legacy `text-neutral-*` / `bg-white` / `bg-blue-*` classes, hand-rolled `<ul>` lists, and `<table>` markup. Add an `AlertDialog` confirm to the two currently-unguarded destructive deletes (departemen, libur).

This is **sub-project 4b of 5** in the branding/redesign initiative. SP1/SP2/SP3/SP4a are complete.

## Non-goals

- Employee pages (`/absen`, `/absen/consent`, `/cuti`, `/riwayat`, `/slip-gaji`) — **SP5**.
- Dark mode. `theme-provider.tsx` stays `forcedTheme="light"`. New/touched code uses semantic + `dark:`-ready utilities so SP5's dark-mode task inherits clean code; no `.dark` verification here.
- Any server-action, RLS, payroll-calculation, or data-model change. This is **pure presentation** — no new backend code, no new migrations, no signature changes to server actions.
- The SP4a-deferred dashboard-lib items (`status = 'aktif'` filters on `getTodaySummary.cuti` / `getBranchBreakdown`, org-wide non-working-day check for the Alpa tile, `initials()` hoist).
- Deleting the legacy `--color-neutral-*` / `--radius-card` / `--shadow-card` token block from `globals.css` — SP5's employee pages still use it. SP4b removes no shared component.
- The `text-amber-600 dark:text-amber-400` inline class on the accent-color warning in `instansi-form.tsx` — kept (deliberate, matches `StatCard`'s warning tone; there is no `--warning` token).

## Tech context

- Next.js 16.3 App Router (`searchParams` / `params` are Promises), React 19.2, TypeScript strict, Tailwind v4, shadcn/ui (`radix-nova`), `lucide-react`, `@react-pdf/renderer` (payslip PDF, untouched), Supabase cloud.
- shadcn primitives already generated in `src/components/ui/`: `card`, `table`, `tabs`, `select`, `input`, `label`, `textarea`, `checkbox`, `badge`, `button`, `separator`, `skeleton`, `alert`, `alert-dialog` (exports `AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel`), `dropdown-menu`, `dialog`, `avatar`, `tooltip`, `popover` (exports `Popover, PopoverTrigger, PopoverContent`), `sheet`, `sonner`.
- SP4a shared components (`src/components/`): `PageHeader` (`{ title, description?, actions? }`), `EmptyState` (`{ icon: LucideIcon, message, action? }`), `Field` (clones a single valid-element child → `id` / `aria-describedby` / `aria-invalid`), `StatusPill` (`{ status: "aktif" | "nonaktif" }`), `NativeSelect` (styled `<select>`, forwardRef, keeps `FormData` + `fireEvent.change` working), `FilterBar` (layout shell), `ResponsiveTable` (see below), `AuditAksiBadge` (already shadcn `<Badge>` — SP4a), `PayrollStatusBadge`, `RoleBadge`.
- `ResponsiveTable<T>`: `{ columns, rows, rowKey, rowHref?, caption?, emptyState, footer?, footerMobile? }`; `Column<T> = { key, header, cell: (row) => ReactNode, align?: "left" | "right", headerClassName?, cellClassName?, hideOnMobile?, mobileLabel? }`. Desktop shadcn `<Table>` on `md`+, mobile `<Card>` stack below (`md:hidden`), `footer` wrapped in `<TableFooter><TableRow>`, empty → `emptyState`. **The FIRST column's cell is the mobile card title with no label** — lead with an identifying column. `caption` → `<caption className="sr-only">` (pass one at every call site).
- `getCurrentEmployee(db)` → `{ id, nama, email, role, branchId, fotoPath } | null`, wrapped in React `cache()` (SP4a).
- Formatters: `formatRupiah` (`@/lib/format/rupiah`), `monthLabel` / `MONTH_NAMES_ID` (`@/lib/format/month`).
- Route-group `error.tsx` boundaries exist for `(admin)` / `(account)` / `(employee)` (SP4a).
- Unit tests: Vitest + Testing Library (`npm test` = `vitest run src/`). `./node_modules/.bin/tsc --noEmit` — never `npx tsc`. `npm run build` currently 26 routes; SP4b keeps 26 (no route paths change).
- **`instansi-form.tsx` already uses `<Field>` + semantic tokens** (built to the design system in SP1) — it needs the lightest touch: its raw `<input>` children → shadcn `<Input>` / `<Textarea>`, its raw `<button>`s → `<Button>`, and the two panels wrapped in `<Card>`. Do not rebuild it.

## Global constraints

- **No shared server-action / RLS / payroll-calc / data-model change.** No new migrations. The shared server actions in each route's `actions.ts` (`createPayrollPeriod`, `generatePayroll`, `finalizePayroll`, `addDepartment`, `deleteDepartment`, `addHoliday`, `deleteHoliday`, `saveSchedule`, `saveAppSettings`, `uploadLogo`, `removeLogo`, `addHoliday`) — their imports and signatures are **unchanged**. The only permitted change is to a **page-local inline `"use server"` wrapper** that exists purely as presentation glue: the `remove(id)` wrappers in `departemen/page.tsx` and `libur/page.tsx` change their return type from `void` to the underlying `Result` so `<ConfirmDeleteButton>` can toast on failure (they still `console.error` the raw error). No behavior change — just propagating the result.
- **Never render raw Postgres/PostgREST error text.** `console.error` the raw error; render a fixed Indonesian string (the existing pages already return fixed strings — keep them, move them into `<Alert>`).
- Semantic + `dark:`-ready utilities only in new/touched code: `bg-card`, `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `border-border`, `border-input`, `ring-foreground/10`, `text-primary`. **Never** `bg-white`, `bg-neutral-*`, `text-neutral-*`, `bg-blue-*`, `text-blue-*`, `border-neutral-*`, `divide-neutral-*`, `text-red-600`, `text-green-*`, `hover:border-blue-300`, `bg-green-50`, `bg-neutral-50`. (The one kept exception: the accent-warning `text-amber-600 dark:text-amber-400` in `instansi-form.tsx`.)
- Icons: `lucide-react` only. Never emoji. Never new hand-rolled inline SVG.
- Indonesian UI copy. `lang="id"`.
- Every page keeps its existing auth guard + role check verbatim (`if (!employee) redirect("/login")`; `hr_admin` / `super_admin` — `instansi` is `super_admin` only).
- Current unit suite: 431 green. Must stay green at every commit; `tsc` clean; `npm run build` 26 routes.

---

## 1. Shared component

### 1.1 `<ConfirmDeleteButton>` — `src/components/confirm-delete-button.tsx` (+ test)

```ts
function ConfirmDeleteButton(props: {
  action: () => Promise<{ ok: true } | { ok: false; error: string }>;
  title: string;              // AlertDialog heading, e.g. "Hapus departemen?"
  description: string;        // AlertDialog body
  label?: string;             // trigger button text, default "Hapus"
  confirmLabel?: string;      // action button text, default "Hapus"
}): JSX.Element
```

- `"use client"`. `useTransition` for the pending state; `sonner` `toast` import.
- Trigger: `<AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /> {label ?? "Hapus"}</Button></AlertDialogTrigger>`.
- `<AlertDialogContent>`: `<AlertDialogHeader>` with `<AlertDialogTitle>{title}</AlertDialogTitle>` + `<AlertDialogDescription>{description}</AlertDialogDescription>`; `<AlertDialogFooter>` with `<AlertDialogCancel>Batal</AlertDialogCancel>` + `<AlertDialogAction disabled={pending} onClick={(e) => { e.preventDefault(); startTransition(async () => { const r = await action(); if (!r.ok) toast.error(r.error); }); }}>{confirmLabel ?? "Hapus"}</AlertDialogAction>`.
  - `e.preventDefault()` so the dialog doesn't auto-close before the action resolves; on `{ ok: true }` the server revalidates (the page's `remove` server action already does — see each list below) and the row disappears on re-render, closing is moot. On `{ ok: false }` the toast fires and the dialog stays open (do NOT close it).
- Controlled `open` state so an error keeps it open: `const [open, setOpen] = useState(false)`; close on success (`setOpen(false)` inside the transition when `r.ok`).

**Test** (`confirm-delete-button.test.tsx`): renders the trigger with the `label`; clicking it opens the dialog (title + description visible); clicking the confirm button calls `action`; an `action` resolving `{ ok: false, error }` → `toast.error` called with the error and the dialog title still visible (not closed); `{ ok: true }` → dialog closes. Mock `sonner`. `vitest.setup.ts` already shims pointer-capture for Radix.

Consumed by: §6 (departemen), §8 (libur).

---

## 2. Payroll list — `src/app/(admin)/payroll/page.tsx`

Keep the guard, role check, the `branches` + `payroll_periods` queries, and the inline `createPeriod` server action **unchanged**. Replace the returned JSX:

- `<PageHeader title="Payroll" description="Buat periode, generate slip gaji, lalu finalisasi." />`.
- **Buat Periode Baru** — `<Card><CardHeader><CardTitle>Buat Periode Baru</CardTitle></CardHeader><CardContent>`: `branchErr` → `<Alert variant="destructive"><AlertDescription>Gagal memuat daftar cabang.</AlertDescription></Alert>`, else `<CreatePeriodForm branches={branches ?? []} createPeriod={createPeriod} />`.
- **Periode** — `periodErr` → `<Alert variant="destructive">`. Else `<ResponsiveTable>`:
  - columns: **Periode** (`cell`: `` `${branchNama} — ${monthLabel(p.bulan)} ${p.tahun}` ``, `rowHref` → `` `/payroll/${p.id}` ``), **Slip** (`cell`: `` `${count} slip` ``, `mobileLabel: "Slip"`), **Total** (`align: "right"`, `cell`: `formatRupiah(total)`, `mobileLabel: "Total"`), **Status** (`cell`: `<PayrollStatusBadge status={p.status as PayrollStatus} />`, `mobileLabel: "Status"`).
  - `rowKey={(p) => p.id}`, `caption="Daftar periode payroll"`, `emptyState={<EmptyState icon={Wallet} message="Belum ada periode payroll." />}`.
  - `total` / `count` are computed exactly as today (`p.payslips` reduce).

### 2.1 `create-period-form.tsx`

Reskin, keep all state + `handleSubmit`: `<form>` stays `flex flex-wrap items-end gap-3` (it sits inside a Card, no `<FilterBar>` needed). `<Field id="branchId" label="Cabang">` + `<NativeSelect name="branchId" required>`; `<Field id="bulan" label="Bulan">` + `<NativeSelect name="bulan" defaultValue={String(now.getMonth() + 1)}>` (`MONTH_NAMES_ID` options, value `i + 1`); `<Field id="tahun" label="Tahun">` + `<Input name="tahun" type="number" defaultValue={now.getFullYear()} className="w-28">`; `<Button type="submit" disabled={submitting}>Buat Periode</Button>`. `error` → `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>` (full width); `success` → `<Alert><AlertDescription>Periode dibuat.</AlertDescription></Alert>`.

`create-period-form.test.tsx` (if it exists — grep) retargets to the shadcn controls; keep every behavioral assertion (submits FormData with branchId/bulan/tahun; shows error on `{ ok: false }`; shows success on `{ ok: true }`).

---

## 3. Payroll period detail — `src/app/(admin)/payroll/[periodId]/page.tsx`

Keep the guard, role check, `period` + `payslips` queries, the `rows` mapping, and the inline `onGenerate` / `onFinalize` server actions **unchanged**. Replace the JSX:

- `periodErr` → `<Alert variant="destructive"><AlertDescription>Gagal memuat periode payroll.</AlertDescription></Alert>`; `!period` → `notFound()`.
- `<PageHeader title={\`${branchNama} — ${monthLabel(period.bulan)} ${period.tahun}\`} description="Slip gaji periode ini." actions={<PayrollStatusBadge status={period.status as PayrollStatus} />} />`.
- `slipErr` → `<Alert variant="destructive">` above the table.
- `<PayslipTable rows={rows} status={period.status} onGenerate={onGenerate} onFinalize={onFinalize} />`.

### 3.1 `payslip-table.tsx`

Keep all state (`message`, `error`, `busy`, `confirming`, `expanded`) + `run()`. Reskin:

- **Draft actions row** (`status === "draft"`): `<Button type="button" disabled={busy} onClick={() => run(onGenerate)}>Generate Slip</Button>` + a **Finalisasi** flow behind an `<AlertDialog>` (replaces the inline `confirming` state — finalize is irreversible): `<AlertDialogTrigger asChild><Button variant="default" disabled={busy}>Finalisasi</Button></AlertDialogTrigger>`, content "Finalisasi periode ini? Slip tidak bisa diubah setelah difinalisasi.", `<AlertDialogAction onClick={(e) => { e.preventDefault(); void run(onFinalize); }}>Finalisasi</AlertDialogAction>`. (Keep `confirming` state only if simpler to leave as an inline confirm — either is acceptable; prefer the `AlertDialog` for consistency with `<ConfirmDeleteButton>`.)
- Outcome: `error` → `<Alert variant="destructive">`, `message` → `<Alert>` (default).
- **Slips** — `payslip-table` renders its **own hand-built shadcn `<Table>`** (NOT `<ResponsiveTable>`): it needs a bespoke per-row expand (the `rincian` detail row), a totals `<TableFooter>`, and a `md:hidden` mobile card variant that `ResponsiveTable` can't express. Use `Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell` from `@/components/ui/table`.
  - Desktop columns: **Nama**, **Gaji Pokok** (`text-right`, `formatRupiah`), **Hari Kerja** (`text-right`), **Potongan** (`text-right`, `formatRupiah`, wrapped `<span className={s.totalPotongan > 0 ? "text-destructive" : undefined}>`), **Gaji Akhir** (`text-right font-medium`, `formatRupiah`), **Rincian** (`text-right` — `<Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>{expanded === s.id ? "Tutup" : "Rincian"}</Button>`).
  - Each slip row is a `<Fragment>`: the `<TableRow>` of cells, then — when `expanded === s.id` — a `<TableRow><TableCell colSpan={6}>` with the `rincian` daily breakdown (`tanggal` · `status` · potongan) as a small token-styled inner list.
  - Totals `<TableFooter>`: "Total" + `sum(gajiPokok)`, blank hari-kerja, `sum(totalPotongan)`, `sum(gajiAkhir)`, blank rincian — all `text-right tabular-nums`.
  - Mobile (`md:hidden`): a `<Card size="sm">` per slip — Nama as title, the four figures as `label → value` rows, a "Rincian" toggle; a final "Total" `<Card>`.
  - Empty (`rows.length === 0`) → `<EmptyState icon={ReceiptText} message="Belum ada slip. Klik Generate Slip untuk membuat." />`.

`payslip-table.test.tsx` retargets to shadcn controls; keep every assertion (generate calls `onGenerate`; finalize confirm flow calls `onFinalize`; a failing action surfaces its error; expand toggles the detail row; totals row present).

---

## 4. Pengaturan hub — `src/app/(admin)/pengaturan/page.tsx`

Keep the guard + `countActiveSuperAdmins` call **unchanged**. Replace the JSX:

- `<PageHeader title="Pengaturan" description="Konfigurasi dan status sistem." />`.
- Super-admin count:
  - `superAdminCount === null` → `<Alert variant="destructive"><AlertDescription>Tidak dapat memeriksa jumlah Super Admin aktif saat ini. Silakan muat ulang halaman.</AlertDescription></Alert>`.
  - `superAdminCount < 2` → `<Alert variant="destructive"><AlertTriangle /><AlertDescription>Peringatan: sistem ini hanya memiliki {superAdminCount} Super Admin aktif. Minimal 2 Super Admin diperlukan agar mekanisme persetujuan cuti berjenjang untuk HR/Super Admin tetap berfungsi. Tambahkan Super Admin lain sesegera mungkin.</AlertDescription></Alert>`.
- Link grid (unchanged role guards — the whole grid is `hr_admin || super_admin`; the Instansi card is additionally `super_admin` only): `<div className="grid gap-3 sm:grid-cols-2">` of `<Link href={...}>` each wrapping `<Card size="sm" className="transition-colors hover:bg-muted/40">` with `<CardHeader>` → an icon (`Building2` instansi, `CalendarOff` libur, `ScrollText` audit, `Building2`/`Network` departemen, `Clock` jadwal), `<CardTitle>` + `<CardDescription>`, and a trailing `<ChevronRight className="size-4 text-muted-foreground" />` (use `CardAction` for the chevron, or a flex row). Copy for each card unchanged from the current page.

---

## 5. Instansi — `src/app/(admin)/pengaturan/instansi/`

`page.tsx` already uses `PageHeader` — no change. Reskin `instansi-form.tsx` (light touch — it already uses `<Field>` + tokens):

- Swap its raw `<input>` children for shadcn `<Input>`; the Alamat field → shadcn `<Textarea>` if it isn't already; raw `<button>`s (Save, logo upload "Unggah" / "Hapus Logo") → `<Button>` (`variant="ghost"` for Hapus Logo).
- Wrap the left `<form>` in `<Card><CardContent>` and the right `<aside>` (Pratinjau + Logo) in `<Card><CardContent>`. Keep the `lg:grid-cols-[1fr_20rem]` outer layout.
- Save / logo outcome messages → `<Alert>` / `sonner` (match current behavior — presentational only).
- `<BrandPreview>` (`brand-preview.tsx`): swap any `bg-white` / `text-neutral-*` for `bg-card` / `text-foreground` / `text-muted-foreground`.
- Keep the `<input type="color">` and the `role="status"` accent-warning `<p className="text-xs text-amber-600 dark:text-amber-400">` verbatim.

`instansi-form.test.tsx` retargets to shadcn controls; keep every assertion (save posts FormData; logo upload flow; accent-color warning; error surfaces).

---

## 6. Departemen — `src/app/(admin)/pengaturan/departemen/page.tsx`

Keep the guard, role check, `branches` + `departments` queries, and the inline `remove` server action **unchanged** (it already calls `deleteDepartment` + `console.error` on failure). Replace the JSX:

- `<PageHeader title="Departemen" description="Kelompokkan karyawan per departemen di tiap cabang." />`.
- `<Card><CardContent><DepartmentForm branches={branches ?? []} addDepartment={addDepartment} /></CardContent></Card>`.
- `error` → `<Alert variant="destructive">`. List → `<ResponsiveTable>`:
  - columns: **Nama** (first), **Cabang** (`(d.branches as unknown as { nama: string } | null)?.nama ?? "-"`, `mobileLabel: "Cabang"`), **Aksi** (`align: "right"`, `cell`: `<ConfirmDeleteButton action={remove.bind(null, d.id)} title="Hapus departemen?" description={\`Departemen "${d.nama}" akan dihapus. Karyawan di dalamnya tidak ikut terhapus.\`} />`).
  - `rowKey={(d) => d.id}`, `caption="Daftar departemen"`, `emptyState={<EmptyState icon={Network} message="Belum ada departemen." />}`.
- The inline `remove` must return the `Result` so `<ConfirmDeleteButton>` can toast on failure. Current `remove` returns `void` + `console.error`s — change it to `return res;` (still `console.error` on `!res.ok`). This is a page-local server action, not a shared action — the change is allowed (it's presentation wiring, not a contract change).

### 6.1 `department-form.tsx`

Reskin, keep state + `action`: `<form action={action} className="flex flex-wrap items-end gap-3">` + `<Field id="nama" label="Nama Departemen">` + `<Input name="nama">`; `<Field id="branchId" label="Cabang">` + `<NativeSelect name="branchId" defaultValue={branches[0]?.id ?? ""}>`; `<Button type="submit" disabled={busy}>Tambah</Button>`; `error` → `<Alert variant="destructive">` (full width).

`department-form.test.tsx` (grep) retargets; keep every assertion.

---

## 7. Jadwal Kerja — `src/app/(admin)/pengaturan/jadwal/page.tsx`

Keep the guard, role check, `branches` + `work_schedules` queries, and `byBranch` map **unchanged**. Replace the JSX:

- `<PageHeader title="Jadwal Kerja" description="Satu jadwal per cabang — dipakai untuk status terlambat dan perhitungan payroll." />`.
- No branches → `<EmptyState icon={Clock} message="Belum ada cabang." />`.
- `<div className="space-y-4">` of one `<ScheduleForm key={b.id} branchId={b.id} branchNama={b.nama} defaults={byBranch.get(b.id) ?? null} saveSchedule={saveSchedule} />` per branch (props unchanged).

### 7.1 `schedule-form.tsx`

Full reskin, keep state + `action` + the `days` Set logic:
- Wrap in `<Card><CardHeader><CardTitle>{branchNama}</CardTitle></CardHeader><CardContent><form action={action} className="space-y-4">`.
- `<div className="flex flex-wrap items-end gap-3">`: `<Field id="jamMasuk-{branchId}" label="Jam Masuk">` + `<Input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"}>`; same for `jamPulang` (default `"17:00"`); `<Field id="toleransiMenit-{branchId}" label="Toleransi (menit)">` + `<Input name="toleransiMenit" type="number" min="0" defaultValue={defaults?.toleransiMenit ?? 15} className="w-28">`.
- `<fieldset>` with `<legend className="text-sm font-medium text-foreground">Hari kerja</legend>` + a `flex flex-wrap gap-3` of `<label className="flex items-center gap-1.5 text-sm">` each containing a shadcn `<Checkbox name="hariKerja" value={String(d.v)} defaultChecked={days.has(d.v)} />` + the day label. **Important:** shadcn `<Checkbox>` is a Radix component that does NOT natively submit in `FormData` — it needs a synced hidden `<input type="checkbox" name="hariKerja" value={d.v} defaultChecked>` OR keep the checkbox uncontrolled-native. **Simplest & correct:** keep the day checkboxes as **native `<input type="checkbox" name="hariKerja">`** styled with the design-system classes (`size-4 rounded border-input accent-primary`), NOT the Radix `<Checkbox>` — the form posts `hariKerja` as a multi-value field and `saveSchedule` reads `formData.getAll("hariKerja")`. Do not change the submission mechanism.
- `error` → `<Alert variant="destructive">`; `msg` → `<Alert>` (default); `<Button type="submit" disabled={busy}>Simpan</Button>`.

`schedule-form.test.tsx` (grep) retargets to the new markup; keep every assertion (saves FormData with jamMasuk/jamPulang/toleransiMenit + the checked `hariKerja` values; error/success surface; the `days` Set pre-checks the right boxes).

---

## 8. Libur — `src/app/(admin)/pengaturan/libur/page.tsx`

Keep the guard, role check, the `tahun` param, `branches` + `holidays` queries, and the inline `remove` server action **unchanged** except `remove` returns its `Result` (same as §6). Replace the JSX:

- `<PageHeader title={\`Hari Libur ${tahun}\`} description="Dipakai payroll untuk menghitung hari kerja efektif." />`.
- `<FilterBar>` with one field: `<Field id="tahun" label="Tahun">` + `<NativeSelect defaultValue={tahun} onChange={(e) => router.push(\`/pengaturan/libur?tahun=${e.target.value}\`)}>` with options for `currentYear - 2 .. currentYear + 1`. This makes the page need a small `"use client"` `<YearFilter>` sub-component (the page is a server component) — create `src/app/(admin)/pengaturan/libur/year-filter.tsx` (`{ tahun: string }`, uses `useRouter`).
- `<Card><CardContent><HolidayForm branches={branches ?? []} addHoliday={addHoliday} /></CardContent></Card>`.
- `error` → `<Alert variant="destructive">`. List → `<ResponsiveTable>`:
  - columns: **Tanggal** (first — `fmt.format(new Date(\`${h.tanggal}T00:00:00Z\`))`), **Nama** (`mobileLabel: "Nama"`), **Cakupan** (`(h.branches as unknown as { nama: string } | null)?.nama ?? "Nasional"`, `mobileLabel: "Cakupan"`), **Aksi** (`align: "right"`, `<ConfirmDeleteButton action={remove.bind(null, h.id)} title="Hapus hari libur?" description={\`"${h.nama}" pada ${fmt.format(...)} akan dihapus.\`} />`).
  - `rowKey={(h) => h.id}`, `caption={\`Daftar hari libur ${tahun}\`}`, `emptyState={<EmptyState icon={CalendarOff} message={\`Belum ada libur tercatat untuk ${tahun}.\`} />}`.

### 8.1 `holiday-form.tsx`

Reskin, keep state + `action` + the "no HTML `required`" comment: `<form action={action} className="flex flex-wrap items-end gap-3">` + `<Field id="tanggal" label="Tanggal">` + `<Input name="tanggal" type="date">`; `<Field id="nama" label="Nama Libur">` + `<Input name="nama">`; `<Field id="branchId" label="Cakupan">` + `<NativeSelect name="branchId" defaultValue="">` with a `<option value="">Nasional</option>` first then the branches; `<Button type="submit" disabled={busy}>Tambah</Button>`; `error` → `<Alert variant="destructive">` (full width).

`holiday-form.test.tsx` (grep) retargets; keep every assertion.

---

## 9. Audit — `src/app/(admin)/pengaturan/audit/page.tsx`

Keep the guard, role check, `employees` query, the full `audit_logs` query with all its `sp.*` filters, and the `fmt` formatter **unchanged**. Replace the JSX:

- `<PageHeader title="Log Audit" description="Riwayat perubahan data karyawan dan persetujuan cuti." />`.
- `<AuditFilters employees={employees ?? []} defaults={sp} />` (reskinned — §9.1).
- `error` → `<Alert variant="destructive"><AlertDescription>Gagal memuat log audit.</AlertDescription></Alert>`.
- List → `<ResponsiveTable>`:
  - columns: **Waktu** (first — `fmt.format(new Date(r.waktu))`, `cellClassName: "whitespace-nowrap"`), **Aksi** (`<AuditAksiBadge aksi={r.aksi} />`, `mobileLabel: "Aksi"`), **Aktor** (`(r.actor …)?.nama ?? "Sistem"` + `{r.is_self_action && <span className="ml-1 text-xs text-muted-foreground">(aksi sendiri)</span>}`, `mobileLabel: "Aktor"`), **Target** (`(r.target …)?.nama ?? "-"`, `mobileLabel: "Target"`), **Detail** (`align: "right"`, `cell`: `<AuditDetailPopover detail={r.detail} />`).
  - `rowKey={(r) => r.id}`, `caption="Log audit"`, `emptyState={<EmptyState icon={ScrollText} message="Belum ada catatan audit." />}`.
- `<AuditDetailPopover>` — inline in the page file OR a tiny `src/app/(admin)/pengaturan/audit/audit-detail-popover.tsx` (`"use client"`, `{ detail: unknown }`): `<Popover><PopoverTrigger asChild><Button variant="ghost" size="sm">Lihat</Button></PopoverTrigger><PopoverContent className="w-96"><pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-[11px]">{detail == null ? "—" : JSON.stringify(detail, null, 2)}</pre></PopoverContent></Popover>`. (Client component — `Popover` is Radix. The page passes `r.detail` which is JSON — safe to serialize.)

### 9.1 `audit-filters.tsx`

Reskin into `<FilterBar>`, keep the `pushWith` / router logic: `<Input type="date">` (Dari, Sampai), `<NativeSelect>` (Target Karyawan — a "" = "Semua" option + employees), `<NativeSelect>` (Aksi — "" = "Semua aksi" + the known `AuditAksiBadge` action keys as options with their Indonesian labels), `<Button type="submit">Terapkan</Button>`. `role="search"` form kept.

`audit-filters.test.tsx` (grep) retargets to the shadcn controls; keep every assertion (each control change → `router.push` with the right query string).

---

## 10. Testing summary & compatibility

### 10.1 New / changed tests

| File | What |
| --- | --- |
| `confirm-delete-button.test.tsx` | trigger opens dialog; confirm calls `action`; `{ ok: false }` → toast + stays open; `{ ok: true }` → closes |
| `create-period-form.test.tsx` | retarget to shadcn controls (grep — create if absent? no: only retarget if it exists) |
| `payslip-table.test.tsx` | retarget: generate/finalize (AlertDialog) + expand toggle + totals row + error surface |
| `instansi-form.test.tsx` | retarget to shadcn `<Input>`/`<Textarea>`/`<Button>` |
| `department-form.test.tsx` | retarget |
| `schedule-form.test.tsx` | retarget (native day checkboxes kept; time/number → shadcn `<Input>`) |
| `holiday-form.test.tsx` | retarget |
| `audit-filters.test.tsx` | retarget to shadcn `<Input type="date">` / `<NativeSelect>` |

The plan must `grep` for each `*.test.tsx` before its task and: if it exists, retarget it (keep every assertion); if it does **not** exist, the reskinned form is covered by `npm run build` + the light-theme smoke — do **not** create a new test file just for a presentational reskin. `confirm-delete-button.test.tsx` is the one genuinely new test.

### 10.2 Compatibility gate

- `npm test` green, `./node_modules/.bin/tsc --noEmit` clean, `npm run build` = 26 routes (unchanged).
- Manual smoke (light theme): `/payroll` (create a period + the period list + row click), `/payroll/[periodId]` (generate → slips render → finalize confirm → status flips; expand a rincian; totals row), `/pengaturan` (the card grid + the super-admin-count Alert), `/pengaturan/instansi` (save + logo upload + accent warning), `/pengaturan/departemen` (add + delete-with-confirm + the confirm's error toast), `/pengaturan/jadwal` (edit a branch schedule + day checkboxes persist), `/pengaturan/libur` (year filter + add + delete-with-confirm), `/pengaturan/audit` (filters push URL + detail popover).
- No visual regression on the not-yet-redesigned pages (`/absen`, `/cuti`, `/riwayat`, `/slip-gaji`, `/absen/consent`) — they still use the legacy token block, which is retained.
- `grep -rn "text-neutral-\|bg-white\|bg-blue-\|text-blue-\|border-neutral-\|divide-neutral-\|text-red-600\|text-green-6\|hover:border-blue" src/app/\(admin\)/payroll src/app/\(admin\)/pengaturan` → **no matches** except the intentional `text-amber-*` in `instansi-form.tsx`.

### 10.3 Hand-off to SP5

- **SP5** is the last redesign sub-project: reskin the 5 employee pages (`/absen`, `/absen/consent`, `/cuti`, `/riwayat`, `/slip-gaji`) + the "dark-mode debt" task — invert `--color-neutral-*` under `.dark` + `bg-white` → `bg-card` sweep over whatever legacy remains, then `theme-provider` → `system` + re-mount `<ThemeToggle>` in both shells, give `AttendanceTrendChart` dark grid/axis colors, add the lint/test guard against new `text-neutral-[789]00` / `bg-white` in `src/app`, and delete the legacy `--color-neutral-*` / `--radius-card` / `--shadow-card` block once its last consumer is gone.
- SP4a-deferred items still open (not SP4b's scope): `getTodaySummary.cuti` + `getBranchBreakdown` not filtered to `employees.status = 'aktif'`; branch-scoped `cuti` path untested; `initials()` duplicated between `profil-form.tsx` and `karyawan/page.tsx` (hoist to `src/lib/utils.ts` when either is next touched); org-wide non-working-day check for the Alpa tile.
