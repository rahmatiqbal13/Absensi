import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationJenis = "lupa_absen" | "slip_gaji" | "kontrak";

export type NewNotification = {
  employee_id: string;
  jenis: NotificationJenis;
  /** Idempotency key per (employee, jenis): the date, or the payroll period id. */
  kunci: string;
  judul: string;
  isi: string;
  link: string | null;
};

/**
 * Inserts notifications, skipping any (employee, jenis, kunci) that already
 * exists — so a retried or overlapping run never duplicates one. `service`
 * must be the service-role client (employees can't insert). Returns how many
 * were actually created.
 */
export async function createNotifications(
  service: SupabaseClient,
  rows: readonly NewNotification[],
): Promise<{ ok: true; created: number } | { ok: false }> {
  if (rows.length === 0) return { ok: true, created: 0 };
  const { data, error } = await service
    .from("notifications")
    .upsert([...rows], { onConflict: "employee_id,jenis,kunci", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("createNotifications: insert failed", rows[0].jenis, error);
    return { ok: false };
  }
  return { ok: true, created: data?.length ?? 0 };
}
