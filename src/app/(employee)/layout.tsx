import { EmployeeShell } from "@/components/employee-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <EmployeeShell>{children}</EmployeeShell>;
}
