import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true; count: number } | { ok: false; error: string };

export async function getPendingApprovalCount(
  db: SupabaseClient,
  employee: { id: string; role: string },
): Promise<Result> {
  let query = db
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (employee.role !== "hr_admin" && employee.role !== "super_admin") {
    query = query.eq("approver_id", employee.id);
  }
  const { count, error } = await query;
  if (error) {
    console.error("getPendingApprovalCount: query failed", error);
    return { ok: false, error: "Gagal memuat jumlah persetujuan." };
  }
  return { ok: true, count: count ?? 0 };
}
