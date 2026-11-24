import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMachineUsers, normalizePin, type MachineUser } from "./machine-users";

/**
 * Commands from the app to the attendance machine, delivered by the office LAN
 * bridge (scripts/mesin-bridge). All functions take the SERVICE-ROLE client.
 *
 *   HR button ─► mesin_commands 'menunggu'
 *   bridge GET /api/mesin/perintah ─► 'diambil' ─► machine (reply to receive_cmd)
 *   machine send_cmd_result ─► bridge POST /api/mesin/perintah ─► 'selesai' / 'gagal'
 *
 * "Tarik data pegawai" = GET_USER_ID_LIST, then (when the list has no names)
 * one GET_USER_INFO per PIN as child commands of the same request.
 */

/** A command older than this is never handed out any more (the UI calls it expired). */
export const COMMAND_TTL_MS = 30 * 60_000;
/** A command taken by the bridge but not answered within this is handed out again. */
const RECLAIM_MS = 3 * 60_000;
const MAX_TRIES = 3;
const MAX_USERS = 1000;
const MAX_HASIL_CHARS = 100_000;

export function bridgeAuthorized(authorization: string | null): boolean {
  const secret = process.env.MESIN_ABSENSI_TOKEN;
  if (!secret || secret.length < 24) return false;
  const given = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type BridgeCommand = { id: string; cmd_code: string; params: Record<string, unknown> };

/** Hands the bridge the oldest command still to be delivered, or null. */
export async function takeNextCommand(db: SupabaseClient): Promise<BridgeCommand | null> {
  const now = Date.now();
  const { data, error } = await db
    .from("mesin_commands")
    .select("id, cmd_code, params, status, percobaan")
    .gt("created_at", new Date(now - COMMAND_TTL_MS).toISOString())
    .or(`status.eq.menunggu,and(status.eq.diambil,diambil_at.lt.${new Date(now - RECLAIM_MS).toISOString()},percobaan.lt.${MAX_TRIES})`)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`mesin_commands select: ${error.message}`);
  const row = data?.[0] as (BridgeCommand & { status: string; percobaan: number }) | undefined;
  if (!row) return null;
  const { data: claimed, error: upErr } = await db
    .from("mesin_commands")
    .update({ status: "diambil", diambil_at: new Date(now).toISOString(), percobaan: row.percobaan + 1 })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id");
  if (upErr) throw new Error(`mesin_commands claim: ${upErr.message}`);
  if (!claimed?.length) return null; // taken concurrently; the bridge asks again
  return { id: row.id, cmd_code: row.cmd_code, params: row.params ?? {} };
}

/** Stores PIN + name as the machine knows them. A reply without a name never erases a known one. */
export async function saveMachineUsers(db: SupabaseClient, users: MachineUser[], sn: string | null): Promise<void> {
  const list = users.slice(0, MAX_USERS);
  const named = list.filter((u) => u.nama);
  const unnamed = list.filter((u) => !u.nama);
  const now = new Date().toISOString();
  if (named.length) {
    const { error } = await db
      .from("mesin_users")
      .upsert(named.map((u) => ({ pin: u.pin, nama: u.nama, sn, diperbarui_at: now })), { onConflict: "pin" });
    if (error) throw new Error(`mesin_users upsert: ${error.message}`);
  }
  if (unnamed.length) {
    const { error } = await db
      .from("mesin_users")
      .upsert(unnamed.map((u) => ({ pin: u.pin, sn, diperbarui_at: now })), { onConflict: "pin", ignoreDuplicates: true });
    if (error) throw new Error(`mesin_users insert: ${error.message}`);
  }
}

const isOk = (code: string | null) => code == null || code === "" || /^(OK|SUCCESS|0)$/i.test(code);

function trimHasil(hasil: unknown): unknown {
  try {
    const s = JSON.stringify(hasil ?? null);
    return s.length <= MAX_HASIL_CHARS ? hasil ?? null : { terpotong: true, awal: s.slice(0, 2000) };
  } catch {
    return null;
  }
}

/** Records the machine's answer to a command and queues follow-ups. */
export async function recordCommandResult(
  db: SupabaseClient,
  input: { id: string; kodeBalasan: string | null; hasil: unknown; sn: string | null },
): Promise<{ ok: true; pengguna: number } | { ok: false; error: string; status: number }> {
  const { data: cmd, error } = await db
    .from("mesin_commands")
    .select("id, cmd_code, params, status, induk_id, diminta_oleh")
    .eq("id", input.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!cmd) return { ok: false, error: "Perintah tidak dikenal.", status: 404 };

  const ok = isOk(input.kodeBalasan);
  await db
    .from("mesin_commands")
    .update({
      status: ok ? "selesai" : "gagal",
      kode_balasan: input.kodeBalasan,
      hasil: trimHasil(input.hasil),
      selesai_at: new Date().toISOString(),
    })
    .eq("id", cmd.id);

  const rootId: string = cmd.induk_id ?? cmd.id;
  const users = ok ? extractMachineUsers(input.hasil) : [];
  if (users.length) await saveMachineUsers(db, users, input.sn);

  if (cmd.cmd_code === "GET_USER_ID_LIST" && ok) {
    // The list carries no names on most firmwares: ask for each user.
    const pins = users.filter((u) => !u.nama).map((u) => u.pin).slice(0, MAX_USERS);
    if (pins.length) {
      const { error: insErr } = await db.from("mesin_commands").insert(
        pins.map((pin) => ({ cmd_code: "GET_USER_INFO", params: { user_id: pin }, induk_id: rootId, diminta_oleh: cmd.diminta_oleh })),
      );
      if (insErr) return { ok: false, error: insErr.message, status: 500 };
    }
  }

  if (cmd.cmd_code === "GET_USER_INFO") {
    const params = (cmd.params ?? {}) as Record<string, unknown>;
    if (!ok && "user_id" in params) {
      // Firmware that rejects { user_id } (the R6 variant) wants { usersId: [...] }.
      const pin = normalizePin(params.user_id);
      if (pin) {
        await db
          .from("mesin_commands")
          .insert({ cmd_code: "GET_USER_INFO", params: { usersId: [pin] }, induk_id: rootId, diminta_oleh: cmd.diminta_oleh });
      }
    } else if (users.length > 1) {
      // This firmware returned every user at once: the per-PIN questions still waiting are moot.
      await db
        .from("mesin_commands")
        .update({ status: "selesai", kode_balasan: "DILEWATI", selesai_at: new Date().toISOString() })
        .eq("induk_id", rootId)
        .eq("cmd_code", "GET_USER_INFO")
        .eq("status", "menunggu");
    }
  }

  return { ok: true, pengguna: users.length };
}
