# Branch Management (`/pengaturan/cabang`) — Design

Date: 2026-09-08
Status: Approved for planning

## Problem

The app has no UI to create, rename, re-address, or delete a `branches` row.
Branches were only ever made by `scripts/seed.ts` or direct DB access, so an
admin who wants a second office ("Kantor Cabang Surabaya") is stuck. Every
existing settings page (Jadwal, Lokasi Kantor, Departemen) only *lists* branches
and configures per-branch settings.

## Scope

A new admin page `/pengaturan/cabang` for branch identity CRUD:
- list all branches (nama, alamat, geofence-configured indicator)
- **add** a branch (nama + alamat)
- **edit** a branch's nama + alamat
- **delete** a branch, guarded against orphaning dependent data

The office **point + radius** stays on the existing `/pengaturan/lokasi` page
(unchanged) — this page is deliberately identity-only. A newly created branch
starts with an unset geofence (`lat=0, long=0`), and the page links to Lokasi
Kantor to finish setup.

Out of scope: bulk import, branch archival/soft-delete, moving employees between
branches (that already lives in the employee edit form), any schema migration.

## Design authority

Mirrors `src/app/(admin)/pengaturan/departemen/` almost exactly (add-form + list
+ `ConfirmDeleteButton` + count-guarded delete), plus an **edit** affordance
departemen lacks. Same monochrome shadcn system, Indonesian copy, `lucide-react`
icons.

## 1. Data model & backend

### Schema — no migration

`branches` already has `id, nama, alamat, lat double precision NOT NULL,
long double precision NOT NULL, radius_geofencing_meter integer NOT NULL
DEFAULT 100, created_at`. RLS `branches_write` is `is_admin_role()`
(= `hr_admin` | `super_admin`), so INSERT/UPDATE/DELETE already work for admins
at the DB layer.

### `validateBranchInput` — `src/lib/branches/validate-branch.ts`

Pure, unit-tested:

```ts
export type BranchInput = { nama: FormDataEntryValue | null; alamat: FormDataEntryValue | null };
export type BranchValue = { nama: string; alamat: string | null };
export type BranchResult = { ok: true; value: BranchValue } | { ok: false; error: string };
export function validateBranchInput(input: BranchInput): BranchResult;
```

Rules: `nama` = `String(...).trim()`, required, 1–100 chars →
`"Nama cabang wajib diisi."` / `"Nama cabang maksimal 100 karakter."`;
`alamat` = `String(...).trim()`, optional, ≤ 200 chars → `""` becomes `null`,
over-length → `"Alamat maksimal 200 karakter."`.

### Actions — `src/app/(admin)/pengaturan/cabang/actions.ts`

`"use server"`. Shared `assertHrAdmin()` guard identical to
`departemen/actions.ts`. Audit rows written via the **service-role** client
(RLS blocks client inserts to `audit_logs`) — same approach as SP1's
`saveBranchLocation`. Audit-insert failure is logged, never fatal.

- `createBranch(formData)` → `{ ok: true; id: string } | { ok: false; error }`
  - guard → `validateBranchInput` → `db.from("branches").insert({ nama, alamat, lat: 0, long: 0, radius_geofencing_meter: 100 }).select("id").single()`
  - audit `aksi: "branch_created"`, `detail: { branch_id, nama, alamat }`
  - `revalidatePath("/pengaturan/cabang")`, `revalidatePath("/pengaturan/lokasi")`
- `updateBranch(branchId, formData)` → `{ ok: true } | { ok: false; error }`
  - guard → reject empty `branchId` → `validateBranchInput`
  - read current `{ nama, alamat }` for the audit "before"
  - `db.from("branches").update({ nama, alamat }).eq("id", branchId)`
  - audit `aksi: "branch_updated"`, `detail: { branch_id, before, after }`
  - `revalidatePath("/pengaturan/cabang")`, `revalidatePath("/pengaturan/lokasi")`, `revalidatePath("/pengaturan/jadwal")`, `revalidatePath("/pengaturan/departemen")`
- `deleteBranch(branchId)` → `{ ok: true } | { ok: false; error }`
  - guard → reject empty `branchId`
  - count blockers, in parallel: `employees`, `departments`, `payroll_periods` with `branch_id = branchId` (these FKs are `ON DELETE RESTRICT`)
  - any blocker > 0 → `{ ok: false, error: "Cabang masih dipakai: <n> karyawan, <n> departemen, <n> periode payroll. Pindahkan atau hapus dulu." }` (only name the non-zero ones)
  - else `db.from("branches").delete().eq("id", branchId).select("id")` — `work_schedules` + `holidays` cascade automatically
  - empty result → `"Gagal menghapus cabang atau Anda tidak berhak."`
  - audit `aksi: "branch_deleted"`, `detail: { branch_id, nama }` (capture nama before delete)
  - `revalidatePath` the four settings pages above

### Audit badge — `src/components/audit-aksi-badge.tsx`

