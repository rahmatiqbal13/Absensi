import { recapToCsv } from "@/lib/laporan/recap-csv";
import { loadRecapForRequest } from "@/lib/laporan/recap-request";

export async function GET(request: Request) {
  const r = await loadRecapForRequest(request);
  if (!r.ok) return r.response;
  return new Response(recapToCsv(r.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-kehadiran-${r.from}_${r.to}.csv"`,
    },
  });
}
