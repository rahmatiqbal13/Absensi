import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovedOvertime } from "@/lib/payroll/overtime";
import { logOptionalLookup } from "@/lib/supabase/missing-column";

/**
 * Approved lembur windows for these employees and dates, keyed
 * "employeeId|YYYY-MM-DD" (the shape computePayrollForBranch and the reports
 * take). Missing table (pre-0058) or a failed read = no approved lembur.
 */
export async function loadApprovedOvertime(
  db: SupabaseClient,
  employeeIds: readonly string[],
  from: string,
  to: string,
): Promise<Map<string, ApprovedOvertime[]>> {
  const map = new Map<string, ApprovedOvertime[]>();
  if (employeeIds.length === 0) return map;
  const { data, error } = await db
    .from("work_requests")
    .select("employee_id, tanggal_mulai, jam_mulai, jam_selesai")
    .eq("jenis", "lembur")
    .eq("status", "approved")
    .in("employee_id", [...employeeIds])
    .gte("tanggal_mulai", from)
    .lte("tanggal_mulai", to);
  if (error) {
    logOptionalLookup("loadApprovedOvertime", error, "0058");
    return map;
  }
  for (const r of (data ?? []) as { employee_id: string; tanggal_mulai: string; jam_mulai: string; jam_selesai: string }[]) {
    const key = `${r.employee_id}|${r.tanggal_mulai}`;
    map.set(key, [...(map.get(key) ?? []), { jamMulai: r.jam_mulai.slice(0, 5), jamSelesai: r.jam_selesai.slice(0, 5) }]);
  }
  return map;
}
