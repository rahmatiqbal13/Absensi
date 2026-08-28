import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadRecap } from "@/lib/laporan/load-recap";
import { recapToCsv } from "@/lib/laporan/recap-csv";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") {
    return new Response("Tidak diizinkan.", { status: 403 });
  }

  const url = new URL(request.url);
  const cabang = url.searchParams.get("cabang");
  const dari = url.searchParams.get("dari");
  const sampai = url.searchParams.get("sampai");
  const dept = url.searchParams.get("dept");
  if (!cabang || !dari || !sampai) {
    return new Response("Parameter cabang, dari, dan sampai wajib.", { status: 400 });
  }
  // `cabang` is interpolated into a PostgREST `.or(...)` string inside loadRecap,
  // so reject anything that is not shaped like a UUID before it gets there.
  if (!UUID_RE.test(cabang)) {
    return new Response("Cabang tidak valid.", { status: 400 });
  }
  if (!DATE_RE.test(dari) || !DATE_RE.test(sampai)) {
    return new Response("Parameter cabang, dari, dan sampai wajib.", { status: 400 });
  }

  const recap = await loadRecap(db, { branchId: cabang, departmentId: dept, from: dari, to: sampai });
  if (!recap.ok) {
    return new Response(recap.error, { status: 400 });
  }

  return new Response(recapToCsv(recap.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-kehadiran-${dari}_${sampai}.csv"`,
    },
  });
}
