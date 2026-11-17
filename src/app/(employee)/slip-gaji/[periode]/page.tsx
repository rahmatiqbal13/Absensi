import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadPayslipDetail } from "@/lib/payroll/payslip-detail";
import { PayslipSheet } from "@/components/payslip-sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function SlipGajiDetailPage({ params }: { params: Promise<{ payslipId: string }> }) {
  const { payslipId } = await params;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  const res = await loadPayslipDetail(db, employee, payslipId);
  if (!res.ok && res.status === 404) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pt-6">
      <Link href="/slip-gaji" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text">
        <ChevronLeft className="size-4" /> Semua slip gaji
      </Link>
      {res.ok ? (
        <PayslipSheet slip={res.slip} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{res.error}</AlertDescription>
        </Alert>
      )}
    </main>
  );
}
