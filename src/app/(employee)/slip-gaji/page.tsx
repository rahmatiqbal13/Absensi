import Link from "next/link";
import { paths } from "@/lib/routing/paths";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { isMagang } from "@/lib/employees/contracts";
import { formatRupiah } from "@/lib/format/rupiah";
import { monthLabel } from "@/lib/format/month";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { ChevronRight, Download, ReceiptText } from "lucide-react";

export default async function SlipGajiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  // Interns have no payroll (status magang).
  if (isMagang(employee.statusKontrak)) redirect("/absen");

  // Only finalized periods are visible to the employee. The !inner join turns
  // the embed into a real join so the status filter excludes non-final rows,
  // matching the employees!inner pattern used in the dashboard summary.
  const { data, error } = await db
    .from("payslips")
    .select("id, gaji_akhir, total_potongan_absensi, payroll_periods!inner(bulan, tahun, status)")
    .eq("employee_id", employee.id)
    .eq("payroll_periods.status", "final");

  if (error) {
    console.error("slip-gaji: payslips query failed", error);
  }

  // Sort by period, newest first. `created_at` is unusable here: generate_payroll
  // deletes + reinserts payslip rows on every regenerate, so a regenerated older
  // period would jump to the top. PostgREST `referencedTable` ordering only sorts
  // the embedded rows, not the parent, so sort the (small) result set in JS.
  const rows = [...(data ?? [])].sort((a, b) => {
    const pa = a.payroll_periods as unknown as { bulan: number; tahun: number };
    const pb = b.payroll_periods as unknown as { bulan: number; tahun: number };
    return pb.tahun - pa.tahun || pb.bulan - pa.bulan;
  });

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pt-8">
      <h1 className="text-2xl font-semibold text-foreground">Slip Gaji</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Gagal memuat slip gaji.</AlertDescription>
        </Alert>
      )}
      {!error && rows.length === 0 && (
        <EmptyState icon={ReceiptText} message="Belum ada slip gaji yang difinalisasi." />
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((s) => {
            const p = s.payroll_periods as unknown as { bulan: number; tahun: number };
            const potongan = Number(s.total_potongan_absensi ?? 0);
            const periode = `${monthLabel(p.bulan)} ${p.tahun}`;
            return (
              <li key={s.id} className="flex items-center gap-2 border-t border-border">
                <Link
                  href={paths.slipGaji(p.bulan, p.tahun)}
                  className="flex min-h-19 min-w-0 flex-1 items-center justify-between gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[1.05rem] font-semibold text-foreground">{periode}</span>
                    <span className="text-sm text-muted-foreground">
                      Final · {potongan > 0 ? `potongan ${formatRupiah(potongan)}` : "tanpa potongan"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[0.95rem] font-semibold tabular-nums">
                    {formatRupiah(Number(s.gaji_akhir))}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </Link>
                <a
                  href={paths.slipGajiPdf(p.bulan, p.tahun)}
                  aria-label={`Unduh PDF ${periode}`}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Download className="size-5" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
