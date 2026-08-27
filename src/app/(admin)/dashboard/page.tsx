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

  // Dashboard visibility follows is_admin_role() (atasan included) — a plain
  // authenticated read, RLS already scopes what each role can see (atasan
  // sees only their team's rows via employees_select's atasan_id clause).
  // Per-branch filtering (a UI to scope hr_admin/super_admin down to one
  // branch) is out of scope for this MVP pass — everyone currently gets the
  // full-org summary that RLS allows them to see.
  const branchId = undefined;
  const summary = await getTodaySummary(db, branchId);
  const currentYearMonth = toJakartaDateOnly(new Date()).slice(0, 7);
  const trend = await getMonthlyTrend(db, currentYearMonth);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Ringkasan kehadiran hari ini.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Hadir" value={summary.hadir} />
        <SummaryCard label="Terlambat" value={summary.terlambat} />
        <SummaryCard label="Alpa" value={summary.alpa} />
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <p className="text-sm font-medium text-neutral-900">Tren Kehadiran Bulan Ini</p>
        <p className="mt-1 text-xs text-neutral-500">Jumlah hadir dan terlambat per hari.</p>
        <div className="mt-4">
          <AttendanceTrendChart data={trend} />
        </div>
      </div>
    </div>
  );
}
