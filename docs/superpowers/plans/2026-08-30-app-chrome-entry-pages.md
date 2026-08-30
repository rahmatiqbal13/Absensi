# App Chrome + Entry Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the two app shells and the three entry pages onto the SP1 design system — branded, dark-aware, calm and professional — add a sign-out, put the org logo + name on the payslip and recap PDFs, and flip the theme provider back to `system`.

**Architecture:** `AdminShell` becomes sidebar + thin topbar (user menu with sign-out, theme toggle) with a mobile `<Sheet>` drawer; `EmployeeShell` becomes a branded sticky header + 4-item bottom nav; all three surfaces use shadcn tokens so `next-themes` dark mode works. A shared `(auth)/layout.tsx` frames `/login` + `/set-password`; `src/app/page.tsx` becomes a branded landing that redirects logged-in users home. The PDF route handlers pre-fetch the logo as a `data:` URL (deterministic, degrades to name-only). The SP1 handoff minors that live in shell/token/primitive code are cleared here.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions) · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui (`radix-nova` preset) · `next-themes` · `lucide-react` · `sonner` · `@react-pdf/renderer` (existing) · Vitest + Testing Library.

This is **sub-project 2 of 5** (spec: `docs/superpowers/specs/2026-08-30-app-chrome-entry-pages-design.md`). SP1 (`2026-08-28-branding-design-system`) is complete. SP3 = `/profil` + profile photos.

## Global Constraints

