"use server";

import QRCode from "qrcode";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { qrToken, windowRemainingMs } from "@/lib/attendance/qr-token";
import { clientIp, withinRateLimit } from "@/lib/security/rate-limit";

// Login-less endpoint: cap lookups per IP so kiosk keys can't be guessed by
// brute force. A kiosk screen refreshes about twice a minute (every 5 s while
// failing), so this leaves room for several screens behind one office IP.
const KIOSK_RATE_LIMIT = { max: 120, windowSeconds: 5 * 60 };

type KioskResult =
  | { ok: true; dataUrl: string; remainingMs: number }
  | { ok: false };

export async function getKioskQr(key: string): Promise<KioskResult> {
  if (!key) return { ok: false };

  const db = createServiceRoleSupabaseClient();
  const allowed = await withinRateLimit(db, [{ key: `kiosk:ip:${await clientIp()}`, ...KIOSK_RATE_LIMIT }]);
  // Thrown, not { ok: false }: the display treats a throw as transient and
  // keeps retrying instead of switching the screen to "inactive".
  if (!allowed) throw new Error("rate limited");

  const { data: branch, error } = await db
    .from("branches")
    .select("id, qr_enabled, qr_secret")
    .eq("kiosk_key", key)
    .maybeSingle();

  if (error) console.error("getKioskQr: branch lookup failed", error);
  if (error || !branch || !branch.qr_enabled || !branch.qr_secret) return { ok: false };

  const payload = `${branch.id}|${qrToken(branch.qr_secret)}`;
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 512 });
  return { ok: true, dataUrl, remainingMs: windowRemainingMs() };
}
