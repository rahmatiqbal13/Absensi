import type { SupabaseClient } from "@supabase/supabase-js";

export type MonthlyTrendPoint = { date: string; hadir: number; terlambat: number };

const PRESENT_STATUSES = ["tepat_waktu", "pulang_cepat", "di_luar_lokasi"];

export async function getMonthlyTrend(
  db: SupabaseClient,
  yearMonth: string,
): Promise<MonthlyTrendPoint[]> {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  const { data } = await db
    .from("attendances")
    .select("tanggal, status")
    .gte("tanggal", startDate)
    .lte("tanggal", endDate);

  const byDate = new Map<string, { hadir: number; terlambat: number }>();
  for (const row of data ?? []) {
    const entry = byDate.get(row.tanggal) ?? { hadir: 0, terlambat: 0 };
    if (PRESENT_STATUSES.includes(row.status)) entry.hadir += 1;
    if (row.status === "terlambat") entry.terlambat += 1;
    byDate.set(row.tanggal, entry);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}
