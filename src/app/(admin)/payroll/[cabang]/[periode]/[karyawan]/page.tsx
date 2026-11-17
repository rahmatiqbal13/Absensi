import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadPayslipDetail } from "@/lib/payroll/payslip-detail";
import { PayslipSheet } from "@/components/payslip-sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function AdminSlipPage({
  params,
}: {
  params: Promise<{ periodId: string; payslipId: string }>;
}) {
  const { periodId, payslipId } = await params;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const res = await loadPayslipDetail(db, employee, payslipId);
  if (!res.ok && res.status === 404) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href={`/payroll/${periodId}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text"
      >
        <ChevronLeft className="size-4" /> Kembali ke periode
      </Link>
      {res.ok ? (
        <PayslipSheet slip={res.slip} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{res.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
