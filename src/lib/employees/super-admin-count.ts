import type { SupabaseClient } from "@supabase/supabase-js";

export async function countActiveSuperAdmins(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "aktif");

  if (error) {
    console.error("countActiveSuperAdmins: query failed", error);
    return 0;
  }
  return count ?? 0;
}
