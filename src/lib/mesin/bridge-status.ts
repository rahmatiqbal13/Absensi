import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Heartbeat of the office LAN bridge (scripts/mesin-bridge, migration 0066).
 * The bridge reports every minute when the machine last talked to it and its
 * own LAN address — the Server IP the machine must be set to. Scans alone
 * can't tell this: a quiet hour has no scans even when everything is fine,
 * while the machine asks the bridge for commands all the time.
 */
export type BridgeStatusRow = {
  bridge_at: string;
  mesin_at: string | null;
  bridge_ip: string | null;
  port: number | null;
  mesin_ip: string | null;
};

/** The bridge reports every 60 s; three missed reports = it is down. */
export const BRIDGE_STALE_MS = 3 * 60_000;
/** The machine asks for commands every few seconds while connected. */
export const MESIN_STALE_MS = 10 * 60_000;

export type BridgeHealth =
  | { state: "tidak_diketahui" }
  | { state: "bridge_mati"; sejak: string }
  | { state: "mesin_putus"; sejak: string | null; ip: string | null; port: number | null }
  | { state: "terhubung"; mesinAt: string; ip: string | null; port: number | null };

export function bridgeHealth(row: BridgeStatusRow | null, now: Date = new Date()): BridgeHealth {
  if (!row) return { state: "tidak_diketahui" };
  const t = now.getTime();
  if (t - Date.parse(row.bridge_at) > BRIDGE_STALE_MS) return { state: "bridge_mati", sejak: row.bridge_at };
  if (!row.mesin_at || t - Date.parse(row.mesin_at) > MESIN_STALE_MS) {
    return { state: "mesin_putus", sejak: row.mesin_at, ip: row.bridge_ip, port: row.port };
  }
  return { state: "terhubung", mesinAt: row.mesin_at, ip: row.bridge_ip, port: row.port };
}

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;
const iso = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 40) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/** Validates the bridge's report ({ mesinAt, ip, port, mesinIp }); bad fields become null. */
export function parseBridgeReport(input: unknown, sn: string | null, now: Date = new Date()) {
  const r = (input ?? {}) as Record<string, unknown>;
  const port = Number(r.port);
  const mesinAt = iso(r.mesinAt);
  return {
    id: "utama",
    bridge_at: now.toISOString(),
    // A clock running ahead on the bridge PC must not mark the machine connected forever.
    mesin_at: mesinAt && Date.parse(mesinAt) <= now.getTime() + 60_000 ? mesinAt : null,
    bridge_ip: typeof r.ip === "string" && IP_RE.test(r.ip) ? r.ip : null,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : null,
    mesin_ip: typeof r.mesinIp === "string" && IP_RE.test(r.mesinIp) ? r.mesinIp : null,
    sn,
  };
}

export async function saveBridgeStatus(db: SupabaseClient, row: ReturnType<typeof parseBridgeReport>): Promise<void> {
  const { error } = await db.from("mesin_bridge_status").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`mesin_bridge_status upsert: ${error.message}`);
}
