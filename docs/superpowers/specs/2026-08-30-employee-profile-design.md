# Employee Profile — Design

**Status:** Approved (brainstorming) — ready for implementation planning.

**This is sub-project 3 of the white-label branding + UI redesign initiative.**

| # | Sub-project | Depends on |
|---|---|---|
| 1 | Branding + Design System foundation (done) | — |
| 2 | App chrome + entry pages (done) | 1 |
| **3** | **Employee profile** (this spec) | 1, 2 |
| 4 | Admin pages redesign (dashboard, karyawan, persetujuan-cuti, laporan, payroll, pengaturan) | 1, 2 |
| 5 | Employee pages redesign (absen, consent, cuti, riwayat, slip-gaji) + dark-mode debt task | 1, 2 |

## Goal

Give an employee a `/profil` page: view their own identity data, edit their phone number and profile photo (photo resized in the browser, stored in a new private bucket, shown via signed URLs), and sign out. Re-add `/profil` to the EmployeeShell bottom nav. Show the profile photo in the AdminShell topbar avatar and the admin `/karyawan` list.

## Non-goals

- Dark mode — deferred to SP5 (`theme-provider.tsx` is `forcedTheme="light"`, `<ThemeToggle>` is unmounted).
- Redesigning the `/karyawan` table (SP4) — SP3 only wires the avatar data + a minimal cell.
- Editing name / jabatan / email / branch / role / start date — admin-only, and the 0009 trigger blocks employee self-edit of everything except `no_telp` and `foto_profil_url`.
- Leave balance, attendance summary, or any other data on `/profil`.
- Server-side image processing (`sharp`) — the project avoids native deps; resize happens client-side.
- An avatar in the EmployeeShell header (considered, dropped).

## Tech context

