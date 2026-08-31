import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { EmployeeShell } from "@/components/employee-shell";
import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { resolveRouteAccess } from "@/lib/auth/route-access";
import { getCurrentEmployee } from "@/lib/auth/session";
import { signProfilePhotoUrl } from "@/lib/profile/photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  // Same derivation (admin)/layout.tsx uses: a role that isn't bounced from
  // /dashboard to the employee home gets the admin shell (karyawan ->
  // "redirect-employee-home"; atasan / hr_admin / super_admin -> "allow").
  const isAdmin =
    resolveRouteAccess("/dashboard", employee.role) !== "redirect-employee-home";

  if (isAdmin) {
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

  return (
    <EmployeeShell brand={<BrandMark size="sm" />} footer={<AppFooter />}>
      {children}
    </EmployeeShell>
  );
}
