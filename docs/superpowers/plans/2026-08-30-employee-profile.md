# Employee Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An employee gets a `/profil` page to view their identity data, edit their phone and profile photo (resized in-browser, private bucket, signed URLs), and sign out — with the photo also shown in the AdminShell topbar and the admin `/karyawan` list.

**Architecture:** A new private `profile-photos` bucket with path-based RLS (employee writes only `<id>/avatar.jpg`, hr_admin reads any). No `employees` schema or trigger change — the 0009 self-update allowlist already permits `no_telp` + `foto_profil_url`. Photos are center-cropped + downscaled to 512² JPEG client-side (canvas, no deps), then uploaded via the user-scoped client so RLS is genuinely enforced. Signed URLs (1 h TTL) are minted server-side per render, degrading to an initials `<Avatar>` fallback on any failure.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions) · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui (`radix-nova`) · `lucide-react` · `sonner` · Supabase cloud (Storage signed URLs) · Vitest + Testing Library.

This is **sub-project 3 of 5** (spec: `docs/superpowers/specs/2026-08-30-employee-profile-design.md`). SP1 + SP2 are complete.

## Global Constraints

- TypeScript strict. Package manager **npm**. `npm test` = `vitest run src/` (unit); `npm run test:integration` = `vitest run tests/integration/`.
- `./node_modules/.bin/tsc --noEmit` — NEVER `npx tsc`.
- **Never return or render raw Postgres/PostgREST/storage error text.** `console.error` the raw error, return/render a fixed Indonesian message. Pattern: `src/app/(admin)/pengaturan/instansi/actions.ts`.
- **Every mutation Server Action gates the caller at the top**, before any DB/storage write: `const db = await createServerSupabaseClient(); const me = await getCurrentEmployee(db); if (!me) return { ok: false, error: "Tidak diizinkan." };`. RLS + the 0009 trigger are the second layer.
- **`.update(...).eq(...).select("id")` and treat an empty result array as failure** — an RLS/trigger no-op returns no error and 0 rows (Plan 6 / SP1 lesson).
- **Supabase is a linked cloud project.** Migrations apply via `npx supabase db push` after `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`. NEVER `db reset` / `truncate` / `delete from` on live data. Last migration: `0028`. This plan adds `0029`. A migration must be idempotent — `on conflict do nothing`, `drop policy if exists` before `create policy`.
- **Storage-schema policies schema-qualify the helper:** `public.is_hr_admin_role()`. Path convention: `<employeeId>/avatar.jpg`; `(storage.foldername(name))[1]` is the employee id.
- Photo uploads go through the **user-scoped** client (`createServerSupabaseClient()`), NOT service-role — so RLS insert/update policies are enforced.
- Client image resize target: **512×512 JPEG, quality 0.8** (`resizeToSquareJpeg`). Server-side re-validation on upload: `type === "image/jpeg"`, `size <= 200 * 1024`.
- Phone validation: `/^[0-9+\-\s]{8,20}$/`, or empty string to clear (`no_telp: null`).
- Signed-URL TTL: **3600 seconds**. Helpers never throw; on any failure the caller renders the initials `<Avatar>` fallback.
- Icons: `lucide-react`. Never emoji. Never hand-rolled inline SVG in new code.
- Indonesian UI copy. `lang="id"`.
- **Dark mode is OFF** (`theme-provider.tsx` is `forcedTheme="light"`). New code still uses shadcn semantic utilities (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) — NOT `bg-white`/`bg-neutral-*`/`text-neutral-*`/`bg-blue-*` — so SP5's dark-mode task inherits clean code. (The pre-existing `/karyawan` page body keeps its legacy classes; SP3 only adds an `<Avatar>` there.)
- `<Avatar>`/`<AvatarImage>`/`<AvatarFallback>` from `@/components/ui/avatar`; `<Field>`/`<PageHeader>` from `@/components/*`; `<SignOutButton>` (`forwardRef`, spreads `{...props}`) from `@/components/sign-out-button`.
- 350 unit tests currently green; `tsc --noEmit` clean; `npm run build` 25 routes. Must stay so at every commit. This plan makes it **26 routes** (`/profil`).

---

## File Structure

**Migration**
- `supabase/migrations/0029_profile_photos_bucket.sql` — private bucket + 4 path-RLS policies.

**Lib** (`src/lib/profile/`)
- `image.ts` — `centerCropRect` (pure) + `resizeToSquareJpeg` (client canvas).
- `photo.ts` — `PROFILE_PHOTO_BUCKET`, `profilePhotoPath`, `signProfilePhotoUrl`, `signProfilePhotoUrls`.

**Auth**
- `src/lib/auth/session.ts` — `getCurrentEmployee` gains `fotoPath: string | null`.

**Profile route** (`src/app/(employee)/profil/`)
- `actions.ts` — `updatePhone` / `uploadPhoto` / `removePhoto`.
- `page.tsx` — server component (identity list + form + sign-out).
- `profil-form.tsx` — client (phone + photo).

**Shell + list**
- `src/components/employee-shell.tsx` — re-add `/profil` nav item.
- `src/components/admin-shell.tsx` — `avatarUrl` prop + `<AvatarImage>` in `UserMenu`; + carried `<SheetDescription>` fix.
- `src/app/(admin)/layout.tsx` — sign + pass `avatarUrl`.
- `src/app/(admin)/karyawan/page.tsx` — avatar column.