Add to `CONFIG`:
```ts
branch_created: { label: "Cabang Dibuat", variant: "success" },
branch_updated: { label: "Cabang Diubah", variant: "info" },
branch_deleted: { label: "Cabang Dihapus", variant: "destructive" },
```
(`branch_location_update` already exists from SP1.)

## 2. Frontend

### `src/app/(admin)/pengaturan/cabang/page.tsx` — server

- `getCurrentEmployee`; `redirect("/login")` if none; `redirect("/dashboard")` unless `hr_admin` | `super_admin` (match departemen).
- Load branches with dependent counts for the delete-guard hint:
  ```ts
  const { data: branches } = await db
    .from("branches")
    .select("id, nama, alamat, lat, long, radius_geofencing_meter")
    .order("nama");
  ```
  Plus per-branch employee + department counts (two grouped queries, or a small
  RPC-free approach: `select("branch_id")` on `employees` and `departments` and
  tally in JS).
- `PageHeader` title "Cabang", description "Kelola kantor cabang: nama, alamat, lalu atur titik & radius di menu Lokasi Kantor."
- Render `<BranchManager branches={...} createBranch={createBranch} updateBranch={updateBranch} deleteBranch={deleteBranch} />`.

### `src/app/(admin)/pengaturan/cabang/branch-manager.tsx` — client

- **Add form** (top, in a `Card` like departemen): `nama` `Input` + `alamat` `Input` + "Tambah Cabang" `Button`. On success: `toast.success`, reset fields. Inline `Alert` for the error.
- **List** via `ResponsiveTable`:
  - columns: Nama, Alamat (`—` when null), Geofence (`AttendanceStatusBadge`-style chip: "Aktif" emerald when `!(lat===0&&long===0)`, "Belum diatur" amber otherwise — reuse the tint classes from SP1's `location-form.tsx`), Aksi.
  - Aksi cell: an **Edit** button (opens a `Dialog` with `nama`/`alamat` prefilled → `updateBranch`) + `ConfirmDeleteButton` (`action={deleteBranch.bind(null, id)}`, title "Hapus cabang?", description names the branch and warns jadwal/hari-libur for it will also be removed).
  - `emptyState`: `EmptyState` icon `Building`, "Belum ada cabang."
- Edit `Dialog`: reuse `@/components/ui/dialog`, `Field`, `Input`, `Button`, `Alert`. Local `busy`/`error` state, closes on success with a `toast`.
- A short helper line under the table: "Titik & radius kantor diatur di menu Lokasi Kantor."

### `src/app/(admin)/pengaturan/page.tsx` — hub card

Add inside the `hr_admin || super_admin` grid, **before** the Lokasi Kantor card:
```tsx
<HubCard href="/pengaturan/cabang" icon={Building} title="Cabang"
  desc="Tambah, ubah nama/alamat, atau hapus kantor cabang." />
```
Import `Building` from `lucide-react`.

### `/pengaturan/lokasi` empty state

`src/app/(admin)/pengaturan/lokasi/page.tsx` — change the `EmptyState` message
from "Belum ada cabang." to "Belum ada cabang. Tambahkan lewat menu Cabang."

## 3. Error handling & edge cases

| Case | Behavior |
|---|---|
| non-admin | actions return `"Tidak diizinkan."`; page redirects |
| blank/oversize nama or alamat | validator message, inline `Alert` |
| delete branch with employees/departments/payroll | rejected, message lists the non-zero blockers |
| delete last remaining branch (no deps) | allowed — the app already handles zero branches on other pages with an `EmptyState`; the admin is on a branch so this can only happen after they move themselves |
| duplicate branch name | allowed (no unique constraint; departemen also allows dupes) |
| DB error | `console.error` + generic Indonesian message |
| audit insert fails | logged, action still succeeds |

## 4. Testing

- **Unit (vitest):** `validate-branch` — required nama, trim, 100/200 length caps, `alamat "" → null`.
- **Action (vitest, mocked Supabase, mirror `lokasi/actions.test.ts`):**
  - `createBranch`: rejects non-admin; rejects blank nama; inserts with `lat:0,long:0,radius:100`; writes `branch_created` audit; tolerates audit failure.
  - `updateBranch`: rejects blank branchId; updates `{nama,alamat}`; writes `branch_updated` audit with before/after.
  - `deleteBranch`: rejects when employee/department/payroll count > 0 (message names them); deletes when clear; writes `branch_deleted` audit.
- **Component (RTL):** `branch-manager` — add form disabled state + success toast (mock action); edit dialog prefills and submits; delete row surfaces the guard error via `ConfirmDeleteButton` (mock). Mock `sonner`.
- **`audit-aksi-badge`:** if the test asserts per-label, add the three new lines.

## 5. Rollout

1. `validate-branch` + tests.
2. `createBranch` / `updateBranch` / `deleteBranch` + audit + tests.
3. Audit badge labels.
4. `/pengaturan/cabang` page + `branch-manager.tsx` + tests.
5. Hub card + `/pengaturan/lokasi` empty-state copy.
6. Impeccable detector + dev-server smoke + manual verify (add a branch, set its
   point in Lokasi Kantor, confirm it appears in Jadwal/Departemen selectors).