- Next.js 16.3 (App Router, Server Actions, Route Handlers), React 19.2, TypeScript strict, Tailwind v4, shadcn/ui (`radix-nova`), `next-themes` (forced light), `lucide-react`, `sonner`.
- Supabase cloud. Migrations via `npx supabase db push` after `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. Last migration: `0028`. This sub-project: `0029`.
- **`employees` table** (`0001`) already has `no_telp text` and `foto_profil_url text` — NO schema change.
- **`prevent_employee_self_privilege_escalation()`** (`0009`) is an ALLOWLIST: a non-admin may change exactly `no_telp` and `foto_profil_url` on their own row (`auth.uid() = old.id`); any other column diff is rejected. NO trigger change needed.
- **`attendance-photos` bucket** (`0008` → `0012`): private, path-based RLS `(storage.foldername(name))[1] = auth.uid()::text OR public.is_hr_admin_role()`, path `<employeeId>/...`. Uploads there go through `createServiceRoleSupabaseClient` (the write policy is defense-in-depth only). SP3's `profile-photos` bucket mirrors the *shape* but uploads go through the **user-scoped** client, so its write policy is genuinely enforced.
- `is_hr_admin_role()` = `hr_admin` / `super_admin`. `/karyawan` is in `HR_ADMIN_PATH_PREFIXES` — `atasan` cannot reach it — so `is_hr_admin_role()` on the read policy covers everyone who needs to see other employees' photos.
- No `createSignedUrl` usage exists in the codebase yet — SP3 introduces it.
- `getCurrentEmployee(db)` (`@/lib/auth/session`) currently returns `{ id, nama, email, role, branchId }` from `.select("id, nama, email, role, branch_id, status")`.
- `<BrandMark>` / `<AppFooter>` are async server components; `AdminShell` / `EmployeeShell` are `"use client"` and receive them (and now `avatarUrl`) as props injected by their server `layout.tsx` (SP2 pattern).
- `<Avatar>` / `<AvatarImage>` / `<AvatarFallback>` from `@/components/ui/avatar`. `<Field>` / `<PageHeader>` / `<EmptyState>` from `@/components/*`. `<SignOutButton>` (`forwardRef`, `@/components/sign-out-button`). `signOut` action (`@/app/(auth)/actions`).
- `<EmployeeShell>` NAV currently has 4 items (`/absen`, `/cuti`, `/riwayat`, `/slip-gaji`); SP2 removed `/profil`. `<AdminShell>` `UserMenu` uses `<Avatar>` with initials only.
- 350 unit tests green; `tsc --noEmit` clean; `npm run build` 25 routes. Must stay so.

---

## 1. Migration `0029_profile_photos_bucket.sql`

```sql
-- supabase/migrations/0029_profile_photos_bucket.sql
--
-- Private bucket for employee profile photos. Path-RLS mirrors attendance-
-- photos (0012): path is <employeeId>/avatar.jpg, an employee reads/writes
-- only their own prefix, hr_admin/super_admin read any (for the /karyawan
-- list + the topbar avatar). Unlike attendance-photos, uploads here go
-- through the USER-SCOPED client, so the write policies are enforced, not
-- just defense-in-depth. Functions schema-qualified for the storage schema.

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

drop policy if exists "profile photos read" on storage.objects;
create policy "profile photos read" on storage.objects for select using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_hr_admin_role()
  )
);

drop policy if exists "profile photos insert" on storage.objects;
create policy "profile photos insert" on storage.objects for insert with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile photos update" on storage.objects;
create policy "profile photos update" on storage.objects for update using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile photos delete" on storage.objects;
create policy "profile photos delete" on storage.objects for delete using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

**Integration test** — `tests/integration/profile-photos-rls.test.ts`, mirrors `reporting-config-rls.test.ts` (seed a branch + a `karyawan` + a second `karyawan` + an `hr_admin`; `signInAs` helper):
- karyawan uploads to `<ownId>/avatar.jpg` → ok; reads it → ok; deletes it → ok.
- karyawan uploads to `<otherId>/avatar.jpg` → error (`42501` or storage error).
- karyawan reads `<otherId>/avatar.jpg` → error / empty.
- hr_admin reads `<karyawanId>/avatar.jpg` (after a service-role seed upload) → ok.
- `afterAll` removes every seeded object.

---

## 2. Lib

### 2.1 `src/lib/profile/photo.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
const SIGN_TTL_SECONDS = 3600;

export function profilePhotoPath(employeeId: string): string {
  return `${employeeId}/avatar.jpg`;
}

export async function signProfilePhotoUrl(
  db: SupabaseClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await db.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrl(path, SIGN_TTL_SECONDS);
    if (error || !data) {
      if (error) console.error("signProfilePhotoUrl: failed", error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("signProfilePhotoUrl: unexpected", err);
    return null;
  }
}

export async function signProfilePhotoUrls(
  db: SupabaseClient,
  paths: (string | null)[],
): Promise<(string | null)[]> {
  const real = paths.filter((p): p is string => Boolean(p));
  if (real.length === 0) return paths.map(() => null);
  try {
    const { data, error } = await db.storage
      .from(PROFILE_PHOTO_BUCKET)
      .createSignedUrls(real, SIGN_TTL_SECONDS);
    if (error || !data) {
      if (error) console.error("signProfilePhotoUrls: failed", error);
      return paths.map(() => null);
    }
    const byPath = new Map(data.map((d) => [d.path, d.error ? null : d.signedUrl]));
    return paths.map((p) => (p ? byPath.get(p) ?? null : null));
  } catch (err) {
    console.error("signProfilePhotoUrls: unexpected", err);
    return paths.map(() => null);
  }
}
```

Never throws. On any failure the caller renders the initials fallback.

**Tests** — mock `db.storage.from(...).createSignedUrl(s)`:
- `profilePhotoPath("abc")` → `"abc/avatar.jpg"`.
- `signProfilePhotoUrl(db, null)` → `null`, no storage call.
- `signProfilePhotoUrl` — success → the `signedUrl`; storage error → `null`; throw → `null`.
- `signProfilePhotoUrls(db, ["a/x", null, "b/y"])` — one `createSignedUrls(["a/x","b/y"], …)` call; result order preserved; a per-item `error` maps to `null` for that slot; all-null input → no storage call, all-null output.

### 2.2 `src/lib/profile/image.ts`

```ts
/** Center-crop rectangle for turning a w×h image into a square. Pure. */
export function centerCropRect(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h);
  return { sx: Math.floor((w - size) / 2), sy: Math.floor((h - size) / 2), size };
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client only. Loads `file`, center-crops to square, scales to `dim`×`dim`,
 * returns a JPEG Blob. Rejects a non-image / undecodable file.
 */
