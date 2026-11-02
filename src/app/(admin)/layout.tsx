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

  // Same visibility rule as the /persetujuan-cuti inbox: HR sees every pending
  // request, an atasan only the ones routed to them. head:true = count only.
  let pendingQuery = db
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") {
    pendingQuery = pendingQuery.eq("approver_id", employee.id);
  }
  const { count: pendingLeave, error: pendingErr } = await pendingQuery;
  if (pendingErr) console.error("admin layout: pending leave count failed", pendingErr);

  return (
    <AdminShell
      employee={employee}
      avatarUrl={avatarUrl ?? undefined}
      brand={<BrandMark size="md" tone="inverse" />}
      footer={<AppFooter />}
      pendingLeave={pendingLeave ?? 0}
    >
      {children}
    </AdminShell>
  );
}
