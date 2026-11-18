import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { EmployeeShell } from "@/components/employee-shell";
import { NotificationBell } from "@/components/notification-bell";
import { getMyNotifications, markMyNotificationsRead } from "@/lib/notifications/actions";
import { getCurrentEmployee } from "@/lib/auth/session";
import { isMagang } from "@/lib/employees/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Cached per request: the page below resolves the same employee.
  const employee = await getCurrentEmployee(await createServerSupabaseClient());
  return (
    <EmployeeShell
      brand={<BrandMark size="sm" />}
      footer={<AppFooter />}
      notifications={<NotificationBell load={getMyNotifications} markRead={markMyNotificationsRead} />}
      hideSlipGaji={isMagang(employee?.statusKontrak)}
      adminHref={employee && employee.role !== "karyawan" ? "/dashboard" : undefined}
    >
      {children}
    </EmployeeShell>
  );
}