export async function resizeToSquareJpeg(
  file: File,
  dim = 512,
  quality = 0.8,
): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Foto harus JPG, PNG, atau WEBP.");
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Berkas gambar tidak dapat dibaca.");
  });
  const { sx, sy, size } = centerCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak dapat memproses gambar.");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, dim, dim);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("Tidak dapat memproses gambar.");
  return blob;
}
```

**Tests** — `centerCropRect` only (pure): landscape `100×60` → `{ sx: 20, sy: 0, size: 60 }`; portrait `60×100` → `{ sx: 0, sy: 20, size: 60 }`; square `80×80` → `{ sx: 0, sy: 0, size: 80 }`; odd `101×60` → `{ sx: 20, sy: 0, size: 60 }`. `resizeToSquareJpeg`'s canvas path is not unit-tested (jsdom has no canvas 2d); the input-validation branch (non-image `File` → the "Foto harus JPG…" message) IS tested. Note this in the test file.

### 2.3 `getCurrentEmployee` — add `fotoPath`

`src/lib/auth/session.ts`: change the select to `"id, nama, email, role, branch_id, status, foto_profil_url"`; add `fotoPath: string | null` to `CurrentEmployee` and map `employee.foto_profil_url`. Additive — the ~15 existing call sites ignore the new field. Update `session.test.ts` if its mock row shape needs the extra key (map handles `undefined` → `null` if you use `?? null`).

---

## 3. Actions — `src/app/(employee)/profil/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth/session";
import { profilePhotoPath, PROFILE_PHOTO_BUCKET } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const PHONE_RE = /^[0-9+\-\s]{8,20}$/;
const MAX_PHOTO_BYTES = 200 * 1024;

async function gate() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return { db, me: null, denied: { ok: false as const, error: "Tidak diizinkan." } };
  return { db, me, denied: null };
}

