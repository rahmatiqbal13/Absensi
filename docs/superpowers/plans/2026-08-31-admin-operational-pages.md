# Admin Operational Pages Redesign (SP4a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the six daily-driver admin screens (dashboard, karyawan list/detail/create, persetujuan-cuti, laporan) and their client sub-components onto the SP1 shadcn/token design system, genuinely reworking the dashboard, and give `/profil` a role-aware shell.

**Architecture:** Build four shared primitives first (`StatCard`, `ResponsiveTable`, `FilterBar`, `StatusPill`) plus a `NativeSelect` control, then four additive read-only dashboard aggregation functions in `src/lib/dashboard/`, then rewrite each page to consume them. No server-action, RLS, or data-model change. `/profil` moves from the `(employee)` route group to a new `(account)` group whose server `layout.tsx` picks `AdminShell` vs `EmployeeShell` by role.

**Tech Stack:** Next.js 16.3 (App Router, async server components, `searchParams`/`params` are Promises) · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui (`radix-nova`) · `lucide-react` · `recharts` · Supabase cloud · Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-08-31-admin-operational-pages-design.md`. This is **sub-project 4a of 5**; SP1/SP2/SP3 are complete.

## Global Constraints

- TypeScript strict. `npm test` = `vitest run src/`. `./node_modules/.bin/tsc --noEmit` — **NEVER** `npx tsc`. `npm run build` currently 26 routes; SP4a keeps 26 (route paths unchanged — `/profil` only moves route groups).
- **No server-action, RLS, or data-model change.** The only new backend code: four additive read-only functions in `src/lib/dashboard/` + additive fields on `getTodaySummary`. `laporan/page.tsx`'s branch-id allowlist guard stays byte-for-byte.
- **Never render raw Postgres/PostgREST error text.** `console.error` the raw error; render/return a fixed Indonesian string. Lib functions return `{ ok: false; error: string }` with a fixed message.
- Icons: `lucide-react` only. Never emoji. Never new hand-rolled inline SVG — migrate any a redesigned component still carries (the `approval-table` empty-state SVG).
- Semantic + `dark:`-ready utilities only in new/touched code: `bg-card`, `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `border-border`, `border-input`, `ring-foreground/10`, `text-primary`. **Never** `bg-white`, `bg-neutral-*`, `text-neutral-*`, `bg-blue-*`, `text-blue-*`, `border-neutral-*`, `divide-neutral-*`, `text-red-600`, `text-green-*` in new code. (Warning tone: `text-amber-600 dark:text-amber-500` — there is no `--warning` token.)
- Indonesian UI copy. `lang="id"`.
- **Select controls:** use the shared `<NativeSelect>` (Task 1) — a `<select>` styled to match shadcn `<Input>`. This is a deliberate choice over Radix `<Select>`: it keeps `FormData` submission working for the employee forms with zero risk, keeps `fireEvent.change` tests simple, and the visual delta at filter/form density is negligible. Text/date inputs use shadcn `<Input>`.
- `Card` = `bg-card ring-1 ring-foreground/10 rounded-xl` + `[--card-spacing:--spacing(4)]`; `size="sm"` → `--spacing(3)`. `Table` self-wraps in `overflow-x-auto` and hover-tints rows via `hover:bg-muted/50`.
- Badge variants available: `default`, `destructive`, `success`, `warning`, `info`, `neutral`.
- `AttendanceStatusBadge` variant map (do not change): `tepat_waktu`=success, `terlambat`=warning, `pulang_cepat`=neutral, `alpa`=destructive, `di_luar_lokasi`=info.
- `leave_requests.status` enum: `'pending' | 'approved' | 'rejected'` (from `supabase/migrations/0002_attendance_leave.sql:33`).
- `getCurrentEmployee(db)` → `{ id, nama, email, role, branchId, fotoPath } | null`. `role` ∈ `'karyawan' | 'atasan' | 'hr_admin' | 'super_admin'`.
- `PRESENT_STATUSES` (from `src/lib/attendance/status.ts`) = `["tepat_waktu", "pulang_cepat", "di_luar_lokasi"]`.
- Current unit suite: 387 green. Must stay green at every commit.

---

## File Structure

**New shared components** (`src/components/`)
- `stat-card.tsx` + `stat-card.test.tsx` — `<StatCard>` (replaces `summary-card.tsx`, deleted in Task 8)
- `responsive-table.tsx` + `responsive-table.test.tsx` — `<ResponsiveTable>` generic list (desktop table / mobile cards)
- `filter-bar.tsx` + `filter-bar.test.tsx` — `<FilterBar>` layout shell
- `status-pill.tsx` + `status-pill.test.tsx` — `<StatusPill>` aktif/nonaktif badge
- `ui/native-select.tsx` — `<NativeSelect>` styled `<select>`

**New dashboard lib** (`src/lib/dashboard/`)
- `attendance-summary.ts` — **modified**: `AttendanceSummary` gains `pulangCepat` / `diLuarLokasi` / `cuti`
- `pending-approval-count.ts` + test
- `branch-breakdown.ts` + test
- `today-exceptions.ts` + test
- `recent-activity.ts` + test

**Rewritten pages / components**
- `src/app/(admin)/dashboard/page.tsx` + `dashboard-controls.tsx` (+ test)
- `src/app/(admin)/karyawan/page.tsx` + `employee-filters.tsx` (+ test)
- `src/app/(admin)/karyawan/employee-form-fields.tsx` (+ test)
- `src/app/(admin)/karyawan/baru/page.tsx` + `create-employee-form.tsx`
- `src/app/(admin)/karyawan/[id]/page.tsx` + `karyawan-tabs.tsx` (new) + `edit-employee-form.tsx` (+ test)
- `src/app/(admin)/persetujuan-cuti/page.tsx` + `approval-list.tsx` (replaces `approval-table.tsx`) (+ test)
- `src/app/(admin)/laporan/page.tsx` + `laporan-filters.tsx` (+ test)

**Route move**
- `src/app/(employee)/profil/*` → `src/app/(account)/profil/*` + new `src/app/(account)/layout.tsx` (+ test)

**Deleted**
- `src/components/summary-card.tsx` + `src/components/summary-card.test.tsx` (Task 8)
- `src/app/(admin)/persetujuan-cuti/approval-table.tsx` + `approval-table.test.tsx` (Task 15)

---

## Task 1: `<NativeSelect>` + `<FilterBar>` + `<StatusPill>`

**Files:**
- Create: `src/components/ui/native-select.tsx`, `src/components/filter-bar.tsx`, `src/components/filter-bar.test.tsx`, `src/components/status-pill.tsx`, `src/components/status-pill.test.tsx`

**Interfaces:**
- Produces:
  - `NativeSelect` — `React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>`, styled like `<Input>`.
  - `FilterBar` — `({ children, className }: { children: React.ReactNode; className?: string }) => JSX.Element`
  - `StatusPill` — `({ status }: { status: "aktif" | "nonaktif" }) => JSX.Element`
- Consumed by: Tasks 7, 9, 11, 12, 14, 16 (`NativeSelect`); Tasks 8, 9, 17 (`FilterBar`); Tasks 10, 13 (`StatusPill`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/filter-bar.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar } from "./filter-bar";