**Carried SP2 fix**
- `src/components/recap-document.test.tsx` — add `<Image>` on/off cases.

**Integration test**
- `tests/integration/profile-photos-rls.test.ts`.

---

## Task 1: Migration 0029 — `profile-photos` bucket + RLS

**Files:**
- Create: `supabase/migrations/0029_profile_photos_bucket.sql`, `tests/integration/profile-photos-rls.test.ts`

**Interfaces:**
- Produces: private bucket `profile-photos`; `storage.objects` policies `"profile photos read"` (`path prefix == auth.uid() OR public.is_hr_admin_role()`), `"profile photos insert"/"update"/"delete"` (`path prefix == auth.uid()`).
- Consumed by: Task 3 (`signProfilePhotoUrl(s)`), Task 5 (`uploadPhoto`/`removePhoto`).

**Prerequisite:** `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0029_profile_photos_bucket.sql
--
-- Private bucket for employee profile photos. Path-RLS mirrors attendance-
-- photos (0012): path is <employeeId>/avatar.jpg, an employee reads/writes
-- only their own prefix, hr_admin/super_admin read any (for the /karyawan
-- list + the topbar avatar). Unlike attendance-photos, uploads here go
-- through the USER-SCOPED client, so these write policies are enforced.

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

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/profile-photos-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();
const BUCKET = "profile-photos";

async function signInAs(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  return client;
}

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/jpeg" });

describe("profile-photos RLS (0029)", () => {
  let branchId: string;
  const ids: Record<string, string> = {};
  const emails: Record<string, string> = {};

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: b } = await db.from("branches")
      .insert({ nama: `Cabang Foto ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = b!.id;
    for (const [key, role] of [["a", "karyawan"], ["b", "karyawan"], ["hr", "hr_admin"]] as const) {
      const email = `${key}.foto.${suffix}@test.local`;
      const { data: u } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      ids[key] = u!.user!.id;
      emails[key] = email;
      await db.from("employees").insert({
        id: ids[key], nama: key, email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role,
      });
    }
  });

  afterAll(async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).remove([
      `${ids.a}/avatar.jpg`, `${ids.b}/avatar.jpg`,
    ]);
  });

  it("lets a karyawan upload, read, and delete their own avatar", async () => {
    const client = await signInAs(emails.a);
    const path = `${ids.a}/avatar.jpg`;
    const up = await client.storage.from(BUCKET).upload(path, png(), { contentType: "image/jpeg", upsert: true });
    expect(up.error).toBeNull();
    const dl = await client.storage.from(BUCKET).download(path);
    expect(dl.error).toBeNull();
    const del = await client.storage.from(BUCKET).remove([path]);
    expect(del.error).toBeNull();
  });

  it("blocks a karyawan from uploading under another employee's prefix", async () => {
    const client = await signInAs(emails.a);
    const { error } = await client.storage.from(BUCKET)
      .upload(`${ids.b}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    expect(error).not.toBeNull();
  });

  it("blocks a karyawan from reading another employee's avatar", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).upload(`${ids.b}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    const client = await signInAs(emails.a);
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(`${ids.b}/avatar.jpg`, 60);
    expect(error ?? data === null).toBeTruthy();
  });

  it("lets an hr_admin read any employee's avatar", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).upload(`${ids.a}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    const client = await signInAs(emails.hr);
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(`${ids.a}/avatar.jpg`, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm run test:integration -- profile-photos-rls
```

Expected: FAIL — bucket `profile-photos` does not exist (upload errors).

- [ ] **Step 4: Apply the migration**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx supabase db push
```

Expected: `Applying migration 0029_profile_photos_bucket.sql...` finishes. (If it flags an ordering artifact from the `0020` renumber, inspect the diff, confirm it's only `0029`, re-run with `--include-all`.)

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run tests/integration/profile-photos-rls.test.ts
```

Expected: PASS (4 tests). (GoTrue `signInAs` can transiently rate-limit on long runs — re-run isolated.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0029_profile_photos_bucket.sql tests/integration/profile-photos-rls.test.ts
git commit -m "feat(db): private profile-photos bucket, path-scoped RLS"
```

---

## Task 2: `src/lib/profile/image.ts` — center-crop + client resize

**Files:**
- Create: `src/lib/profile/image.ts`, `src/lib/profile/image.test.ts`

**Interfaces:**
- Produces: `centerCropRect(w: number, h: number): { sx: number; sy: number; size: number }` (pure); `resizeToSquareJpeg(file: File, dim?: number, quality?: number): Promise<Blob>` (client-only, canvas).
- Consumed by: Task 6 (`profil-form`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/profile/image.test.ts
import { describe, it, expect } from "vitest";
import { centerCropRect, resizeToSquareJpeg } from "./image";

describe("centerCropRect", () => {
  it("crops the wider axis for a landscape image", () => {
    expect(centerCropRect(100, 60)).toEqual({ sx: 20, sy: 0, size: 60 });
  });
  it("crops the taller axis for a portrait image", () => {
    expect(centerCropRect(60, 100)).toEqual({ sx: 0, sy: 20, size: 60 });
  });
  it("is a no-op offset for a square image", () => {
    expect(centerCropRect(80, 80)).toEqual({ sx: 0, sy: 0, size: 80 });
  });
  it("floors an odd overhang", () => {
    expect(centerCropRect(101, 60)).toEqual({ sx: 20, sy: 0, size: 60 });
  });
});

describe("resizeToSquareJpeg", () => {
  it("rejects a non-image file with an Indonesian message", async () => {
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    await expect(resizeToSquareJpeg(file)).rejects.toThrow(/JPG, PNG, atau WEBP/);
  });
  // The canvas path (createImageBitmap / canvas.toBlob) is not available in
  // jsdom and is verified manually in a browser. Only the validation branch
  // is unit-tested here.
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- profile/image.test
```

Expected: FAIL — `Cannot find module './image'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/profile/image.ts

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
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Berkas gambar tidak dapat dibaca.");
  }
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

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- profile/image.test && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (5 tests). If tsc complains about `ImageBitmap` / `createImageBitmap` types, they are in `lib.dom` — the project's tsconfig includes DOM libs (client components compile). If not, add `/// <reference lib="dom" />` at the top.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/image.ts src/lib/profile/image.test.ts
git commit -m "feat(profile): client-side center-crop + 512px JPEG resize"
```

---

## Task 3: `src/lib/profile/photo.ts` — signed URLs

**Files:**
- Create: `src/lib/profile/photo.ts`, `src/lib/profile/photo.test.ts`

**Interfaces:**
- Produces:
  - `PROFILE_PHOTO_BUCKET = "profile-photos"`
  - `profilePhotoPath(employeeId: string): string` → `` `${employeeId}/avatar.jpg` ``
  - `signProfilePhotoUrl(db: SupabaseClient, path: string | null): Promise<string | null>`
  - `signProfilePhotoUrls(db: SupabaseClient, paths: (string | null)[]): Promise<(string | null)[]>`
- Consumed by: Task 5 (path), Task 7 (`page.tsx`), Task 9 (`(admin)/layout.tsx`), Task 10 (`karyawan/page.tsx`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/profile/photo.test.ts
import { describe, it, expect, vi } from "vitest";
import { profilePhotoPath, signProfilePhotoUrl, signProfilePhotoUrls } from "./photo";

function db(over: { createSignedUrl?: unknown; createSignedUrls?: unknown }) {
  return {
    storage: {
      from: () => ({
        createSignedUrl: over.createSignedUrl ?? vi.fn(),
        createSignedUrls: over.createSignedUrls ?? vi.fn(),
      }),
    },
  } as never;
}

describe("profilePhotoPath", () => {
  it("is <id>/avatar.jpg", () => {
    expect(profilePhotoPath("abc")).toBe("abc/avatar.jpg");
  });
});

describe("signProfilePhotoUrl", () => {
  it("returns null for a null path without calling storage", async () => {
    const createSignedUrl = vi.fn();
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), null)).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it("returns the signed url on success", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://s/x" }, error: null });
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), "a/avatar.jpg")).toBe("https://s/x");
  });
  it("returns null on a storage error", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: "no" } });
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), "a/avatar.jpg")).toBeNull();
  });
  it("returns null (no throw) when storage throws", async () => {
    const createSignedUrl = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), "a/avatar.jpg")).toBeNull();
  });
});

describe("signProfilePhotoUrls", () => {
  it("batches only the non-null paths and preserves order", async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "a/avatar.jpg", signedUrl: "https://s/a", error: null },
        { path: "b/avatar.jpg", signedUrl: "https://s/b", error: null },
      ],
      error: null,
    });
    const out = await signProfilePhotoUrls(db({ createSignedUrls }), ["a/avatar.jpg", null, "b/avatar.jpg"]);
    expect(createSignedUrls).toHaveBeenCalledWith(["a/avatar.jpg", "b/avatar.jpg"], 3600);
    expect(out).toEqual(["https://s/a", null, "https://s/b"]);
  });
  it("maps a per-item error to null", async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ path: "a/avatar.jpg", signedUrl: null, error: "denied" }],
      error: null,
    });
    expect(await signProfilePhotoUrls(db({ createSignedUrls }), ["a/avatar.jpg"])).toEqual([null]);
  });
  it("returns all-null and makes no storage call for all-null input", async () => {
    const createSignedUrls = vi.fn();
    expect(await signProfilePhotoUrls(db({ createSignedUrls }), [null, null])).toEqual([null, null]);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- profile/photo.test
```

Expected: FAIL — `Cannot find module './photo'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/profile/photo.ts
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
    const byPath = new Map(
      data.map((d) => [d.path, d.error ? null : d.signedUrl] as const),
    );
    return paths.map((p) => (p ? byPath.get(p) ?? null : null));
  } catch (err) {
    console.error("signProfilePhotoUrls: unexpected", err);
    return paths.map(() => null);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- profile/photo.test && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/photo.ts src/lib/profile/photo.test.ts
git commit -m "feat(profile): signed-URL helpers for profile photos"
```

---

## Task 4: `getCurrentEmployee` gains `fotoPath`

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/lib/auth/session.test.ts`

**Interfaces:**
- Produces: `CurrentEmployee` gains `fotoPath: string | null` (the raw storage path from `employees.foto_profil_url`).
- Consumed by: Task 9 (`(admin)/layout.tsx` signs `employee.fotoPath`).

- [ ] **Step 1: Update the two `toEqual` cases in `session.test.ts`**

In the "returns the employee record for the authenticated user" test, add `foto_profil_url: "user-1/avatar.jpg"` to the mock employee object and `fotoPath: "user-1/avatar.jpg"` to the expected result:

```typescript
    const db = makeMockDb(
      { id: "user-1" },
      {
        id: "user-1", nama: "Budi", email: "budi@test.local", role: "hr_admin",
        branch_id: "branch-1", status: "aktif", foto_profil_url: "user-1/avatar.jpg",
      },
    );
    const result = await getCurrentEmployee(db as any);
    expect(result).toEqual({
      id: "user-1", nama: "Budi", email: "budi@test.local", role: "hr_admin",
      branchId: "branch-1", fotoPath: "user-1/avatar.jpg",
    });
```

Add one case:

```typescript
  it("maps a missing foto_profil_url to fotoPath null", async () => {
    const db = makeMockDb(
      { id: "u1" },
      { id: "u1", nama: "X", email: "x@y.z", role: "karyawan", branch_id: "b1", status: "aktif" },
    );
    expect((await getCurrentEmployee(db as any))?.fotoPath).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- session.test
```

Expected: FAIL — result has no `fotoPath`; the `toEqual` mismatch.

- [ ] **Step 3: Update `session.ts`**

- Add to `CurrentEmployee`: `fotoPath: string | null;`
- Change the select: `.select("id, nama, email, role, branch_id, status, foto_profil_url")`
- In the return object add: `fotoPath: employee.foto_profil_url ?? null,`

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- session.test && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS. Then `npm test` (full) — confirm no other test that mocks `getCurrentEmployee`'s return broke (they mostly provide their own object; a `toEqual` on the full shape elsewhere would need `fotoPath` — fix any that surface).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat(auth): getCurrentEmployee exposes fotoPath"
```

---

## Task 5: `/profil` server actions

**Files:**
- Create: `src/app/(employee)/profil/actions.ts`, `src/app/(employee)/profil/actions.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient`, `getCurrentEmployee`, `profilePhotoPath` / `PROFILE_PHOTO_BUCKET` (Task 3).
- Produces:
  - `type Result = { ok: true } | { ok: false; error: string }`
  - `updatePhone(formData: FormData): Promise<Result>` (field `no_telp`)
  - `uploadPhoto(formData: FormData): Promise<Result>` (field `photo`: `Blob`, `image/jpeg`, ≤ 200 KB)
  - `removePhoto(): Promise<Result>`
- Consumed by: Task 6 (`profil-form`), Task 7 (`page.tsx` passes them as props).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/(employee)/profil/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { me: { id: "u1" } as { id: string } | null };
const updateResult = { data: [{ id: "u1" }] as { id: string }[] | null, error: null as unknown };
const updateSpy = vi.fn();
const uploadSpy = vi.fn(() => Promise.resolve({ error: null }));
const removeSpy = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      update: (v: unknown) => {
        updateSpy(v);
        return { eq: () => ({ select: () => Promise.resolve(updateResult) }) };
      },
    }),
    storage: { from: () => ({ upload: uploadSpy, remove: removeSpy }) },
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => state.me }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePhone, uploadPhoto, removePhoto } from "./actions";
import { revalidatePath } from "next/cache";

function fd(entries: Record<string, string | Blob>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  state.me = { id: "u1" };
  updateResult.data = [{ id: "u1" }];
  updateResult.error = null;
  updateSpy.mockClear();
  uploadSpy.mockClear();
  removeSpy.mockClear();
  vi.mocked(revalidatePath).mockClear();
});

