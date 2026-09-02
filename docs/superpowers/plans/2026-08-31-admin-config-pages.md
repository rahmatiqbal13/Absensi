# Admin Config Pages Redesign (SP4b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically reskin the eight admin config screens (payroll list + period detail, `/pengaturan` hub, and instansi/departemen/jadwal/libur/audit) onto the SP1 shadcn/token design system, reusing the SP4a shared kit, and add an `AlertDialog` confirm to the two currently-unguarded deletes.

**Architecture:** One new shared component (`<ConfirmDeleteButton>`), two tiny new page-local client sub-components (`<YearFilter>`, `<AuditDetailPopover>`), and a reskin of each page + its client form. No server-action / RLS / payroll-calc / data-model change; no migrations. `instansi-form.tsx` is already on the design system — it only needs `<Card>` wrappers.

**Tech Stack:** Next.js 16.3 (App Router, async server components, `searchParams`/`params` are Promises) · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui (`radix-nova`) · `lucide-react` · `sonner` · Supabase cloud · Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-08-31-admin-config-pages-design.md`. Sub-project **4b of 5**; SP1/SP2/SP3/SP4a complete.

## Global Constraints

- TypeScript strict. `npm test` = `vitest run src/`. `./node_modules/.bin/tsc --noEmit` — **NEVER** `npx tsc`. `npm run build` stays **26 routes** (no route paths change).
- **No shared server-action / RLS / payroll-calc / data-model change. No new migrations.** The shared `actions.ts` functions in every route keep their imports + signatures. The ONE permitted change: the page-local inline `"use server"` `remove(id)` wrappers in `departemen/page.tsx` and `libur/page.tsx` change their return type from `void` to the underlying `Result` (still `console.error` on `!ok`) so `<ConfirmDeleteButton>` can toast — no behavior change.
- **Never render raw Postgres/PostgREST error text.** `console.error` the raw error; render a fixed Indonesian string. The existing pages already return fixed strings — keep them, move them into `<Alert>`.
- Semantic + `dark:`-ready utilities only in new/touched code: `bg-card`, `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `border-border`, `border-input`, `ring-foreground/10`, `text-primary`. **Never** `bg-white`, `bg-neutral-*`, `text-neutral-*`, `bg-blue-*`, `text-blue-*`, `border-neutral-*`, `divide-neutral-*`, `text-red-600`, `text-green-*`, `hover:border-blue-300`, `bg-green-50`, `bg-neutral-50`. **One kept exception:** `text-amber-600 dark:text-amber-400` on the accent-color `role="status"` warning in `instansi-form.tsx` — do not touch it.
- Icons: `lucide-react` only. Never emoji. Never new hand-rolled inline SVG.
- Indonesian UI copy. `lang="id"`.
- Every page keeps its auth guard + role check verbatim (`if (!employee) redirect("/login")`; `hr_admin` / `super_admin`; `instansi` is `super_admin` only).
- **`ResponsiveTable`'s first column is the mobile card title with no label** — lead every table with an identifying column. Pass `caption` at every call site.
- shadcn `Checkbox` (`@/components/ui/checkbox`) is Radix and does **not** submit in `FormData` — the jadwal day checkboxes stay **native `<input type="checkbox" name="hariKerja">`** styled with design-system classes.
- `alert-dialog.tsx` exports: `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger` (+ Media/Overlay/Portal). `popover.tsx` exports `Popover, PopoverTrigger, PopoverContent`.
- `<Field id label>` renders `<div className="space-y-1.5"><Label htmlFor={id}>…</Label>{child}</div>` and clones its single child to set `id` (so `getByLabelText` resolves to the `<Input>` / `<NativeSelect>`'s inner `<select>`). Pass **no** layout `className` to `<Field>` — the parent `<form className="flex flex-wrap items-end gap-3">` positions each Field as a flex item.
- `deleteDepartment(id)` / `deleteHoliday(id)` already return `Promise<{ ok: true } | { ok: false; error: string }>` — the exact `ConfirmDeleteButton` `action` prop type.
- Current unit suite: 431 green. Must stay green at every commit; `tsc` clean; `npm run build` 26 routes.

---

## File Structure

**New shared component** (`src/components/`)
- `confirm-delete-button.tsx` + `confirm-delete-button.test.tsx`

**New page-local client sub-components**
- `src/app/(admin)/pengaturan/libur/year-filter.tsx`
- `src/app/(admin)/pengaturan/audit/audit-detail-popover.tsx`

**Reskinned pages / forms**
- `src/app/(admin)/payroll/page.tsx` + `create-period-form.tsx` (+ test retarget)
- `src/app/(admin)/payroll/[periodId]/page.tsx` + `payslip-table.tsx` (+ test retarget)
- `src/app/(admin)/pengaturan/page.tsx`
- `src/app/(admin)/pengaturan/instansi/instansi-form.tsx` (Card wrap only; + test check)
- `src/app/(admin)/pengaturan/departemen/page.tsx` + `department-form.tsx` (+ test retarget)
- `src/app/(admin)/pengaturan/jadwal/page.tsx` + `schedule-form.tsx` (+ test retarget)
- `src/app/(admin)/pengaturan/libur/page.tsx` + `holiday-form.tsx` (+ test retarget)
- `src/app/(admin)/pengaturan/audit/page.tsx` + `audit-filters.tsx` (+ test check)

**No test file created** except `confirm-delete-button.test.tsx`. Every reskinned form has an existing `*.test.tsx` (verified) — retarget it, keep every assertion.

---

## Task 1: `<ConfirmDeleteButton>`

**Files:**
- Create: `src/components/confirm-delete-button.tsx`, `src/components/confirm-delete-button.test.tsx`

**Interfaces:**
- Produces: `ConfirmDeleteButton` — `(props: { action: () => Promise<{ ok: true } | { ok: false; error: string }>; title: string; description: string; label?: string; confirmLabel?: string }) => JSX.Element`
- Consumed by: Task 5 (departemen), Task 7 (libur).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/confirm-delete-button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { ConfirmDeleteButton } from "./confirm-delete-button";

const base = {
  title: "Hapus departemen?",
  description: "Departemen \"Operasional\" akan dihapus.",
};

describe("ConfirmDeleteButton", () => {
  it("renders a trigger with the default label and opens the dialog on click", async () => {
    const user = userEvent.setup();
    render(<ConfirmDeleteButton {...base} action={vi.fn().mockResolvedValue({ ok: true })} />);
    const trigger = screen.getByRole("button", { name: /hapus/i });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByText("Hapus departemen?")).toBeVisible();
    expect(screen.getByText(/akan dihapus/i)).toBeVisible();
  });

  it("uses a custom label", () => {
    render(<ConfirmDeleteButton {...base} label="Buang" action={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Buang" })).toBeInTheDocument();
  });

  it("calls action when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<ConfirmDeleteButton {...base} action={action} />);
    await user.click(screen.getByRole("button", { name: /hapus/i }));
    await user.click(await screen.findByRole("button", { name: "Hapus", hidden: false }));
    // there are two "Hapus" — the trigger and the AlertDialogAction; pick the one inside the dialog
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("toasts and keeps the dialog open when action fails", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: false, error: "Masih dipakai karyawan." });
    render(<ConfirmDeleteButton {...base} action={action} confirmLabel="Ya, hapus" />);
    await user.click(screen.getByRole("button", { name: /hapus/i }));
    await user.click(await screen.findByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Masih dipakai karyawan."));
    expect(screen.getByText("Hapus departemen?")).toBeVisible(); // still open
  });

  it("closes the dialog on success", async () => {
    const user = userEvent.setup();
    render(<ConfirmDeleteButton {...base} action={vi.fn().mockResolvedValue({ ok: true })} confirmLabel="Ya, hapus" />);
    await user.click(screen.getByRole("button", { name: /hapus/i }));
    await user.click(await screen.findByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(screen.queryByText("Hapus departemen?")).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- confirm-delete-button
```

Expected: FAIL — `Cannot find module './confirm-delete-button'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/confirm-delete-button.tsx
"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Result = { ok: true } | { ok: false; error: string };

export function ConfirmDeleteButton({
  action,
  title,
  description,
  label = "Hapus",
  confirmLabel = "Hapus",
}: {
  action: () => Promise<Result>;
  title: string;
  description: string;
  label?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm(e: React.MouseEvent) {
    e.preventDefault(); // keep the dialog open until the action resolves
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
          <Trash2 className="size-4" /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- confirm-delete-button && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (5 tests). If the "calls action" test's `findByRole` is ambiguous between the trigger and the action button (both say "Hapus"), scope it: `within(screen.getByRole("alertdialog")).getByRole("button", { name: "Hapus" })` — import `within`. Keep the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/confirm-delete-button.tsx src/components/confirm-delete-button.test.tsx
git commit -m "feat(ui): ConfirmDeleteButton — AlertDialog confirm for destructive actions"
```

---

## Task 2: Payroll list — `/payroll`

**Files:**
- Modify: `src/app/(admin)/payroll/page.tsx`, `src/app/(admin)/payroll/create-period-form.tsx`, `src/app/(admin)/payroll/create-period-form.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Card*`, `Alert` + `AlertDescription`, `ResponsiveTable`, `EmptyState`, `PayrollStatusBadge`, `NativeSelect`, `Input`, `Button`, `Field`, `formatRupiah`, `monthLabel` / `MONTH_NAMES_ID`.

- [ ] **Step 1: Retarget `create-period-form.test.tsx`**

The 3 tests use `getByLabelText(/cabang|bulan|tahun/i)` + `fireEvent`/`userEvent`. `<Field id label>` + `<NativeSelect>` / `<Input>` keep `getByLabelText` working (label text unchanged: "Cabang", "Bulan", "Tahun"). The error test asserts `getByText(errorString)` — will still work (now inside `<Alert>`, but the text renders). Run after Step 2; only fix a selector that genuinely breaks. Keep all 3 assertions.

- [ ] **Step 2: Reskin `create-period-form.tsx`**

Keep `now`, `error`, `success`, `submitting` state + `handleSubmit`. Replace the JSX:

```tsx
  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field id="branchId" label="Cabang">
        <NativeSelect name="branchId" required defaultValue={branches[0]?.id ?? ""} className="w-44">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="bulan" label="Bulan">
        <NativeSelect name="bulan" defaultValue={String(now.getMonth() + 1)} className="w-40">
          {MONTH_NAMES_ID.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="tahun" label="Tahun">
        <Input name="tahun" type="number" defaultValue={now.getFullYear()} className="w-28" />
      </Field>
      <Button type="submit" disabled={submitting}>Buat Periode</Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="w-full">
          <AlertDescription>Periode dibuat.</AlertDescription>
        </Alert>
      )}
    </form>
  );
```

Imports: `Field` from `@/components/field`; `NativeSelect` from `@/components/ui/native-select`; `Input` from `@/components/ui/input`; `Button` from `@/components/ui/button`; `Alert, AlertDescription` from `@/components/ui/alert`. Keep `MONTH_NAMES_ID` import. Remove nothing else.

Note: `<Field>` clones a single child to set `id`. `<NativeSelect>` spreads `{...props}` onto its inner `<select>`, so the cloned `id` lands there and `getByLabelText` resolves. If `<Field>`'s clone puts `id` on a wrapper, add an explicit `id="branchId"` etc. to each control.

- [ ] **Step 3: Reskin `payroll/page.tsx`**

Keep the guard, role check, `branches` + `periods` queries, and the inline `createPeriod` server action **verbatim**. Replace the returned JSX:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Buat periode, generate slip gaji, lalu finalisasi."
      />

      <Card>
        <CardHeader>
          <CardTitle>Buat Periode Baru</CardTitle>
        </CardHeader>
        <CardContent>
          {branchErr ? (
            <Alert variant="destructive">
              <AlertDescription>Gagal memuat daftar cabang.</AlertDescription>
            </Alert>
          ) : (
            <CreatePeriodForm branches={branches ?? []} createPeriod={createPeriod} />
          )}
        </CardContent>
      </Card>

      {periodErr ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat periode payroll.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: "periode",
              header: "Periode",
              cell: (p) =>
                `${(p.branches as unknown as { nama: string } | null)?.nama ?? "-"} — ${monthLabel(p.bulan)} ${p.tahun}`,
            },
            {
              key: "slip",
              header: "Slip",
              mobileLabel: "Slip",
              cell: (p) => `${((p.payslips ?? []) as unknown[]).length} slip`,
            },
            {
              key: "total",
              header: "Total",
              align: "right",
              mobileLabel: "Total",
              cell: (p) =>
                formatRupiah(
                  ((p.payslips ?? []) as { gaji_akhir: number }[]).reduce(
                    (sum, s) => sum + Number(s.gaji_akhir),
                    0,
                  ),
                ),
            },
            {
              key: "status",
              header: "Status",
              mobileLabel: "Status",
              cell: (p) => <PayrollStatusBadge status={p.status as PayrollStatus} />,
            },
          ]}
          rows={periods ?? []}
          rowKey={(p) => p.id}
          rowHref={(p) => `/payroll/${p.id}`}
          caption="Daftar periode payroll"
          emptyState={<EmptyState icon={Wallet} message="Belum ada periode payroll." />}
        />
      )}
    </div>
  );
```

Imports to add: `PageHeader` from `@/components/page-header`; `Card, CardContent, CardHeader, CardTitle` from `@/components/ui/card`; `Alert, AlertDescription` from `@/components/ui/alert`; `ResponsiveTable` from `@/components/responsive-table`; `EmptyState` from `@/components/empty-state`; `Wallet` from `lucide-react`. Keep `Link` removed if now unused (the `rowHref` handles nav — grep for other `Link` uses; there are none, remove the import).

- [ ] **Step 4: Verify**

```bash
npm test -- create-period-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 3 tests pass; tsc clean; build compiles, `/payroll` present, 26 routes.

- [ ] **Step 5: Dev-server smoke**

`/payroll`: PageHeader; "Buat Periode Baru" card with the reskinned form; period list as a table (desktop) / cards (mobile) with Periode/Slip/Total/Status; row click → `/payroll/[id]`; empty → EmptyState.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/payroll/page.tsx" "src/app/(admin)/payroll/create-period-form.tsx" "src/app/(admin)/payroll/create-period-form.test.tsx"
git commit -m "feat(payroll): reskin list page + create-period form to shadcn"
```

---

## Task 3: Payroll period detail — `/payroll/[periodId]`

**Files:**
- Modify: `src/app/(admin)/payroll/[periodId]/page.tsx`, `src/app/(admin)/payroll/[periodId]/payslip-table.tsx`, `src/app/(admin)/payroll/[periodId]/payslip-table.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Alert`, `PayrollStatusBadge`, `Table*` from `@/components/ui/table`, `Card*`, `Button`, `AlertDialog*`, `EmptyState`, `formatRupiah`, `monthLabel`.

- [ ] **Step 1: Reskin `payroll/[periodId]/page.tsx`**

Keep the guard, role check, `period` + `slips` queries, the `rows` mapping, and the inline `onGenerate` / `onFinalize` server actions **verbatim**. Replace the JSX:

```tsx
  if (periodErr) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Gagal memuat periode payroll.</AlertDescription>
      </Alert>
    );
  }
  if (!period) notFound();

  // ... slips query + rows mapping unchanged ...

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${(period.branches as unknown as { nama: string } | null)?.nama ?? "-"} — ${monthLabel(period.bulan)} ${period.tahun}`}
        description="Slip gaji periode ini."
        actions={<PayrollStatusBadge status={period.status as PayrollStatus} />}
      />

      {slipErr && (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat slip gaji.</AlertDescription>
        </Alert>
      )}

      <PayslipTable
        rows={rows}
        status={period.status as "draft" | "final"}
        onGenerate={onGenerate}
        onFinalize={onFinalize}
      />
    </div>
  );
```

Imports: `PageHeader` from `@/components/page-header`; `Alert, AlertDescription` from `@/components/ui/alert`. (`PayrollStatusBadge` already imported.)

- [ ] **Step 2: Retarget `payslip-table.test.tsx`**

Read the 8 tests. They assert: empty prompt text; one row per payslip + final amount; Generate calls `onGenerate` (`getByRole("button", { name: /generate/i })`); Generate/Finalize hidden when `final`; "asks for confirmation before finalizing"; recovers on reject (generic error); expands a row (`getByRole("button", { name: /rincian/i })` / `aria-label`); `aria-expanded` toggle.

The confirm-before-finalize test currently expects the inline `confirming` state ("Kunci periode ini?" + "Ya, finalisasi"). Task changes it to an `<AlertDialog>` → update that ONE test: click "Finalisasi" → `await screen.findByRole("alertdialog")` → click the dialog's "Finalisasi" action → assert `onFinalize` called. Keep the assertion's intent (a confirm gate exists; confirming calls `onFinalize`). Every other test stays as-is (selectors unchanged: Generate button, rincian button, aria-expanded).

- [ ] **Step 3: Reskin `payslip-table.tsx`**

Keep ALL state (`message`, `error`, `busy`, `expanded`) + `run()`. **Drop the `confirming` state** (replaced by AlertDialog). Rewrite the body:

```tsx
"use client";

import { Fragment, useState } from "react";
import type { ActionResult } from "../actions";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { formatRupiah } from "@/lib/format/rupiah";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { ReceiptText } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type PayslipView = {
  id: string;
  nama: string;
  gajiPokok: number;
  hariKerjaEfektif: number;
  totalPotongan: number;
  gajiAkhir: number;
  rincian: RincianHarianEntry[];
};

export function PayslipTable({
  rows, status, onGenerate, onFinalize,
}: {
  rows: PayslipView[];
  status: "draft" | "final";
  onGenerate: () => Promise<ActionResult>;
  onFinalize: () => Promise<ActionResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>): Promise<boolean> {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setMessage(result.message ?? "Berhasil.");
      return true;
    } catch (err) {
      console.error("payslip-table action failed", err);
      setError("Terjadi kesalahan. Coba lagi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const totals = rows.reduce(
    (a, r) => ({
      gajiPokok: a.gajiPokok + r.gajiPokok,
      totalPotongan: a.totalPotongan + r.totalPotongan,
      gajiAkhir: a.gajiAkhir + r.gajiAkhir,
    }),
    { gajiPokok: 0, totalPotongan: 0, gajiAkhir: 0 },
  );

  return (
    <div className="space-y-4">
      {status === "draft" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy} onClick={() => run(onGenerate)}>
            {rows.length ? "Regenerate" : "Generate"}
          </Button>
          {rows.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="default" disabled={busy}>Finalisasi</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalisasi periode ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Slip tidak bisa diubah lagi setelah periode difinalisasi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    onClick={(e) => { e.preventDefault(); void run(onFinalize); }}
                  >
                    Finalisasi
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} message="Belum ada slip gaji. Klik Generate." />
      ) : (
        <>
          {/* desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Gaji Pokok</TableHead>
                  <TableHead className="text-right">Hari Efektif</TableHead>
                  <TableHead className="text-right">Potongan</TableHead>
                  <TableHead className="text-right">Gaji Akhir</TableHead>
                  <TableHead className="text-right">Rincian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow>
                      <TableCell className="font-medium text-foreground">{row.nama}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRupiah(row.gajiPokok)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.hariKerjaEfektif}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={row.totalPotongan > 0 ? "text-destructive" : undefined}>
                          {formatRupiah(row.totalPotongan)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatRupiah(row.gajiAkhir)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Rincian ${row.nama}`}
                          aria-expanded={expanded === row.id}
                          onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        >
                          {expanded === row.id ? "Tutup" : "Rincian"}
                        </Button>
                        <a href={`/slip-gaji/${row.id}/pdf`} className="ml-3 text-xs text-primary hover:underline">
                          PDF
                        </a>
                      </TableCell>
                    </TableRow>
                    {expanded === row.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {row.rincian.map((r) => (
                              <li key={r.tanggal} className="flex flex-wrap gap-x-4">
                                <span className="w-24">{r.tanggal}</span>
                                <span className="w-20">{r.jenis}</span>
                                <span className="w-28">{r.status ?? "-"}</span>
                                <span>terlambat {r.menit_terlambat}m · pulang cepat {r.menit_pulang_cepat}m</span>
                                <span className="text-destructive">{formatRupiah(r.potongan)}</span>
                                {r.catatan && <span className="italic">{r.catatan}</span>}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(totals.gajiPokok)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formatRupiah(totals.totalPotongan)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(totals.gajiAkhir)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* mobile */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <Card key={row.id} size="sm">
                <CardContent className="space-y-1.5">
                  <div className="text-sm font-medium text-foreground">{row.nama}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Gaji Pokok</dt>
                    <dd className="text-right tabular-nums">{formatRupiah(row.gajiPokok)}</dd>
                    <dt className="text-muted-foreground">Hari Efektif</dt>
                    <dd className="text-right tabular-nums">{row.hariKerjaEfektif}</dd>
                    <dt className="text-muted-foreground">Potongan</dt>
                    <dd className={`text-right tabular-nums ${row.totalPotongan > 0 ? "text-destructive" : ""}`}>{formatRupiah(row.totalPotongan)}</dd>
                    <dt className="text-muted-foreground">Gaji Akhir</dt>
                    <dd className="text-right font-medium tabular-nums">{formatRupiah(row.gajiAkhir)}</dd>
                  </dl>
                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button" variant="ghost" size="sm"
                      aria-label={`Rincian ${row.nama}`}
                      aria-expanded={expanded === row.id}
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      {expanded === row.id ? "Tutup" : "Rincian"}
                    </Button>
                    <a href={`/slip-gaji/${row.id}/pdf`} className="self-center text-xs text-primary hover:underline">PDF</a>
                  </div>
                  {expanded === row.id && (
                    <ul className="space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      {row.rincian.map((r) => (
                        <li key={r.tanggal} className="flex flex-wrap gap-x-3">
                          <span>{r.tanggal}</span><span>{r.status ?? "-"}</span>
                          <span className="text-destructive">{formatRupiah(r.potongan)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
            <Card size="sm">
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="font-medium">Total Gaji Pokok</dt>
                  <dd className="text-right tabular-nums">{formatRupiah(totals.gajiPokok)}</dd>
                  <dt className="font-medium">Total Potongan</dt>
                  <dd className="text-right tabular-nums">{formatRupiah(totals.totalPotongan)}</dd>
                  <dt className="font-medium">Total Gaji Akhir</dt>
                  <dd className="text-right tabular-nums">{formatRupiah(totals.gajiAkhir)}</dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
```

The empty-state test asserts `getByText(/belum ada slip/i)` — `<EmptyState message="Belum ada slip gaji. Klik Generate.">` matches. The `aria-label={\`Rincian ${row.nama}\`}` + `aria-expanded` are preserved for those tests. The finalize test is the one retargeted in Step 2.

- [ ] **Step 4: Verify**

```bash
npm test -- payslip-table && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 8 tests pass (finalize test retargeted); tsc clean; build compiles.

- [ ] **Step 5: Dev-server smoke**

`/payroll/[periodId]`: header + status badge; draft → Generate + Finalisasi (AlertDialog confirm) → status flips to final, buttons gone; expand a rincian row; totals footer; mobile cards at narrow width.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/payroll/[periodId]/"
git commit -m "feat(payroll): reskin period detail + payslip table (shadcn, AlertDialog finalize)"
```

---

## Task 4: Pengaturan hub + Instansi

**Files:**
- Modify: `src/app/(admin)/pengaturan/page.tsx`, `src/app/(admin)/pengaturan/instansi/instansi-form.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Card*`, `Alert*`, `Link`, lucide icons (`Building2`, `Network`, `Clock`, `CalendarOff`, `ScrollText`, `ChevronRight`, `AlertTriangle`).

- [ ] **Step 1: Reskin `pengaturan/page.tsx`**

Keep the guard + `countActiveSuperAdmins` call verbatim. Replace the JSX:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" description="Konfigurasi dan status sistem." />

      {superAdminCount === null ? (
        <Alert variant="destructive">
          <AlertDescription>
            Tidak dapat memeriksa jumlah Super Admin aktif saat ini. Silakan muat ulang halaman.
          </AlertDescription>
        </Alert>
      ) : (
        superAdminCount < 2 && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Peringatan: sistem ini hanya memiliki {superAdminCount} Super Admin aktif. Minimal 2
              Super Admin diperlukan agar mekanisme persetujuan cuti berjenjang untuk HR/Super Admin
              tetap berfungsi. Tambahkan Super Admin lain sesegera mungkin.
            </AlertDescription>
          </Alert>
        )
      )}

      {(employee.role === "hr_admin" || employee.role === "super_admin") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {employee.role === "super_admin" && (
            <HubCard
              href="/pengaturan/instansi"
              icon={Building2}
              title="Instansi"
              desc="Nama, logo, kontak, dan warna aksen aplikasi."
            />
          )}
          <HubCard href="/pengaturan/libur" icon={CalendarOff} title="Hari Libur"
            desc="Kelola hari libur nasional & cabang untuk perhitungan payroll." />
          <HubCard href="/pengaturan/audit" icon={ScrollText} title="Log Audit"
            desc="Riwayat perubahan data karyawan & persetujuan cuti." />
          <HubCard href="/pengaturan/departemen" icon={Network} title="Departemen"
            desc="Kelompokkan karyawan per departemen di tiap cabang." />
          <HubCard href="/pengaturan/jadwal" icon={Clock} title="Jadwal Kerja"
            desc="Jam kerja, hari kerja, dan toleransi keterlambatan per cabang." />
        </div>
      )}
    </div>
  );
```

Add a local `HubCard` component in the same file (it's a server component — `HubCard` renders no client state, fine):

```tsx
import type { LucideIcon } from "lucide-react";

function HubCard({
  href, icon: Icon, title, desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="block">
      <Card size="sm" className="transition-colors hover:bg-muted/40">
        <CardContent className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  );
}
```

Imports: `PageHeader`; `Card, CardContent` from `@/components/ui/card`; `Alert, AlertDescription` from `@/components/ui/alert`; `Building2, Network, Clock, CalendarOff, ScrollText, ChevronRight, AlertTriangle` + `type LucideIcon` from `lucide-react`. Keep `Link`.

- [ ] **Step 2: Wrap the instansi form panels in `<Card>`**

`instansi-form.tsx` is already fully on the design system. The ONLY change: wrap the left `<form>` and the right `<aside>` each in `<Card><CardContent>`. Change:

```tsx
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardContent>
          <form action={onSave} className="space-y-5">
            {/* ... unchanged ... */}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <aside className="space-y-6">
            {/* ... unchanged ... */}
          </aside>
        </CardContent>
      </Card>
    </div>
```

Add `import { Card, CardContent } from "@/components/ui/card";`. Nothing else in the file changes (the `<input type="color">`, the `text-amber-600 dark:text-amber-400` warning, all `<Field>`/`<Input>`/`<Button>` stay).

- [ ] **Step 3: Verify**

```bash
npm test -- instansi-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: `instansi-form`'s 3 tests still pass (markup inside the form is unchanged; the `<Card>` wrappers don't affect `getByLabelText` / `getByRole`); tsc clean; build 26 routes, `/pengaturan` + `/pengaturan/instansi` present.

- [ ] **Step 4: Dev-server smoke**

`/pengaturan`: PageHeader; the super-admin warning as an `<Alert>` (if `< 2`); the 5 (or 4 for hr_admin) link cards with icons + chevron, hover state, navigate correctly. `/pengaturan/instansi`: the form + preview now sit in cards; save + logo upload + accent warning all still work.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/page.tsx" "src/app/(admin)/pengaturan/instansi/instansi-form.tsx"
git commit -m "feat(pengaturan): reskin hub cards + wrap instansi form in Card"
```

---

## Task 5: Departemen — `/pengaturan/departemen`

**Files:**
- Modify: `src/app/(admin)/pengaturan/departemen/page.tsx`, `src/app/(admin)/pengaturan/departemen/department-form.tsx`, `src/app/(admin)/pengaturan/departemen/department-form.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Card*`, `Alert*`, `ResponsiveTable`, `EmptyState`, `ConfirmDeleteButton` (Task 1), `Field`, `Input`, `NativeSelect`, `Button`, `Network` icon.

- [ ] **Step 1: Retarget `department-form.test.tsx`**

2 tests: "submits nama and branchId" + "shows an error from a failed add". `getByLabelText(/nama departemen|cabang/i)` + submit. `<Field>` + `<Input>` / `<NativeSelect>` keep labels working (text unchanged: "Nama Departemen", "Cabang"). Error now in `<Alert>` — `getByText` still works. Run after Step 2; keep both assertions.

- [ ] **Step 2: Reskin `department-form.tsx`**

Keep `error`, `busy` state + `action`. Replace JSX:

```tsx
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field id="nama" label="Nama Departemen">
        <Input name="nama" />
      </Field>
      <Field id="branchId" label="Cabang">
        <NativeSelect name="branchId" defaultValue={branches[0]?.id ?? ""} className="w-44">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" disabled={busy}>Tambah</Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
```

Imports: `Field`, `Input`, `NativeSelect`, `Button`, `Alert, AlertDescription`.

- [ ] **Step 3: Reskin `departemen/page.tsx` + make `remove` return `Result`**

Keep the guard, role check, `branches` + `departments` queries verbatim. Change the inline `remove`:

```tsx
  async function remove(id: string) {
    "use server";
    const res = await deleteDepartment(id);
    if (!res.ok) console.error("DepartemenPage: deleteDepartment failed", res.error);
    return res;
  }
```

Replace the JSX:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title="Departemen"
        description="Kelompokkan karyawan per departemen di tiap cabang."
      />
      <Card>
        <CardContent>
          <DepartmentForm branches={branches ?? []} addDepartment={addDepartment} />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar departemen.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            { key: "nama", header: "Nama", cell: (d) => d.nama },
            {
              key: "cabang",
              header: "Cabang",
              mobileLabel: "Cabang",
              cell: (d) => (d.branches as unknown as { nama: string } | null)?.nama ?? "-",
            },
            {
              key: "aksi",
              header: "Aksi",
              align: "right",
              cell: (d) => (
                <ConfirmDeleteButton
                  action={remove.bind(null, d.id)}
                  title="Hapus departemen?"
                  description={`Departemen "${d.nama}" akan dihapus. Karyawan di dalamnya tidak ikut terhapus.`}
                />
              ),
            },
          ]}
          rows={departments ?? []}
          rowKey={(d) => d.id}
          caption="Daftar departemen"
          emptyState={<EmptyState icon={Network} message="Belum ada departemen." />}
        />
      )}
    </div>
  );
```

Imports: `PageHeader`; `Card, CardContent`; `Alert, AlertDescription`; `ResponsiveTable`; `EmptyState`; `ConfirmDeleteButton` from `@/components/confirm-delete-button`; `Network` from `lucide-react`.

- [ ] **Step 4: Verify**

```bash
npm test -- department-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 2 tests pass; tsc clean; build 26 routes.

- [ ] **Step 5: Dev-server smoke**

`/pengaturan/departemen`: add a department; the list as a table; click "Hapus" → AlertDialog → "Batal" cancels, confirm deletes; an error from delete → toast, dialog stays; empty → EmptyState.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/pengaturan/departemen/"
git commit -m "feat(pengaturan): reskin departemen — table + ConfirmDeleteButton"
```

---

## Task 6: Jadwal Kerja — `/pengaturan/jadwal`

**Files:**
- Modify: `src/app/(admin)/pengaturan/jadwal/page.tsx`, `src/app/(admin)/pengaturan/jadwal/schedule-form.tsx`, `src/app/(admin)/pengaturan/jadwal/schedule-form.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `EmptyState`, `Card*`, `Field`, `Input`, `Button`, `Alert*`, `Clock` icon.

- [ ] **Step 1: Retarget `schedule-form.test.tsx`**

2 tests: "submits jam, hari kerja checkboxes, and toleransi" + "shows an error from a failed save". They check `getByLabelText(/jam masuk|jam pulang|toleransi/i)`, the day checkboxes (`getByLabelText("Sen")` / `getByRole("checkbox", { name: "Sen" })`), and submit. The day checkboxes STAY native `<input type="checkbox">` — keep them working. Time/toleransi → `<Field>` + `<Input>` keep labels. Error → `<Alert>`. Run after Step 2; keep both assertions.

- [ ] **Step 2: Reskin `schedule-form.tsx`**

Keep `error`, `msg`, `busy` state + `action` + the `days` Set. Replace JSX:

```tsx
  return (
    <Card>
      <CardHeader>
        <CardTitle>{branchNama}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field id={`jamMasuk-${branchId}`} label="Jam Masuk">
              <Input name="jamMasuk" type="time" defaultValue={defaults?.jamMasuk ?? "09:00"} className="w-36" />
            </Field>
            <Field id={`jamPulang-${branchId}`} label="Jam Pulang">
              <Input name="jamPulang" type="time" defaultValue={defaults?.jamPulang ?? "17:00"} className="w-36" />
            </Field>
            <Field id={`toleransiMenit-${branchId}`} label="Toleransi (menit)">
              <Input name="toleransiMenit" type="number" min="0" defaultValue={defaults?.toleransiMenit ?? 15} className="w-28" />
            </Field>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-sm font-medium text-foreground">Hari kerja</legend>
            {DAYS.map((d) => (
              <label key={d.v} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="hariKerja"
                  value={d.v}
                  defaultChecked={days.has(d.v)}
                  className="size-4 rounded border-input accent-primary"
                />
                {d.label}
              </label>
            ))}
          </fieldset>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}
          <Button type="submit" disabled={busy}>Simpan</Button>
        </form>
      </CardContent>
    </Card>
  );
```

Imports: `Card, CardContent, CardHeader, CardTitle`; `Field`; `Input`; `Button`; `Alert, AlertDescription`.

- [ ] **Step 3: Reskin `jadwal/page.tsx`**

Keep the guard, role check, `branches` + `work_schedules` queries, `byBranch` map verbatim. Replace JSX:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title="Jadwal Kerja"
        description="Satu jadwal per cabang — dipakai untuk status terlambat dan perhitungan payroll."
      />
      {(branches ?? []).length === 0 ? (
        <EmptyState icon={Clock} message="Belum ada cabang." />
      ) : (
        <div className="space-y-4">
          {(branches ?? []).map((b) => (
            <ScheduleForm
              key={b.id}
              branchId={b.id}
              branchNama={b.nama}
              defaults={byBranch.get(b.id) ?? null}
              saveSchedule={saveSchedule}
            />
          ))}
        </div>
      )}
    </div>
  );
```

Imports: `PageHeader`; `EmptyState`; `Clock` from `lucide-react`.

- [ ] **Step 4: Verify**

```bash
npm test -- schedule-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 2 tests pass; tsc clean; build 26 routes.

- [ ] **Step 5: Dev-server smoke**

`/pengaturan/jadwal`: one card per branch with the branch name; edit jam/toleransi/days + Simpan → success `<Alert>`; the day checkboxes pre-check from the saved schedule; no branches → EmptyState.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/pengaturan/jadwal/"
git commit -m "feat(pengaturan): reskin jadwal — Card per branch, shadcn inputs"
```

---

## Task 7: Libur — `/pengaturan/libur`

**Files:**
- Create: `src/app/(admin)/pengaturan/libur/year-filter.tsx`
- Modify: `src/app/(admin)/pengaturan/libur/page.tsx`, `src/app/(admin)/pengaturan/libur/holiday-form.tsx`, `src/app/(admin)/pengaturan/libur/holiday-form.test.tsx`

**Interfaces:**
- Produces: `YearFilter` — `({ tahun }: { tahun: string }) => JSX.Element` (client, pushes `?tahun=`).
- Consumes: `PageHeader`, `FilterBar`, `Card*`, `Alert*`, `ResponsiveTable`, `EmptyState`, `ConfirmDeleteButton`, `Field`, `Input`, `NativeSelect`, `Button`, `Label`, `CalendarOff` icon.

- [ ] **Step 1: Write `year-filter.tsx`**

```tsx
// src/app/(admin)/pengaturan/libur/year-filter.tsx
"use client";

import { useRouter } from "next/navigation";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/ui/native-select";

export function YearFilter({ tahun }: { tahun: string }) {
  const router = useRouter();
  const now = new Date().getFullYear();
  const years = [now - 2, now - 1, now, now + 1].map(String);
  return (
    <Field id="tahun" label="Tahun">
      <NativeSelect
        defaultValue={tahun}
        onChange={(e) => router.push(`/pengaturan/libur?tahun=${e.target.value}`)}
        className="w-32"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </NativeSelect>
    </Field>
  );
}
```

(No dedicated test — a two-line router push; covered by `npm run build` + smoke.)

- [ ] **Step 2: Retarget `holiday-form.test.tsx`**

2 tests: "submits tanggal, nama, and scope" + "shows an error from a failed add". `getByLabelText(/tanggal|nama libur|cakupan/i)` — wait, current labels are "Tanggal", "Nama Libur", and the scope select. Check the current label for the branch select — the spec renames it to "Cakupan". If the test uses `/cabang/i` or a different label, update the test's label matcher to `/cakupan/i` (the spec's chosen label) — that's a copy change the spec mandates, not a weakening. Keep both assertions.

- [ ] **Step 3: Reskin `holiday-form.tsx`**

Keep `error`, `busy` + `action` + the "no HTML `required`" comment. Replace JSX:

```tsx
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {/* No HTML `required` — jsdom/React 19 form-action tests submit these empty;
          addHoliday() validates server-side (ISO date + non-empty nama). */}
      <Field id="tanggal" label="Tanggal">
        <Input name="tanggal" type="date" className="w-44" />
      </Field>
      <Field id="nama" label="Nama Libur">
        <Input name="nama" />
      </Field>
      <Field id="branchId" label="Cakupan">
        <NativeSelect name="branchId" defaultValue="" className="w-48">
          <option value="">Nasional</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" disabled={busy}>Tambah</Button>
      {error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
```

Imports: `Field`, `Input`, `NativeSelect`, `Button`, `Alert, AlertDescription`.

- [ ] **Step 4: Reskin `libur/page.tsx` + `remove` → `Result`**

Keep the guard, role check, `tahun` param, `branches` + `holidays` queries, `fmt` verbatim. Change `remove`:

```tsx
  async function remove(id: string) {
    "use server";
    const res = await deleteHoliday(id);
    if (!res.ok) console.error("LiburPage: deleteHoliday failed", res.error);
    return res;
  }
```

Replace the JSX:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hari Libur ${tahun}`}
        description="Dipakai payroll untuk menghitung hari kerja efektif."
      />

      <FilterBar>
        <YearFilter tahun={tahun} />
      </FilterBar>

      <Card>
        <CardContent>
          <HolidayForm branches={branches ?? []} addHoliday={addHoliday} />
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar libur.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: "tanggal",
              header: "Tanggal",
              cell: (h) => fmt.format(new Date(`${h.tanggal}T00:00:00Z`)),
            },
            { key: "nama", header: "Nama", mobileLabel: "Nama", cell: (h) => h.nama },
            {
              key: "cakupan",
              header: "Cakupan",
              mobileLabel: "Cakupan",
              cell: (h) => (h.branches as unknown as { nama: string } | null)?.nama ?? "Nasional",
            },
            {
              key: "aksi",
              header: "Aksi",
              align: "right",
              cell: (h) => (
                <ConfirmDeleteButton
                  action={remove.bind(null, h.id)}
                  title="Hapus hari libur?"
                  description={`"${h.nama}" pada ${fmt.format(new Date(`${h.tanggal}T00:00:00Z`))} akan dihapus.`}
                />
              ),
            },
          ]}
          rows={holidays ?? []}
          rowKey={(h) => h.id}
          caption={`Daftar hari libur ${tahun}`}
          emptyState={<EmptyState icon={CalendarOff} message={`Belum ada libur tercatat untuk ${tahun}.`} />}
        />
      )}
    </div>
  );
```

Imports: `PageHeader`; `FilterBar` from `@/components/filter-bar`; `Card, CardContent`; `Alert, AlertDescription`; `ResponsiveTable`; `EmptyState`; `ConfirmDeleteButton`; `CalendarOff` from `lucide-react`; `YearFilter` from `./year-filter`.

- [ ] **Step 5: Verify**

```bash
npm test -- holiday-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 2 tests pass; tsc clean; build 26 routes.

- [ ] **Step 6: Dev-server smoke**

`/pengaturan/libur`: year `<NativeSelect>` in a FilterBar switches the list; add a holiday (national + branch-scoped); the list as a table; delete with confirm.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/pengaturan/libur/"
git commit -m "feat(pengaturan): reskin libur — FilterBar year + table + ConfirmDeleteButton"
```

---

## Task 8: Audit — `/pengaturan/audit`

**Files:**
- Create: `src/app/(admin)/pengaturan/audit/audit-detail-popover.tsx`
- Modify: `src/app/(admin)/pengaturan/audit/page.tsx`, `src/app/(admin)/pengaturan/audit/audit-filters.tsx`

**Interfaces:**
- Produces: `AuditDetailPopover` — `({ detail }: { detail: unknown }) => JSX.Element` (client).
- Consumes: `PageHeader`, `FilterBar`, `ResponsiveTable`, `EmptyState`, `Alert*`, `AuditAksiBadge`, `Popover*`, `Button`, `Field`, `Input`, `NativeSelect`, `ScrollText` icon.

`audit-filters.tsx` has NO test file (verified) — no test step for it.

- [ ] **Step 1: Write `audit-detail-popover.tsx`**

```tsx
// src/app/(admin)/pengaturan/audit/audit-detail-popover.tsx
"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function AuditDetailPopover({ detail }: { detail: unknown }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">Lihat</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-[11px] text-foreground">
          {detail == null ? "—" : JSON.stringify(detail, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Reskin `audit-filters.tsx`**

Keep `pushWith` + the router logic + `AKSI_OPTIONS`. Wrap in `<FilterBar>`, swap the raw `<label>`/`<input>`/`<select>` for `<Field>` + `<Input type="date">` / `<NativeSelect>`. The controls push on `onChange` (no submit button — all controls are dates/selects, matching the existing behavior). Replace the returned JSX:

```tsx
  return (
    <FilterBar>
      <Field id="audit-dari" label="Dari">
        <Input
          type="date"
          defaultValue={defaults.dari}
          onChange={(e) => pushWith({ dari: e.target.value })}
          className="w-40"
        />
      </Field>
      <Field id="audit-sampai" label="Sampai">
        <Input
          type="date"
          defaultValue={defaults.sampai}
          onChange={(e) => pushWith({ sampai: e.target.value })}
          className="w-40"
        />
      </Field>
      <Field id="audit-target" label="Karyawan">
        <NativeSelect
          defaultValue={defaults.target ?? ""}
          onChange={(e) => pushWith({ target: e.target.value })}
          className="w-48"
        >
          <option value="">Semua</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.nama}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="audit-aksi" label="Aksi">
        <NativeSelect
          defaultValue={defaults.aksi ?? ""}
          onChange={(e) => pushWith({ aksi: e.target.value })}
          className="w-48"
        >
          {AKSI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </NativeSelect>
      </Field>
    </FilterBar>
  );
```

Imports: `FilterBar`, `Field`, `Input`, `NativeSelect`. Remove nothing from the logic.

- [ ] **Step 3: Reskin `audit/page.tsx`**

Keep the guard, role check, `employees` query, the full `audit_logs` query with all `sp.*` filters, and `fmt` verbatim. Replace the JSX:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Audit"
        description="Riwayat perubahan data karyawan dan persetujuan cuti."
      />

      <AuditFilters employees={employees ?? []} defaults={sp} />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat log audit.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: "waktu",
              header: "Waktu",
              cellClassName: "whitespace-nowrap",
              cell: (r) => fmt.format(new Date(r.waktu)),
            },
            { key: "aksi", header: "Aksi", mobileLabel: "Aksi", cell: (r) => <AuditAksiBadge aksi={r.aksi} /> },
            {
              key: "aktor",
              header: "Aktor",
              mobileLabel: "Aktor",
              cell: (r) => (
                <>
                  {(r.actor as unknown as { nama: string } | null)?.nama ?? "Sistem"}
                  {r.is_self_action && (
                    <span className="ml-1 text-xs text-muted-foreground">(aksi sendiri)</span>
                  )}
                </>
              ),
            },
            {
              key: "target",
              header: "Target",
              mobileLabel: "Target",
              cell: (r) => (r.target as unknown as { nama: string } | null)?.nama ?? "-",
            },
            {
              key: "detail",
              header: "Detail",
              align: "right",
              cell: (r) => <AuditDetailPopover detail={r.detail} />,
            },
          ]}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          caption="Log audit"
          emptyState={<EmptyState icon={ScrollText} message="Belum ada catatan audit." />}
        />
      )}
    </div>
  );
```

Imports: `PageHeader`; `ResponsiveTable`; `EmptyState`; `Alert, AlertDescription`; `ScrollText` from `lucide-react`; `AuditDetailPopover` from `./audit-detail-popover`. (`AuditAksiBadge` + `AuditFilters` already imported.)

- [ ] **Step 4: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: full suite green (no test for audit page/filters/popover); tsc clean; build 26 routes, `/pengaturan/audit` present.

- [ ] **Step 5: Dev-server smoke**

`/pengaturan/audit`: filters in a FilterBar push the URL on change; the log as a table with Waktu/Aksi/Aktor/Target/Detail; "Lihat" opens a Popover with the pretty-printed JSON that doesn't shift the table; empty → EmptyState.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/pengaturan/audit/"
git commit -m "feat(pengaturan): reskin audit — FilterBar + table + detail Popover"
```

---

## Post-plan verification

```bash
npm test                       # 431 + 5 (confirm-delete-button) ≈ 436 green
./node_modules/.bin/tsc --noEmit
npm run build                  # 26 routes; /payroll /payroll/[periodId] /pengaturan + 5 sub-pages present
grep -rn "text-neutral-\|bg-white\|bg-blue-\|text-blue-\|border-neutral-\|divide-neutral-\|text-red-600\|text-green-6\|hover:border-blue\|bg-green-50\|bg-neutral-50" src/app/\(admin\)/payroll src/app/\(admin\)/pengaturan src/components/confirm-delete-button.tsx
#   ^ expect ONE match only: the intentional text-amber-* line in instansi-form.tsx is NOT in these paths' grep — so expect ZERO matches
```

Dev-server smoke (light theme), all 8 pages per the per-task notes.

Then the final whole-branch review, then `finishing-a-development-branch`.

## SP5 hand-off

- **SP5** is the last redesign sub-project: reskin the 5 employee pages (`/absen`, `/absen/consent`, `/cuti`, `/riwayat`, `/slip-gaji`) + the "dark-mode debt" task — invert `--color-neutral-*` under `.dark` + `bg-white` → `bg-card` sweep over whatever legacy remains, `theme-provider` → `system` + re-mount `<ThemeToggle>` in both shells, give `AttendanceTrendChart` dark grid/axis colors, add the lint/test guard against new `text-neutral-[789]00` / `bg-white` in `src/app`, delete the legacy `--color-neutral-*` / `--radius-card` / `--shadow-card` block once its last consumer is gone.
- SP4a-deferred items still open: `getTodaySummary.cuti` + `getBranchBreakdown` not filtered to `employees.status = 'aktif'`; branch-scoped `cuti` path untested; `initials()` duplicated (`profil-form.tsx` / `karyawan/page.tsx` → hoist to `src/lib/utils.ts` when either is next touched); org-wide non-working-day check for the Alpa tile.