- TypeScript strict. Package manager **npm**. `npm test` = `vitest run src/` (unit); `npm run test:integration` = `vitest run tests/integration/` (live cloud).
- `./node_modules/.bin/tsc --noEmit` — NEVER `npx tsc` (an npm wrapper intercepts it).
- **Never return or render raw Postgres/PostgREST error text.** `console.error` the raw error, return/render a fixed Indonesian message.
- Icons: `lucide-react`. Never emoji. Never hand-rolled inline SVG in new/rewritten code (existing inline SVGs elsewhere stay until their page is redesigned in SP4/SP5).
- Indonesian UI copy. `lang="id"`.
- **Dark-aware:** every shell/entry surface uses shadcn semantic utilities (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`, `bg-primary/10`) — NOT hardcoded `bg-white` / `bg-neutral-*` / `bg-blue-*` / `text-neutral-*`. The one exception: the `--color-neutral-*` legacy tokens stay defined for not-yet-redesigned page bodies, but SP2's own code must not add new usages.
- **Touch targets ≥ 44px, `text-base` on mobile** for interactive controls in the employee shell and the entry forms (field-use mobile attendance app).
- **SP1 components to consume (all committed):** `<BrandMark size="sm"|"md"|"lg" showName? className?>` (`@/components/brand-mark` — async server component), `<AppFooter>` (`@/components/app-footer` — async server component, renders `© <year> <namaInstansi> · Dibuat oleh Rahmat Iqbal R.P.`), `<ThemeToggle>` (`@/components/theme-toggle` — client), `<RoleBadge role={Role}>` (`@/components/role-badge`), `getAppSettings()` (`@/lib/branding/get-app-settings` → `AppSettings` with `namaInstansi, namaSingkat, tagline, logoUrl, alamat, telepon, email, warnaAksen`; cached; never throws), `<Field id label hint error required className>` (`@/components/field`).
- **shadcn `ui/*` files are ours to edit.** When a task edits one (`alert.tsx`, `input.tsx`, `button.tsx`), add a `// PROJECT EDIT: …` comment so a future `shadcn add` re-generation is a conscious re-merge.
- `getCurrentEmployee(db)` returns `CurrentEmployee | null` = `{ id: string; nama: string; email: string; role: Role; branchId: string }` (`@/lib/auth/session`). `Role = "karyawan" | "atasan" | "hr_admin" | "super_admin"` (`@/lib/auth/route-access`).
- `resolveRouteAccess(pathname, role)` in `route-access.ts` is unchanged. This plan ADDS `homePathForRole(role)` to that file.
- **No auth-flow, RLS, or route-access-rule changes** beyond adding `signOut`.
- 327 unit tests currently green; `tsc --noEmit` clean; `npm run build` 25 routes. Must stay so at every commit.
- The shadcn base layer already shifted existing page visuals in SP1 (universal `border-border` reset, `body` bg → white, badge sizing) — not SP2 regressions.
- Migrations: none in this sub-project.

---

## File Structure

**New:**
- `src/app/(auth)/actions.ts` — `signOut()` server action.
- `src/components/sign-out-button.tsx` — client, `useTransition` + pending state.
- `src/app/(auth)/layout.tsx` — shared branded frame for login + set-password.
- `src/lib/branding/fetch-logo.ts` — `fetchLogoDataUrl(url): Promise<string|null>`.
- Test files alongside each.

**Rewritten:**
- `src/components/admin-shell.tsx` (+ `.test.tsx`)
- `src/components/employee-shell.tsx` (+ `.test.tsx`)
- `src/app/page.tsx` — landing.
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/set-password/page.tsx`, `src/app/(auth)/set-password/set-password-form.tsx`
- `src/components/payslip-document.tsx`, `src/components/recap-document.tsx`

**Modified:**
- `src/app/(admin)/layout.tsx` — pass `employee` (not just `role`) to `<AdminShell>`.
- `src/lib/auth/route-access.ts` — add `homePathForRole`.
- `src/components/ui/alert.tsx` — add a `warning` variant.
- `src/components/ui/input.tsx`, `src/components/ui/button.tsx` — default control height.
- `src/components/theme-provider.tsx` — flip to `system`.
- `src/app/globals.css` — delete dead legacy tokens (keep `--color-neutral-*`).
- `src/components/field.tsx` (+ `.test.tsx`) — harden.
- `src/components/attendance-status-badge.tsx` — `pulang_cepat` → `info`.
- `src/app/(admin)/pengaturan/instansi/instansi-form.tsx` — contrast warning as its own line.
- `src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx`, `src/app/(admin)/laporan/pdf/route.tsx` — pass logo/name.

---

## Task 1: `signOut` action + `<SignOutButton>`

**Files:**
- Create: `src/app/(auth)/actions.ts`, `src/app/(auth)/actions.test.ts`, `src/components/sign-out-button.tsx`, `src/components/sign-out-button.test.tsx`

**Interfaces:**
- Produces: `signOut(): Promise<never>` (`"use server"` — calls `db.auth.signOut()` then `redirect("/login")`); `<SignOutButton variant?="ghost"|"menuitem" className?>` — client, calls `signOut` in `useTransition`, disabled while pending.
- Consumed by: Task 5 (AdminShell user menu).

- [ ] **Step 1: Write the failing action test**

```ts
// src/app/(auth)/actions.test.ts
import { describe, it, expect, vi } from "vitest";

const signOutMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { signOut: signOutMock } }),
}));
const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { signOut } from "./actions";

describe("signOut", () => {
  it("signs out then redirects to /login", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- "(auth)/actions"
```

Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Write the action**

```ts
// src/app/(auth)/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOut() {
  const db = await createServerSupabaseClient();
  await db.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 4: Write the failing button test**

```tsx
// src/components/sign-out-button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/(auth)/actions", () => ({ signOut }));

import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  it("calls signOut on click", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole("button", { name: /keluar/i }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Write the button**

```tsx
// src/components/sign-out-button.tsx
"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60",
        className,
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {pending ? "Keluar…" : "Keluar"}
    </button>
  );
}
```

- [ ] **Step 6: Run both to verify they pass**

```bash
npm test -- "(auth)/actions" sign-out-button && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (2 tests), tsc clean. Note: the button test imports `@/app/(auth)/actions` — the alias `@` maps to `src`, so `@/app/(auth)/actions` resolves. If the `(auth)` parens break the vitest mock path, use a relative `vi.mock("../app/(auth)/actions", ...)` — verify the mock actually intercepts (assert `signOut` called).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/actions.ts" "src/app/(auth)/actions.test.ts" src/components/sign-out-button.tsx src/components/sign-out-button.test.tsx
git commit -m "feat(auth): signOut server action + SignOutButton"
```

---

## Task 2: `homePathForRole` + landing page

**Files:**
- Modify: `src/lib/auth/route-access.ts`, `src/lib/auth/route-access.test.ts`
- Rewrite: `src/app/page.tsx`

**Interfaces:**
- Produces: `homePathForRole(role: Role): "/absen" | "/dashboard"` — `"karyawan" → "/absen"`, everything else `→ "/dashboard"`.
- Consumed by: `src/app/page.tsx`.

- [ ] **Step 1: Add the failing test cases**

Append to `src/lib/auth/route-access.test.ts`:

```ts
import { homePathForRole } from "./route-access";

describe("homePathForRole", () => {
  it("sends karyawan to /absen", () => {
    expect(homePathForRole("karyawan")).toBe("/absen");
  });
  it("sends every admin role to /dashboard", () => {
    for (const r of ["atasan", "hr_admin", "super_admin"] as const) {
      expect(homePathForRole(r)).toBe("/dashboard");
    }
  });
});
```

(If `route-access.test.ts` does not already import `describe/it/expect`, they are globals via the vitest config — no import needed; match the existing file's style.)

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- route-access
```

Expected: FAIL — `homePathForRole is not a function`.

- [ ] **Step 3: Add the helper**

Append to `src/lib/auth/route-access.ts`:

```ts
export function homePathForRole(role: Role): "/absen" | "/dashboard" {
  return role === "karyawan" ? "/absen" : "/dashboard";
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- route-access
```

Expected: PASS.

- [ ] **Step 5: Rewrite the landing page**

```tsx
// src/app/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getCurrentEmployee } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/route-access";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (employee) redirect(homePathForRole(employee.role));

  const { tagline } = await getAppSettings();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <BrandMark size="lg" />
        {tagline && <p className="text-sm text-muted-foreground">{tagline}</p>}
        <Button asChild className="w-full">
          <Link href="/login">Masuk</Link>
        </Button>
      </div>
      <AppFooter />
    </main>
  );
}
```

- [ ] **Step 6: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: tsc clean; build compiles; `/` still listed (now `ƒ` — it reads a session).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/route-access.ts src/lib/auth/route-access.test.ts src/app/page.tsx
git commit -m "feat(landing): branded landing page + homePathForRole redirect"
```

---

## Task 3: `(auth)` layout + `Alert` warning variant + login redesign

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Modify: `src/components/ui/alert.tsx`
- Rewrite: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/page.test.tsx`

**Interfaces:**
- Consumes: `<BrandMark>`, `<AppFooter>`, `<Field>`, shadcn `Input`/`Button`/`Alert`, the existing `login` action (`./actions`).
- Produces: `Alert` gains `variant="warning"`.

- [ ] **Step 1: Add the `warning` variant to `ui/alert.tsx`**

In the `alertVariants` `cva` config, alongside `default` and `destructive`:

```tsx
        // PROJECT EDIT: semantic warning variant (used by login "nonaktif" notice).
        warning:
          "border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 [&>svg]:text-amber-600",
```

- [ ] **Step 2: Write the `(auth)` layout**

```tsx
// src/app/(auth)/layout.tsx
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <BrandMark size="lg" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</div>
      </div>
      <AppFooter />
    </main>
  );
}
```

- [ ] **Step 3: Write the failing login page test**

```tsx
// src/app/(auth)/login/page.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({ login: vi.fn() }));

import LoginPage from "./page";

describe("LoginPage", () => {
  it("renders the heading, both inputs, and the submit button", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Masuk" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Kata Sandi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Masuk" })).toBeInTheDocument();
  });

  it("shows the nonaktif notice as an alert", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ reason: "nonaktif" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent(/nonaktif/i);
  });

  it("shows a login error as an alert", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "Email atau kata sandi salah." }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email atau kata sandi salah.");
  });

  it("has no alert when there is no error or reason", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

The `getByRole("alert")` assertions are the real RED→GREEN driver: the current page renders the messages in a bare `<p>` (no `role`), the rewrite uses shadcn `<Alert>` (`role="alert"`).

- [ ] **Step 4: Run to verify it fails**

```bash
npm test -- "login/page.test"
```

Expected: FAIL — the current page renders error/reason messages in a bare `<p>` with no `role`, so the three `getByRole("alert")` / `queryByRole("alert")` cases fail against the old markup. (The heading + input + button cases may pass against the old page — that's fine; the rewrite must keep them passing.) Also add `import "@testing-library/jest-dom"` is global; if `Promise.resolve({})` typing complains, cast to the `searchParams` param type.

- [ ] **Step 5: Rewrite `login/page.tsx`**

```tsx
// src/app/(auth)/login/page.tsx
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Masuk</h1>
        <p className="text-sm text-muted-foreground">Sistem Absensi HR</p>
      </div>

      {reason === "nonaktif" && (
        <Alert variant="warning">
          <AlertDescription>Akun Anda nonaktif. Hubungi HR untuk mengaktifkan kembali.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={login} className="space-y-4">
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-11 text-base" />
        </Field>
        <Field id="password" label="Kata Sandi">
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-11 text-base"
          />
        </Field>
        <Button type="submit" className="h-11 w-full text-base">
          Masuk
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Run + build**

```bash
npm test -- "login/page.test" && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 3 tests pass; tsc clean; build compiles; `/login` listed. Manual: dev-server `/login` renders the branded card + footer in light and (OS-dark, after Task 9) dark.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/layout.tsx" src/components/ui/alert.tsx "src/app/(auth)/login/page.tsx" "src/app/(auth)/login/page.test.tsx"
git commit -m "feat(auth): shared (auth) layout + Alert warning variant + login redesign"
```

---

## Task 4: set-password redesign

**Files:**
- Rewrite: `src/app/(auth)/set-password/page.tsx`, `src/app/(auth)/set-password/set-password-form.tsx`
- Modify: `src/app/(auth)/set-password/set-password-form.test.tsx` (if present; else create)

**Interfaces:**
- Consumes: the `(auth)/layout.tsx` frame (Task 3), `<Field>`, shadcn `Input`/`Button`/`Alert`/`Skeleton`.
- The session-establishment `useEffect` in `page.tsx` is UNCHANGED — only markup/styling.

- [ ] **Step 1: Read the current form + test**

```bash
cat "src/app/(auth)/set-password/set-password-form.tsx"
ls "src/app/(auth)/set-password/"
```

Note the exact validation messages ("Kata sandi minimal 8 karakter.", "Konfirmasi kata sandi tidak cocok.", "Terjadi kesalahan. Coba lagi.") and the `onSubmit` prop signature `(password: string) => Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 2: Write/adjust the failing form test**

```tsx
// src/app/(auth)/set-password/set-password-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetPasswordForm } from "./set-password-form";

describe("SetPasswordForm", () => {
  it("rejects a password under 8 chars", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Kata Sandi"), "short");
    await user.type(screen.getByLabelText("Konfirmasi Kata Sandi"), "short");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(screen.getByText(/minimal 8/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a mismatch", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SetPasswordForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Kata Sandi"), "password123");
    await user.type(screen.getByLabelText("Konfirmasi Kata Sandi"), "password124");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(screen.getByText(/tidak cocok/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit and shows the success state on a valid submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<SetPasswordForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Kata Sandi"), "password123");
    await user.type(screen.getByLabelText("Konfirmasi Kata Sandi"), "password123");
    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(onSubmit).toHaveBeenCalledWith("password123");
    expect(await screen.findByText(/berhasil/i)).toBeInTheDocument();
  });
});
```

Adjust the label strings / button name / success copy to match whatever the current form uses if it differs — but keep three cases (short, mismatch, success).

- [ ] **Step 3: Run to verify it fails**

```bash
npm test -- set-password-form
```

Expected: FAIL on the label/button queries (the current form uses bare `<label>` + `<input>`, not `<Field>`).

- [ ] **Step 4: Rewrite `set-password-form.tsx`**

Keep the exact state machine (`pw`, `confirm`, `error`, `busy`, `done`), the two validation checks, the `< 8` and mismatch messages, the `try/catch` around `onSubmit`, the success (`done`) state. Replace the markup:

```tsx
"use client";

import { useState } from "react";
import { Field } from "@/components/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SubmitResult = { ok: true } | { ok: false; error: string };

export function SetPasswordForm({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<SubmitResult>;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (pw !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(pw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } catch (err) {
      console.error("set-password submit failed", err);
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert>
        <AlertDescription>Kata sandi berhasil disimpan. Mengalihkan…</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field id="pw" label="Kata Sandi">
        <Input
          id="pw"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className="h-11 text-base"
        />
      </Field>
      <Field id="confirm" label="Konfirmasi Kata Sandi">
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="h-11 text-base"
        />
      </Field>
      <Button type="submit" disabled={busy} className="h-11 w-full text-base">
        {busy ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Restyle `set-password/page.tsx`**

Keep the entire `useEffect` session-establishment block and `onSubmit` verbatim. Replace only the returned JSX's outer `<main>`/card (now provided by `(auth)/layout.tsx`) with inner content:

```tsx
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Buat Kata Sandi</h1>
        <p className="text-sm text-muted-foreground">Tetapkan kata sandi untuk akun Anda.</p>
      </div>
      {fatal ? (
        <Alert variant="destructive">
          <AlertDescription>{fatal}</AlertDescription>
        </Alert>
      ) : ready ? (
        <SetPasswordForm onSubmit={onSubmit} />
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <p className="text-sm text-muted-foreground">Memeriksa link…</p>
        </div>
      )}
    </div>
  );
```

Add imports: `Alert`, `AlertDescription` from `@/components/ui/alert`, `Skeleton` from `@/components/ui/skeleton`. Remove the old `<main>` wrapper import/markup.

- [ ] **Step 6: Run + build**

```bash
npm test -- set-password-form && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 3 tests pass; tsc clean; build compiles; `/set-password` listed.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/set-password"
git commit -m "feat(auth): set-password redesign on shadcn primitives"
```

---

## Task 5: AdminShell redesign

**Files:**
- Rewrite: `src/components/admin-shell.tsx`, `src/components/admin-shell.test.tsx`
- Modify: `src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `<BrandMark size="md">`, `<ThemeToggle>`, `<RoleBadge>`, `<SignOutButton>` (Task 1), `<AppFooter>`, shadcn `Sheet`/`DropdownMenu`/`Avatar`/`Button`, `lucide-react`, `homePathForRole` not needed here.
- Produces: `<AdminShell employee={CurrentEmployee} >{children}</AdminShell>` — the prop changes from `role: Role | null` to `employee: CurrentEmployee` (the layout guarantees non-null before rendering).

- [ ] **Step 1: Rewrite `admin-shell.test.tsx`**

```tsx
// src/components/admin-shell.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>tema</button> }));
vi.mock("@/components/sign-out-button", () => ({
  SignOutButton: () => <button>Keluar</button>,
}));
vi.mock("@/components/brand-mark", () => ({ BrandMark: () => <div>Brand</div> }));
vi.mock("@/components/app-footer", () => ({ AppFooter: () => <footer>footer</footer> }));

import { AdminShell } from "./admin-shell";

const emp = (role: "atasan" | "hr_admin" | "super_admin") => ({
  id: "u1", nama: "Budi Santoso", email: "budi@x.id", role, branchId: "b1",
});

describe("AdminShell", () => {
  it("renders the primary nav for super_admin", () => {
    render(<AdminShell employee={emp("super_admin")}><div>content</div></AdminShell>);
    for (const name of ["Dashboard", "Karyawan", "Cuti", "Laporan", "Payroll", "Pengaturan"]) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
  });

  it("hides Payroll + Karyawan from atasan", () => {
    render(<AdminShell employee={emp("atasan")}><div>content</div></AdminShell>);
    expect(screen.queryByRole("link", { name: "Payroll" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Karyawan" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
  });

  it("renders page content and the footer", () => {
    render(<AdminShell employee={emp("hr_admin")}><div>konten admin</div></AdminShell>);
    expect(screen.getByText("konten admin")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
  });

  it("shows the user name + role and a working Keluar item", async () => {
    const user = userEvent.setup();
    render(<AdminShell employee={emp("hr_admin")}><div>content</div></AdminShell>);
    await user.click(screen.getByRole("button", { name: /budi santoso/i }));
    expect(await screen.findByRole("menuitem", { name: /keluar/i })).toBeInTheDocument();
  });

  it("opens the mobile nav sheet", async () => {
    const user = userEvent.setup();
    render(<AdminShell employee={emp("hr_admin")}><div>content</div></AdminShell>);
    await user.click(screen.getByRole("button", { name: /buka menu/i }));
    // sheet renders a second copy of the nav — Dashboard now appears at least twice
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThanOrEqual(2);
  });
});
```

Note: the nav renders in both the desktop `<aside>` and the mobile `<Sheet>` (Radix keeps the `SheetContent` mounted). That's why the tests use `getAllByRole(...).length`. The `atasan` filter must apply to BOTH copies. If keeping both copies mounted doubles every link in the a11y tree and that bothers a later reviewer, an acceptable alternative is `md:hidden` / `hidden md:flex` wrappers plus a single shared `<Nav>` sub-component rendered twice — still two copies, but explicit. Keep it simple: one `<AdminNav role onNavigate?>` component, rendered in the aside and in the sheet.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- admin-shell
```

Expected: FAIL — `employee` prop shape / new structure not present.

- [ ] **Step 3: Write `admin-shell.tsx`**

```tsx
// src/components/admin-shell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { RoleBadge } from "@/components/role-badge";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CurrentEmployee } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/karyawan", label: "Karyawan", Icon: Users, hrAdminOnly: true },
  { href: "/persetujuan-cuti", label: "Cuti", Icon: CalendarCheck },
  { href: "/laporan", label: "Laporan", Icon: BarChart3 },
  { href: "/payroll", label: "Payroll", Icon: Wallet, hrAdminOnly: true },
  { href: "/pengaturan", label: "Pengaturan", Icon: Settings },
] as const;

function AdminNav({
  role,
  onNavigate,
}: {
  role: CurrentEmployee["role"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter(
    (i) => !("hrAdminOnly" in i && i.hrAdminOnly) || role === "hr_admin" || role === "super_admin",
  );
  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ employee }: { employee: CurrentEmployee }) {
  const initials =
    employee.nama
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{employee.nama}</span>
          <RoleBadge role={employee.role} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {employee.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <SignOutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminShell({
  employee,
  children,
}: {
  employee: CurrentEmployee;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="p-4">
          <BrandMark size="md" />
        </div>
        <AdminNav role={employee.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="p-4">
                <BrandMark size="md" />
              </SheetTitle>
              <SheetClose asChild>
                <div>
                  <AdminNav role={employee.role} />
                </div>
              </SheetClose>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu employee={employee} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}
```

Note: `SheetClose asChild` wrapping a `<div>` that contains the nav makes any click inside close the sheet — acceptable (every interactive child is a nav `<Link>`). If Radix warns about `asChild` with a `<div>` having multiple children, drop the `SheetClose` wrapper and instead pass `onNavigate` to `<AdminNav>` that calls a `setOpen(false)` — convert `<Sheet>` to controlled (`open`/`onOpenChange` state). The controlled form is cleaner; use it if the `asChild`+`<div>` form logs a warning.

- [ ] **Step 4: Update `(admin)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { resolveRouteAccess } from "@/lib/auth/route-access";
import { getCurrentEmployee } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  const decision = resolveRouteAccess("/dashboard", employee?.role ?? null);
  if (decision === "redirect-login" || !employee) redirect("/login");
  if (decision === "redirect-employee-home") redirect("/absen");

  return <AdminShell employee={employee}>{children}</AdminShell>;
}
```

Keep the existing explanatory comment block about defense-in-depth.

- [ ] **Step 5: Run + build**

```bash
npm test -- admin-shell && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 5 tests pass; tsc clean; build compiles. If the Sheet/DropdownMenu don't open under jsdom, add the pointer-capture shim to `vitest.setup.ts` (Radix needs it):

```ts
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-shell.tsx src/components/admin-shell.test.tsx "src/app/(admin)/layout.tsx" vitest.setup.ts
git commit -m "feat(shell): AdminShell redesign — branded sidebar, topbar user menu, mobile sheet"
```

---

## Task 6: EmployeeShell redesign

**Files:**
- Rewrite: `src/components/employee-shell.tsx`, `src/components/employee-shell.test.tsx`

**Interfaces:**
- Consumes: `<BrandMark size="sm">`, `<ThemeToggle>`, `<AppFooter>`, `lucide-react`.
- Produces: `<EmployeeShell>{children}</EmployeeShell>` — signature unchanged (no props).

- [ ] **Step 1: Rewrite `employee-shell.test.tsx`**

```tsx
// src/components/employee-shell.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/absen" }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>tema</button> }));
vi.mock("@/components/brand-mark", () => ({ BrandMark: () => <div>Brand</div> }));
vi.mock("@/components/app-footer", () => ({ AppFooter: () => <footer>footer</footer> }));

import { EmployeeShell } from "./employee-shell";

describe("EmployeeShell", () => {
  it("renders exactly the four bottom-nav items", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    for (const name of ["Absen", "Cuti", "Riwayat", "Slip Gaji"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Profil" })).not.toBeInTheDocument();
  });

  it("marks the active item with the primary colour", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    expect(screen.getByRole("link", { name: "Absen" }).className).toContain("text-primary");
  });

  it("gives each nav item a ≥44px touch target", () => {
    render(<EmployeeShell><div>content</div></EmployeeShell>);
    expect(screen.getByRole("link", { name: "Cuti" }).className).toMatch(/min-h-1[1-4]/);
  });

  it("renders the header brand + theme toggle, the content, and the footer", () => {
    render(<EmployeeShell><div>konten halaman</div></EmployeeShell>);
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tema" })).toBeInTheDocument();
    expect(screen.getByText("konten halaman")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- employee-shell
```

Expected: FAIL — "Slip Gaji" not a link name yet / "Profil" still present / no header brand.

- [ ] **Step 3: Write `employee-shell.tsx`**

```tsx
// src/components/employee-shell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, FileText, ListChecks } from "lucide-react";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/absen", label: "Absen", Icon: Clock },
  { href: "/cuti", label: "Cuti", Icon: CalendarDays },
  { href: "/riwayat", label: "Riwayat", Icon: ListChecks },
  { href: "/slip-gaji", label: "Slip Gaji", Icon: FileText },
] as const;

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <BrandMark size="sm" />
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col pb-16">
        <main className="flex-1">{children}</main>
        <AppFooter />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Run + build**

```bash
npm test -- employee-shell && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: 4 tests pass; tsc clean; build compiles.

- [ ] **Step 5: Commit**

```bash
git add src/components/employee-shell.tsx src/components/employee-shell.test.tsx
git commit -m "feat(shell): EmployeeShell redesign — branded header, 4-item bottom nav"
```

---

## Task 7: `fetchLogoDataUrl` helper

**Files:**
- Create: `src/lib/branding/fetch-logo.ts`, `src/lib/branding/fetch-logo.test.ts`

**Interfaces:**
- Produces: `fetchLogoDataUrl(logoUrl: string | null): Promise<string | null>` — `null` for null input or any failure; else `data:<mime>;base64,<...>`.
- Consumed by: Task 8 (both PDF routes).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/branding/fetch-logo.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLogoDataUrl } from "./fetch-logo";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchLogoDataUrl", () => {
  it("returns null for a null input without fetching", async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchLogoDataUrl(null)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns a data URL for a 200 image response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "3" },
      }),
    ) as unknown as typeof fetch;
    const out = await fetchLogoDataUrl("https://cdn.test/logo.png");
    expect(out).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchLogoDataUrl("https://cdn.test/missing.png")).toBeNull();
  });

  it("returns null on an oversized response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(5 * 1024 * 1024) },
      }),
    ) as unknown as typeof fetch;
    expect(await fetchLogoDataUrl("https://cdn.test/huge.png")).toBeNull();
  });

  it("returns null (no throw) when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(await fetchLogoDataUrl("https://cdn.test/logo.png")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- fetch-logo
```

Expected: FAIL — `Cannot find module './fetch-logo'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/branding/fetch-logo.ts

const MAX_BYTES = 1024 * 1024;

/**
 * Fetches an org logo and returns it as a `data:` URL for embedding in a
 * server-rendered PDF. Returns null for a null input or ANY failure (bad
 * status, oversized, timeout, network) — the caller renders the org name only.
 */
export async function fetchLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.error("fetchLogoDataUrl: failed", err);
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- fetch-logo
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/branding/fetch-logo.ts src/lib/branding/fetch-logo.test.ts
git commit -m "feat(branding): fetchLogoDataUrl — logo bytes as a data URL for PDFs"
```

---

## Task 8: PDF headers — payslip + recap

**Files:**
- Modify: `src/components/payslip-document.tsx`, `src/components/recap-document.tsx`
- Create: `src/components/pdf-tree-helper.ts`, `src/components/payslip-document.test.tsx`, `src/components/recap-document.test.tsx`
- Modify: `src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx`, `src/app/(admin)/laporan/pdf/route.tsx`

**Interfaces:**
- Consumes: `fetchLogoDataUrl` (Task 7), `getAppSettings` (SP1).
- Produces: `PayslipDocData` + `RecapDocData` each gain `orgNama: string; orgLogoUrl: string | null`.

- [ ] **Step 1: Write the failing doc tests**

`@react-pdf/renderer`'s output is compressed binary PDF, and its primitives (`Text`, `View`, `Image`) are custom components, not DOM — so `renderToString`/`renderToBuffer` and RTL `render()` are both unusable for asserting header content. Instead, call the component function and walk the returned React element tree. Add a shared tiny test helper.

```tsx
// src/components/pdf-tree-helper.ts
import type { ReactElement } from "react";

/** Flattened visible text of a React element tree (works for @react-pdf too). */
export function treeText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join(" ");
  if (typeof node === "object" && node !== null && "props" in node) {
    return treeText((node as ReactElement).props?.children as unknown);
  }
  return "";
}

