# Branch Management (`/pengaturan/cabang`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An admin page to create, rename/re-address, and delete `branches` rows, so a second office can be added without touching the database.

**Architecture:** Mirrors `src/app/(admin)/pengaturan/departemen/` (add-form + `ResponsiveTable` list + `ConfirmDeleteButton`, count-guarded delete), adding an edit `Dialog`. Server actions write audit rows via the service-role client (as SP1's `saveBranchLocation` does). Office point/radius stays on `/pengaturan/lokasi`; a new branch starts with `lat=0,long=0` ("belum diatur").

**Tech Stack:** Next 16.3.2 App Router + Server Actions, React 19.2, Supabase (`@supabase/ssr` + service-role client), Tailwind v4 + shadcn, `sonner`, `lucide-react`, `vitest` + RTL.

## Global Constraints

- No schema migration — `branches` columns + `branches_write` RLS (`is_admin_role()`) already exist.
- All user-facing strings Indonesian. Never surface raw Postgres text — log it, return an Indonesian message.
- Icons: `lucide-react` only, never emoji.
- Access: `hr_admin` OR `super_admin` (page redirect + every action).
- New branch defaults: `lat: 0, long: 0, radius_geofencing_meter: 100`.
- `validateBranchInput`: `nama` required, trimmed, 1–100 chars; `alamat` trimmed, optional, ≤ 200 chars, `"" → null`.
- Delete guard: reject if any `employees` / `departments` / `payroll_periods` row references the branch (those FKs are `ON DELETE RESTRICT`); `work_schedules` + `holidays` cascade.
- Audit `aksi` values, exact: `"branch_created"`, `"branch_updated"`, `"branch_deleted"`. Audit-insert failure is logged, never fails the action.
- Test runner: `npx vitest run <path>` for one file; `npm test` (= `vitest run src/`) for the suite — **never** bare `npx vitest run` beyond that (it is scoped to `src/` now, but keep the habit). `npx tsc --noEmit` + `npx eslint` must be clean.
- TDD: failing test first. Commit after each task; end every commit message with exactly:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- After the UI task, run `node .agents/skills/impeccable/scripts/detect.mjs --json <changed UI files>` once.

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/branches/validate-branch.ts` | Pure validator for `{nama, alamat}` |
| `src/lib/branches/validate-branch.test.ts` | Unit tests |
| `src/app/(admin)/pengaturan/cabang/actions.ts` | `createBranch` / `updateBranch` / `deleteBranch` + audit |
| `src/app/(admin)/pengaturan/cabang/actions.test.ts` | Action tests (mocked Supabase) |
| `src/app/(admin)/pengaturan/cabang/page.tsx` | Server component: guard, list branches + dep counts |
| `src/app/(admin)/pengaturan/cabang/branch-manager.tsx` | Client: add form + table + edit dialog + delete |
| `src/app/(admin)/pengaturan/cabang/branch-manager.test.tsx` | Component tests |

**Modified:**

| File | Change |
|---|---|
| `src/components/audit-aksi-badge.tsx` | Add `branch_created` / `branch_updated` / `branch_deleted` |
| `src/app/(admin)/pengaturan/page.tsx` | Add "Cabang" `HubCard` before "Lokasi Kantor" |
| `src/app/(admin)/pengaturan/lokasi/page.tsx` | Empty-state copy points to the Cabang menu |

---

## Task 1: `validateBranchInput`

**Files:**
- Create: `src/lib/branches/validate-branch.ts`
- Test: `src/lib/branches/validate-branch.test.ts`

**Interfaces — Produces:**
```ts
export type BranchInput = { nama: FormDataEntryValue | null; alamat: FormDataEntryValue | null };
export type BranchValue = { nama: string; alamat: string | null };
export type BranchResult = { ok: true; value: BranchValue } | { ok: false; error: string };
export function validateBranchInput(input: BranchInput): BranchResult;
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/branches/validate-branch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateBranchInput } from "./validate-branch";

