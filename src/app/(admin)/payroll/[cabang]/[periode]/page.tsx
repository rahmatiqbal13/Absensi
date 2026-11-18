import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { FileSpreadsheet } from "lucide-react";
import { PayrollStatusBadge, payrollDisplayStatus } from "@/components/payroll-status-badge";
import { Button } from "@/components/ui/button";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { RincianHarianEntry } from "@/lib/payroll/deduction";
import { monthLabel } from "@/lib/format/month";
import { PayslipTable, type PayslipView } from "./payslip-table";
import { generatePayroll, finalizePayroll, setPayrollPaid } from "../../actions";
import { PaymentPanel } from "./payment-panel";
import { paths, payrollPeriodId } from "@/lib/routing/paths";

export default async function PayrollPeriodPage({
  params,
}: {
  params: Promise<{ cabang: string; periode: string }>;
}) {
  const { cabang, periode } = await params;
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") redirect("/dashboard");

  const resolvedId = await payrollPeriodId(db, cabang, periode);
  if (!resolvedId) notFound();
  const periodId: string = resolvedId;

  const { data: period, error: periodErr } = await db
    .from("payroll_periods")
    .select("id, bulan, tahun, status, dibayar_pada, branches(nama, slug)")
    .eq("id", periodId)
    .maybeSingle();
  if (periodErr) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Gagal memuat periode payroll.</AlertDescription>
      </Alert>
    );
  }
  if (!period) notFound();

  const { data: slips, error: slipErr } = await db
    .from("payslips")
    .select(
      "id, gaji_pokok, hari_kerja_efektif, total_potongan_absensi, upah_lembur, tarif_pph21, potongan_pph21, gaji_akhir, rincian_harian, employees(nama, slug)",
    )
    .eq("payroll_period_id", periodId)
    .order("created_at", { ascending: true });

  const rows: PayslipView[] = slipErr
    ? []
    : (slips ?? []).map((s) => ({
        id: s.id,
        nama: (s.employees as unknown as { nama: string } | null)?.nama ?? "-",
        employeeSlug: (s.employees as unknown as { slug: string } | null)?.slug ?? "",
        gajiPokok: Number(s.gaji_pokok),
        hariKerjaEfektif: s.hari_kerja_efektif,
        totalPotongan: Number(s.total_potongan_absensi),
        upahLembur: Number(s.upah_lembur ?? 0),
        tarifPph21: Number(s.tarif_pph21 ?? 0),
        potonganPph21: Number(s.potongan_pph21 ?? 0),
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
  async function onSetPaid(tanggal: string | null) {
    "use server";
    return setPayrollPaid(periodId, tanggal);
  }

  const periodPath = paths.payrollPeriod({ branchSlug: cabang, bulan: period.bulan, tahun: period.tahun });
  const displayStatus = payrollDisplayStatus(period.status, period.dibayar_pada);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payroll"
        title={`${(period.branches as unknown as { nama: string } | null)?.nama ?? "-"} — ${monthLabel(period.bulan)} ${period.tahun}`}
        description="Slip gaji periode ini."
        actions={
          <>
            {rows.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <a href={`${periodPath}/xlsx`}>
                  <FileSpreadsheet className="size-4" aria-hidden="true" /> Unduh Excel
                </a>
              </Button>
            )}
            <PayrollStatusBadge status={displayStatus} />
          </>
        }
      />

      <PayrollSteps step={displayStatus === "dibayar" ? 4 : period.status === "final" ? 3 : rows.length > 0 ? 2 : 1} />

      {period.status === "final" && (
        <PaymentPanel
          dibayarPada={period.dibayar_pada}
          today={toJakartaDateOnly(new Date())}
          onSetPaid={onSetPaid}
        />
      )}

      {slipErr && (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat slip gaji.</AlertDescription>
        </Alert>
      )}

      <PayslipTable
        periodPath={periodPath}
        rows={rows}
        status={period.status as "draft" | "final"}
        onGenerate={onGenerate}
        onFinalize={onFinalize}
      />
    </div>
  );
}

const STEPS = ["Buat periode", "Generate slip", "Finalisasi", "Dibayar"];

function PayrollSteps({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label="Tahapan payroll" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {STEPS.map((label, i) => {
        const done = i < step;
        return (
          <li
            key={label}
            aria-current={i === step - 1 ? "step" : undefined}
            className="flex flex-col gap-2"
          >
            <span className={done ? "h-1 rounded-sm bg-primary" : "h-1 rounded-sm bg-secondary"} />
            <span className={done ? "text-[0.8rem] font-semibold" : "text-[0.8rem] font-semibold text-muted-foreground"}>
              <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> · {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