describe("updatePhone", () => {
  it("refuses when there is no session", async () => {
    state.me = null;
    expect(await updatePhone(fd({ no_telp: "0812" }))).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(updateSpy).not.toHaveBeenCalled();
  });
  it("rejects a malformed phone", async () => {
    const r = await updatePhone(fd({ no_telp: "abc" }));
    expect(r).toEqual({ ok: false, error: "Nomor telepon tidak valid (8–20 digit)." });
  });
  it("clears the phone on an empty string", async () => {
    const r = await updatePhone(fd({ no_telp: "  " }));
    expect(r).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledWith({ no_telp: null });
    expect(revalidatePath).toHaveBeenCalledWith("/profil");
  });
  it("saves a valid phone", async () => {
    const r = await updatePhone(fd({ no_telp: "0812 3456 7890" }));
    expect(r).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledWith({ no_telp: "0812 3456 7890" });
  });
  it("reports failure and does not revalidate on an RLS no-op", async () => {
    updateResult.data = [];
    const r = await updatePhone(fd({ no_telp: "081234567" }));
    expect(r.ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadPhoto", () => {
  it("rejects a non-Blob", async () => {
    expect(await uploadPhoto(fd({ photo: "x" }))).toEqual({ ok: false, error: "Pilih foto." });
  });
  it("rejects a non-jpeg blob", async () => {
    expect(await uploadPhoto(fd({ photo: new Blob(["x"], { type: "image/png" }) }))).toEqual({
      ok: false, error: "Foto tidak valid.",
    });
  });
  it("rejects an oversized blob", async () => {
    const big = new Blob([new Uint8Array(210 * 1024)], { type: "image/jpeg" });
    expect(await uploadPhoto(fd({ photo: big }))).toEqual({ ok: false, error: "Foto terlalu besar." });
  });
  it("uploads, sets the column, and revalidates the layout", async () => {
    const r = await uploadPhoto(fd({ photo: new Blob(["x"], { type: "image/jpeg" }) }));
    expect(r).toEqual({ ok: true });
    expect(uploadSpy).toHaveBeenCalledWith(
      "u1/avatar.jpg", expect.any(Blob), { contentType: "image/jpeg", upsert: true },
    );
    expect(updateSpy).toHaveBeenCalledWith({ foto_profil_url: "u1/avatar.jpg" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("removePhoto", () => {
  it("removes the file, nulls the column, revalidates", async () => {
    const r = await removePhoto();
    expect(r).toEqual({ ok: true });
    expect(removeSpy).toHaveBeenCalledWith(["u1/avatar.jpg"]);
    expect(updateSpy).toHaveBeenCalledWith({ foto_profil_url: null });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- "profil/actions"
```

Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Write the implementation**

Copy §3 of the spec verbatim into `src/app/(employee)/profil/actions.ts` (`updatePhone` / `uploadPhoto` / `removePhoto` with the `gate()` helper, `PHONE_RE`, `MAX_PHOTO_BYTES`).

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- "profil/actions" && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (11 tests). If the mock's `.update().eq().select()` chain doesn't line up with the impl, adjust the test mock (not the impl contract) — keep every assertion.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/profil/actions.ts" "src/app/(employee)/profil/actions.test.ts"
git commit -m "feat(profil): updatePhone / uploadPhoto / removePhoto actions"
```

---

## Task 6: `<ProfilForm>`

**Files:**
- Create: `src/app/(employee)/profil/profil-form.tsx`, `src/app/(employee)/profil/profil-form.test.tsx`

**Interfaces:**
- Consumes: `<Field>`, shadcn `Input`/`Button`, `<Avatar>`/`<AvatarImage>`/`<AvatarFallback>`, `resizeToSquareJpeg` (Task 2), `toast` from `sonner`, the three action fns (Task 5) via props.
- Produces: `<ProfilForm defaultPhone nama photoUrl updatePhone uploadPhoto removePhoto />`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/(employee)/profil/profil-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const resizeToSquareJpeg = vi.fn();
vi.mock("@/lib/profile/image", () => ({ resizeToSquareJpeg }));

import { toast } from "sonner";
import { ProfilForm } from "./profil-form";

const base = {
  defaultPhone: "081234567",
  nama: "Budi Santoso",
  photoUrl: null as string | null,
  updatePhone: vi.fn().mockResolvedValue({ ok: true }),
  uploadPhoto: vi.fn().mockResolvedValue({ ok: true }),
  removePhoto: vi.fn().mockResolvedValue({ ok: true }),
};

describe("ProfilForm", () => {
  it("renders the phone field prefilled and the photo controls with initials fallback", () => {
    render(<ProfilForm {...base} />);
    expect(screen.getByLabelText(/nomor telepon/i)).toHaveValue("081234567");
    expect(screen.getByText("BS")).toBeInTheDocument(); // initials fallback
    expect(screen.getByRole("button", { name: /ganti foto/i })).toBeInTheDocument();
  });

  it("submits the phone to updatePhone", async () => {
    const user = userEvent.setup();
    const updatePhone = vi.fn().mockResolvedValue({ ok: true });
    render(<ProfilForm {...base} updatePhone={updatePhone} />);
    await user.clear(screen.getByLabelText(/nomor telepon/i));
    await user.type(screen.getByLabelText(/nomor telepon/i), "08129999");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    const submitted = updatePhone.mock.calls[0][0] as FormData;
    expect(submitted.get("no_telp")).toBe("08129999");
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts the error when updatePhone fails", async () => {
    const user = userEvent.setup();
    const updatePhone = vi.fn().mockResolvedValue({ ok: false, error: "Nomor telepon tidak valid (8–20 digit)." });
    render(<ProfilForm {...base} updatePhone={updatePhone} />);
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(toast.error).toHaveBeenCalledWith("Nomor telepon tidak valid (8–20 digit).");
  });

  it("resizes a selected file and uploads it on confirm", async () => {
    const user = userEvent.setup();
    resizeToSquareJpeg.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    const uploadPhoto = vi.fn().mockResolvedValue({ ok: true });
    render(<ProfilForm {...base} uploadPhoto={uploadPhoto} />);
    const file = new File(["x"], "p.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/pilih berkas foto/i), file);
    expect(resizeToSquareJpeg).toHaveBeenCalledWith(file);
    await user.click(await screen.findByRole("button", { name: /unggah/i }));
    const submitted = uploadPhoto.mock.calls[0][0] as FormData;
    expect(submitted.get("photo")).toBeInstanceOf(Blob);
  });

  it("toasts the resize error and does not upload", async () => {
    const user = userEvent.setup();
    resizeToSquareJpeg.mockRejectedValue(new Error("Foto harus JPG, PNG, atau WEBP."));
    const uploadPhoto = vi.fn();
    render(<ProfilForm {...base} uploadPhoto={uploadPhoto} />);
    await user.upload(
      screen.getByLabelText(/pilih berkas foto/i),
      new File(["x"], "a.txt", { type: "text/plain" }),
    );
    expect(toast.error).toHaveBeenCalledWith("Foto harus JPG, PNG, atau WEBP.");
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("calls removePhoto when a photo is set", async () => {
    const user = userEvent.setup();
    const removePhoto = vi.fn().mockResolvedValue({ ok: true });
    render(<ProfilForm {...base} photoUrl="https://s/x" removePhoto={removePhoto} />);
    await user.click(screen.getByRole("button", { name: /hapus foto/i }));
    expect(removePhoto).toHaveBeenCalled();
  });
});
```

Note: `URL.createObjectURL` is not in jsdom — the component must guard it (`typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : ""`), OR the test stubs it: add to the test file top `vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} })`. Prefer the component guard (real robustness) AND a test stub.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- profil-form.test
```

Expected: FAIL — `Cannot find module './profil-form'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/(employee)/profil/profil-form.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resizeToSquareJpeg } from "@/lib/profile/image";

type Result = { ok: true } | { ok: false; error: string };

function initials(nama: string): string {
  return (
    nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ProfilForm({
  defaultPhone,
  nama,
  photoUrl,
  updatePhone,
  uploadPhoto,
  removePhoto,
}: {
  defaultPhone: string;
  nama: string;
  photoUrl: string | null;
  updatePhone: (fd: FormData) => Promise<Result>;
  uploadPhoto: (fd: FormData) => Promise<Result>;
  removePhoto: () => Promise<Result>;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [pendingPhone, startPhone] = useTransition();
  const [pendingPhoto, startPhoto] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const pendingBlob = useRef<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function savePhone() {
    startPhone(async () => {
      const fd = new FormData();
      fd.set("no_telp", phone);
      const r = await updatePhone(fd);
      if (r.ok) toast.success("Nomor telepon tersimpan.");
      else toast.error(r.error);
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await resizeToSquareJpeg(file);
      pendingBlob.current = blob;
      const url =
        typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : "";
      setPreview(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses foto.");
    }
  }

  function cancelPreview() {
    if (preview && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(preview);
    setPreview(null);
    pendingBlob.current = null;
  }

  function confirmUpload() {
    const blob = pendingBlob.current;
    if (!blob) return;
    startPhoto(async () => {
      const fd = new FormData();
      fd.set("photo", blob);
      const r = await uploadPhoto(fd);
      if (r.ok) {
        toast.success("Foto profil diperbarui.");
        cancelPreview();
      } else {
        toast.error(r.error);
      }
    });
  }

  function onRemove() {
    startPhoto(async () => {
      const r = await removePhoto();
      if (r.ok) toast.success("Foto profil dihapus.");
      else toast.error(r.error);
    });
  }

  const shown = preview ?? photoUrl;

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {shown ? <AvatarImage src={shown} alt="" /> : null}
          <AvatarFallback>{initials(nama)}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Pilih berkas foto"
            className="hidden"
            onChange={onFile}
          />
          {!preview && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                Ganti Foto
              </Button>
              {photoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendingPhoto}
                  onClick={onRemove}
                >
                  Hapus Foto
                </Button>
              )}
            </div>
          )}
          {preview && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={pendingPhoto} onClick={confirmUpload}>
                {pendingPhoto ? "Mengunggah…" : "Unggah"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelPreview}>
                Batal
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">JPG/PNG/WEBP — otomatis dipotong persegi.</p>
        </div>
      </div>

      <form
        action={(fd) => {
          setPhone(String(fd.get("no_telp") ?? ""));
          savePhone();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field id="no_telp" label="Nomor Telepon" className="flex-1">
          <Input
            name="no_telp"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 text-base"
          />
        </Field>
        <Button type="submit" disabled={pendingPhone} className="h-11">
          {pendingPhone ? "Menyimpan…" : "Simpan"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- profil-form.test && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (6 tests). If `screen.getByText("BS")` fails because Radix `<AvatarFallback>` delays rendering in jsdom, add `import "@testing-library/jest-dom"` is global; wrap the assertion in `await screen.findByText("BS")` — Radix renders the fallback after a mount effect. Adjust the first two tests to `findByText` / `findByRole` as needed; do NOT drop the assertion.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(employee)/profil/profil-form.tsx" "src/app/(employee)/profil/profil-form.test.tsx"
git commit -m "feat(profil): ProfilForm — phone + photo (resize/preview/upload)"
```

---

## Task 7: `/profil` page

**Files:**
- Create: `src/app/(employee)/profil/page.tsx`

**Interfaces:**
- Consumes: `getCurrentEmployee`, `signProfilePhotoUrl` (Task 3), `<PageHeader>`, `<SignOutButton>`, `<ProfilForm>` (Task 6), the three actions (Task 5).

- [ ] **Step 1: Write the page**

Copy §4.1 of the spec verbatim into `src/app/(employee)/profil/page.tsx` (the identity `<dl>`, `<ProfilForm>` with all six props, and the `<SignOutButton className="…" />` block). Imports: `redirect` from `next/navigation`; `PageHeader` from `@/components/page-header`; `SignOutButton` from `@/components/sign-out-button`; `getCurrentEmployee` from `@/lib/auth/session`; `signProfilePhotoUrl` from `@/lib/profile/photo`; `createServerSupabaseClient` from `@/lib/supabase/server`; `ProfilForm` from `./profil-form`; `updatePhone, uploadPhoto, removePhoto` from `./actions`.

- [ ] **Step 2: Verify build**

```bash
./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: tsc clean; build compiles; **`/profil` listed** (26 routes now, `ƒ`). The to-one embeds `branches(nama)` / `departments(nama)` need the `as unknown as { nama: string } | null` cast (spec §4.1 already does).

- [ ] **Step 3: Dev-server smoke**

`npm run dev`, log in as a `karyawan`, visit `/profil`: the identity list shows their data, the phone field is prefilled, "Ganti Foto" opens the picker; selecting an image shows a square preview; "Unggah" persists it and the avatar updates; "Hapus Foto" clears it; "Keluar" signs out to `/login`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(employee)/profil/page.tsx"
git commit -m "feat(profil): /profil page — identity, phone, photo, sign out"
```

---

## Task 8: Re-add `/profil` to the EmployeeShell nav

**Files:**
- Modify: `src/components/employee-shell.tsx`, `src/components/employee-shell.test.tsx`

**Interfaces:** `<EmployeeShell>` signature unchanged; the bottom nav goes from 4 to 5 items.

- [ ] **Step 1: Update `employee-shell.test.tsx`**

The "renders exactly the four bottom-nav items" test (SP2) asserts 4 names and `queryByRole("link", { name: "Profil" })` absent. Change it:

```tsx
  it("renders the five bottom-nav items", () => {
    render(<EmployeeShell brand={<div>Brand</div>} footer={<footer>footer</footer>}><div>content</div></EmployeeShell>);
    for (const name of ["Absen", "Cuti", "Riwayat", "Slip Gaji", "Profil"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });
```

Match the exact `render(...)` prop style the current test file uses (it passes `brand`/`footer` per SP2). Keep the active-state, touch-target, brand/footer/content tests unchanged.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- employee-shell
```

Expected: FAIL — no "Profil" link.

- [ ] **Step 3: Update `employee-shell.tsx`**

- Import `User` from `lucide-react` (alongside the existing `CalendarDays, Clock, FileText, ListChecks`).
- Add to `NAV` as the last entry: `{ href: "/profil", label: "Profil", Icon: User }`.

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- employee-shell && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: PASS; build compiles. Note: 5 items in the bottom nav still each get `flex-1` — they'll be narrower; acceptable for 5 on a phone (existing pattern was 5 before SP2 dropped `/profil`).

- [ ] **Step 5: Commit**

```bash
git add src/components/employee-shell.tsx src/components/employee-shell.test.tsx
git commit -m "feat(shell): re-add Profil to the employee bottom nav"
```

---

## Task 9: AdminShell topbar avatar + `<SheetDescription>` fix

**Files:**
- Modify: `src/components/admin-shell.tsx`, `src/components/admin-shell.test.tsx`, `src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `signProfilePhotoUrl` (Task 3), `employee.fotoPath` (Task 4).
- Produces: `<AdminShell>` gains `avatarUrl?: string` (rendered in `UserMenu`).

- [ ] **Step 1: Update `admin-shell.test.tsx`**

The current test mocks `@/components/ui/avatar`? Check — if it renders the real Radix `<Avatar>`, add a mock at the top so `<AvatarImage>` deterministically renders an `<img>`:

```tsx
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: (p: Record<string, unknown>) => <img alt="" {...p} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
```

Add cases (keep the existing nav/menu/sheet/footer tests):

```tsx
  it("renders the avatar image when avatarUrl is given", async () => {
    const user = userEvent.setup();
    render(<AdminShell employee={emp("hr_admin")} avatarUrl="https://s/pic" brand={<div>b</div>} footer={<footer>f</footer>}><div>c</div></AdminShell>);
    // open the user menu trigger; the avatar is inside it
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://s/pic");
  });

  it("shows the initials fallback when avatarUrl is absent", () => {
    render(<AdminShell employee={emp("hr_admin")} brand={<div>b</div>} footer={<footer>f</footer>}><div>c</div></AdminShell>);
    expect(screen.getByText("BS")).toBeInTheDocument(); // initials of "Budi Santoso"
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
```

Match the `emp(...)` helper + `render(...)` prop style the current file uses (it passes `brand`/`footer`).

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- admin-shell
```

Expected: FAIL — `avatarUrl` prop not wired.

- [ ] **Step 3: Update `admin-shell.tsx`**

- `AdminShell` param: add `avatarUrl,` and to the prop type `avatarUrl?: string;`.
- Pass it to `<UserMenu employee={employee} avatarUrl={avatarUrl} />`.
- `UserMenu` param: add `avatarUrl,` + `avatarUrl?: string` to its type. Its `<Avatar>` becomes:

```tsx
<Avatar className="h-7 w-7">
  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
</Avatar>
```

Import `AvatarImage` alongside the existing `Avatar, AvatarFallback`.
- **Carried SP2 fix:** in the `<SheetContent>`, add right after the `<SheetTitle className="sr-only">…`:

```tsx
<SheetDescription className="sr-only">Menu navigasi admin</SheetDescription>
```

Import `SheetDescription` from `@/components/ui/sheet`.

- [ ] **Step 4: Update `(admin)/layout.tsx`**

```tsx
import { signProfilePhotoUrl } from "@/lib/profile/photo";
// ...after `const employee = await getCurrentEmployee(db);` and the redirect guards:
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
```

- [ ] **Step 5: Run to verify it passes**

```bash
npm test -- admin-shell && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: PASS; build compiles. Full `npm test` — confirm nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-shell.tsx src/components/admin-shell.test.tsx "src/app/(admin)/layout.tsx"
git commit -m "feat(shell): profile photo in the AdminShell topbar + sr-only Sheet description"
```

---

## Task 10: Avatar column in the `/karyawan` list

**Files:**
- Modify: `src/app/(admin)/karyawan/page.tsx`

**Interfaces:**
- Consumes: `signProfilePhotoUrls` (Task 3).

- [ ] **Step 1: Add `foto_profil_url` to the list query + sign**

In `src/app/(admin)/karyawan/page.tsx`:
- Change the `.select(...)` to include `foto_profil_url`: `"id, nama, jabatan, role, status, foto_profil_url, branches(nama)"`.
- After `const { data: rows, error } = await query;`, add:

```tsx
  const photoUrls = rows
    ? await signProfilePhotoUrls(db, rows.map((r) => (r.foto_profil_url as string | null) ?? null))
    : [];
```

- Import `signProfilePhotoUrls` from `@/lib/profile/photo`, plus `Avatar, AvatarFallback, AvatarImage` from `@/components/ui/avatar`.

- [ ] **Step 2: Render the avatar in the name cell**

Replace the name `<td>` content so it's `<div className="flex items-center gap-2">` with a small avatar then the existing `<Link>`:

```tsx
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        {photoUrls[i] ? <AvatarImage src={photoUrls[i]!} alt="" /> : null}
                        <AvatarFallback className="text-[0.65rem]">
                          {(r.nama.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <Link href={`/karyawan/${r.id}`} className="font-medium text-blue-700 hover:underline">
                        {r.nama}
                      </Link>
                    </div>
                  </td>
```

(Keep the legacy `text-blue-700` etc. on this page — SP4 restyles the whole table. The `<Avatar>`/`<AvatarFallback>` are token-based, which is fine.)

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm run build && npm test
```

Expected: tsc clean; build compiles (`/karyawan` listed); all tests green (the page has no unit test). Dev-server: `/karyawan` shows a small avatar (initials or photo) beside each name.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/karyawan/page.tsx"
git commit -m "feat(karyawan): profile photo avatar in the employee list"
```

---

## Task 11: Carried SP2 fix — `recap-document.test.tsx` Image coverage

**Files:**
- Modify: `src/components/recap-document.test.tsx`

**Interfaces:** none — test-only.

- [ ] **Step 1: Add the two cases**

`payslip-document.test.tsx` (SP2) has `renders no Image when orgLogoUrl is null` and `renders an Image when orgLogoUrl is set` using `treeHasType(tree, Image)` from `./pdf-tree-helper`. `recap-document.test.tsx` currently only asserts the org name. Add the same two, adapted to `RecapDocument`:

```tsx
import { Image } from "@react-pdf/renderer";
import { treeText, treeHasType } from "./pdf-tree-helper";
// ...
  const data = (over: Partial<RecapDocData> = {}) => ({
    branchNama: "Kantor Pusat", from: "2026-01-01", to: "2026-01-31",
    rows: [], orgNama: "PT Contoh", orgLogoUrl: null as string | null, ...over,
  });

  it("renders no Image when orgLogoUrl is null", () => {
    expect(treeHasType(RecapDocument({ data: data() }), Image)).toBe(false);
  });

  it("renders an Image when orgLogoUrl is set", () => {
    expect(treeHasType(RecapDocument({ data: data({ orgLogoUrl: "data:image/png;base64,AAAA" }) }), Image)).toBe(true);
  });
```

Adjust the existing "puts the org name in the header" test to use the `data()` helper if convenient; keep its assertion (`treeText(...).toContain("PT Contoh")`).

- [ ] **Step 2: Run to verify**

```bash
npm test -- recap-document && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (3 cases).

- [ ] **Step 3: Commit**

```bash
git add src/components/recap-document.test.tsx
git commit -m "test(pdf): recap-document Image on/off coverage (carried from SP2 review)"
```

---

## Post-plan verification

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build            # 26 routes now, /profil listed
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
npx vitest run tests/integration/profile-photos-rls.test.ts
```

Dev-server smoke: `/profil` full flow (view / edit phone / upload+resize / remove / sign out); `/karyawan` avatars; the AdminShell topbar avatar (upload a photo as an hr_admin, confirm it shows in the topbar after the revalidate).

Then the final whole-branch review, then `finishing-a-development-branch`.

## SP4 / SP5 hand-off

- **SP4** restyles `/karyawan` — the SP3 avatar cell markup is minimal and expected to be reworked.
- **SP5** (dark-mode debt): migrate page bodies off `text-neutral-*`/`bg-white`, invert the legacy neutral ramp under `.dark`, revert `theme-provider.tsx` to `system` + re-mount `<ThemeToggle>` (consider surfacing it on `/profil` too).