describe("validateBranchInput", () => {
  it("accepts a name and address, trimming both", () => {
    expect(validateBranchInput({ nama: "  Kantor Surabaya  ", alamat: "  Jl. Basuki  " })).toEqual({
      ok: true,
      value: { nama: "Kantor Surabaya", alamat: "Jl. Basuki" },
    });
  });

  it("accepts a name with no address (empty -> null)", () => {
    expect(validateBranchInput({ nama: "Kantor Pusat", alamat: "" })).toEqual({
      ok: true,
      value: { nama: "Kantor Pusat", alamat: null },
    });
    expect(validateBranchInput({ nama: "Kantor Pusat", alamat: null })).toEqual({
      ok: true,
      value: { nama: "Kantor Pusat", alamat: null },
    });
  });

  it("rejects a blank name", () => {
    expect(validateBranchInput({ nama: "   ", alamat: null })).toEqual({
      ok: false,
      error: "Nama cabang wajib diisi.",
    });
    expect(validateBranchInput({ nama: null, alamat: null }).ok).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(validateBranchInput({ nama: "x".repeat(101), alamat: null })).toEqual({
      ok: false,
      error: "Nama cabang maksimal 100 karakter.",
    });
  });

  it("rejects an address over 200 chars", () => {
    expect(validateBranchInput({ nama: "OK", alamat: "y".repeat(201) })).toEqual({
      ok: false,
      error: "Alamat maksimal 200 karakter.",
    });
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/lib/branches/validate-branch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/branches/validate-branch.ts`:

```ts
export type BranchInput = {
  nama: FormDataEntryValue | null;
  alamat: FormDataEntryValue | null;
};

export type BranchValue = { nama: string; alamat: string | null };

export type BranchResult =
  | { ok: true; value: BranchValue }
  | { ok: false; error: string };

export function validateBranchInput(input: BranchInput): BranchResult {
  const nama = String(input.nama ?? "").trim();
  const alamat = String(input.alamat ?? "").trim();

  if (!nama) return { ok: false, error: "Nama cabang wajib diisi." };
  if (nama.length > 100) return { ok: false, error: "Nama cabang maksimal 100 karakter." };
  if (alamat.length > 200) return { ok: false, error: "Alamat maksimal 200 karakter." };

  return { ok: true, value: { nama, alamat: alamat || null } };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/branches/validate-branch.test.ts` → PASS. Then `npm test` → no new failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branches/validate-branch.ts src/lib/branches/validate-branch.test.ts
git commit -m "feat: add branch nama/alamat validator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `createBranch` / `updateBranch` / `deleteBranch` actions

**Files:**
- Create: `src/app/(admin)/pengaturan/cabang/actions.ts`
- Test: `src/app/(admin)/pengaturan/cabang/actions.test.ts`

**Interfaces:**
- Consumes: `validateBranchInput` (Task 1); `createServerSupabaseClient` + `createServiceRoleSupabaseClient` (`@/lib/supabase/server`); `getCurrentEmployee` (`@/lib/auth/session`).
- Produces:
  ```ts
  export function createBranch(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  export function updateBranch(branchId: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>;
  export function deleteBranch(branchId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  ```
  FormData keys: `nama`, `alamat`.

**Read first:** `src/app/(admin)/pengaturan/departemen/actions.ts` (the `assertHrAdmin` helper + count-guard + `.select("id")` delete pattern) and `src/app/(admin)/pengaturan/lokasi/actions.ts` (the service-role audit insert). Match both.

- [ ] **Step 1: Write the failing tests**

Create `src/app/(admin)/pengaturan/cabang/actions.test.ts`. Mirror the mocking style of `src/app/(admin)/pengaturan/lokasi/actions.test.ts` (mock `@/lib/supabase/server`, `@/lib/auth/session`, `next/cache`). Concrete cases:

```
createBranch:
  - non-admin -> { ok: false, error: "Tidak diizinkan." }, no insert
  - blank nama -> { ok: false, error: "Nama cabang wajib diisi." }
  - valid -> branches.insert called with objectContaining({ nama, alamat, lat: 0, long: 0, radius_geofencing_meter: 100 });
             audit_logs.insert called with objectContaining({ aksi: "branch_created" }); returns { ok: true, id }
  - audit insert error -> still { ok: true, id }

updateBranch:
  - blank branchId -> { ok: false, error: "Cabang tidak valid." }
  - blank nama -> validator error
  - valid -> branches.update called with { nama, alamat } on .eq("id", branchId);
             audit_logs.insert aksi "branch_updated" with detail.before / detail.after

deleteBranch:
  - employees count > 0 -> { ok: false } and message contains "karyawan"; no branches.delete
  - departments count > 0 -> message contains "departemen"
  - payroll_periods count > 0 -> message contains "payroll"
  - all zero -> branches.delete.eq("id", branchId).select("id") called; audit "branch_deleted"; { ok: true }
  - delete returns empty rows -> { ok: false, error: "Gagal menghapus cabang atau Anda tidak berhak." }
```

Write real `it(...)` blocks with `expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({...}))` assertions.

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run "src/app/(admin)/pengaturan/cabang/actions.test.ts"` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/app/(admin)/pengaturan/cabang/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { validateBranchInput } from "@/lib/branches/validate-branch";

type Result = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

async function assertHrAdmin() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || (me.role !== "hr_admin" && me.role !== "super_admin")) {
    return { db, me: null, denied: { ok: false as const, error: "Tidak diizinkan." } };
  }
  return { db, me, denied: null };
}

function revalidateBranchPages() {
  for (const p of [
    "/pengaturan/cabang",
    "/pengaturan/lokasi",
    "/pengaturan/jadwal",
    "/pengaturan/departemen",
  ]) {
    revalidatePath(p);
  }
}

async function writeAudit(actorId: string, aksi: string, detail: Record<string, unknown>) {
  const service = createServiceRoleSupabaseClient();
  const { error } = await service
    .from("audit_logs")
    .insert({ actor_id: actorId, target_employee_id: null, aksi, detail });
  if (error) console.error(`writeAudit(${aksi}) failed`, error);
}

export async function createBranch(formData: FormData): Promise<CreateResult> {
  const { db, me, denied } = await assertHrAdmin();
  if (denied) return denied;

  const parsed = validateBranchInput({ nama: formData.get("nama"), alamat: formData.get("alamat") });
  if (!parsed.ok) return parsed;

  const { data, error } = await db
    .from("branches")
    .insert({
      nama: parsed.value.nama,
      alamat: parsed.value.alamat,
      lat: 0,
      long: 0,
      radius_geofencing_meter: 100,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createBranch: insert failed", error);
    return { ok: false, error: "Gagal menambah cabang." };
  }

  await writeAudit(me.id, "branch_created", {
    branch_id: data.id,
    nama: parsed.value.nama,
    alamat: parsed.value.alamat,
  });
  revalidateBranchPages();
  return { ok: true, id: data.id };
}

export async function updateBranch(branchId: string, formData: FormData): Promise<Result> {
  const { db, me, denied } = await assertHrAdmin();
  if (denied) return denied;
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const parsed = validateBranchInput({ nama: formData.get("nama"), alamat: formData.get("alamat") });
  if (!parsed.ok) return parsed;

  const { data: before } = await db
    .from("branches")
    .select("nama, alamat")
    .eq("id", branchId)
    .single();

  const after = { nama: parsed.value.nama, alamat: parsed.value.alamat };
  const { error } = await db.from("branches").update(after).eq("id", branchId);
  if (error) {
    console.error("updateBranch: update failed", error);
    return { ok: false, error: "Gagal menyimpan perubahan cabang." };
  }

  await writeAudit(me.id, "branch_updated", { branch_id: branchId, before: before ?? null, after });
  revalidateBranchPages();
  return { ok: true };
}

export async function deleteBranch(branchId: string): Promise<Result> {
  const { db, me, denied } = await assertHrAdmin();
  if (denied) return denied;
  if (!branchId) return { ok: false, error: "Cabang tidak valid." };

  const [emp, dept, pay] = await Promise.all([
    db.from("employees").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    db.from("departments").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    db.from("payroll_periods").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
  ]);
  if (emp.error || dept.error || pay.error) {
    console.error("deleteBranch: dependency count failed", emp.error ?? dept.error ?? pay.error);
    return { ok: false, error: "Gagal memeriksa keterkaitan cabang." };
  }
  const blockers: string[] = [];
  if ((emp.count ?? 0) > 0) blockers.push(`${emp.count} karyawan`);
  if ((dept.count ?? 0) > 0) blockers.push(`${dept.count} departemen`);
  if ((pay.count ?? 0) > 0) blockers.push(`${pay.count} periode payroll`);
  if (blockers.length > 0) {
    return {
      ok: false,
      error: `Cabang masih dipakai: ${blockers.join(", ")}. Pindahkan atau hapus dulu.`,
    };
  }

  const { data: branchRow } = await db.from("branches").select("nama").eq("id", branchId).single();

  const { data, error } = await db.from("branches").delete().eq("id", branchId).select("id");
  if (error) {
    console.error("deleteBranch: delete failed", error);
    return { ok: false, error: "Gagal menghapus cabang." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menghapus cabang atau Anda tidak berhak." };
  }

  await writeAudit(me.id, "branch_deleted", { branch_id: branchId, nama: branchRow?.nama ?? null });
  revalidateBranchPages();
  return { ok: true };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run "src/app/(admin)/pengaturan/cabang/actions.test.ts"` → PASS. `npx tsc --noEmit` → clean. `npm test` → no new failures.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/cabang/actions.ts" "src/app/(admin)/pengaturan/cabang/actions.test.ts"
git commit -m "feat: add branch create/update/delete server actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Audit badge labels

**Files:**
- Modify: `src/components/audit-aksi-badge.tsx`

- [ ] **Step 1: Check the test**

Read `src/components/audit-aksi-badge.test.tsx`. If it asserts a label per `CONFIG` key, note the pattern; otherwise no test change needed.

- [ ] **Step 2: Add the entries**

In `src/components/audit-aksi-badge.tsx`, in `CONFIG` (after `branch_location_update`):

```ts
  branch_created: { label: "Cabang Dibuat", variant: "success" },
  branch_updated: { label: "Cabang Diubah", variant: "info" },
  branch_deleted: { label: "Cabang Dihapus", variant: "destructive" },
```

If the test iterates `CONFIG`, add the matching assertions.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/components/audit-aksi-badge.test.tsx` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/audit-aksi-badge.tsx src/components/audit-aksi-badge.test.tsx
git commit -m "feat: audit badge labels for branch create/update/delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `/pengaturan/cabang` page + `BranchManager`

**Files:**
- Create: `src/app/(admin)/pengaturan/cabang/page.tsx`
- Create: `src/app/(admin)/pengaturan/cabang/branch-manager.tsx`
- Test: `src/app/(admin)/pengaturan/cabang/branch-manager.test.tsx`

**Interfaces:**
- Consumes: `createBranch` / `updateBranch` / `deleteBranch` (Task 2); `ConfirmDeleteButton` (`@/components/confirm-delete-button`); `ResponsiveTable` (`@/components/responsive-table`); `EmptyState`; `PageHeader`; UI `card` / `dialog` / `button` / `input` / `alert`; `Field` (`@/components/field`); `toast` from `sonner`.
- Produces:
  ```ts
  export type BranchRow = {
    id: string; nama: string; alamat: string | null;
    lat: number; long: number; radius: number;
    employeeCount: number; departmentCount: number;
  };
  export function BranchManager(props: {
    branches: BranchRow[];
    createBranch: (fd: FormData) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
    updateBranch: (id: string, fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
    deleteBranch: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  }): JSX.Element;
  ```

**Read first:** `src/app/(admin)/pengaturan/departemen/page.tsx` + `department-form.tsx` (the exact add-form + `ResponsiveTable` + `ConfirmDeleteButton` + `remove.bind(null, id)` server-action-wrapper pattern). `BranchManager` follows it, plus an edit `Dialog`.

- [ ] **Step 1: `page.tsx`**

Create `src/app/(admin)/pengaturan/cabang/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { BranchManager, type BranchRow } from "./branch-manager";
import { createBranch, updateBranch, deleteBranch } from "./actions";

export default async function CabangPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter")
    .order("nama");
  if (error) console.error("cabang: branches query failed", error);

  const { data: emps } = await db.from("employees").select("branch_id");
  const { data: depts } = await db.from("departments").select("branch_id");
  const tally = (rows: { branch_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.branch_id, (m.get(r.branch_id) ?? 0) + 1);
    return m;
  };
  const empBy = tally(emps);
  const deptBy = tally(depts);

  const rows: BranchRow[] = (branches ?? []).map((b) => ({
    id: b.id,
    nama: b.nama,
    alamat: b.alamat,
    lat: b.lat,
    long: b.long,
    radius: b.radius_geofencing_meter,
    employeeCount: empBy.get(b.id) ?? 0,
    departmentCount: deptBy.get(b.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cabang"
        description="Kelola kantor cabang: nama dan alamat. Titik & radius diatur di menu Lokasi Kantor."
      />
      <BranchManager
        branches={rows}
        createBranch={createBranch}
        updateBranch={updateBranch}
        deleteBranch={deleteBranch}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the failing component test**

Create `src/app/(admin)/pengaturan/cabang/branch-manager.test.tsx`. Mock `sonner`. Cases:

```
- renders each branch's nama + alamat ("—" when null) and a geofence chip
  ("Belum diatur" when lat/long 0,0, "Aktif" otherwise)
- add form: typing a nama and submitting calls createBranch with FormData
  carrying nama/alamat; a failed create shows the error in an Alert
- edit: clicking Edit on a row opens a dialog prefilled with that branch's
  nama/alamat; submitting calls updateBranch(id, fd)
- delete: ConfirmDeleteButton wired to deleteBranch — a rejected delete
  ({ ok:false, error }) surfaces the message via toast.error (mock)
- empty branches -> EmptyState "Belum ada cabang."
```

- [ ] **Step 3: Run — verify fail**

Run: `npx vitest run "src/app/(admin)/pengaturan/cabang/branch-manager.test.tsx"` → FAIL (module not found).

- [ ] **Step 4: Implement `branch-manager.tsx`**

`"use client"`. Structure:
- `useState` for add-form `busy`/`error`, and for the edit dialog: `editing: BranchRow | null`, its `busy`/`error`.
- **Add form** in a `Card` (copy `department-form.tsx`'s `<form action={action}>` + `Field`/`Input`/`Button`/`Alert` shape): `nama` `Input`, `alamat` `Input`, "Tambah Cabang" `Button` (disabled while busy). On `r.ok`: `toast.success("Cabang ditambahkan.")`, reset the form (`event.currentTarget.reset()` or controlled state). On `!r.ok`: `setError(r.error)`.
- **List** via `ResponsiveTable`:
  - `nama` column → `d.nama`
  - `alamat` column → `d.alamat ?? "—"`
  - `geofence` column → a `<span>` chip: `d.lat === 0 && d.long === 0` ? amber "Belum diatur" : emerald "Aktif". Use the tint classes from `src/app/(admin)/pengaturan/lokasi/location-form.tsx` (`bg-amber-500/10 text-amber-700 dark:text-amber-300` / `bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`, plus `rounded-full px-2.5 py-0.5 text-xs font-medium`).
  - `aksi` column (align right): an **Edit** `Button` (`variant="ghost" size="sm"`, `Pencil` icon) that sets `editing = row`; then `<ConfirmDeleteButton action={remove.bind(null, row.id)} title="Hapus cabang?" description={\`Cabang "\${row.nama}" akan dihapus beserta jadwal kerja & hari libur khususnya. Karyawan/departemen yang masih terkait akan menolak penghapusan.\`} />`.
  - `emptyState`: `<EmptyState icon={Building} message="Belum ada cabang." />` (import `Building` from `lucide-react`).
- `remove` wrapper: a plain `async (id) => deleteBranch(id)` passed to `ConfirmDeleteButton` (which already toasts on `!ok` and closes on `ok`). Bind per row.
- **Edit `Dialog`** (`@/components/ui/dialog`): open when `editing != null`. Title "Ubah Cabang". A `<form action={editAction}>` with `Field`+`Input` for `nama` (`defaultValue={editing.nama}`) and `alamat` (`defaultValue={editing.alamat ?? ""}`), a "Simpan" `Button`, inline `Alert`. `editAction` calls `updateBranch(editing.id, fd)`; on `ok` → `toast.success("Perubahan disimpan.")`, `setEditing(null)`; on `!ok` → `setError`.
- Helper line under the table: `<p className="text-xs text-muted-foreground">Titik &amp; radius kantor diatur di menu Lokasi Kantor.</p>`
- Keep the file focused (~160 lines). Match `department-form.tsx` idioms for the action wrappers (try/catch → `"Terjadi kesalahan. Coba lagi."`, `finally` clears busy).

- [ ] **Step 5: Run — verify pass**

Run: `npx vitest run "src/app/(admin)/pengaturan/cabang/"` → PASS. `npx tsc --noEmit` + `npx eslint "src/app/(admin)/pengaturan/cabang"` → clean. `npm test` → no new failures.

- [ ] **Step 6: Impeccable detector**

Run: `node .agents/skills/impeccable/scripts/detect.mjs --json "src/app/(admin)/pengaturan/cabang/branch-manager.tsx" "src/app/(admin)/pengaturan/cabang/page.tsx"`
Fix anything flagged, re-run once.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/pengaturan/cabang/"
git commit -m "feat: add /pengaturan/cabang branch management page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Hub card + Lokasi Kantor empty-state copy + smoke test

**Files:**
- Modify: `src/app/(admin)/pengaturan/page.tsx`
- Modify: `src/app/(admin)/pengaturan/lokasi/page.tsx`

- [ ] **Step 1: Hub card**

In `src/app/(admin)/pengaturan/page.tsx`: add `Building` to the `lucide-react` import, and add this `HubCard` inside the `hr_admin || super_admin` grid **immediately before** the "Lokasi Kantor" card:

```tsx
          <HubCard href="/pengaturan/cabang" icon={Building} title="Cabang"
            desc="Tambah, ubah nama/alamat, atau hapus kantor cabang." />
```

- [ ] **Step 2: Lokasi Kantor empty state**

In `src/app/(admin)/pengaturan/lokasi/page.tsx`, change the `EmptyState` `message` from `"Belum ada cabang."` to `"Belum ada cabang. Tambahkan lewat menu Cabang."`

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean. `npm test` → no new failures.

- [ ] **Step 4: Dev-server smoke**

`npm run dev` in the background; `curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/pengaturan/cabang` → expect `307` → `/login` (no 500). Kill the server. Report what you saw.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/pengaturan/page.tsx" "src/app/(admin)/pengaturan/lokasi/page.tsx"
git commit -m "feat: link Cabang from the settings hub + Lokasi Kantor empty state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1 — no migration, `is_admin_role()` RLS | (nothing to build) |
| 1 — `validateBranchInput` | Task 1 |
| 1 — `createBranch` / `updateBranch` / `deleteBranch` + service-role audit | Task 2 |
| 1 — delete guard on employees/departments/payroll | Task 2 |
| 1 — audit badge labels | Task 3 |
| 2 — `/pengaturan/cabang` page + dep counts | Task 4 (page.tsx) |
| 2 — add form / list / geofence chip / edit dialog / delete | Task 4 (branch-manager.tsx) |
| 2 — hub card before Lokasi Kantor | Task 5 |
| 2 — Lokasi Kantor empty-state copy | Task 5 |
| 3 — error/edge cases | Task 2 (actions) + Task 4 (inline Alerts) |
| 4 — all test groups | Tasks 1, 2, 4 (+ 3 if the badge test iterates) |
| 5 — rollout order | Task order matches |

No gaps.

**Placeholder scan:** Task 4 Step 4 (`branch-manager.tsx`) is a behavior contract, not verbatim JSX, because it is a stateful view built by composing existing primitives (`department-form.tsx` shape + a `Dialog` + `ConfirmDeleteButton`); every field, action wrapper, copy string, and conditional is enumerated and the sibling to copy is named. Pure functions (Task 1) and both actions (Task 2) carry full code.

**Type consistency:** `validateBranchInput` return shape identical in Tasks 1, 2. `BranchRow` (Task 4) — `radius` on the client type, DB column `radius_geofencing_meter` only inside `page.tsx` mapping and the action insert. Action signatures (`createBranch(fd)`, `updateBranch(id, fd)`, `deleteBranch(id)`) identical in Tasks 2, 4. Audit `aksi` strings identical in Tasks 2, 3.
