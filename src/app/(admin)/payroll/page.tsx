import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { PayrollStatusBadge, type PayrollStatus } from "@/components/payroll-status-badge";
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
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Payroll</h1>
        <p className="mt-1 text-sm text-neutral-500">Buat periode, generate slip gaji, lalu finalisasi.</p>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-900">Buat Periode Baru</h2>
        {branchErr ? (
          <p className="text-sm text-red-600">Gagal memuat daftar cabang.</p>
        ) : (
          <CreatePeriodForm branches={branches ?? []} createPeriod={createPeriod} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-900">Periode</h2>
        {periodErr && <p className="text-sm text-red-600">Gagal memuat periode payroll.</p>}
        {!periodErr && (!periods || periods.length === 0) && (
          <p className="text-sm text-neutral-500">Belum ada periode payroll.</p>
        )}
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {(periods ?? []).map((p) => {
            const total = ((p.payslips ?? []) as { gaji_akhir: number }[]).reduce(
              (sum, s) => sum + Number(s.gaji_akhir),
              0,
            );
            const count = ((p.payslips ?? []) as unknown[]).length;
            return (
              <li key={p.id} className="flex items-center justify-between gap-4 p-4">
                <Link href={`/payroll/${p.id}`} className="flex-1 text-sm font-medium text-blue-700 hover:underline">
                  {(p.branches as unknown as { nama: string } | null)?.nama ?? "-"} — {monthLabel(p.bulan)} {p.tahun}
                </Link>
                <span className="text-sm text-neutral-500">{count} slip · {formatRupiah(total)}</span>
                <PayrollStatusBadge status={p.status as PayrollStatus} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
