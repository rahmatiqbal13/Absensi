import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { getMonthlyTrend } from "@/lib/dashboard/monthly-trend";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { SummaryCard } from "@/components/summary-card";
import { AttendanceTrendChart } from "@/components/attendance-trend-chart";

export default async function DashboardPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) {
    redirect("/login");
  }

  // Dashboard reads run under is_admin_role(), which migration 0009 widened to
  // INCLUDE the atasan role. employees_select and attendances_select still carry
  // their atasan_id = auth.uid() clause, but is_admin_role() is now a leading
  // disjunct that short-circuits true for atasan, so that clause never narrows —
  // atasan sees ORG-WIDE aggregate counts here, not team-scoped. That is the
  // intended tier for this MVP (a reporting concern, trusted internal role);
  // team-scoping would need a separate atasan_id-filtered query. Per-branch
  // filtering (a UI to scope hr_admin/super_admin down to one branch) is also
  // out of scope for this MVP pass.
  const branchId = undefined;
  const summaryResult = await getTodaySummary(db, branchId);
  const currentYearMonth = toJakartaDateOnly(new Date()).slice(0, 7);
  const trendResult = await getMonthlyTrend(db, currentYearMonth);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Ringkasan kehadiran hari ini.</p>
      </div>
      {summaryResult.ok ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Hadir" value={summaryResult.summary.hadir} />
          <SummaryCard label="Terlambat" value={summaryResult.summary.terlambat} />
          <SummaryCard label="Alpa" value={summaryResult.summary.alpa} />
        </div>
      ) : (
        <p className="text-sm text-red-600">{summaryResult.error}</p>
      )}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <p className="text-sm font-medium text-neutral-900">Tren Kehadiran Bulan Ini</p>
        <p className="mt-1 text-xs text-neutral-500">Jumlah hadir dan terlambat per hari.</p>
        <div className="mt-4">
          {trendResult.ok ? (
            <AttendanceTrendChart data={trendResult.points} />
          ) : (
            <p className="text-sm text-red-600">{trendResult.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