/** True if any node in the tree has the given component as its `type`. */
export function treeHasType(node: unknown, type: unknown): boolean {
  if (node == null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((n) => treeHasType(n, type));
  const el = node as ReactElement;
  if (el.type === type) return true;
  return treeHasType(el.props?.children as unknown, type);
}
```

```tsx
// src/components/payslip-document.test.tsx
import { describe, it, expect } from "vitest";
import { Image } from "@react-pdf/renderer";
import { PayslipDocument } from "./payslip-document";
import { treeText, treeHasType } from "./pdf-tree-helper";

const base = {
  nama: "Budi", branchNama: "Kantor Pusat", periodeLabel: "Januari 2026",
  gajiPokok: 5000000, hariKerjaEfektif: 22, gajiHarian: 227272,
  totalPotongan: 100000, gajiAkhir: 4900000,
};

describe("PayslipDocument", () => {
  it("puts the org name in the header", () => {
    const tree = PayslipDocument({ data: { ...base, orgNama: "PT Contoh", orgLogoUrl: null } });
    expect(treeText(tree)).toContain("PT Contoh");
  });

  it("renders no Image when orgLogoUrl is null", () => {
    const tree = PayslipDocument({ data: { ...base, orgNama: "PT Contoh", orgLogoUrl: null } });
    expect(treeHasType(tree, Image)).toBe(false);
  });

  it("renders an Image when orgLogoUrl is set", () => {
    const tree = PayslipDocument({
      data: { ...base, orgNama: "PT Contoh", orgLogoUrl: "data:image/png;base64,AAAA" },
    });
    expect(treeHasType(tree, Image)).toBe(true);
  });
});
```

```tsx
// src/components/recap-document.test.tsx
import { describe, it, expect } from "vitest";
import { RecapDocument } from "./recap-document";
import { treeText } from "./pdf-tree-helper";

describe("RecapDocument", () => {
  it("puts the org name in the header", () => {
    const tree = RecapDocument({
      data: {
        branchNama: "Kantor Pusat", from: "2026-01-01", to: "2026-01-31",
        rows: [], orgNama: "PT Contoh", orgLogoUrl: null,
      },
    });
    expect(treeText(tree)).toContain("PT Contoh");
  });
});
```

Note: `PayslipDocument`/`RecapDocument` are plain function components — calling them directly returns the element tree. The helper file is `pdf-tree-helper.ts` (no `.test.` / `.spec.` in the name) so vitest does not treat it as a test file.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- payslip-document recap-document
```

Expected: FAIL — `orgNama` not in `PayslipDocData`.

- [ ] **Step 3: Update `payslip-document.tsx`**

Add to `PayslipDocData`: `orgNama: string; orgLogoUrl: string | null;`. Add a `header` style and a header `<View>` before the title:

```tsx
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
// ...
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  headerLogo: { width: 28, height: 28, objectFit: "contain" },
  headerName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 16, marginBottom: 4 },
  sub: { color: "#555", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "1px solid #eee" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 8, fontSize: 13 },
});

export function PayslipDocument({ data }: { data: PayslipDocData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {data.orgLogoUrl ? <Image src={data.orgLogoUrl} style={styles.headerLogo} /> : null}
          <Text style={styles.headerName}>{data.orgNama}</Text>
        </View>
        <Text style={styles.title}>Slip Gaji — {data.branchNama}</Text>
        {/* ...rest unchanged... */}
```

- [ ] **Step 4: Update `recap-document.tsx`**

Same: add `orgNama`/`orgLogoUrl` to `RecapDocData`, `Image` import, a `header` style, the header `<View>` before the title.

- [ ] **Step 5: Update `slip-gaji/[payslipId]/pdf/route.tsx`**

```tsx
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { fetchLogoDataUrl } from "@/lib/branding/fetch-logo";
// ...inside GET, before renderToBuffer:
const { namaInstansi, logoUrl } = await getAppSettings();
const orgLogoUrl = await fetchLogoDataUrl(logoUrl);
// ...in the <PayslipDocument data={{ ... }}> object add:
//   orgNama: namaInstansi,
//   orgLogoUrl,
```

- [ ] **Step 6: Update `laporan/pdf/route.tsx`**

Same two lines + `orgNama: namaInstansi, orgLogoUrl` in the `<RecapDocument data={{...}}>` object.

- [ ] **Step 7: Run + build**

```bash
npm test -- payslip-document recap-document && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: doc tests pass; tsc clean; build compiles; both `/…/pdf` routes listed.

- [ ] **Step 8: Commit**

```bash
git add src/components/payslip-document.tsx src/components/recap-document.tsx src/components/pdf-tree-helper.ts src/components/payslip-document.test.tsx src/components/recap-document.test.tsx "src/app/(employee)/slip-gaji/[payslipId]/pdf/route.tsx" "src/app/(admin)/laporan/pdf/route.tsx"
git commit -m "feat(pdf): org logo + name header on payslip and recap PDFs"
```

---

## Task 9: Flip theme to `system` + delete dead legacy tokens

**Files:**
- Modify: `src/components/theme-provider.tsx`, `src/app/globals.css`

**Interfaces:** none produced.

- [ ] **Step 1: Flip the provider**

`src/components/theme-provider.tsx` — replace the forced-light body:

```tsx
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
```

Delete the SP1 "force light until SP2" comment; add: `// SP2 made both shells + entry pages dark-aware, so system theme is safe.`

- [ ] **Step 2: Confirm the dead tokens are unused**

```bash
grep -rn "color-brand\|shadow-card\|radius-card\|radius-control\|color-danger\|color-success" src/ --include=*.tsx --include=*.ts
```

Expected: ZERO hits (SP1 verified this; re-confirm). If any hit appears, STOP — that token is in use; leave it and report.

- [ ] **Step 3: Edit `globals.css`**

In the trailing legacy block, DELETE: the `--color-brand`, `--color-brand-hover`, `--color-brand-soft`, `--color-danger`, `--color-danger-soft`, `--color-success`, `--radius-card`, `--radius-control`, `--shadow-card` declarations AND the entire self-referential `@theme inline { --color-brand: var(--color-brand); ... }` block.

KEEP the `--color-neutral-50..900` declarations. Replace the block comment with:

```css
/* --- Legacy neutral scale. Still referenced by admin/employee page BODIES not
   yet redesigned (SP4/SP5). Delete each var when its last `*-color-neutral-*`
   usage in src/ is gone. Do not add new usages. --- */
```

- [ ] **Step 4: Verify**

```bash
./node_modules/.bin/tsc --noEmit && npm run build && npm test
```

Expected: tsc clean; build compiles (25 routes); all tests green. Manual: OS dark mode → `/dashboard`, `/absen`, `/login` shells render dark; not-yet-redesigned page bodies stay light-styled (expected — SP4/SP5).

- [ ] **Step 5: Commit**

```bash
git add src/components/theme-provider.tsx src/app/globals.css
git commit -m "chore(theme): enable system dark mode + drop unused legacy tokens"
```

---

## Task 10: `Field` hardening

**Files:**
- Modify: `src/components/field.tsx`, `src/components/field.test.tsx`

**Interfaces:** `<Field>` public API unchanged; behaviour with a non-element child and a child that already has `aria-describedby` is now defined.

- [ ] **Step 1: Add failing test cases**

Append to `src/components/field.test.tsx`:

```tsx
  it("renders a non-element child without crashing", () => {
    render(<Field id="s" label="S">just text</Field>);
    expect(screen.getByText("just text")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("merges the child's own aria-describedby with the generated hint id", () => {
    render(
      <Field id="m" label="M" hint="a hint">
        <input id="m" aria-describedby="external-help" />
      </Field>,
    );
    const input = screen.getByLabelText("M");
    expect(input.getAttribute("aria-describedby")).toContain("external-help");
    expect(input.getAttribute("aria-describedby")).toContain("m-hint");
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- field.test
```

Expected: FAIL — `Children.only` throws on the string child; the merge test shows only `m-hint`.

- [ ] **Step 3: Rewrite the enhancement logic in `field.tsx`**

Replace the `Children.only` + `cloneElement` block:

```tsx
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  let enhanced: React.ReactNode = children;
  if (isValidElement(children)) {
    const child = children as React.ReactElement<{
      id?: string;
      "aria-describedby"?: string;
    }>;
    const describedBy = [child.props["aria-describedby"], hintId, errorId]
      .filter(Boolean)
      .join(" ") || undefined;
    enhanced = cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      id: child.props.id ?? id,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy,
    });
  }
```

Remove the `Children` import; keep `cloneElement`, `isValidElement`. The `<Label htmlFor={id}>` stays — for a non-element child there's no control to associate, which is acceptable (callers always pass a control).

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- field.test && ./node_modules/.bin/tsc --noEmit
```

Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/field.tsx src/components/field.test.tsx
git commit -m "fix(design): Field handles non-element children + merges aria-describedby"
```

---

## Task 11: SP1 minor cleanup — badge variant, contrast warning, control sizing

**Files:**
- Modify: `src/components/attendance-status-badge.tsx`
- Modify: `src/app/(admin)/pengaturan/instansi/instansi-form.tsx`, `src/app/(admin)/pengaturan/instansi/instansi-form.test.tsx`
- Modify: `src/components/ui/input.tsx`, `src/components/ui/button.tsx`

**Interfaces:** none changed.

- [ ] **Step 1: `pulang_cepat` → `info` variant**

In `src/components/attendance-status-badge.tsx` `CONFIG`, change `pulang_cepat` from `variant: "warning"` to `variant: "info"` (the `info` variant already exists in `ui/badge.tsx`; icon stays `LogOut`). Also widen the `CONFIG` value type union to include `"info"` if TS complains.

```bash
npm test -- attendance-status-badge
```

Expected: still PASS (no test asserts `pulang_cepat`'s class specifically).

- [ ] **Step 2: Promote the contrast warning in `instansi-form.tsx`**

Currently `accentWarning(hex)` is passed as the `<Field hint=…>` for the `warna_aksen` field (muted, and suppressed when `hexInvalid`). Change: pass NO `hint`; after the color `<Field>` + swatch row, render:

```tsx
{warning && (
  <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
    {warning}
  </p>
)}
```

where `warning` is the already-computed `HEX_RE.test(hex) ? accentWarning(hex) : null`.

Update `instansi-form.test.tsx`: the existing "shows a contrast warning for a low-contrast accent" test asserts `findByText(/kontras rendah/i)` — that still resolves (now in a `role="status"` `<p>`). Add `{ selector: "p" }` or leave as-is if it still matches uniquely. Run:

```bash
npm test -- instansi-form
```

Expected: PASS (the warning is still findable by text).

- [ ] **Step 3: Bump `Input` / `Button` default height**

`src/components/ui/input.tsx` — first read the file to see the actual base classes (radix-nova). Raise the input height to `h-10` and make the base text size `text-base md:text-sm` (readable on mobile, compact on desktop). Add `// PROJECT EDIT: h-10 + text-base base — field-use mobile app; radix-nova's default is too small.`

`src/components/ui/button.tsx` — read the `size` variants. Raise the `default` size to `h-10` and, if that makes it taller than the `lg` size, raise `lg` to `h-11` so the scale stays monotonic (`xs < sm < default < lg`). Leave `icon` / `icon-*` untouched. Add the same `// PROJECT EDIT:` comment. Do NOT change `xs`/`sm` (used for dense table-row actions).

```bash
npm test && ./node_modules/.bin/tsc --noEmit && npm run build
```

Expected: all green; tsc clean; build compiles. (A few component tests that assert on class strings may need the new height — update them to match, don't weaken.)

- [ ] **Step 4: Commit**

```bash
git add src/components/attendance-status-badge.tsx "src/app/(admin)/pengaturan/instansi/instansi-form.tsx" "src/app/(admin)/pengaturan/instansi/instansi-form.test.tsx" src/components/ui/input.tsx src/components/ui/button.tsx
git commit -m "fix(design): pulang_cepat info badge, contrast warning as status line, larger controls"
```

---

## Post-plan verification

```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build
```

Then a dev-server pass (`npm run dev`): in BOTH OS light and dark, load `/`, `/login`, `/set-password` (append a dummy `#` so it shows the "link invalid" state), `/dashboard`, `/karyawan`, `/pengaturan`, `/pengaturan/instansi`, `/absen`, `/cuti`, `/riwayat`, `/slip-gaji` — confirm the shells render correctly, the sign-out works, the theme toggle works, no console errors. Download a payslip PDF and a laporan PDF — confirm the org name (and logo if one is uploaded) is in the header.

Then the final whole-branch review, then `finishing-a-development-branch`.

## SP3 hand-off

- Re-add a `/profil` item to `EmployeeShell`'s `NAV` (icon `User`), and build the route.
- `profile-photos` private bucket + migration + path-RLS (mirror `attendance-photos` 0012); `updateOwnProfile` (phone) + `uploadProfilePhoto` / `removeProfilePhoto` actions; a signed-URL helper; `/profil` page + form.
- Feed the AdminShell `UserMenu` `<Avatar>` a signed photo URL (currently initials-only); add avatars to the admin `/karyawan` list.
