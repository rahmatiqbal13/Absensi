import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/supabase/missing-column";

export const CONSENT_JENIS_LOKASI_FOTO = "lokasi_foto_absensi";
export const CONSENT_POLICY_VERSION = "1.0";

export async function hasActiveConsent(
  db: SupabaseClient,
  employeeId: string,
): Promise<boolean> {
  const query = (withdrawalAware: boolean) => {
    let q = db
      .from("consents")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("jenis", CONSENT_JENIS_LOKASI_FOTO);
    // Withdrawn consents (0054) don't count.
    if (withdrawalAware) q = q.is("dicabut_at", null);
    return q.limit(1);
  };

  let { data, error } = await query(true);
  // Before migration 0054 there is no dicabut_at: never block clock-in over it.
  if (error && isMissingColumn(error)) ({ data, error } = await query(false));

  if (error) {
    console.error(
      `Failed to check consent for employee ${employeeId}:`,
      error.message,
    );
  }

  return Boolean(data && data.length > 0);
}

/** Withdraws the caller's own location/photo consent (UU PDP). */
export async function withdrawConsent(db: SupabaseClient): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc("withdraw_my_consent", { p_jenis: CONSENT_JENIS_LOKASI_FOTO });
  if (error) {
    console.error("withdrawConsent: rpc failed", error);
    return { ok: false, error: "Gagal menarik persetujuan. Coba lagi." };
  }
  return { ok: true };
}

export async function recordConsent(
  db: SupabaseClient,
  employeeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db
    .from("consents")
    .insert({
      employee_id: employeeId,
      jenis: CONSENT_JENIS_LOKASI_FOTO,
      versi_kebijakan: CONSENT_POLICY_VERSION,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
