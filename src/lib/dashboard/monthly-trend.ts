import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESENT_STATUSES } from "@/lib/attendance/status";

export type MonthlyTrendPoint = { date: string; hadir: number; terlambat: number };

export type MonthlyTrendResult =
  | { ok: true; points: MonthlyTrendPoint[] }
  | { ok: false; error: string };

export async function getMonthlyTrend(
  db: SupabaseClient,
  yearMonth: string,
  branchId?: string,
): Promise<MonthlyTrendResult> {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  // `attendances` has no `branch_id` column — it is reachable only via
  // `employees.branch_id`. Branch-scoping mirrors getTodaySummary
  // (src/lib/dashboard/attendance-summary.ts): select the related `employees`
  // row with `!inner` (a real join, so a mismatch excludes the row) and filter
  // on the dotted `employees.branch_id` path.
  const query = branchId
    ? db
        .from("attendances")
        .select("tanggal, status, employees!inner(branch_id)")
        .gte("tanggal", startDate)
        .lte("tanggal", endDate)
        .eq("employees.branch_id", branchId)
    : db
        .from("attendances")
        .select("tanggal, status")
        .gte("tanggal", startDate)
        .lte("tanggal", endDate);

  const { data, error } = await query;

  if (error) {
    console.error("getMonthlyTrend: attendances query failed", error);
    return { ok: false, error: "Gagal memuat tren kehadiran." };
  }

  const byDate = new Map<string, { hadir: number; terlambat: number }>();
  for (const row of (data ?? []) as { tanggal: string; status: string }[]) {
    const entry = byDate.get(row.tanggal) ?? { hadir: 0, terlambat: 0 };
    if (PRESENT_STATUSES.includes(row.status)) entry.hadir += 1;
    if (row.status === "terlambat") entry.terlambat += 1;
    byDate.set(row.tanggal, entry);
  }

  const points = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return { ok: true, points };
}
