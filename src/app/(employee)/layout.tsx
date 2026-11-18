import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { EmployeeShell } from "@/components/employee-shell";
import { NotificationBell } from "@/components/notification-bell";
import { getMyNotifications, markMyNotificationsRead } from "@/lib/notifications/actions";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EmployeeShell brand={<BrandMark size="sm" />} footer={<AppFooter />} notifications={<NotificationBell load={getMyNotifications} markRead={markMyNotificationsRead} />}>
      {children}
    </EmployeeShell>
  );
}
