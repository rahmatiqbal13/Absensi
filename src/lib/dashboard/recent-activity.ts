import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityRow = { id: string; aksi: string; actorNama: string; waktu: string };
type Result = { ok: true; rows: ActivityRow[] } | { ok: false; error: string };

export async function getRecentActivity(db: SupabaseClient): Promise<Result> {
  const { data, error } = await db
    .from("audit_logs")
    .select("id, aksi, waktu, actor:employees!audit_logs_actor_id_fkey(nama)")
    .order("waktu", { ascending: false })
    .limit(10);
  if (error) {
    console.error("getRecentActivity: query failed", error);
    return { ok: false, error: "Gagal memuat aktivitas." };
  }
  const rows: ActivityRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    aksi: r.aksi as string,
    waktu: r.waktu as string,
    actorNama:
      ((r.actor as unknown as { nama: string } | null)?.nama) ?? "Sistem",
  }));
  return { ok: true, rows };
}
