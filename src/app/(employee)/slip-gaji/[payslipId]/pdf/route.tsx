import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/format/month";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { fetchLogoDataUrl } from "@/lib/branding/fetch-logo";
import { PayslipDocument } from "@/components/payslip-document";

// @react-pdf/renderer needs Node APIs (fontkit, zlib) — pin the runtime to
// Node explicitly so this can never be moved onto the Edge runtime.
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ payslipId: string }> },
) {
  const { payslipId } = await params;
  const db = await createServerSupabaseClient();

  type PayslipQueryRow = {
    gaji_pokok: number;
    hari_kerja_efektif: number;
    gaji_harian: number;
    total_potongan_absensi: number;
    gaji_akhir: number;
    employees: { nama: string } | null;
    payroll_periods:
      | { bulan: number; tahun: number; branches: { nama: string } | null }
      | null;
  };

  const { data, error } = await db
    .from("payslips")
    .select(
      "gaji_pokok, hari_kerja_efektif, gaji_harian, total_potongan_absensi, gaji_akhir, " +
        "employees(nama), payroll_periods(bulan, tahun, branches(nama))",
    )
    .eq("id", payslipId)
    .maybeSingle();

  if (error) {
    console.error("payslip pdf: lookup failed", error);
    return new Response("Gagal memuat slip gaji.", { status: 500 });
  }
  if (!data) {
    return new Response("Slip gaji tidak ditemukan.", { status: 404 });
  }

  const slip = data as unknown as PayslipQueryRow;
  const period = slip.payroll_periods;

  const { namaInstansi, logoUrl } = await getAppSettings();
  const orgLogoUrl = await fetchLogoDataUrl(logoUrl);

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      <PayslipDocument
        data={{
          nama: (slip.employees as { nama: string } | null)?.nama ?? "-",
          orgNama: namaInstansi,
          orgLogoUrl,
          branchNama: period?.branches?.nama ?? "-",
          periodeLabel: period ? `${monthLabel(period.bulan)} ${period.tahun}` : "-",
          gajiPokok: Number(slip.gaji_pokok),
          hariKerjaEfektif: slip.hari_kerja_efektif,
          gajiHarian: Number(slip.gaji_harian),
          totalPotongan: Number(slip.total_potongan_absensi),
          gajiAkhir: Number(slip.gaji_akhir),
        }}
      />,
    );
  } catch (err) {
    console.error("payslip pdf render failed", err);
    return new Response("Gagal membuat slip gaji.", { status: 500 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="slip-gaji-${payslipId}.pdf"`,
    },
  });
}
