import { recapToXlsx, XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { loadRecapForRequest } from "@/lib/laporan/recap-request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const r = await loadRecapForRequest(request);
  if (!r.ok) return r.response;
  const buffer = await recapToXlsx(r.rows, "Rekap Kehadiran");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="laporan-kehadiran-${r.from}_${r.to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
