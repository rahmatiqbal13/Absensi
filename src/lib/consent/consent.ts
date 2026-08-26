import type { SupabaseClient } from "@supabase/supabase-js";

export const CONSENT_JENIS_LOKASI_FOTO = "lokasi_foto_absensi";
export const CONSENT_POLICY_VERSION = "1.0";

export async function hasActiveConsent(
  db: SupabaseClient,
  employeeId: string,
): Promise<boolean> {
  const { data } = await db
    .from("consents")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("jenis", CONSENT_JENIS_LOKASI_FOTO)
    .limit(1);

  return Boolean(data && data.length > 0);
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
