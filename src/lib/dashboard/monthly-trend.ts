import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESENT_STATUSES } from "@/lib/attendance/status";

export type MonthlyTrendPoint = { date: string; hadir: number; terlambat: number };

export type MonthlyTrendResult =
  | { ok: true; points: MonthlyTrendPoint[] }
  | { ok: false; error: string };

export async function getMonthlyTrend(
  db: SupabaseClient,
  yearMonth: string,
): Promise<MonthlyTrendResult> {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await db
    .from("attendances")
    .select("tanggal, status")
    .gte("tanggal", startDate)
    .lte("tanggal", endDate);

  if (error) {
    console.error("getMonthlyTrend: attendances query failed", error);
    return { ok: false, error: "Gagal memuat tren kehadiran." };
  }

  const byDate = new Map<string, { hadir: number; terlambat: number }>();
  for (const row of data ?? []) {
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
