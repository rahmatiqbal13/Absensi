import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PayrollStatusBadge, type PayrollStatus } from "@/components/payroll-status-badge";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResponsiveTable } from "@/components/responsive-table";
import { EmptyState } from "@/components/empty-state";
import { formatRupiah } from "@/lib/format/rupiah";
import { monthLabel } from "@/lib/format/month";
import { CreatePeriodForm } from "./create-period-form";
import { createPayrollPeriod } from "./actions";

export default async function PayrollPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: branches, error: branchErr } = await db
    .from("branches")
    .select("id, nama")
    .order("nama");

  const { data: periods, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, bulan, tahun, status, branches(nama), payslips(gaji_akhir)")
    .order("tahun", { ascending: false })
    .order("bulan", { ascending: false });

  async function createPeriod(formData: FormData) {
    "use server";
    const branchId = String(formData.get("branchId"));
    const bulan = Number(formData.get("bulan"));
    const tahun = Number(formData.get("tahun"));
    if (!branchId || !bulan || !tahun) {
      return { ok: false as const, error: "Cabang, bulan, dan tahun wajib diisi." };
    }
    return createPayrollPeriod(branchId, bulan, tahun);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Buat periode, generate slip gaji, lalu finalisasi."
      />

      <Card>
        <CardHeader>
          <CardTitle>Buat Periode Baru</CardTitle>
        </CardHeader>
        <CardContent>
          {branchErr ? (
            <Alert variant="destructive">
              <AlertDescription>Gagal memuat daftar cabang.</AlertDescription>
            </Alert>
          ) : (
            <CreatePeriodForm branches={branches ?? []} createPeriod={createPeriod} />
          )}
        </CardContent>
      </Card>

      {periodErr ? (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat periode payroll.</AlertDescription>
        </Alert>
      ) : (
        <ResponsiveTable
          columns={[
            {
              key: "periode",
              header: "Periode",
              cell: (p) =>
                `${(p.branches as unknown as { nama: string } | null)?.nama ?? "-"} — ${monthLabel(p.bulan)} ${p.tahun}`,
            },
            {
              key: "slip",
              header: "Slip",
              mobileLabel: "Slip",
              cell: (p) => `${((p.payslips ?? []) as unknown[]).length} slip`,
            },
            {
              key: "total",
              header: "Total",
              align: "right",
              mobileLabel: "Total",
              cell: (p) =>
                formatRupiah(
                  ((p.payslips ?? []) as { gaji_akhir: number }[]).reduce(
                    (sum, s) => sum + Number(s.gaji_akhir),
                    0,
                  ),
                ),
            },
            {
              key: "status",
              header: "Status",
              mobileLabel: "Status",
              cell: (p) => <PayrollStatusBadge status={p.status as PayrollStatus} />,
            },
          ]}
          rows={periods ?? []}
          rowKey={(p) => p.id}
          rowHref={(p) => `/payroll/${p.id}`}
          caption="Daftar periode payroll"
          emptyState={<EmptyState icon={Wallet} message="Belum ada periode payroll." />}
        />
      )}
    </div>
  );
}