export async function updatePhone(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const raw = String(formData.get("no_telp") ?? "").trim();
  const no_telp = raw === "" ? null : raw;
  if (no_telp !== null && !PHONE_RE.test(no_telp)) {
    return { ok: false, error: "Nomor telepon tidak valid (8–20 digit)." };
  }

  const { data, error } = await db
    .from("employees")
    .update({ no_telp })
    .eq("id", me!.id)
    .select("id");
  if (error) {
    console.error("updatePhone: update failed", error);
    return { ok: false, error: "Gagal menyimpan nomor telepon." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Gagal menyimpan — coba muat ulang." };
  }
  revalidatePath("/profil");
  return { ok: true };
}

export async function uploadPhoto(formData: FormData): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const photo = formData.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return { ok: false, error: "Pilih foto." };
  }
  if (photo.type !== "image/jpeg") {
    return { ok: false, error: "Foto tidak valid." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Foto terlalu besar." };
  }

  const path = profilePhotoPath(me!.id);
  const { error: upErr } = await db.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg", upsert: true });
  if (upErr) {
    console.error("uploadPhoto: upload failed", upErr);
    return { ok: false, error: "Gagal mengunggah foto." };
  }

  const { data, error } = await db
    .from("employees")
    .update({ foto_profil_url: path })
    .eq("id", me!.id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("uploadPhoto: settings update failed", error);
    return { ok: false, error: "Gagal menyimpan foto." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removePhoto(): Promise<Result> {
  const { db, me, denied } = await gate();
  if (denied) return denied;

  const { error: rmErr } = await db.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove([profilePhotoPath(me!.id)]);
  if (rmErr) console.error("removePhoto: storage remove failed", rmErr);

  const { data, error } = await db
    .from("employees")
    .update({ foto_profil_url: null })
    .eq("id", me!.id)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("removePhoto: update failed", error);
    return { ok: false, error: "Gagal menghapus foto." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
```

Notes: the `employees` update uses the **user-scoped** client, so the 0009 allowlist trigger runs and rejects anything but `no_telp` / `foto_profil_url`. `.select("id")` + zero-row → failure (RLS/trigger no-op safety, per the Plan 6 / SP1 lesson).

**Tests** (mock `createServerSupabaseClient` + `getCurrentEmployee` + `next/cache`):
- `updatePhone` — no session → `{ ok: false, error: "Tidak diizinkan." }`, no DB call; `"abc"` → invalid-phone error; `""` → clears (`no_telp: null`), ok; `"0812 3456 7890"` → ok, `revalidatePath("/profil")`; `.select("id")` returns `[]` → failure, no revalidate.
- `uploadPhoto` — non-Blob → "Pilih foto."; `type: "image/png"` → "Foto tidak valid."; `size > 200 KB` → "Foto terlalu besar."; valid → `storage.upload(path, blob, { contentType: "image/jpeg", upsert: true })` then column set then `revalidatePath("/", "layout")`.
- `removePhoto` — calls `storage.remove([path])`, nulls the column, `revalidatePath("/", "layout")`; a storage-remove error is logged but not fatal (still nulls + returns ok if the column update succeeds).

---

## 4. Page + form

### 4.1 `src/app/(employee)/profil/page.tsx` (server component)

```tsx
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { getCurrentEmployee } from "@/lib/auth/session";
import { signProfilePhotoUrl } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProfilForm } from "./profil-form";
import { removePhoto, updatePhone, uploadPhoto } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  karyawan: "Karyawan", atasan: "Atasan", hr_admin: "HR Admin", super_admin: "Super Admin",
};

export default async function ProfilPage() {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) redirect("/login");

  const { data: row, error } = await db
    .from("employees")
    .select("nama, jabatan, no_telp, foto_profil_url, tanggal_mulai_kerja, role, branches(nama), departments(nama)")
    .eq("id", me.id)
    .single();
  if (error) console.error("profil: query failed", error);

  const photoUrl = await signProfilePhotoUrl(db, row?.foto_profil_url ?? null);
  const branchNama = (row?.branches as unknown as { nama: string } | null)?.nama ?? "-";
  const deptNama = (row?.departments as unknown as { nama: string } | null)?.nama ?? "-";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 p-4">
      <PageHeader title="Profil" description="Data diri dan pengaturan akun Anda." />

      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        {[
          ["Nama", row?.nama ?? me.nama],
          ["Email", me.email],
          ["Jabatan", row?.jabatan ?? "-"],
          ["Cabang", branchNama],
          ["Departemen", deptNama],
          ["Peran", ROLE_LABEL[row?.role ?? me.role] ?? "-"],
          ["Mulai Kerja", row?.tanggal_mulai_kerja ?? "-"],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="col-span-2 text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <ProfilForm
        defaultPhone={row?.no_telp ?? ""}
        nama={row?.nama ?? me.nama}
        photoUrl={photoUrl}
        updatePhone={updatePhone}
        uploadPhoto={uploadPhoto}
        removePhoto={removePhoto}
      />

      <div className="border-t border-border pt-4">
        <SignOutButton className="w-full justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted sm:w-auto" />
      </div>
    </div>
  );
}
```

`<SignOutButton>` (SP2: `forwardRef`, spreads `{...props}`, merges its own default classes with the passed `className`) is rendered directly with outline-button classes — no `<Button asChild>` wrapper, so there is no button-in-button nesting. Its default classes (`flex w-full items-center gap-2 …`) already give the icon+label layout; the passed classes add the border + centering.

### 4.2 `src/app/(employee)/profil/profil-form.tsx` (client)

- Props: `defaultPhone: string`, `nama: string`, `photoUrl: string | null`, and the three action fns.
- **Phone block:** `<Field id="no_telp" label="Nomor Telepon">` + `<Input>` (`type="tel"`, `inputMode="tel"`, `h-11 text-base`) + a "Simpan" `<Button>`; on submit call `updatePhone(fd)`, `toast.success("Nomor telepon tersimpan.")` / `toast.error(r.error)`.
- **Photo block:** a `<div>` with the current `<Avatar className="h-20 w-20">` (`<AvatarImage src={preview ?? photoUrl}>` + `<AvatarFallback>` initials of `nama`); a hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` behind a "Ganti Foto" `<Button>`; on `change`: `resizeToSquareJpeg(file)` in a try → set `preview` (a `URL.createObjectURL`) + hold the `Blob` in state; show "Unggah" + "Batal"; "Unggah" builds a `FormData` with `photo` = the Blob and calls `uploadPhoto`, then clears preview + `toast`. A "Hapus Foto" `<Button variant="ghost">` shown when `photoUrl` and no pending preview → `removePhoto`.
- All buttons disabled during their pending transition (`useTransition`).

**Tests** — mock `sonner`, `./actions` (via props), and `@/lib/profile/image` (`resizeToSquareJpeg`):
- renders the phone field with `defaultPhone`, the avatar (fallback initials when `photoUrl` is null), the "Ganti Foto" control.
- typing a bad phone + "Simpan" → the action returns `{ ok: false, error }` → `toast.error` called with it (or an inline error — pick one and test it).
- "Simpan" with a valid phone → `updatePhone` called with a FormData whose `no_telp` matches.
- selecting a file → `resizeToSquareJpeg` (mocked to resolve a `Blob`) is called; the "Unggah" button appears; clicking it → `uploadPhoto` called with a FormData containing a `photo` Blob.
- `resizeToSquareJpeg` mock rejects → `toast.error` with the thrown message; no `uploadPhoto` call.
- "Hapus Foto" (shown when `photoUrl` set) → `removePhoto` called.

---

## 5. Shell + list wiring

### 5.1 `src/components/employee-shell.tsx`

Re-add to `NAV` (as the 5th item, after `/slip-gaji`): `{ href: "/profil", label: "Profil", Icon: User }` (`User` from `lucide-react`). Now 5 items. `employee-shell.test.tsx`: expect all 5 names incl. `"Profil"`; the active-state + touch-target + brand + footer assertions unchanged.

### 5.2 `src/components/admin-shell.tsx`

`AdminShell` gains `avatarUrl?: string`. `UserMenu` receives it and renders:

```tsx
<Avatar className="h-7 w-7">
  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
</Avatar>
```

`admin-shell.test.tsx`: add a case — `avatarUrl` given → an `<img>` with that `src`; omitted → the initials fallback text is present. Existing assertions unchanged.

### 5.3 `src/app/(admin)/layout.tsx`

After loading `employee`, sign its photo and pass it:

```tsx
const avatarUrl = await signProfilePhotoUrl(db, employee.fotoPath);
return (
  <AdminShell employee={employee} avatarUrl={avatarUrl ?? undefined} brand={<BrandMark size="md" />} footer={<AppFooter />}>
    {children}
  </AdminShell>
);
```

### 5.4 `src/app/(admin)/karyawan/page.tsx`

- Add `foto_profil_url` to the list `.select(...)`.
- After the query: `const photoUrls = await signProfilePhotoUrls(db, rows.map((r) => r.foto_profil_url ?? null));`
- In the name cell, prepend a small `<Avatar className="h-7 w-7">` (`AvatarImage` when the signed URL for that row is non-null, else `AvatarFallback` initials of `r.nama`). Keep the rest of the row markup as-is — **SP4 restyles this table**; SP3 only adds the avatar.
- No test change required for the page (it has no unit test); `npm run build` covers it.

---

## 6. Testing summary & compatibility

| Area | File | Kind |
|---|---|---|
| `0029` bucket + RLS | `tests/integration/profile-photos-rls.test.ts` | integration (live) |
| `centerCropRect` + resize validation | `src/lib/profile/image.test.ts` | unit |
| `signProfilePhotoUrl(s)` + `profilePhotoPath` | `src/lib/profile/photo.test.ts` | unit |
| `getCurrentEmployee` `fotoPath` | `src/lib/auth/session.test.ts` (update mock) | unit |
| `updatePhone` / `uploadPhoto` / `removePhoto` | `src/app/(employee)/profil/actions.test.ts` | unit |
| `ProfilForm` | `src/app/(employee)/profil/profil-form.test.tsx` | unit (RTL) |
| EmployeeShell 5 nav items | `src/components/employee-shell.test.tsx` (update) | unit |
| AdminShell avatar image/fallback | `src/components/admin-shell.test.tsx` (add case) | unit |

- `npm test` green (350 + new). `tsc --noEmit` clean. `npm run build` — now **26 routes** (`/profil` added).
- Integration: run `profile-photos-rls.test.ts` in isolation (the full integration suite rate-limits GoTrue — known).
- No existing page's behaviour changes except: `getCurrentEmployee` return shape grows one field, `(admin)/layout.tsx` + `admin-shell.tsx` + `employee-shell.tsx` + `karyawan/page.tsx` gain avatar wiring.
- `next build` route count: `/profil` is dynamic (`ƒ` — session + storage).

## 7. SP4 / SP5 hand-off

- **SP4** restyles the `/karyawan` table; the avatar cell markup from SP3 §5.4 is minimal and expected to be reworked.
- **SP5** (dark-mode debt task) re-mounts `<ThemeToggle>` — `/profil` is a natural place to *also* surface it (an employee "settings"-ish screen) once dark mode is safe; note it but do not add it in SP3.
- Two carried FIX-IN-SP3 items from SP2's final review, fold into this sub-project's cleanup: (a) `SheetContent` in `admin-shell.tsx` needs an `sr-only` `<SheetDescription>` to silence the Radix console notice; (b) `recap-document.test.tsx` needs the `<Image>` on/off cases (copy from `payslip-document.test.tsx`).
