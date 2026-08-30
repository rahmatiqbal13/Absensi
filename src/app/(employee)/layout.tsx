import { AppFooter } from "@/components/app-footer";
import { BrandMark } from "@/components/brand-mark";
import { EmployeeShell } from "@/components/employee-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EmployeeShell brand={<BrandMark size="sm" />} footer={<AppFooter />}>
      {children}
    </EmployeeShell>
  );
}
