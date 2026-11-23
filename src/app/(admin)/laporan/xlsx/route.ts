import { XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { attendanceToXlsx } from "@/lib/export/attendance-xlsx";
import { loadRecapForRequest } from "@/lib/laporan/recap-request";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { printedAt } from "@/components/employee-daily-pdf";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const r = await loadRecapForRequest(request);
  if (!r.ok) return r.response;
  const { namaInstansi, alamat } = await getAppSettings();
  const now = new Date();
  const buffer = await attendanceToXlsx({
    org: { nama: namaInstansi, alamat },
    branchNama: r.recap.branchNama,
    from: r.from,
    to: r.to,
    dicetak: printedAt(now),
    hariIni: toJakartaDateOnly(now),
    rows: r.recap.rows,
    daily: r.recap.daily,
    jadwal: r.recap.jadwal,
    jabatan: r.recap.jabatan,
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="laporan-kehadiran-${r.from}_${r.to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
