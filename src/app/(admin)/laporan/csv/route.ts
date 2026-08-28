import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadRecap } from "@/lib/laporan/load-recap";
import { recapToCsv } from "@/lib/laporan/recap-csv";
import { validateRecapRange } from "@/lib/laporan/validate-range";

const UUID_RE = /^[0-9a-f-]{36}$/i;

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
  // `cabang` is interpolated into a PostgREST `.or(...)` string inside loadRecap,
  // so reject anything that is not shaped like a UUID before it gets there.
  if (!cabang || !UUID_RE.test(cabang)) {
    return new Response("Cabang tidak valid.", { status: 400 });
  }
  const range = validateRecapRange(dari, sampai);
  if (!range.ok) {
    return new Response(range.error, { status: 400 });
  }

  const recap = await loadRecap(db, {
    branchId: cabang,
    departmentId: dept,
    from: range.from,
    to: range.to,
  });
  if (!recap.ok) {
    return new Response(recap.error, { status: 400 });
  }

  return new Response(recapToCsv(recap.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-kehadiran-${range.from}_${range.to}.csv"`,
    },
  });
}
