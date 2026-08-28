import { renderToBuffer } from "@react-pdf/renderer";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadRecap } from "@/lib/laporan/load-recap";
import { RecapDocument } from "@/components/recap-document";

// @react-pdf/renderer needs Node APIs (fontkit, zlib) — pin the runtime to
// Node explicitly so this can never be moved onto the Edge runtime.
export const runtime = "nodejs";

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

  try {
    const buffer = await renderToBuffer(
      <RecapDocument data={{ branchNama: recap.branchNama, from: dari, to: sampai, rows: recap.rows }} />,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="laporan-kehadiran-${dari}_${sampai}.pdf"`,
      },
    });
  } catch (err) {
    console.error("laporan pdf render failed", err);
    return new Response("Gagal membuat PDF laporan.", { status: 500 });
  }
}
