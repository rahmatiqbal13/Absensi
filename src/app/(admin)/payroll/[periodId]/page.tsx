import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PayrollStatusBadge, type PayrollStatus } from "@/components/payroll-status-badge";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { monthLabel } from "@/lib/format/month";
import { PayslipTable, type PayslipView } from "./payslip-table";
import { generatePayroll, finalizePayroll } from "../actions";

export default async function PayrollPeriodPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const { data: period, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, bulan, tahun, status, branches(nama)")
    .eq("id", periodId)
    .maybeSingle();
  if (periodErr) {
    return <p className="text-sm text-red-600">Gagal memuat periode payroll.</p>;
  }
  if (!period) notFound();

  const { data: slips, error: slipErr } = await db
    .from("payslips")
    .select(
      "id, gaji_pokok, hari_kerja_efektif, total_potongan_absensi, gaji_akhir, rincian_harian, employees(nama)",
    )
    .eq("payroll_period_id", periodId)
    .order("created_at", { ascending: true });

  const rows: PayslipView[] = slipErr
    ? []
    : (slips ?? []).map((s) => ({
        id: s.id,
        nama: (s.employees as unknown as { nama: string } | null)?.nama ?? "-",
        gajiPokok: Number(s.gaji_pokok),
        hariKerjaEfektif: s.hari_kerja_efektif,
        totalPotongan: Number(s.total_potongan_absensi),
        gajiAkhir: Number(s.gaji_akhir),
        rincian: (s.rincian_harian ?? []) as RincianHarianEntry[],
      }));

  async function onGenerate() {
    "use server";
    return generatePayroll(periodId);
  }
  async function onFinalize() {
    "use server";
    return finalizePayroll(periodId);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {(period.branches as unknown as { nama: string } | null)?.nama ?? "-"} — {monthLabel(period.bulan)}{" "}
            {period.tahun}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Slip gaji periode ini.</p>
        </div>
        <PayrollStatusBadge status={period.status as PayrollStatus} />
      </div>

      {slipErr && <p className="text-sm text-red-600">Gagal memuat slip gaji.</p>}

      <PayslipTable
        rows={rows}
        status={period.status as "draft" | "final"}
        onGenerate={onGenerate}
        onFinalize={onFinalize}
      />
    </div>
  );
}
