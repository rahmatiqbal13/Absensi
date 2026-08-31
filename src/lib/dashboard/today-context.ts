import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

export type TodayContext = {
  today: string;                      // Jakarta YYYY-MM-DD
  /** branch_id -> today is a WORKING, non-holiday day for that branch */
  workingByBranch: Map<string, boolean>;
  /** employee_id set with an approved leave request spanning today */
  onLeave: Set<string>;
};

type Result = { ok: true; ctx: TodayContext } | { ok: false; error: string };

/**
 * Reference data the dashboard needs to attribute "no attendance row today"
 * correctly: per-branch working-day status (work_schedules.hari_kerja minus
 * holidays) and the set of employees on approved leave today. Mirrors the
 * precedence in src/lib/laporan/attendance-recap.ts.
 *
 * `branchId` given => only that branch is loaded into workingByBranch and
 * onLeave is branch-scoped. Undefined => all branches / org-wide leave.
 */
export async function getTodayContext(
  db: SupabaseClient,
  branchId?: string,
): Promise<Result> {
  const today = toJakartaDateOnly(new Date());
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();

  let scheduleQuery = db.from("work_schedules").select("branch_id, hari_kerja");
  if (branchId) scheduleQuery = scheduleQuery.eq("branch_id", branchId);

  // national (branch_id is null) OR the specific branch's holiday for today
  let holidayQuery = db.from("holidays").select("branch_id").eq("tanggal", today);
  if (branchId) holidayQuery = holidayQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`);

  let leaveQuery = branchId
    ? db
        .from("leave_requests")
        .select("employee_id, employees!leave_requests_employee_id_fkey!inner(branch_id)")
        .eq("status", "approved")
        .lte("tanggal_mulai", today)
        .gte("tanggal_selesai", today)
        .eq("employees.branch_id", branchId)
    : db
        .from("leave_requests")
        .select("employee_id")
        .eq("status", "approved")
        .lte("tanggal_mulai", today)
        .gte("tanggal_selesai", today);

  const [schedRes, holRes, leaveRes] = await Promise.all([scheduleQuery, holidayQuery, leaveQuery]);
  const err = schedRes.error ?? holRes.error ?? leaveRes.error;
  if (err) {
    console.error("getTodayContext: query failed", err);
    return { ok: false, error: "Gagal memuat konteks hari ini." };
  }

  // A branch with a national holiday today is non-working regardless of hari_kerja.
  // holidays rows with branch_id === null apply to every branch.
  const nationalHoliday = (holRes.data ?? []).some((h) => h.branch_id === null);
  const branchHoliday = new Set(
    (holRes.data ?? []).map((h) => h.branch_id as string | null).filter((b): b is string => b !== null),
  );

  const workingByBranch = new Map<string, boolean>();
  for (const s of schedRes.data ?? []) {
    const bid = s.branch_id as string;
    const hariKerja = (s.hari_kerja as number[] | null) ?? [];
    const isWorkingDow = hariKerja.includes(dow);
    workingByBranch.set(bid, isWorkingDow && !nationalHoliday && !branchHoliday.has(bid));
  }

  const onLeave = new Set(
    (leaveRes.data ?? []).map((r) => r.employee_id as string),
  );

  return { ok: true, ctx: { today, workingByBranch, onLeave } };
}
