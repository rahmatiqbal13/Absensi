import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { loadRecap, type LoadRecapResult } from "@/lib/laporan/load-recap";
import { validateRecapRange } from "@/lib/laporan/validate-range";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Shared by the recap downloads (/laporan/csv, /laporan/xlsx): checks the
 * viewer and the ?cabang&dari&sampai&dept params, then loads the recap.
 * An atasan only ever gets their own team (PRD §6).
 */
export async function loadRecapForRequest(
  request: Request,
): Promise<{ ok: true; recap: Extract<LoadRecapResult, { ok: true }>; rows: Extract<LoadRecapResult, { ok: true }>["rows"]; from: string; to: string } | { ok: false; response: Response }> {
  const fail = (body: string, status: number) => ({ ok: false as const, response: new Response(body, { status }) });

  const db = await createServerSupabaseClient();
  const me = await getCurrentEmployee(db);
  if (!me || me.role === "karyawan") return fail("Tidak diizinkan.", 403);

  const url = new URL(request.url);
  const cabang = url.searchParams.get("cabang");
  // `cabang` is interpolated into a PostgREST `.or(...)` string inside loadRecap,
  // so reject anything that is not shaped like a UUID before it gets there.
  if (!cabang || !UUID_RE.test(cabang)) return fail("Cabang tidak valid.", 400);
  const range = validateRecapRange(url.searchParams.get("dari"), url.searchParams.get("sampai"));
  if (!range.ok) return fail(range.error, 400);

  const recap = await loadRecap(db, {
    branchId: cabang,
    departmentId: url.searchParams.get("dept"),
    atasanId: me.role === "atasan" ? me.id : null,
    from: range.from,
    to: range.to,
  });
  if (!recap.ok) return fail(recap.error, 400);
  return { ok: true, recap, rows: recap.rows, from: range.from, to: range.to };
}
