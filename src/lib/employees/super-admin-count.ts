import type { SupabaseClient } from "@supabase/supabase-js";

// Returns the number of active super_admin employees, or `null` if the count
// could not be determined (query error). Callers must treat `null` as
// "unknown" — NOT as zero — so a transient failure never surfaces as a false
// "0 Super Admin aktif" alarm.
export async function countActiveSuperAdmins(db: SupabaseClient): Promise<number | null> {
  const { count, error } = await db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "aktif");

  if (error) {
    console.error("countActiveSuperAdmins: query failed", error);
    return null;
  }
  return count ?? 0;
}
