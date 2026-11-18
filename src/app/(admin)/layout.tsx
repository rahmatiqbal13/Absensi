import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { ProductLogo } from "@/components/product-logo";
import { NotificationBell } from "@/components/notification-bell";
import {
  getMyNotifications,
  markMyNotificationsRead,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/notifications/actions";
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
  // Corrections: same rule, minus the viewer's own requests (never decidable by them).
  let correctionQuery = db
    .from("attendance_corrections")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("employee_id", employee.id);
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") {
    correctionQuery = correctionQuery.eq("approver_id", employee.id);
  }
  // Lembur & dinas luar (0058): same rule; a missing table just reads as 0.
  let requestQuery = db
    .from("work_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("employee_id", employee.id);
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") {
    requestQuery = requestQuery.eq("approver_id", employee.id);
  }
  const [
    { count: pendingLeave, error: pendingErr },
    { count: pendingCorrection, error: corrErr },
    { count: pendingRequests },
  ] = await Promise.all([pendingQuery, correctionQuery, requestQuery]);
  if (pendingErr) console.error("admin layout: pending leave count failed", pendingErr);
  if (corrErr) console.error("admin layout: pending correction count failed", corrErr);

  return (
    <AdminShell
      employee={employee}
      avatarUrl={avatarUrl ?? undefined}
      brand={
        <div className="flex flex-col gap-3">
          <ProductLogo size={34} />
          <div className="rounded-[10px] bg-sidebar-accent/70 px-2.5 py-2">
            <BrandMark size="sm" tone="inverse" />
          </div>
        </div>
      }
      footer={<AppFooter />}
      pendingLeave={pendingLeave ?? 0}
      pendingCorrection={pendingCorrection ?? 0}
      pendingRequests={pendingRequests ?? 0}
      notifications={<NotificationBell load={getMyNotifications} markRead={markMyNotificationsRead} push={{ save: savePushSubscription, remove: removePushSubscription }} />}
    >
      {children}
    </AdminShell>
  );
}
