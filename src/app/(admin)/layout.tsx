import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { resolveRouteAccess } from "@/lib/auth/route-access";
import { getCurrentEmployee } from "@/lib/auth/session";
import { signProfilePhotoUrl } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Defense in depth. src/proxy.ts already performs this check, but Next's own
  // docs are explicit that proxy/middleware is an optimistic check and "should
  // not be used as a full session management or authorization solution"
  // (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
  //
  // A layout has no reliable pathname, but this one wraps EVERY (admin) route
  // and they all share the same access rule, so any admin prefix is a faithful
  // stand-in -- resolveRouteAccess stays the single source of the rule.
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  const decision = resolveRouteAccess("/dashboard", employee?.role ?? null);
  if (decision === "redirect-login" || !employee) redirect("/login");
  if (decision === "redirect-employee-home") redirect("/absen");

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
