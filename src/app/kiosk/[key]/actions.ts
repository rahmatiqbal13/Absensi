"use server";

import QRCode from "qrcode";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { qrToken, windowRemainingMs } from "@/lib/attendance/qr-token";

type KioskResult =
  | { ok: true; dataUrl: string; remainingMs: number }
  | { ok: false };

export async function getKioskQr(key: string): Promise<KioskResult> {
  if (!key) return { ok: false };

  const db = createServiceRoleSupabaseClient();
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
