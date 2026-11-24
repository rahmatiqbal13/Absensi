import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { applyMachineScans } from "@/lib/mesin/apply-scans";
import { wibToIso } from "@/lib/mesin/parse-log";
import { bridgeAuthorized } from "@/lib/mesin/commands";

/**
 * Receives scans from the office LAN bridge (scripts/mesin-bridge), which
 * reads them off the attendance machine and POSTs them here:
 *
 *   POST /api/mesin/scans
 *   Authorization: Bearer $MESIN_ABSENSI_TOKEN
 *   { "sn": "FIO66205020150", "scans": [{ "pin": "8", "waktu": "2026-08-01 07:07:48" }] }
 *
 * `waktu` is the machine's wall clock (WIB). Idempotent: re-sending scans
 * already received changes nothing, so the bridge may retry freely.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCANS = 5000;
const PIN_RE = /^[0-9A-Za-z]{1,20}$/;
const WAKTU_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/;

export async function POST(request: NextRequest) {
  if (!bridgeAuthorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON." }, { status: 400 });
  }
  const { sn, scans } = (body ?? {}) as { sn?: unknown; scans?: unknown };
  if (!Array.isArray(scans)) return NextResponse.json({ ok: false, error: "`scans` harus array." }, { status: 400 });
  if (scans.length > MAX_SCANS) {
    return NextResponse.json({ ok: false, error: `Maks ${MAX_SCANS} scan per kiriman.` }, { status: 413 });
  }
  const serial = typeof sn === "string" && sn.length <= 64 ? sn : null;

  const valid: { pin: string; waktu: string; sn: string | null }[] = [];
  const invalid: number[] = [];
  scans.forEach((s, i) => {
    const pin = String((s as { pin?: unknown })?.pin ?? "").trim().replace(/^0+(?=\d)/, "");
    const m = WAKTU_RE.exec(String((s as { waktu?: unknown })?.waktu ?? "").trim());
    const waktu = m ? wibToIso(m[1], m[2]) : "";
    if (!PIN_RE.test(pin) || !m || Number.isNaN(Date.parse(waktu))) invalid.push(i);
    else valid.push({ pin, waktu, sn: serial });
  });

  const res = await applyMachineScans(createServiceRoleSupabaseClient(), valid, {
    sumber: "jaringan",
    actorId: null,
    dryRun: false,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json({
    ok: true,
    diterima: valid.length,
    tidakValid: invalid,
    scanBaru: res.scanBaru,
    hariDitulis: res.ditulis,
    pinBelumTerdaftar: res.unmapped.map((u) => u.pin),
  });
}
