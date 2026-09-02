import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/format/rupiah";
import { monthLabel } from "@/lib/format/month";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Download, ReceiptText } from "lucide-react";

export default async function SlipGajiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");

  // Only finalized periods are visible to the employee. The !inner join turns
  // the embed into a real join so the status filter excludes non-final rows,
  // matching the employees!inner pattern used in the dashboard summary.
  const { data, error } = await db
    .from("payslips")
    .select("id, gaji_akhir, payroll_periods!inner(bulan, tahun, status)")
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
        <ul className="divide-y divide-border">
          {rows.map((s) => {
            const p = s.payroll_periods as unknown as { bulan: number; tahun: number };
            return (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {monthLabel(p.bulan)} {p.tahun}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatRupiah(Number(s.gaji_akhir))}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <a href={`/slip-gaji/${s.id}/pdf`}>
                    <Download className="size-4" /> Unduh PDF
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
