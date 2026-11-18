import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { payrollToXlsx, XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { monthLabel } from "@/lib/format/month";
import { payrollPeriodId } from "@/lib/routing/paths";

export const runtime = "nodejs";

/** /payroll/<cabang>/<YYYY-MM>/xlsx — the period's payslips as a spreadsheet (HR only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cabang: string; periode: string }> },
) {
  const { cabang, periode } = await params;
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me) return new Response("Silakan masuk terlebih dahulu.", { status: 401 });
  if (me.role !== "hr_admin" && me.role !== "super_admin") return new Response("Tidak diizinkan.", { status: 403 });

  const periodId = await payrollPeriodId(db, cabang, periode);
  if (!periodId) return new Response("Periode payroll tidak ditemukan.", { status: 404 });

  const [{ data: period }, { data: slips, error }] = await Promise.all([
    db.from("payroll_periods").select("bulan, tahun").eq("id", periodId).single(),
    db
      .from("payslips")
      .select(
        "gaji_pokok, hari_kerja_efektif, upah_lembur, total_potongan_absensi, potongan_pph21, gaji_akhir, employees(nama, jabatan)",
      )
      .eq("payroll_period_id", periodId),
  ]);
  if (error || !period) {
    console.error("payroll xlsx: load failed", error);
    return new Response("Gagal memuat slip gaji.", { status: 500 });
  }

  const rows = (slips ?? [])
    .map((s) => {
      const emp = s.employees as unknown as { nama: string; jabatan: string | null } | null;
      return {
        nama: emp?.nama ?? "-",
        jabatan: emp?.jabatan ?? null,
        gajiPokok: Number(s.gaji_pokok),
        hariKerjaEfektif: s.hari_kerja_efektif,
        upahLembur: Number(s.upah_lembur ?? 0),
        totalPotongan: Number(s.total_potongan_absensi),
        potonganPph21: Number(s.potongan_pph21 ?? 0),
        gajiAkhir: Number(s.gaji_akhir),
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  const buffer = await payrollToXlsx(rows, `${monthLabel(period.bulan)} ${period.tahun}`);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="payroll-${cabang}-${periode}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
