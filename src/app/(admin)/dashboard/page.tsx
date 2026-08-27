import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getTodaySummary } from "@/lib/dashboard/attendance-summary";
import { SummaryCard } from "@/components/summary-card";

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
    </div>
  );
}
