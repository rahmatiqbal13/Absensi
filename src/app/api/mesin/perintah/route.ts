import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { bridgeAuthorized, recordCommandResult, saveMachineUsers, takeNextCommand } from "@/lib/mesin/commands";
import { extractMachineUsers } from "@/lib/mesin/machine-users";
import { parseBridgeReport, saveBridgeStatus } from "@/lib/mesin/bridge-status";

/**
 * Command channel for the office LAN bridge (scripts/mesin-bridge).
 *
 *   GET  /api/mesin/perintah  → { ok, perintah: { id, cmd_code, params } | null }
 *        The next command for the machine (e.g. GET_USER_ID_LIST from the
 *        "Tarik data pegawai" button). The bridge hands it to the machine on
 *        the machine's next receive_cmd.
 *
 *   POST /api/mesin/perintah  { id, kodeBalasan, hasil, sn }
 *        The machine's answer (send_cmd_result): cmd_return_code + JSON body.
 *   POST /api/mesin/perintah  { pengguna: <realtime_enroll_data JSON>, sn }
 *        A user just enrolled on the machine (PIN + name only).
 *   POST /api/mesin/perintah  { status: { mesinAt, ip, port, mesinIp }, sn }
 *        The bridge's heartbeat, every minute (0066).
 *
 * Authorization: Bearer $MESIN_ABSENSI_TOKEN (same token as /api/mesin/scans).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unauthorized = () => NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!bridgeAuthorized(request.headers.get("authorization"))) return unauthorized();
  try {
    const perintah = await takeNextCommand(createServiceRoleSupabaseClient());
    return NextResponse.json({ ok: true, perintah });
  } catch (e) {
    console.error("api/mesin/perintah GET", e);
    return NextResponse.json({ ok: false, error: "Gagal membaca antrian perintah." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!bridgeAuthorized(request.headers.get("authorization"))) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON." }, { status: 400 });
  }
  const sn = typeof body.sn === "string" && body.sn.length <= 64 ? body.sn : null;
  const db = createServiceRoleSupabaseClient();

  try {
    if ("status" in body) {
      await saveBridgeStatus(db, parseBridgeReport(body.status, sn));
      return NextResponse.json({ ok: true });
    }
    if ("pengguna" in body) {
      const users = extractMachineUsers(body.pengguna);
      await saveMachineUsers(db, users, sn);
      return NextResponse.json({ ok: true, pengguna: users.length });
    }
    const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null;
    if (!id) return NextResponse.json({ ok: false, error: "`id` perintah tidak valid." }, { status: 400 });
    const kodeBalasan = typeof body.kodeBalasan === "string" ? body.kodeBalasan.slice(0, 60) : null;
    const r = await recordCommandResult(db, { id, kodeBalasan, hasil: body.hasil, sn });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, pengguna: r.pengguna });
  } catch (e) {
    console.error("api/mesin/perintah POST", e);
    return NextResponse.json({ ok: false, error: "Gagal menyimpan balasan mesin." }, { status: 500 });
  }
}