describe("FilterBar", () => {
  it("renders its children", () => {
    render(<FilterBar><span>child</span></FilterBar>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });
  it("applies the base layout classes and merges className", () => {
    const { container } = render(<FilterBar className="mt-4">x</FilterBar>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("flex");
    expect(el.className).toContain("bg-card");
    expect(el.className).toContain("mt-4");
  });
});
```

```tsx
// src/components/status-pill.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("renders Aktif with the success variant", () => {
    render(<StatusPill status="aktif" />);
    const el = screen.getByText("Aktif");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("data-variant")).toBe("success");
  });
  it("renders Nonaktif with the neutral variant", () => {
    render(<StatusPill status="nonaktif" />);
    const el = screen.getByText("Nonaktif");
    expect(el.getAttribute("data-variant")).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- filter-bar status-pill
```

Expected: FAIL — `Cannot find module './filter-bar'` / `'./status-pill'`.

- [ ] **Step 3: Write the implementations**

```tsx
// src/components/ui/native-select.tsx
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A plain <select> styled to match shadcn <Input>. Used instead of the Radix
// <Select> so form posts (FormData) keep working and fireEvent.change tests
// stay simple. See the plan's Global Constraints.
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          data-slot="native-select"
          className={cn(
            "h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-2.5 py-1 pr-8 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  },
);

export { NativeSelect };
```

```tsx
// src/components/filter-bar.tsx
import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

```tsx
// src/components/status-pill.tsx
import { Badge } from "@/components/ui/badge";

export function StatusPill({ status }: { status: "aktif" | "nonaktif" }) {
  return status === "aktif" ? (
    <Badge variant="success">Aktif</Badge>
  ) : (
    <Badge variant="neutral">Nonaktif</Badge>
  );
}
```

Verify `src/components/ui/badge.tsx` sets `data-variant={variant}` on the element (it does — line ~49). If it does not, change the test to assert the class instead (`toContain("bg-emerald")` / `toContain("bg-muted")`), not the data attribute.

- [ ] **Step 4: Run to verify they pass**

```bash
npm test -- filter-bar status-pill && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (4 tests). `native-select` has no test of its own — it's exercised via the filter/form tasks.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/native-select.tsx src/components/filter-bar.tsx src/components/filter-bar.test.tsx src/components/status-pill.tsx src/components/status-pill.test.tsx
git commit -m "feat(ui): NativeSelect, FilterBar, StatusPill primitives"
```

---

## Task 2: `<StatCard>`

**Files:**
- Create: `src/components/stat-card.tsx`, `src/components/stat-card.test.tsx`

**Interfaces:**
- Produces: `StatCard` — `(props: { label: string; value: number | string; sublabel?: string; tone?: "default" | "warning" | "destructive" | "accent"; icon?: LucideIcon; href?: string }) => JSX.Element`
- Consumed by: Task 8 (dashboard).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/stat-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("renders label, value, and sublabel", () => {
    render(<StatCard label="Hadir" value={42} sublabel="89%" />);
    expect(screen.getByText("Hadir")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("89%")).toBeInTheDocument();
  });

  it("is a plain element (no link) without href", () => {
    const { container } = render(<StatCard label="Alpa" value={3} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("wraps the card in a link when href is set", () => {
    render(<StatCard label="Menunggu persetujuan" value={7} href="/persetujuan-cuti" tone="accent" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/persetujuan-cuti");
    expect(link).toHaveTextContent("Menunggu persetujuan");
    expect(link).toHaveTextContent("7");
  });

  it("tints the value for the destructive tone", () => {
    render(<StatCard label="Alpa" value={3} tone="destructive" />);
    expect(screen.getByText("3").className).toContain("text-destructive");
  });

  it("renders an icon when given", () => {
    const { container } = render(<StatCard label="x" value={1} icon={Users} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- stat-card
```

Expected: FAIL — `Cannot find module './stat-card'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/stat-card.tsx
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardTone = "default" | "warning" | "destructive" | "accent";

const VALUE_TONE: Record<StatCardTone, string> = {
  default: "text-foreground",
  warning: "text-amber-600 dark:text-amber-500",
  destructive: "text-destructive",
  accent: "text-primary",
};

export function StatCard({
  label,
  value,
  sublabel,
  tone = "default",
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: StatCardTone;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
        <span>{label}</span>
        {href && tone === "accent" ? (
          <ArrowRight className="ml-auto size-4 text-primary" aria-hidden="true" />
        ) : null}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", VALUE_TONE[tone])}>{value}</div>
      {sublabel ? <div className="text-xs text-muted-foreground">{sublabel}</div> : null}
    </>
  );

  const cardClass = cn(
    "gap-1 px-4",
    tone === "accent" && "ring-primary/30",
    href && "transition-colors hover:bg-muted/40",
    href && tone === "accent" && "hover:ring-primary/50",
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card size="sm" className={cardClass}>
          {body}
        </Card>
      </Link>
    );
  }
  return (
    <Card size="sm" className={cardClass}>
      {body}
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- stat-card && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (5 tests). If `<Card>`'s internal padding fights the `px-4` override, drop the override — the assertions don't check padding.

- [ ] **Step 5: Commit**

```bash
git add src/components/stat-card.tsx src/components/stat-card.test.tsx
git commit -m "feat(ui): StatCard — dashboard stat tile with optional link + tone"
```

---

## Task 3: `<ResponsiveTable>`

**Files:**
- Create: `src/components/responsive-table.tsx`, `src/components/responsive-table.test.tsx`

**Interfaces:**
- Produces:

```ts
type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  headerClassName?: string;
  cellClassName?: string;
  hideOnMobile?: boolean;
  mobileLabel?: string;
};

function ResponsiveTable<T>(props: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption?: string;
  emptyState: React.ReactNode;
  footer?: React.ReactNode;        // <tr> content for <TableFooter> (desktop)
  footerMobile?: React.ReactNode;  // rendered after the last mobile card
}): JSX.Element
```

- Consumed by: Tasks 8 (dashboard per-branch), 10 (karyawan list), 13 (audit tab), 17 (laporan).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/responsive-table.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ResponsiveTable } from "./responsive-table";

type Row = { id: string; nama: string; jabatan: string; kota: string };
const rows: Row[] = [
  { id: "1", nama: "Andi", jabatan: "Staff", kota: "Jakarta" },
  { id: "2", nama: "Siti", jabatan: "Manajer", kota: "Bandung" },
];
const columns = [
  { key: "nama", header: "Nama", cell: (r: Row) => r.nama },
  { key: "jabatan", header: "Jabatan", cell: (r: Row) => r.jabatan, mobileLabel: "Jabatan" },
  { key: "kota", header: "Kota", cell: (r: Row) => r.kota, hideOnMobile: true },
];

describe("ResponsiveTable", () => {
  it("renders a desktop <table> with headers and cells", () => {
    render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<p>kosong</p>} />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Nama")).toBeInTheDocument();
    expect(within(table).getByText("Andi")).toBeInTheDocument();
    expect(within(table).getByText("Bandung")).toBeInTheDocument();
  });

  it("renders mobile cards with mobileLabels, omitting hideOnMobile columns", () => {
    const { container } = render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<p>kosong</p>} />,
    );
    const mobile = container.querySelector('[data-slot="responsive-table-cards"]') as HTMLElement;
    expect(mobile).not.toBeNull();
    expect(within(mobile).getAllByText("Jabatan").length).toBe(2); // label per card
    expect(within(mobile).queryByText("Kota")).toBeNull();          // hideOnMobile
    expect(within(mobile).getByText("Manajer")).toBeInTheDocument();
  });

  it("wraps rows/cards in a link when rowHref is set", () => {
    render(
      <ResponsiveTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`} emptyState={<p>kosong</p>}
      />,
    );
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/x/1");
  });

  it("renders the emptyState and no table when rows is empty", () => {
    render(
      <ResponsiveTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyState={<p>kosong</p>} />,
    );
    expect(screen.getByText("kosong")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders footer and footerMobile slots", () => {
    render(
      <ResponsiveTable
        columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<p>kosong</p>}
        footer={<><td>Total</td><td>2</td><td>2</td></>}
        footerMobile={<div>Total mobile</div>}
      />,
    );
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Total mobile")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- responsive-table
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/responsive-table.tsx
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  headerClassName?: string;
  cellClassName?: string;
  hideOnMobile?: boolean;
  mobileLabel?: string;
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  caption,
  emptyState,
  footer,
  footerMobile,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption?: string;
  emptyState: React.ReactNode;
  footer?: React.ReactNode;
  footerMobile?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{emptyState}</>;

  const alignCls = (a?: "left" | "right") =>
    a === "right" ? "text-right tabular-nums" : "text-left";

  return (
    <>
      {/* desktop */}
      <div className="hidden md:block">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(alignCls(c.align), c.headerClassName)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <TableRow key={rowKey(row)} className={cn(href && "relative")}>
                  {columns.map((c, i) => (
                    <TableCell key={c.key} className={cn(alignCls(c.align), c.cellClassName)}>
                      {href && i === 0 ? (
                        <Link
                          href={href}
                          className="font-medium text-foreground after:absolute after:inset-0"
                        >
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
          {footer ? (
            <TableFooter>
              <TableRow>{footer}</TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      {/* mobile */}
      <div data-slot="responsive-table-cards" className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const [first, ...rest] = columns;
          const inner = (
            <Card size="sm" className="gap-2">
              <div className="text-sm font-medium text-foreground">{first.cell(row)}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {rest
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted-foreground">
                        {c.mobileLabel ?? (typeof c.header === "string" ? c.header : c.key)}
                      </dt>
                      <dd className={cn("text-foreground", c.align === "right" && "text-right")}>
                        {c.cell(row)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </Card>
          );
          return href ? (
            <Link key={rowKey(row)} href={href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={rowKey(row)}>{inner}</div>
          );
        })}
        {footerMobile}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- responsive-table && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (5 tests). jsdom renders both the `md:block` and `md:hidden` branches (CSS media queries aren't applied), which is why the test can assert both — this is intentional.

- [ ] **Step 5: Commit**

```bash
git add src/components/responsive-table.tsx src/components/responsive-table.test.tsx
git commit -m "feat(ui): ResponsiveTable — desktop table / mobile card list"
```

---

## Task 4: Extend `getTodaySummary` with pulangCepat / diLuarLokasi / cuti

**Files:**
- Modify: `src/lib/dashboard/attendance-summary.ts`, `src/lib/dashboard/attendance-summary.test.ts`

**Interfaces:**
- Produces: `AttendanceSummary` gains `pulangCepat: number`, `diLuarLokasi: number`, `cuti: number`. `pulangCepat` / `diLuarLokasi` are counts of today's rows with exactly that `status` (they **overlap `hadir`**). `cuti` = distinct active employees (branch-scoped when `branchId`) with an `approved` `leave_requests` row spanning today.
- Consumed by: Task 8.

- [ ] **Step 1: Read the current file**

Read `src/lib/dashboard/attendance-summary.ts` and `attendance-summary.test.ts` fully. Note the mock-`db` shape the existing tests use (chained `.from().select().eq()...` returning `{ data, error }` / `{ count, error }`).

- [ ] **Step 2: Add failing test cases**

Append to `attendance-summary.test.ts` (adapt the mock-db helper the file already defines — do not rewrite existing cases):

```ts
it("counts pulang_cepat and di_luar_lokasi as their own fields (overlapping hadir)", async () => {
  // attendance rows: 2 tepat_waktu, 1 pulang_cepat, 1 di_luar_lokasi, 1 terlambat
  const db = makeDb({
    attendanceRows: [
      { status: "tepat_waktu" }, { status: "tepat_waktu" },
      { status: "pulang_cepat" }, { status: "di_luar_lokasi" }, { status: "terlambat" },
    ],
    activeCount: 6,
    approvedLeaveToday: 2,
  });
  const res = await getTodaySummary(db);
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.summary.hadir).toBe(4);          // tepat_waktu + pulang_cepat + di_luar_lokasi
  expect(res.summary.pulangCepat).toBe(1);
  expect(res.summary.diLuarLokasi).toBe(1);
  expect(res.summary.cuti).toBe(2);
});

it("returns zeros for the new fields when there is no data", async () => {
  const db = makeDb({ attendanceRows: [], activeCount: 3, approvedLeaveToday: 0 });
  const res = await getTodaySummary(db);
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.summary.pulangCepat).toBe(0);
  expect(res.summary.diLuarLokasi).toBe(0);
  expect(res.summary.cuti).toBe(0);
});
```

You will need to extend the file's `makeDb` mock helper to also answer the new `leave_requests` count query (`approvedLeaveToday`). Keep the existing helper's behavior for the two existing queries identical.

- [ ] **Step 3: Run to verify the new cases fail**

```bash
npm test -- attendance-summary
```

Expected: the two new cases FAIL (`pulangCepat` undefined); existing cases still PASS.

- [ ] **Step 4: Implement**

In `attendance-summary.ts`:
- Add `pulangCepat: number; diLuarLokasi: number; cuti: number;` to the `AttendanceSummary` type.
- After computing `hadir` / `terlambat` / `alpa`, add:
  ```ts
  const pulangCepat = rows.filter((row) => row.status === "pulang_cepat").length;
  const diLuarLokasi = rows.filter((row) => row.status === "di_luar_lokasi").length;
  ```
- Add a leave query before the return (uses the same `today` and optional `branchId`):
  ```ts
  // Approved leave that spans today. `.or` isn't needed — a range check is two
  // .lte/.gte. Branch scope via the employees embed, like the attendance query.
  let leaveQuery = db
    .from("leave_requests")
    .select("employee_id, employees!leave_requests_employee_id_fkey!inner(branch_id)")
    .eq("status", "approved")
    .lte("tanggal_mulai", today)
    .gte("tanggal_selesai", today);
  if (branchId) leaveQuery = leaveQuery.eq("employees.branch_id", branchId);
  const { data: leaveRows, error: leaveError } = await leaveQuery;
  if (leaveError) {
    console.error("getTodaySummary: leave query failed", leaveError);
    return { ok: false, error: "Gagal memuat data absensi." };
  }
  const cuti = new Set((leaveRows ?? []).map((r) => r.employee_id)).size;
  ```
  `leave_requests` has two FKs to `employees` (`employee_id` and `approver_id`), so the `!leave_requests_employee_id_fkey` hint is required to disambiguate; `!inner` on the same embed turns it into a filtering join. If PostgREST rejects `employees!leave_requests_employee_id_fkey!inner(...)`, split it: `.select("employee_id, employees!leave_requests_employee_id_fkey(branch_id)")` and, when `branchId` is set, add `.not("employees", "is", null).eq("employees.branch_id", branchId)`. The unfiltered case (no `branchId`) needs no join at all — just `.select("employee_id")`.
- Include `pulangCepat`, `diLuarLokasi`, `cuti` in the returned `summary` object.

- [ ] **Step 5: Run to verify all pass**

```bash
npm test -- attendance-summary && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (all existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/attendance-summary.ts src/lib/dashboard/attendance-summary.test.ts
git commit -m "feat(dashboard): getTodaySummary reports pulangCepat / diLuarLokasi / cuti"
```

---

## Task 5: `getPendingApprovalCount` + `getRecentActivity`

**Files:**
- Create: `src/lib/dashboard/pending-approval-count.ts`, `src/lib/dashboard/pending-approval-count.test.ts`, `src/lib/dashboard/recent-activity.ts`, `src/lib/dashboard/recent-activity.test.ts`

**Interfaces:**
- Produces:
  - `getPendingApprovalCount(db, employee: { id: string; role: string }): Promise<{ ok: true; count: number } | { ok: false; error: string }>`
  - `getRecentActivity(db): Promise<{ ok: true; rows: { id: string; aksi: string; actorNama: string; waktu: string }[] } | { ok: false; error: string }>`
- Consumed by: Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/dashboard/pending-approval-count.test.ts
import { describe, it, expect } from "vitest";
import { getPendingApprovalCount } from "./pending-approval-count";

// Minimal chainable count-query mock: .from().select(_, {count, head}).eq().eq()
// then awaited. Records the .eq() calls so we can assert the role scoping.
function makeCountDb(count: number | null, error: unknown = null) {
  const eqCalls: [string, string][] = [];
  const thenable = {
    eqCalls,
    then(resolve: (v: { count: number | null; error: unknown }) => void) {
      resolve({ count, error });
    },
    eq(col: string, val: string) {
      eqCalls.push([col, val]);
      return thenable;
    },
  };
  return {
    eqCalls,
    from: () => ({ select: () => thenable }),
  } as never;
}

describe("getPendingApprovalCount", () => {
  it("counts all pending requests for an hr_admin (no approver filter)", async () => {
    const c = makeCountDb(4);
    const res = await getPendingApprovalCount(c, { id: "u1", role: "hr_admin" });
    expect(res).toEqual({ ok: true, count: 4 });
    expect((c as unknown as { eqCalls: [string, string][] }).eqCalls).toEqual([["status", "pending"]]);
  });

  it("filters by approver_id for a non-admin", async () => {
    const c = makeCountDb(2);
    const res = await getPendingApprovalCount(c, { id: "u9", role: "atasan" });
    expect(res).toEqual({ ok: true, count: 2 });
    expect((c as unknown as { eqCalls: [string, string][] }).eqCalls).toEqual([
      ["status", "pending"],
      ["approver_id", "u9"],
    ]);
  });

  it("returns an error result on a query error", async () => {
    const c = makeCountDb(null, { message: "boom" });
    const res = await getPendingApprovalCount(c, { id: "u1", role: "super_admin" });
    expect(res.ok).toBe(false);
  });
});
```

```ts
// src/lib/dashboard/recent-activity.test.ts
import { describe, it, expect } from "vitest";
import { getRecentActivity } from "./recent-activity";

function db(rows: unknown[] | null, error: unknown = null) {
  const q = {
    then(resolve: (v: { data: unknown; error: unknown }) => void) {
      resolve({ data: rows, error });
    },
    order() { return q; },
    limit() { return q; },
  };
  return { from: () => ({ select: () => q }) } as never;
}

describe("getRecentActivity", () => {
  it("maps rows to { id, aksi, actorNama, waktu }", async () => {
    const res = await getRecentActivity(
      db([
        { id: "1", aksi: "update_employee", waktu: "2026-08-31T10:00:00Z", actor: { nama: "Rahmat" } },
        { id: "2", aksi: "approve_leave", waktu: "2026-08-30T09:00:00Z", actor: null },
      ]),
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { id: "1", aksi: "update_employee", actorNama: "Rahmat", waktu: "2026-08-31T10:00:00Z" },
        { id: "2", aksi: "approve_leave", actorNama: "Sistem", waktu: "2026-08-30T09:00:00Z" },
      ],
    });
  });

  it("returns an error result on a query error", async () => {
    const res = await getRecentActivity(db(null, { message: "x" }));
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- pending-approval-count recent-activity
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/dashboard/pending-approval-count.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true; count: number } | { ok: false; error: string };

export async function getPendingApprovalCount(
  db: SupabaseClient,
  employee: { id: string; role: string },
): Promise<Result> {
  let query = db
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") {
    query = query.eq("approver_id", employee.id);
  }
  const { count, error } = await query;
  if (error) {
    console.error("getPendingApprovalCount: query failed", error);
    return { ok: false, error: "Gagal memuat jumlah persetujuan." };
  }
  return { ok: true, count: count ?? 0 };
}
```

```ts
// src/lib/dashboard/recent-activity.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityRow = { id: string; aksi: string; actorNama: string; waktu: string };
type Result = { ok: true; rows: ActivityRow[] } | { ok: false; error: string };

export async function getRecentActivity(db: SupabaseClient): Promise<Result> {
  const { data, error } = await db
    .from("audit_logs")
    .select("id, aksi, waktu, actor:employees!audit_logs_actor_id_fkey(nama)")
    .order("waktu", { ascending: false })
    .limit(10);
  if (error) {
    console.error("getRecentActivity: query failed", error);
    return { ok: false, error: "Gagal memuat aktivitas." };
  }
  const rows: ActivityRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    aksi: r.aksi as string,
    waktu: r.waktu as string,
    actorNama:
      ((r.actor as unknown as { nama: string } | null)?.nama) ?? "Sistem",
  }));
  return { ok: true, rows };
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npm test -- pending-approval-count recent-activity && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS. If the count-query mock doesn't line up with the `.eq().eq()` chain, adjust the test mock (not the impl); keep every assertion including the `_eqCalls` order checks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/pending-approval-count.ts src/lib/dashboard/pending-approval-count.test.ts src/lib/dashboard/recent-activity.ts src/lib/dashboard/recent-activity.test.ts
git commit -m "feat(dashboard): pending-approval-count + recent-activity lib"
```

---

## Task 6: `getBranchBreakdown` + `getTodayExceptions`

**Files:**
- Create: `src/lib/dashboard/branch-breakdown.ts`, `src/lib/dashboard/branch-breakdown.test.ts`, `src/lib/dashboard/today-exceptions.ts`, `src/lib/dashboard/today-exceptions.test.ts`

**Interfaces:**
- Produces:
  - `getBranchBreakdown(db): Promise<{ ok: true; rows: { branchId: string; nama: string; hadir: number; terlambat: number; alpa: number }[] } | { ok: false; error: string }>`
  - `getTodayExceptions(db, branchId?): Promise<{ ok: true; rows: { employeeId: string; nama: string; status: "terlambat" | "alpa" | "di_luar_lokasi" | "pulang_cepat" }[] } | { ok: false; error: string }>`
- Consumed by: Task 8.

> **Note:** `attendances` has **no** `menit_terlambat` column (checked `supabase/migrations/0002_attendance_leave.sql`). The exceptions list shows name + status badge only — no "N minutes late" figure. The spec's `menitTerlambat` field is dropped.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/dashboard/branch-breakdown.test.ts
import { describe, it, expect } from "vitest";
import { getBranchBreakdown } from "./branch-breakdown";

// db mock: three tables — branches, employees (active, with branch_id),
// attendances today (status + employees.branch_id embed).
function makeDb(opts: {
  branches: { id: string; nama: string }[];
  activeEmployees: { branch_id: string }[];
  attendances: { status: string; employees: { branch_id: string } }[];
  error?: unknown;
}) {
  return {
    from(table: string) {
      const resolve = (r: unknown) => ({
        then: (res: (v: unknown) => void) => res(r),
        eq() { return this; },
        order() { return this; },
      });
      if (table === "branches")
        return { select: () => resolve({ data: opts.branches, error: opts.error ?? null }) };
      if (table === "employees")
        return { select: () => resolve({ data: opts.activeEmployees, error: opts.error ?? null }) };
      return { select: () => resolve({ data: opts.attendances, error: opts.error ?? null }) };
    },
  } as never;
}

describe("getBranchBreakdown", () => {
  it("computes hadir/terlambat and alpa = headcount - rows per branch", async () => {
    const res = await getBranchBreakdown(
      makeDb({
        branches: [{ id: "b1", nama: "Pusat" }, { id: "b2", nama: "Bandung" }],
        activeEmployees: [
          { branch_id: "b1" }, { branch_id: "b1" }, { branch_id: "b1" }, // 3 at b1
          { branch_id: "b2" }, { branch_id: "b2" },                       // 2 at b2
        ],
        attendances: [
          { status: "tepat_waktu", employees: { branch_id: "b1" } },
          { status: "terlambat", employees: { branch_id: "b1" } },
          { status: "tepat_waktu", employees: { branch_id: "b2" } },
        ],
      }),
    );
    expect(res).toEqual({
      ok: true,
      rows: [
        { branchId: "b1", nama: "Pusat", hadir: 1, terlambat: 1, alpa: 1 },   // 3 - 2 rows
        { branchId: "b2", nama: "Bandung", hadir: 1, terlambat: 0, alpa: 1 }, // 2 - 1 row
      ],
    });
  });

  it("returns an error result when a query fails", async () => {
    const res = await getBranchBreakdown(
      makeDb({ branches: [], activeEmployees: [], attendances: [], error: { message: "x" } }),
    );
    expect(res.ok).toBe(false);
  });
});
```

```ts
// src/lib/dashboard/today-exceptions.test.ts
import { describe, it, expect } from "vitest";
import { getTodayExceptions } from "./today-exceptions";

function makeDb(opts: {
  activeEmployees: { id: string; nama: string; branch_id: string }[];
  attendances: { employee_id: string; status: string }[];
  error?: unknown;
}) {
  return {
    from(table: string) {
      const q = {
        then: (res: (v: unknown) => void) =>
          res(
            table === "employees"
              ? { data: opts.activeEmployees, error: opts.error ?? null }
              : { data: opts.attendances, error: opts.error ?? null },
          ),
        eq() { return q; },
        in() { return q; },
        order() { return q; },
        select() { return q; },
      };
      return { select: () => q };
    },
  } as never;
}

describe("getTodayExceptions", () => {
  it("includes late/dll/pc rows and employees with no row as alpa, sorted alpa→terlambat→dll→pc", async () => {
    const res = await getTodayExceptions(
      makeDb({
        activeEmployees: [
          { id: "e1", nama: "Andi", branch_id: "b1" },
          { id: "e2", nama: "Siti", branch_id: "b1" },
          { id: "e3", nama: "Budi", branch_id: "b1" },
          { id: "e4", nama: "Rina", branch_id: "b1" },
        ],
        attendances: [
          { employee_id: "e2", status: "terlambat" },
          { employee_id: "e3", status: "di_luar_lokasi" },
          { employee_id: "e4", status: "tepat_waktu" }, // not an exception
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => [r.nama, r.status])).toEqual([
      ["Andi", "alpa"],          // no row
      ["Siti", "terlambat"],
      ["Budi", "di_luar_lokasi"],
    ]);
  });

  it("returns an error result on a query error", async () => {
    const res = await getTodayExceptions(
      makeDb({ activeEmployees: [], attendances: [], error: { message: "x" } }),
    );
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- branch-breakdown today-exceptions
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/dashboard/branch-breakdown.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PRESENT_STATUSES } from "@/lib/attendance/status";

type BranchRow = { branchId: string; nama: string; hadir: number; terlambat: number; alpa: number };
type Result = { ok: true; rows: BranchRow[] } | { ok: false; error: string };

export async function getBranchBreakdown(db: SupabaseClient): Promise<Result> {
  const today = toJakartaDateOnly(new Date());
  const [branchesRes, employeesRes, attendancesRes] = await Promise.all([
    db.from("branches").select("id, nama").order("nama"),
    db.from("employees").select("branch_id").eq("status", "aktif"),
    db.from("attendances").select("status, employees!inner(branch_id)").eq("tanggal", today),
  ]);
  const err = branchesRes.error ?? employeesRes.error ?? attendancesRes.error;
  if (err) {
    console.error("getBranchBreakdown: query failed", err);
    return { ok: false, error: "Gagal memuat ringkasan per cabang." };
  }
  const headcount = new Map<string, number>();
  for (const e of employeesRes.data ?? []) {
    const b = e.branch_id as string;
    headcount.set(b, (headcount.get(b) ?? 0) + 1);
  }
  const hadir = new Map<string, number>();
  const terlambat = new Map<string, number>();
  const rowsPerBranch = new Map<string, number>();
  for (const a of attendancesRes.data ?? []) {
    const b = (a.employees as unknown as { branch_id: string }).branch_id;
    const s = a.status as string;
    rowsPerBranch.set(b, (rowsPerBranch.get(b) ?? 0) + 1);
    if (PRESENT_STATUSES.includes(s)) hadir.set(b, (hadir.get(b) ?? 0) + 1);
    if (s === "terlambat") terlambat.set(b, (terlambat.get(b) ?? 0) + 1);
  }
  const rows: BranchRow[] = (branchesRes.data ?? []).map((b) => {
    const id = b.id as string;
    return {
      branchId: id,
      nama: b.nama as string,
      hadir: hadir.get(id) ?? 0,
      terlambat: terlambat.get(id) ?? 0,
      alpa: Math.max((headcount.get(id) ?? 0) - (rowsPerBranch.get(id) ?? 0), 0),
    };
  });
  return { ok: true, rows };
}
```

```ts
// src/lib/dashboard/today-exceptions.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

type ExceptionStatus = "terlambat" | "alpa" | "di_luar_lokasi" | "pulang_cepat";
type ExceptionRow = {
  employeeId: string;
  nama: string;
  status: ExceptionStatus;
};
type Result = { ok: true; rows: ExceptionRow[] } | { ok: false; error: string };

const SORT_ORDER: Record<ExceptionStatus, number> = {
  alpa: 0,
  terlambat: 1,
  di_luar_lokasi: 2,
  pulang_cepat: 3,
};

export async function getTodayExceptions(
  db: SupabaseClient,
  branchId?: string,
): Promise<Result> {
  const today = toJakartaDateOnly(new Date());

  let employeeQuery = db
    .from("employees")
    .select("id, nama, branch_id")
    .eq("status", "aktif");
  if (branchId) employeeQuery = employeeQuery.eq("branch_id", branchId);

  let attendanceQuery = branchId
    ? db
        .from("attendances")
        .select("employee_id, status, employees!inner(branch_id)")
        .eq("tanggal", today)
        .eq("employees.branch_id", branchId)
    : db.from("attendances").select("employee_id, status").eq("tanggal", today);

  const [employeesRes, attendancesRes] = await Promise.all([employeeQuery, attendanceQuery]);
  const err = employeesRes.error ?? attendancesRes.error;
  if (err) {
    console.error("getTodayExceptions: query failed", err);
    return { ok: false, error: "Gagal memuat daftar perlu perhatian." };
  }

  const byEmployee = new Map<string, string>();
  for (const a of attendancesRes.data ?? []) {
    byEmployee.set(a.employee_id as string, a.status as string);
  }

  const rows: ExceptionRow[] = [];
  for (const e of employeesRes.data ?? []) {
    const id = e.id as string;
    const status = byEmployee.get(id);
    if (status === undefined) {
      rows.push({ employeeId: id, nama: e.nama as string, status: "alpa" });
    } else if (
      status === "terlambat" ||
      status === "di_luar_lokasi" ||
      status === "pulang_cepat"
    ) {
      rows.push({ employeeId: id, nama: e.nama as string, status });
    }
  }

  rows.sort((a, b) => {
    const d = SORT_ORDER[a.status] - SORT_ORDER[b.status];
    return d !== 0 ? d : a.nama.localeCompare(b.nama);
  });

  return { ok: true, rows };
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npm test -- branch-breakdown today-exceptions && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS. Adjust the test mocks to match the real chain shape if needed; keep every assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/branch-breakdown.ts src/lib/dashboard/branch-breakdown.test.ts src/lib/dashboard/today-exceptions.ts src/lib/dashboard/today-exceptions.test.ts
git commit -m "feat(dashboard): branch-breakdown + today-exceptions lib"
```

---

## Task 7: `dashboard-controls.tsx` reskin

**Files:**
- Modify: `src/app/(admin)/dashboard/dashboard-controls.tsx`, `src/app/(admin)/dashboard/dashboard-controls.test.tsx`

**Interfaces:**
- Consumes: `NativeSelect` (Task 1), shadcn `Button`, `Label`.
- Produces: same `<DashboardControls branches selectedBranch>` signature and behavior (push `?branch=`, 30s `router.refresh()`, client timestamp).

- [ ] **Step 1: Update the test for the new markup**

The existing tests use `fireEvent.change(screen.getByLabelText(/cabang/i), ...)` and `getByRole("button", { name: /muat ulang/i })`. `NativeSelect` is still a `<select>` with a `<Label htmlFor>` — `getByLabelText` keeps working. Keep all four test cases as-is; only adjust if a selector breaks (e.g. the label text). Run them after Step 2 to confirm.

- [ ] **Step 2: Reskin the component**

```tsx
// src/app/(admin)/dashboard/dashboard-controls.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const TIME_FMT = new Intl.DateTimeFormat("id-ID", { timeStyle: "medium", timeZone: "Asia/Jakarta" });

export function DashboardControls({
  branches,
  selectedBranch,
}: {
  branches: { id: string; nama: string }[];
  selectedBranch: string;
}) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const stamp = () => setUpdatedAt(TIME_FMT.format(new Date()));
    stamp();
    const id = setInterval(() => {
      router.refresh();
      stamp();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="branch" className="text-xs text-muted-foreground">Cabang</Label>
        <NativeSelect
          id="branch"
          defaultValue={selectedBranch}
          onChange={(e) =>
            router.push(e.target.value ? `/dashboard?branch=${e.target.value}` : "/dashboard")
          }
          className="h-9 w-48"
        >
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.nama}</option>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
        <RefreshCw className="size-4" /> Muat ulang
      </Button>
      {updatedAt && (
        <span className="text-xs text-muted-foreground">Diperbarui {updatedAt}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- dashboard-controls && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (4 tests). If `getByRole("button", { name: /muat ulang/i })` fails because the icon adds an accessible-name fragment, use `{ name: /muat ulang/i }` (regex already tolerant) — should be fine.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/dashboard/dashboard-controls.tsx" "src/app/(admin)/dashboard/dashboard-controls.test.tsx"
git commit -m "feat(dashboard): reskin DashboardControls to shadcn"
```

---

## Task 8: Dashboard page rewrite + delete `SummaryCard`

**Files:**
- Modify: `src/app/(admin)/dashboard/page.tsx`
- Delete: `src/components/summary-card.tsx`, `src/components/summary-card.test.tsx`

**Interfaces:**
- Consumes: `StatCard` (T2), `ResponsiveTable` (T3), extended `getTodaySummary` (T4), `getPendingApprovalCount` + `getRecentActivity` (T5), `getBranchBreakdown` + `getTodayExceptions` (T6), `getMonthlyTrend` (existing), `AttendanceTrendChart` (existing), `AttendanceStatusBadge` (existing), `PageHeader`, `Card*`, `Alert`, `DashboardControls` (T7).

- [ ] **Step 1: Confirm `SummaryCard` has no other consumer**

```bash
grep -rn "summary-card\|SummaryCard" src/ | grep -v "summary-card.tsx\|summary-card.test"
```

Expected: only `src/app/(admin)/dashboard/page.tsx`. If anything else appears, STOP and report.

- [ ] **Step 2: Rewrite the page**

```tsx
// src/app/(admin)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { getMonthlyTrend } from "@/lib/dashboard/monthly-trend";
import { getPendingApprovalCount } from "@/lib/dashboard/pending-approval-count";
import { getBranchBreakdown } from "@/lib/dashboard/branch-breakdown";
import { getTodayExceptions } from "@/lib/dashboard/today-exceptions";
import { getRecentActivity } from "@/lib/dashboard/recent-activity";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ResponsiveTable } from "@/components/responsive-table";
import { AttendanceTrendChart } from "@/components/attendance-trend-chart";
import { AttendanceStatusBadge } from "@/components/attendance-status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { DashboardControls } from "./dashboard-controls";

function pct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function InlineError({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-destructive">{children}</p>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  const { data: branches } = await db.from("branches").select("id, nama").order("nama");
  const branchList = branches ?? [];
  const branchId = branch && branchList.some((b) => b.id === branch) ? branch : undefined;
  const branchName = branchId ? branchList.find((b) => b.id === branchId)?.nama : undefined;
  const isHrAdmin = employee.role === "hr_admin" || employee.role === "super_admin";
  const showBranchBreakdown = !branchId && branchList.length > 1;

  const ym = toJakartaDateOnly(new Date()).slice(0, 7);
  const [summary, trend, approvals, exceptions, breakdown, activity] = await Promise.all([
    getTodaySummary(db, branchId),
    getMonthlyTrend(db, ym, branchId),
    getPendingApprovalCount(db, employee),
    getTodayExceptions(db, branchId),
    showBranchBreakdown ? getBranchBreakdown(db) : Promise.resolve(null),
    isHrAdmin ? getRecentActivity(db) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Ringkasan kehadiran hari ini${branchName ? ` · ${branchName}` : ""}`}
        actions={<DashboardControls branches={branchList} selectedBranch={branchId ?? ""} />}
      />

      {/* stat row */}
      {summary.ok ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Hadir" value={summary.summary.hadir} sublabel={pct(summary.summary.hadir, summary.summary.total)} />
          <StatCard label="Terlambat" value={summary.summary.terlambat} tone="warning" />
          <StatCard label="Pulang Cepat" value={summary.summary.pulangCepat} />
          <StatCard label="Di Luar Lokasi" value={summary.summary.diLuarLokasi} />
          <StatCard label="Alpa" value={summary.summary.alpa} tone="destructive" />
          <StatCard label="Cuti" value={summary.summary.cuti} />
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{summary.error}</AlertDescription>
        </Alert>
      )}

      {/* trend + approvals */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tren Kehadiran Bulan Ini</CardTitle>
            <CardDescription>Jumlah hadir dan terlambat per hari.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.ok ? <AttendanceTrendChart data={trend.points} /> : <InlineError>{trend.error}</InlineError>}
          </CardContent>
        </Card>
        {approvals.ok ? (
          <StatCard
            label="Menunggu persetujuan"
            value={approvals.count}
            sublabel="Tinjau pengajuan cuti →"
            tone="accent"
            href="/persetujuan-cuti"
          />
        ) : (
          <Card size="sm"><CardContent><InlineError>{approvals.error}</InlineError></CardContent></Card>
        )}
      </div>

      {/* per-branch + exceptions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {showBranchBreakdown && (
          <Card>
            <CardHeader><CardTitle>Per Cabang · hari ini</CardTitle></CardHeader>
            <CardContent>
              {breakdown && breakdown.ok ? (
                <ResponsiveTable
                  columns={[
                    { key: "nama", header: "Cabang", cell: (r) => r.nama },
                    { key: "hadir", header: "Hadir", align: "right", cell: (r) => r.hadir },
                    { key: "terlambat", header: "Terlambat", align: "right", cell: (r) => r.terlambat },
                    { key: "alpa", header: "Alpa", align: "right", cell: (r) => r.alpa },
                  ]}
                  rows={breakdown.rows}
                  rowKey={(r) => r.branchId}
                  emptyState={<p className="text-sm text-muted-foreground">Belum ada cabang.</p>}
                />
              ) : (
                <InlineError>{breakdown?.ok === false ? breakdown.error : "Gagal memuat."}</InlineError>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Perlu perhatian · hari ini</CardTitle></CardHeader>
          <CardContent>
            {exceptions.ok ? (
              exceptions.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Semua karyawan hadir tepat waktu.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {exceptions.rows.slice(0, 8).map((r) => (
                    <li key={r.employeeId} className="flex items-center justify-between gap-2">
                      <span className="text-foreground">{r.nama}</span>
                      <AttendanceStatusBadge status={r.status} />
                    </li>
                  ))}
                  {exceptions.rows.length > 8 && (
                    <li className="text-xs text-muted-foreground">
                      + {exceptions.rows.length - 8} lainnya
                    </li>
                  )}
                </ul>
              )
            ) : (
              <InlineError>{exceptions.error}</InlineError>
            )}
          </CardContent>
        </Card>
      </div>

      {/* recent activity */}
      {isHrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas Terakhir</CardTitle>
            <CardAction>
              <Link href="/pengaturan/audit" className="text-xs text-primary hover:underline">
                Lihat semua
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {activity && activity.ok ? (
              activity.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {activity.rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                      <span className="text-foreground">{a.actorNama}</span>
                      <span>{a.aksi}</span>
                      <span className="text-xs">
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(a.waktu))}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <InlineError>{activity?.ok === false ? activity.error : "Gagal memuat."}</InlineError>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

Note the `AttendanceStatusBadge` `status` prop type is `AttendanceStatus` (`"terlambat" | "alpa" | "di_luar_lokasi" | "pulang_cepat" | "tepat_waktu"`) — the exception rows' `status` is a subset, so it type-checks directly.

- [ ] **Step 3: Delete `SummaryCard`**

```bash
git rm src/components/summary-card.tsx src/components/summary-card.test.tsx
```

- [ ] **Step 4: Build + typecheck + test**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: tsc clean; full suite green (SummaryCard tests gone, count drops by however many that file had — that's expected); build compiles, `/dashboard` present, still 26 routes.

- [ ] **Step 5: Dev-server smoke**

`npm run dev`, log in as `hr_admin`, open `/dashboard`: 6 stat tiles, trend chart in a card, "Menunggu persetujuan" tile links to `/persetujuan-cuti`, per-branch table (if >1 branch), exceptions list, activity feed. Switch the branch filter → breakdown hides, description updates. As an `atasan`: no activity feed, approvals count is approver-scoped.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dashboard): full rework — 6 stat tiles, approvals tile, per-branch, exceptions, activity"
```

---

## Task 9: `employee-filters.tsx` reskin

**Files:**
- Modify: `src/app/(admin)/karyawan/employee-filters.tsx`, `src/app/(admin)/karyawan/employee-filters.test.tsx`

**Interfaces:**
- Consumes: `FilterBar` (T1), `NativeSelect` (T1), shadcn `Input`, `Label`, `Button`.
- Produces: same `<EmployeeFilters branches defaults>` signature + `/karyawan?...` push behavior.

- [ ] **Step 1: Read the current test**

Read `employee-filters.test.tsx`. It likely uses `getByLabelText` + `fireEvent.change` on native `<select>` / `<input>`. With `NativeSelect` (still `<select>`) + shadcn `<Input>` (still `<input>`) + `<Label htmlFor>`, those selectors keep working. Keep the test's assertions; only touch selectors that break.

- [ ] **Step 2: Reskin the component**

```tsx
// src/app/(admin)/karyawan/employee-filters.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Defaults = { cabang?: string; role?: string; status: string; q: string };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Semua role" },
  { value: "karyawan", label: "Karyawan" },
  { value: "atasan", label: "Atasan" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export function EmployeeFilters({
  branches,
  defaults,
}: {
  branches: { id: string; nama: string }[];
  defaults: Defaults;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaults.q);

  function pushWith(overrides: Partial<Defaults>) {
    const next = {
      cabang: defaults.cabang ?? "",
      role: defaults.role ?? "",
      status: defaults.status,
      q,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.cabang) params.set("cabang", next.cabang);
    if (next.role) params.set("role", next.role);
    params.set("status", next.status || "semua");
    if (next.q) params.set("q", next.q);
    router.push(`/karyawan?${params.toString()}`);
  }

  return (
    <FilterBar>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          pushWith({ q });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Cari nama</Label>
          <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cabang">Cabang</Label>
          <NativeSelect
            id="cabang"
            defaultValue={defaults.cabang ?? ""}
            onChange={(e) => pushWith({ cabang: e.target.value })}
            className="h-9 w-44"
          >
            <option value="">Semua cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <NativeSelect
            id="role"
            defaultValue={defaults.role ?? ""}
            onChange={(e) => pushWith({ role: e.target.value })}
            className="h-9 w-40"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect
            id="status"
            defaultValue={defaults.status}
            onChange={(e) => pushWith({ status: e.target.value })}
            className="h-9 w-32"
          >
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="semua">Semua</option>
          </NativeSelect>
        </div>
        <Button type="submit" size="sm">
          <Search className="size-4" /> Cari
        </Button>
      </form>
    </FilterBar>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- employee-filters && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS. Fix any selector that broke (label text unchanged, so `getByLabelText` should be fine).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/karyawan/employee-filters.tsx" "src/app/(admin)/karyawan/employee-filters.test.tsx"
git commit -m "feat(karyawan): reskin EmployeeFilters to shadcn + FilterBar"
```

---

## Task 10: `karyawan/page.tsx` → ResponsiveTable

**Files:**
- Modify: `src/app/(admin)/karyawan/page.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `ResponsiveTable` (T3), `StatusPill` (T1), `RoleBadge`, `Avatar*`, `EmptyState`, `Alert`, `Button`, `signProfilePhotoUrls` (existing), `EmployeeFilters` (T9).

- [ ] **Step 1: Rewrite the page**

Keep the guard, the query (already selects `foto_profil_url`), the filter application, and the `signProfilePhotoUrls` call **unchanged**. Replace the JSX from `<div className="space-y-6">` onward:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title="Karyawan"
        description="Kelola data karyawan dan onboarding."
        actions={
          <Button asChild>
            <Link href="/karyawan/baru">
              <UserPlus className="size-4" /> Tambah Karyawan
            </Link>
          </Button>
        }
      />

      <EmployeeFilters
        branches={branches ?? []}
        defaults={{ cabang: sp.cabang, role: sp.role, status: rawStatus, q: sp.q ?? "" }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat daftar karyawan.</AlertDescription>
        </Alert>
      )}

      {!error && (
        <ResponsiveTable
          columns={[
            {
              key: "nama",
              header: "Nama",
              cell: (r) => (
                <span className="flex items-center gap-2">
                  <Avatar className="size-7">
                    {photoUrlByIndex(r) ? <AvatarImage src={photoUrlByIndex(r)!} alt="" /> : null}
                    <AvatarFallback className="text-[0.65rem]">{initials(r.nama)}</AvatarFallback>
                  </Avatar>
                  {r.nama}
                </span>
              ),
            },
            { key: "jabatan", header: "Jabatan", cell: (r) => r.jabatan, mobileLabel: "Jabatan" },
            {
              key: "cabang",
              header: "Cabang",
              cell: (r) => (r.branches as unknown as { nama: string } | null)?.nama ?? "-",
              mobileLabel: "Cabang",
            },
            { key: "role", header: "Peran", cell: (r) => <RoleBadge role={r.role as Role} />, mobileLabel: "Peran" },
            { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status as "aktif" | "nonaktif"} />, mobileLabel: "Status" },
          ]}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          rowHref={(r) => `/karyawan/${r.id}`}
          emptyState={<EmptyState icon={Users} message="Tidak ada karyawan yang cocok dengan filter." />}
        />
      )}
    </div>
  );
```

For the avatar URL: `signProfilePhotoUrls` returns an array aligned to `rows`. Build a `Map<string, string | null>` keyed by `r.id` right after the sign call, and reference it in the `cell` closure — cleaner than an index helper:

```tsx
  const photoByRow = new Map<string, string | null>(
    (rows ?? []).map((r, i) => [r.id, photoUrls[i] ?? null]),
  );
```

and in the cell: `photoByRow.get(r.id)`. Replace the sketch's `photoUrlByIndex(r)` accordingly.

Add a local `initials(nama)` helper (first letters of first two words, uppercased, `|| "?"`) or import it if one exists (grep `function initials` in `src/`).

Imports to add: `Link` from `next/link`; `UserPlus, Users` from `lucide-react`; `PageHeader`, `ResponsiveTable`, `StatusPill`, `EmptyState` from `@/components/*`; `Avatar, AvatarFallback, AvatarImage` from `@/components/ui/avatar`; `Button` from `@/components/ui/button`; `Alert, AlertDescription` from `@/components/ui/alert`. Remove now-unused imports.

- [ ] **Step 2: Typecheck + build**

```bash
./node_modules/.bin/tsc --noEmit && npm run build && npm test
```

Expected: tsc clean; build compiles (`/karyawan` present); suite green (no test file for this page).

- [ ] **Step 3: Dev-server smoke**

`/karyawan`: table with avatars + badges on desktop, card list at a narrow width, filters push the URL, "Tambah Karyawan" navigates, a row click opens the detail, empty filter → EmptyState.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/karyawan/page.tsx"
git commit -m "feat(karyawan): list uses ResponsiveTable + PageHeader + StatusPill"
```

---

## Task 11: `employee-form-fields.tsx` → 4 titled sections

**Files:**
- Modify: `src/app/(admin)/karyawan/employee-form-fields.tsx`, `src/app/(admin)/karyawan/employee-form-fields.test.tsx`

**Interfaces:**
- Consumes: `Field`, `Input`, `NativeSelect` (T1).
- Produces: same `<EmployeeFormFields branches departments approverOptions defaults? emailReadOnly?>` signature. Same `name` attributes and uncontrolled `defaultValue` behavior (parent forms read `FormData`).

- [ ] **Step 1: Update the test**

Read `employee-form-fields.test.tsx`. Keep every existing assertion about field presence / `name` / readOnly. Add:

```tsx
it("groups fields under four section headings", () => {
  render(<EmployeeFormFields branches={[]} departments={[]} approverOptions={[]} />);
  for (const h of ["Identitas", "Kepegawaian", "Struktur Organisasi", "Persetujuan"]) {
    expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
  }
});
```

If existing assertions used `getByLabelText("Nama")` etc., they keep working — `<Field label="Nama">` renders a `<label>` wired to the control.

- [ ] **Step 2: Rewrite**

```tsx
// src/app/(admin)/karyawan/employee-form-fields.tsx
"use client";

import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type EmployeeFieldValues = {
  nama: string; email: string; jabatan: string; statusKontrak: string;
  tanggalMulaiKerja: string; gajiPokok: string; role: string;
  branchId: string; departmentId: string; atasanId: string; designatedApproverId: string;
};

const ROLE_OPTIONS = [
  { value: "karyawan", label: "Karyawan" },
  { value: "atasan", label: "Atasan" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "super_admin", label: "Super Admin" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function EmployeeFormFields({
  branches,
  departments,
  approverOptions,
  defaults = {},
  emailReadOnly = false,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string }[];
  approverOptions: { id: string; nama: string }[];
  defaults?: Partial<EmployeeFieldValues>;
  emailReadOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
      <Section title="Identitas">
        <Field id="nama" label="Nama">
          <Input name="nama" defaultValue={defaults.nama} required />
        </Field>
        <Field id="email" label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={defaults.email}
            required
            readOnly={emailReadOnly}
            aria-readonly={emailReadOnly || undefined}
            className={emailReadOnly ? "bg-muted text-muted-foreground" : undefined}
          />
        </Field>
        <Field id="jabatan" label="Jabatan">
          <Input name="jabatan" defaultValue={defaults.jabatan} required />
        </Field>
      </Section>

      <Section title="Kepegawaian">
        <Field id="statusKontrak" label="Status Kontrak">
          <Input name="statusKontrak" defaultValue={defaults.statusKontrak ?? "tetap"} />
        </Field>
        <Field id="tanggalMulaiKerja" label="Tanggal Mulai Kerja">
          <Input name="tanggalMulaiKerja" type="date" defaultValue={defaults.tanggalMulaiKerja} required />
        </Field>
        <Field id="gajiPokok" label="Gaji Pokok">
          <Input name="gajiPokok" type="number" min="0" inputMode="numeric" defaultValue={defaults.gajiPokok ?? "0"} />
        </Field>
        <Field id="role" label="Role">
          <NativeSelect name="role" defaultValue={defaults.role ?? "karyawan"}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>

      <Section title="Struktur Organisasi">
        <Field id="branchId" label="Cabang">
          <NativeSelect name="branchId" defaultValue={defaults.branchId ?? ""} required>
            <option value="">Pilih cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="departmentId" label="Departemen (opsional)">
          <NativeSelect name="departmentId" defaultValue={defaults.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.nama}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="atasanId" label="Atasan (opsional)">
          <NativeSelect name="atasanId" defaultValue={defaults.atasanId ?? ""}>
            <option value="">—</option>
            {approverOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.nama}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>

      <Section title="Persetujuan">
        <Field id="designatedApproverId" label="Approver Pengganti (wajib utk HR/Super Admin)">
          <NativeSelect name="designatedApproverId" defaultValue={defaults.designatedApproverId ?? ""}>
            <option value="">—</option>
            {approverOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.nama}</option>
            ))}
          </NativeSelect>
        </Field>
      </Section>
    </div>
  );
}
```

`<Field id label>` clones its child to set `id={id}` — so the child `<Input>` / `<NativeSelect>` gets `id` matching the label's `htmlFor`, and `name` stays as passed. Confirm `Field` forwards to a `<select>` child correctly (it clones any single valid element — `NativeSelect` forwards `id` to its inner `<select>` via `{...props}`, and `Field` sets `id` on the `NativeSelect` element which passes it through). If `Field`'s clone sets `id` on the `NativeSelect` wrapper `<div>` instead of the `<select>`, add an explicit `id` prop to each `NativeSelect` matching the `Field` `id` and let `Field`'s clone be a harmless no-op — the `<select>` gets the right `id` either way.

- [ ] **Step 3: Run tests**

```bash
npm test -- employee-form-fields && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (existing + the 4-headings case).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/karyawan/employee-form-fields.tsx" "src/app/(admin)/karyawan/employee-form-fields.test.tsx"
git commit -m "feat(karyawan): sectioned employee form fields (Identitas/Kepegawaian/Struktur/Persetujuan)"
```

---

## Task 12: `karyawan/baru` page + `create-employee-form` reskin

**Files:**
- Modify: `src/app/(admin)/karyawan/baru/page.tsx`, `src/app/(admin)/karyawan/baru/create-employee-form.tsx`

(There is no `create-employee-form.test.tsx` — this form has no unit test; it's covered by `employee-form-fields` tests + `npm run build` + the dev-server smoke.)

**Interfaces:**
- Consumes: `PageHeader`, `Card*`, `Alert`, `Button`, `Input`, `EmployeeFormFields` (T11).

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/(admin)/karyawan/baru/page.tsx  — replace only the returned JSX
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tambah Karyawan"
        description="Buat akun, lalu kirim link set-password ke karyawan."
      />
      <Card>
        <CardContent>
          <CreateEmployeeForm
            branches={branches ?? []}
            departments={departments ?? []}
            approverOptions={approvers ?? []}
            createEmployee={createEmployee}
          />
        </CardContent>
      </Card>
    </div>
  );
```

Imports: `PageHeader` from `@/components/page-header`; `Card, CardContent` from `@/components/ui/card`. Remove the old `<div><h1>…` block.

- [ ] **Step 2: Reskin `create-employee-form.tsx`**

Keep all state + the `action` handler logic. Replace the legacy-styled JSX:
- The success panel: `<div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">` with `<p className="text-sm font-medium text-foreground">`, an `<Input readOnly value={link} className="flex-1" />` + a `<Button type="button" variant="outline" onClick={copy}>` (`{copied ? "Tersalin" : "Salin"}`), and `<Button asChild variant="link"><Link href="/karyawan">Kembali ke daftar karyawan</Link></Button>`.
- The form: `<form action={action} className="space-y-6">` + `<EmployeeFormFields .../>` + `{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}` + `<Button type="submit" disabled={busy}>Buat & Ambil Link</Button>`.

Imports: `Link` from `next/link`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `Alert, AlertDescription` from `@/components/ui/alert`.

- [ ] **Step 3: Typecheck + build + test**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: all green; `/karyawan/baru` compiles.

- [ ] **Step 4: Dev-server smoke**

`/karyawan/baru`: the sectioned form renders in a card, submitting a valid new employee shows the set-password link panel with a working "Salin", an invalid submit shows an `<Alert>`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/karyawan/baru/"
git commit -m "feat(karyawan): reskin create-employee page + form"
```

---

## Task 13: `karyawan/[id]` page + `KaryawanTabs` (Detail / Riwayat)

**Files:**
- Create: `src/app/(admin)/karyawan/[id]/karyawan-tabs.tsx`, `src/app/(admin)/karyawan/[id]/karyawan-tabs.test.tsx`
- Modify: `src/app/(admin)/karyawan/[id]/page.tsx`, `src/components/audit-aksi-badge.tsx`, `src/components/audit-aksi-badge.test.tsx`

**Interfaces:**
- Consumes: `Tabs*` from `@/components/ui/tabs`, `PageHeader`, `RoleBadge`, `StatusPill` (T1), `ResponsiveTable` (T3), `EmptyState`, `Alert`, `AuditAksiBadge` (migrated in this task), `EditEmployeeForm` (T14 — but this task renders it as a slot; T14 reskins its internals).
- Produces: `<KaryawanTabs detailSlot={ReactNode} riwayatSlot={ReactNode} />` — a `"use client"` component with two `<TabsContent>`.

- [ ] **Step 0: Migrate `AuditAksiBadge` to shadcn `<Badge>`**

The current `audit-aksi-badge.tsx` uses a raw `<span>` with legacy `bg-green-50` / `text-blue-700` / `bg-neutral-100` classes — it would render legacy colors inside the redesigned Riwayat tab. Rewrite it:

```tsx
// src/components/audit-aksi-badge.tsx
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "success" | "info" | "destructive" | "neutral";

const CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  employee_created: { label: "Karyawan Dibuat", variant: "success" },
  employee_updated: { label: "Karyawan Diubah", variant: "info" },
  employee_deactivated: { label: "Karyawan Dinonaktifkan", variant: "destructive" },
  employee_reactivated: { label: "Karyawan Diaktifkan", variant: "success" },
  employee_deleted: { label: "Karyawan Dihapus", variant: "destructive" },
  leave_approved: { label: "Cuti Disetujui", variant: "success" },
  leave_rejected: { label: "Cuti Ditolak", variant: "destructive" },
};

export function AuditAksiBadge({ aksi }: { aksi: string }) {
  const c = CONFIG[aksi] ?? { label: aksi, variant: "neutral" as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
```

Update `audit-aksi-badge.test.tsx` — keep every assertion about the mapped **labels** (e.g. `employee_created` → "Karyawan Dibuat", unknown → the raw string). Any assertion on the old `bg-*` class strings → retarget to `data-variant` (`success` / `info` / `destructive` / `neutral`) or drop just that class assertion (not the label assertion). Run `npm test -- audit-aksi-badge` — green before moving on.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/(admin)/karyawan/[id]/karyawan-tabs.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KaryawanTabs } from "./karyawan-tabs";

describe("KaryawanTabs", () => {
  it("shows the Detail slot first and switches to Riwayat on click", async () => {
    const user = userEvent.setup();
    render(<KaryawanTabs detailSlot={<p>detail here</p>} riwayatSlot={<p>riwayat here</p>} />);
    expect(screen.getByText("detail here")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Riwayat" }));
    expect(screen.getByText("riwayat here")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- karyawan-tabs
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `KaryawanTabs`**

```tsx
// src/app/(admin)/karyawan/[id]/karyawan-tabs.tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function KaryawanTabs({
  detailSlot,
  riwayatSlot,
}: {
  detailSlot: React.ReactNode;
  riwayatSlot: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="detail" className="space-y-4">
      <TabsList>
        <TabsTrigger value="detail">Detail</TabsTrigger>
        <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
      </TabsList>
      <TabsContent value="detail">{detailSlot}</TabsContent>
      <TabsContent value="riwayat">{riwayatSlot}</TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- karyawan-tabs && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS. `vitest.setup.ts` shims pointer-capture so Radix Tabs works in jsdom.

- [ ] **Step 5: Rewrite `karyawan/[id]/page.tsx`**

Keep the guard, the `emp` query, the `Promise.all` for branches/departments/approvers/audit, and all the `console.error` lines **unchanged**. Replace the JSX from `if (error) { return ... }` onward:

```tsx
  if (error) {
    console.error("KaryawanDetailPage: employee lookup failed", error);
    return (
      <Alert variant="destructive">
        <AlertDescription>Gagal memuat data karyawan.</AlertDescription>
      </Alert>
    );
  }
  if (!emp) notFound();

  // ... the Promise.all block stays ...

  const auditRows = (audit ?? []).map((a) => ({
    key: `${a.waktu}-${a.aksi}`,
    aksi: a.aksi as string,
    oleh: (a.actor as unknown as { nama: string } | null)?.nama ?? "Sistem",
    waktu: a.waktu as string,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={emp.nama}
        description={emp.email}
        actions={
          <>
            <RoleBadge role={emp.role as Role} />
            <StatusPill status={emp.status as "aktif" | "nonaktif"} />
          </>
        }
      />
      <KaryawanTabs
        detailSlot={
          <EditEmployeeForm
            employeeId={emp.id}
            defaults={{
              nama: emp.nama,
              email: emp.email,
              jabatan: emp.jabatan,
              statusKontrak: emp.status_kontrak,
              tanggalMulaiKerja: emp.tanggal_mulai_kerja,
              gajiPokok: String(emp.gaji_pokok),
              role: emp.role,
              branchId: emp.branch_id,
              departmentId: emp.department_id ?? "",
              atasanId: emp.atasan_id ?? "",
              designatedApproverId: emp.designated_approver_id ?? "",
            }}
            branches={branches ?? []}
            departments={departments ?? []}
            approverOptions={approvers ?? []}
            updateEmployee={updateEmployee}
            setStatus={setEmployeeStatus}
            currentStatus={emp.status as "aktif" | "nonaktif"}
            isSelf={me.id === emp.id}
          />
        }
        riwayatSlot={
          <ResponsiveTable
            columns={[
              { key: "aksi", header: "Aksi", cell: (r) => <AuditAksiBadge aksi={r.aksi} /> },
              { key: "oleh", header: "Oleh", cell: (r) => r.oleh, mobileLabel: "Oleh" },
              {
                key: "waktu",
                header: "Waktu",
                cell: (r) =>
                  new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(new Date(r.waktu)),
                mobileLabel: "Waktu",
              },
            ]}
            rows={auditRows}
            rowKey={(r) => r.key}
            emptyState={<EmptyState icon={History} message="Belum ada riwayat." />}
          />
        }
      />
    </div>
  );
```

`AuditAksiBadge` (migrated in Step 0) takes `aksi: string` and safely falls back to a `neutral` badge with the raw string for unknown actions — use it directly.

Imports to add: `PageHeader`, `StatusPill`, `ResponsiveTable`, `EmptyState` from `@/components/*`; `AuditAksiBadge` from `@/components/audit-aksi-badge`; `Alert, AlertDescription` from `@/components/ui/alert`; `History` from `lucide-react`; `KaryawanTabs` from `./karyawan-tabs`. Remove now-unused imports.

- [ ] **Step 6: Typecheck + build + test**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: all green (incl. `audit-aksi-badge`); `/karyawan/[id]` compiles.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/karyawan/[id]/" src/components/audit-aksi-badge.tsx src/components/audit-aksi-badge.test.tsx
git commit -m "feat(karyawan): detail page — PageHeader + Tabs (Detail / Riwayat); AuditAksiBadge to shadcn"
```

---

## Task 14: `edit-employee-form.tsx` reskin

**Files:**
- Modify: `src/app/(admin)/karyawan/[id]/edit-employee-form.tsx`

(There is no `edit-employee-form.test.tsx` — covered by `employee-form-fields` tests + `karyawan-tabs` test + `npm run build` + dev-server smoke.)

**Interfaces:**
- Consumes: `Button`, `Alert`, `Card*`, `EmployeeFormFields` (T11).
- Produces: same `<EditEmployeeForm>` signature and behavior. The existing inline deactivate-confirm (`confirming` state) is **kept and reskinned** — the spec's "add an AlertDialog" clause was conditional on there being no confirm; there is one.

- [ ] **Step 1: Reskin**

Keep `useState` + `run()` + the `action` handler exactly. Replace the JSX:
- Outer `<div className="space-y-6">`.
- The update form: `<form action={...} className="space-y-6">` + `<EmployeeFormFields ... emailReadOnly />` + `{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}` + `{msg && <Alert><AlertDescription>{msg}</AlertDescription></Alert>}` + `<Button type="submit" disabled={busy}>Simpan Perubahan</Button>`.
- The status block (only when `!isSelf`): `<Card size="sm"><CardContent className="space-y-2">`:
  - `currentStatus === "aktif"` and not `confirming` → `<Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirming(true)}>Nonaktifkan Karyawan</Button>`
  - `confirming` → a `<div className="flex flex-wrap items-center gap-2 text-sm">` with the prompt text + `<Button type="button" variant="destructive" size="sm" disabled={busy} onClick={...}>Ya, nonaktifkan</Button>` + `<Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>Batal</Button>`.
  - `currentStatus === "nonaktif"` → `<Button type="button" variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-500" disabled={busy} onClick={...}>Aktifkan Kembali</Button>`.

Imports: `Button` from `@/components/ui/button`; `Alert, AlertDescription` from `@/components/ui/alert`; `Card, CardContent` from `@/components/ui/card`.

- [ ] **Step 2: Typecheck + build + full suite**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: all green; `/karyawan/[id]` compiles.

- [ ] **Step 3: Dev-server smoke**

On `/karyawan/[id]` Detail tab: edit a field + "Simpan Perubahan" → success `<Alert>`; deactivate flow — "Nonaktifkan Karyawan" → inline confirm → "Ya, nonaktifkan" runs `setStatus`, "Batal" cancels; a reactivate button shows for an already-nonaktif employee; no status block when viewing your own record.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/karyawan/[id]/edit-employee-form.tsx"
git commit -m "feat(karyawan): reskin EditEmployeeForm (shadcn buttons + alerts + card)"
```

---

## Task 15: `approval-list.tsx` (replaces `approval-table.tsx`)

**Files:**
- Create: `src/app/(admin)/persetujuan-cuti/approval-list.tsx`, `src/app/(admin)/persetujuan-cuti/approval-list.test.tsx`
- Delete: `src/app/(admin)/persetujuan-cuti/approval-table.tsx`, `src/app/(admin)/persetujuan-cuti/approval-table.test.tsx`
- Modify: `src/app/(admin)/persetujuan-cuti/page.tsx`

**Interfaces:**
- Consumes: `Table*`, `Card*`, `Input`, `Button`, `Badge`, `EmptyState`, `PageHeader`, `Alert`.
- Produces: `<ApprovalList requests approveLeave rejectLeave />` — same prop types as the old `<ApprovalTable>`; `type PendingLeaveRequest` re-exported from this file.

- [ ] **Step 1: Write the failing test** (port `approval-table.test.tsx`, keep every behavioral assertion)

```tsx
// src/app/(admin)/persetujuan-cuti/approval-list.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalList, type PendingLeaveRequest } from "./approval-list";

const req: PendingLeaveRequest = {
  id: "r1", employeeName: "Andi", jenis: "tahunan",
  tanggalMulai: "2026-09-01", tanggalSelesai: "2026-09-03", alasan: "Liburan",
};

describe("ApprovalList", () => {
  it("shows the empty state when there are no requests", () => {
    render(<ApprovalList requests={[]} approveLeave={vi.fn()} rejectLeave={vi.fn()} />);
    expect(screen.getByText(/Tidak ada pengajuan cuti/i)).toBeInTheDocument();
  });

  it("approves with a trimmed note (or null)", async () => {
    const user = userEvent.setup();
    const approveLeave = vi.fn().mockResolvedValue({ ok: true });
    render(<ApprovalList requests={[req]} approveLeave={approveLeave} rejectLeave={vi.fn()} />);
    // desktop + mobile both render; act on the first Setujui button
    await user.click(screen.getAllByRole("button", { name: /setujui/i })[0]);
    expect(approveLeave).toHaveBeenCalledWith("r1", null);
  });

  it("blocks reject without a note and shows the error", async () => {
    const user = userEvent.setup();
    const rejectLeave = vi.fn();
    render(<ApprovalList requests={[req]} approveLeave={vi.fn()} rejectLeave={rejectLeave} />);
    await user.click(screen.getAllByRole("button", { name: /tolak/i })[0]);
    expect(rejectLeave).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Catatan wajib diisi untuk menolak/i).length).toBeGreaterThan(0);
  });

  it("rejects with a note", async () => {
    const user = userEvent.setup();
    const rejectLeave = vi.fn().mockResolvedValue({ ok: true });
    render(<ApprovalList requests={[req]} approveLeave={vi.fn()} rejectLeave={rejectLeave} />);
    await user.type(screen.getAllByPlaceholderText(/wajib diisi untuk menolak/i)[0], "  Tidak disetujui  ");
    await user.click(screen.getAllByRole("button", { name: /tolak/i })[0]);
    expect(rejectLeave).toHaveBeenCalledWith("r1", "Tidak disetujui");
  });

  it("surfaces a failing action's error", async () => {
    const user = userEvent.setup();
    const approveLeave = vi.fn().mockResolvedValue({ ok: false, error: "Server sibuk." });
    render(<ApprovalList requests={[req]} approveLeave={approveLeave} rejectLeave={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /setujui/i })[0]);
    expect(screen.getAllByText("Server sibuk.").length).toBeGreaterThan(0);
  });
});
```

Note: because both the desktop `<Table>` and the mobile `<Card>` list render in jsdom, each request's controls appear **twice**. The test uses `getAllBy*[0]` and `.length` assertions. `catatanByRequest[id]` state is held on the parent `<ApprovalList>` (one entry per request id), and `renderActions(id)` inlines the same JSX in both places — typing in the first instance and clicking the first button is consistent because they read/write the same parent state.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- approval-list
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```tsx
// src/app/(admin)/persetujuan-cuti/approval-list.tsx
"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PendingLeaveRequest = {
  id: string;
  employeeName: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasan: string | null;
};

type ActionResult = { ok: true } | { ok: false; error: string };

const JENIS_LABELS: Record<string, string> = {
  tahunan: "Cuti Tahunan", sakit: "Sakit", melahirkan: "Melahirkan", keguguran: "Keguguran",
  menikah: "Menikah", menikahkan_anak: "Menikahkan Anak", khitan_baptis_anak: "Khitan/Baptis Anak",
  istri_melahirkan_keguguran: "Istri Melahirkan/Keguguran",
  kematian_keluarga_inti: "Kematian Keluarga Inti",
  kematian_keluarga_serumah: "Kematian Keluarga Serumah", lainnya: "Lainnya",
};

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function ApprovalList({
  requests,
  approveLeave,
  rejectLeave,
}: {
  requests: PendingLeaveRequest[];
  approveLeave: (requestId: string, catatan: string | null) => Promise<ActionResult>;
  rejectLeave: (requestId: string, catatan: string) => Promise<ActionResult>;
}) {
  const [catatanByRequest, setCatatanByRequest] = useState<Record<string, string>>({});
  const [errorByRequest, setErrorByRequest] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        message="Tidak ada pengajuan cuti yang menunggu persetujuan."
      />
    );
  }

  async function handleApprove(id: string) {
    setErrorByRequest((p) => ({ ...p, [id]: "" }));
    setPendingId(id);
    try {
      const r = await approveLeave(id, catatanByRequest[id]?.trim() || null);
      if (!r.ok) setErrorByRequest((p) => ({ ...p, [id]: r.error }));
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(id: string) {
    const catatan = (catatanByRequest[id] || "").trim();
    if (!catatan) {
      setErrorByRequest((p) => ({ ...p, [id]: "Catatan wajib diisi untuk menolak." }));
      return;
    }
    setErrorByRequest((p) => ({ ...p, [id]: "" }));
    setPendingId(id);
    try {
      const r = await rejectLeave(id, catatan);
      if (!r.ok) setErrorByRequest((p) => ({ ...p, [id]: r.error }));
    } finally {
      setPendingId(null);
    }
  }

  // Plain render function, NOT a nested component — calling `<Actions/>` as a
  // component would remount the <Input> on every parent render and drop focus
  // mid-typing. `renderActions(id)` just inlines the JSX.
  const renderActions = (id: string) => {
    const busy = pendingId === id;
    return (
      <div className="flex flex-col gap-2">
        <Input
          aria-label="Catatan penolakan"
          placeholder="Wajib diisi untuk menolak"
          className="h-9 min-w-[180px]"
          value={catatanByRequest[id] ?? ""}
          onChange={(e) => setCatatanByRequest((p) => ({ ...p, [id]: e.target.value }))}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => handleApprove(id)}>
            Setujui
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => handleReject(id)}
          >
            Tolak
          </Button>
        </div>
        {errorByRequest[id] && (
          <p className="text-xs text-destructive">{errorByRequest[id]}</p>
        )}
      </div>
    );
  };

  return (
    <>
      {/* desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => (
              <TableRow key={req.id} className="align-top">
                <TableCell className="font-medium text-foreground">{req.employeeName}</TableCell>
                <TableCell>{JENIS_LABELS[req.jenis] ?? req.jenis}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(req.tanggalMulai)} – {formatDate(req.tanggalSelesai)}
                </TableCell>
                <TableCell>{req.alasan ?? "-"}</TableCell>
                <TableCell>{renderActions(req.id)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* mobile */}
      <div className="flex flex-col gap-3 md:hidden">
        {requests.map((req) => (
          <Card key={req.id} size="sm">
            <CardHeader>
              <CardTitle>{req.employeeName}</CardTitle>
              <Badge variant="neutral" className="w-fit">
                {JENIS_LABELS[req.jenis] ?? req.jenis}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {formatDate(req.tanggalMulai)} – {formatDate(req.tanggalSelesai)}
              </p>
              <p>{req.alasan ?? "-"}</p>
              {renderActions(req.id)}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Rewrite `persetujuan-cuti/page.tsx`**

Keep the guard + query + role scoping + the `rows` mapping unchanged. Replace both JSX branches:

```tsx
  if (error) {
    console.error("Failed to load pending leave requests:", error);
    return (
      <div className="space-y-4">
        <PageHeader
          title="Persetujuan Cuti"
          description="Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan."
        />
        <Alert variant="destructive">
          <AlertDescription>
            Gagal memuat daftar pengajuan cuti. Silakan muat ulang halaman.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ... rows mapping unchanged ...

  return (
    <div className="space-y-4">
      <PageHeader
        title="Persetujuan Cuti"
        description="Tinjau dan proses pengajuan cuti karyawan yang menunggu persetujuan."
      />
      <ApprovalList requests={requests} approveLeave={approveLeave} rejectLeave={rejectLeave} />
    </div>
  );
```

Update the import: `ApprovalList, type PendingLeaveRequest` from `./approval-list`. Add `PageHeader`, `Alert, AlertDescription`.

- [ ] **Step 5: Delete the old files**

```bash
git rm "src/app/(admin)/persetujuan-cuti/approval-table.tsx" "src/app/(admin)/persetujuan-cuti/approval-table.test.tsx"
```

- [ ] **Step 6: Run + typecheck + build**

```bash
npm test -- approval-list persetujuan && ./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: `approval-list` 5 tests pass; full suite green; build compiles.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(persetujuan-cuti): ApprovalList — desktop table + mobile cards, shadcn"
```

---

## Task 16: `laporan-filters.tsx` reskin

**Files:**
- Modify: `src/app/(admin)/laporan/laporan-filters.tsx`, `src/app/(admin)/laporan/laporan-filters.test.tsx`

**Interfaces:**
- Consumes: `FilterBar` (T1), `NativeSelect` (T1), `Input`, `Label`, `Button`.
- Produces: same `<LaporanFilters branches departments defaults>` signature + `/laporan?...` push.

- [ ] **Step 1: Reskin** (mirror Task 9 — wrap in `<FilterBar>`, `NativeSelect` for Cabang/Departemen, `<Input type="date">` for Dari/Sampai, `<Button type="submit">Terapkan`). The `pushWith` / `deptOptions` filter logic and all `name`/`id`/label text are unchanged.

```tsx
// src/app/(admin)/laporan/laporan-filters.tsx
"use client";

import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/filter-bar";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Defaults = { cabang: string; dept: string; dari: string; sampai: string };

export function LaporanFilters({
  branches,
  departments,
  defaults,
}: {
  branches: { id: string; nama: string }[];
  departments: { id: string; nama: string; branchId: string }[];
  defaults: Defaults;
}) {
  const router = useRouter();

  function pushWith(over: Partial<Defaults>) {
    const next = { ...defaults, ...over };
    const params = new URLSearchParams();
    params.set("cabang", next.cabang);
    if (next.dept) params.set("dept", next.dept);
    params.set("dari", next.dari);
    params.set("sampai", next.sampai);
    router.push(`/laporan?${params.toString()}`);
  }

  const deptOptions = departments.filter((d) => d.branchId === defaults.cabang);

  return (
    <FilterBar>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          pushWith({});
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cabang">Cabang</Label>
          <NativeSelect
            id="cabang"
            defaultValue={defaults.cabang}
            onChange={(e) => pushWith({ cabang: e.target.value, dept: "" })}
            className="h-9 w-44"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nama}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dept">Departemen</Label>
          <NativeSelect
            id="dept"
            defaultValue={defaults.dept}
            onChange={(e) => pushWith({ dept: e.target.value })}
            className="h-9 w-44"
          >
            <option value="">Semua departemen</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.nama}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dari">Dari</Label>
          <Input id="dari" type="date" defaultValue={defaults.dari}
            onChange={(e) => pushWith({ dari: e.target.value })} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sampai">Sampai</Label>
          <Input id="sampai" type="date" defaultValue={defaults.sampai}
            onChange={(e) => pushWith({ sampai: e.target.value })} className="h-9 w-40" />
        </div>
        <Button type="submit" size="sm">Terapkan</Button>
      </form>
    </FilterBar>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- laporan-filters && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (label text + `fireEvent.change` unchanged).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/laporan/laporan-filters.tsx" "src/app/(admin)/laporan/laporan-filters.test.tsx"
git commit -m "feat(laporan): reskin LaporanFilters to shadcn + FilterBar"
```

---

## Task 17: `laporan/page.tsx` → ResponsiveTable + totals

**Files:**
- Modify: `src/app/(admin)/laporan/page.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `ResponsiveTable` (T3), `EmptyState`, `Alert`, `Button`, `LaporanFilters` (T16), `TableCell` (for the footer slot).

- [ ] **Step 1: Rewrite the returned JSX only**

**Do not touch** the param validation / `branchIds` allowlist / `defaultCabang` / `dept` / `range` / `queryString` / `loadRecap` block — copy it verbatim.

```tsx
  const totals = recap.ok
    ? recap.rows.reduce(
        (acc, r) => ({
          hadir: acc.hadir + r.hadir,
          terlambat: acc.terlambat + r.terlambat,
          pulangCepat: acc.pulangCepat + r.pulangCepat,
          diLuarLokasi: acc.diLuarLokasi + r.diLuarLokasi,
          alpa: acc.alpa + r.alpa,
          cuti: acc.cuti + r.cuti,
          menit: acc.menit + r.totalMenitTerlambat,
        }),
        { hadir: 0, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0, alpa: 0, cuti: 0, menit: 0 },
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Kehadiran"
        description="Rekap per karyawan untuk rentang tanggal terpilih."
        actions={
          recap.ok ? (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={`/laporan/csv?${queryString}`}><Download className="size-4" /> Unduh CSV</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/laporan/pdf?${queryString}`}><Download className="size-4" /> Unduh PDF</a>
              </Button>
            </>
          ) : undefined
        }
      />

      <LaporanFilters
        branches={branchList}
        departments={deptList}
        defaults={{ cabang: defaultCabang, dept, dari, sampai }}
      />

      {!recap.ok && (
        <Alert variant="destructive"><AlertDescription>{recap.error}</AlertDescription></Alert>
      )}

      {recap.ok && (
        <ResponsiveTable
          columns={[
            { key: "nama", header: "Nama", cell: (r) => r.nama },
            { key: "hadir", header: "Hadir", align: "right", cell: (r) => r.hadir, mobileLabel: "Hadir" },
            { key: "terlambat", header: "Terlambat", align: "right", cell: (r) => r.terlambat, mobileLabel: "Terlambat" },
            { key: "pc", header: "Pulang Cepat", align: "right", cell: (r) => r.pulangCepat, mobileLabel: "Pulang Cepat" },
            { key: "dll", header: "Di Luar Lokasi", align: "right", cell: (r) => r.diLuarLokasi, mobileLabel: "Di Luar Lokasi" },
            {
              key: "alpa", header: "Alpa", align: "right", mobileLabel: "Alpa",
              cell: (r) => <span className={r.alpa > 0 ? "text-destructive" : undefined}>{r.alpa}</span>,
            },
            { key: "cuti", header: "Cuti", align: "right", cell: (r) => r.cuti, mobileLabel: "Cuti" },
            { key: "menit", header: "Menit Terlambat", align: "right", cell: (r) => r.totalMenitTerlambat, mobileLabel: "Menit Terlambat" },
          ]}
          rows={recap.rows}
          rowKey={(r) => r.employeeId}
          emptyState={<EmptyState icon={FileBarChart} message="Tidak ada karyawan aktif untuk filter ini." />}
          footer={
            totals ? (
              <>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right tabular-nums">{totals.hadir}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.terlambat}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.pulangCepat}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.diLuarLokasi}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.alpa}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.cuti}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.menit}</TableCell>
              </>
            ) : undefined
          }
          footerMobile={
            totals ? (
              <Card size="sm">
                <CardHeader><CardTitle>Total</CardTitle></CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {[
                      ["Hadir", totals.hadir], ["Terlambat", totals.terlambat],
                      ["Pulang Cepat", totals.pulangCepat], ["Di Luar Lokasi", totals.diLuarLokasi],
                      ["Alpa", totals.alpa], ["Cuti", totals.cuti], ["Menit Terlambat", totals.menit],
                    ].map(([k, v]) => (
                      <div key={k as string} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : undefined
          }
        />
      )}
    </div>
  );
```

Confirm the recap row field names against `src/lib/laporan/load-recap.ts` (the existing page uses `r.hadir`, `r.terlambat`, `r.pulangCepat`, `r.diLuarLokasi`, `r.alpa`, `r.cuti`, `r.totalMenitTerlambat`, `r.nama`, `r.employeeId` — match whatever `loadRecap` actually returns).

Imports: `PageHeader`, `ResponsiveTable`, `EmptyState` from `@/components/*`; `Alert, AlertDescription` from `@/components/ui/alert`; `Button` from `@/components/ui/button`; `Card, CardContent, CardHeader, CardTitle` from `@/components/ui/card`; `TableCell` from `@/components/ui/table`; `Download, FileBarChart` from `lucide-react`. Remove unused.

- [ ] **Step 2: Typecheck + build + test**

```bash
./node_modules/.bin/tsc --noEmit && npm test && npm run build
```

Expected: all green; `/laporan` compiles.

- [ ] **Step 3: Dev-server smoke**

`/laporan`: filters push URL, table renders with a Total footer row on desktop and a Total card on mobile, alpa cells tinted, CSV/PDF buttons hit the routes, invalid range → Alert, empty → EmptyState.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/laporan/page.tsx"
git commit -m "feat(laporan): ResponsiveTable + totals footer + shadcn download buttons"
```

---

## Task 18: Role-aware `/profil` shell — move to `(account)`

**Files:**
- Move: `src/app/(employee)/profil/{page.tsx,actions.ts,actions.test.ts,profil-form.tsx,profil-form.test.tsx}` → `src/app/(account)/profil/`
- Create: `src/app/(account)/layout.tsx`, `src/app/(account)/layout.test.tsx`

**Interfaces:**
- Consumes: `getCurrentEmployee`, `signProfilePhotoUrl`, `AdminShell`, `EmployeeShell`, `BrandMark`, `AppFooter`.

- [ ] **Step 1: Move the directory**

```bash
mkdir -p "src/app/(account)"
git mv "src/app/(employee)/profil" "src/app/(account)/profil"
```

- [ ] **Step 2: Fix relative imports in the moved files**

`grep -rn "from \"\\.\\./\\|from '\\.\\./" "src/app/(account)/profil/"` — the depth from `(account)/profil/` to `src/` is the same as from `(employee)/profil/` (both are two levels under `src/app/`), so `@/`-absolute imports are unaffected and `../`-relative imports resolve to `src/app/(account)/` now. The profil files use `@/`-absolute imports throughout (verified in SP3) plus `./actions` / `./profil-form` (sibling — fine). Confirm with the grep; fix any `../`-relative import that pointed at an `(employee)`-group file (there should be none).

- [ ] **Step 3: Write the failing layout test**

```tsx
// src/app/(account)/layout.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getCurrentEmployee = vi.fn();
const redirect = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: () => getCurrentEmployee() }));
vi.mock("@/lib/profile/photo", () => ({ signProfilePhotoUrl: async () => null }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import AccountLayout from "./layout";

describe("(account) layout", () => {
  it("renders the AdminShell for an hr_admin", async () => {
    getCurrentEmployee.mockResolvedValue({ id: "u1", nama: "Budi", email: "b@x.id", role: "hr_admin", branchId: "b1", fotoPath: null });
    render(await AccountLayout({ children: <p>profil</p> }));
    // AdminShell renders the admin primary nav (Dashboard link)
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByText("profil")).toBeInTheDocument();
  });

  it("renders the EmployeeShell for a karyawan", async () => {
    getCurrentEmployee.mockResolvedValue({ id: "u2", nama: "Ana", email: "a@x.id", role: "karyawan", branchId: "b1", fotoPath: null });
    render(await AccountLayout({ children: <p>profil</p> }));
    expect(screen.getByRole("link", { name: "Absen" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });

  it("redirects to /login when there is no session", async () => {
    getCurrentEmployee.mockResolvedValue(null);
    await AccountLayout({ children: <p>x</p> });
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
```

- [ ] **Step 4: Run to verify it fails**

```bash
npm test -- "(account)/layout"
```

Expected: FAIL — `./layout` missing.

- [ ] **Step 5: Write the layout**

```tsx
// src/app/(account)/layout.tsx
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { EmployeeShell } from "@/components/employee-shell";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentEmployee } from "@/lib/auth/session";
import { signProfilePhotoUrl } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  const isAdmin =
    employee.role === "hr_admin" ||
    employee.role === "super_admin" ||
    employee.role === "atasan";

  if (isAdmin) {
    const avatarUrl = await signProfilePhotoUrl(db, employee.fotoPath);
    return (
      <AdminShell
        employee={employee}
        avatarUrl={avatarUrl ?? undefined}
        brand={<BrandMark size="md" />}
        footer={<AppFooter />}
      >
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

- [ ] **Step 6: Run to verify it passes**

```bash
npm test -- "(account)/layout" && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (3 cases). If `AdminShell` needs `usePathname` mocked (it's a client component using `next/navigation`), add `vi.mock("next/navigation", ...)` with both `redirect` and `usePathname: () => "/profil"`.

- [ ] **Step 7: Full suite + build + smoke**

```bash
npm test && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: the moved `profil-form.test` / `actions.test` run green from the new path; build still 26 routes, `/profil` present. Dev-server: `/profil` as `hr_admin` → AdminShell (sidebar, Dashboard reachable); as `karyawan` → EmployeeShell (bottom nav). The EmployeeShell's "Profil" nav item + the AdminShell UserMenu "Profil" item both still resolve.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(profil): role-aware shell — move to (account) route group"
```

---

## Post-plan verification

```bash
npm test                       # green (net: −SummaryCard tests, +StatCard/ResponsiveTable/FilterBar/StatusPill/KaryawanTabs/lib/account-layout tests)
./node_modules/.bin/tsc --noEmit
npm run build                  # 26 routes; /dashboard /karyawan /karyawan/[id] /karyawan/baru /persetujuan-cuti /laporan /profil all present
grep -rn "text-neutral-\|bg-white\|bg-blue-\|text-blue-\|border-neutral-\|divide-neutral-\|text-red-600\|text-green-6" src/app/\(admin\)/dashboard src/app/\(admin\)/karyawan src/app/\(admin\)/persetujuan-cuti src/app/\(admin\)/laporan src/app/\(account\)
#   ^ expect NO matches in the SP4a-touched files (legacy classes remain only in payroll/ + pengaturan/ — SP4b)
```

Dev-server smoke (light theme), all six pages + `/profil` in both shells, per Task 8/10/13/15/17 notes.

Then the final whole-branch review, then `finishing-a-development-branch`.

## SP4b / SP5 hand-off

- **SP4b** (payroll + pengaturan): reuse `StatCard` / `ResponsiveTable` / `FilterBar` / `StatusPill` / `NativeSelect`; `/pengaturan` hub cards → `<Link>`-wrapped `<Card>`; audit page → the Riwayat-tab `ResponsiveTable` pattern; payroll status → `PayrollStatusBadge` (exists).
- **SP5** final "dark-mode debt": invert `--color-neutral-*` under `.dark` + `bg-white` → `bg-card` sweep over the remaining legacy bodies, then `theme-provider` → `system` + re-mount `<ThemeToggle>`; add the `text-neutral-[789]00` / `bg-white` lint guard for `src/app`; give `AttendanceTrendChart` dark grid/axis colors; delete the legacy `--color-neutral-*` / `--radius-card` / `--shadow-card` block once its last consumer is gone.
- The `StatCard` warning tone uses raw `text-amber-600 dark:text-amber-500` (no `--warning` token) — SP5 may formalize a token.
