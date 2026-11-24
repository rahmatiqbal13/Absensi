import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { loadScheduleAssignments, loadSchedules, pickSchedule } from "@/lib/schedule/resolve";

export type TodayContext = {
  today: string;                      // Jakarta YYYY-MM-DD
  /**
   * branch_id -> today is a WORKING, non-holiday day for at least one schedule
   * in that branch (its default or any department's own schedule).
   */
  workingByBranch: Map<string, boolean>;
  /**
   * Active employees whose own schedule (department, else branch default) makes
   * today a non-working day — they are never `alpa` today.
   */
  offToday: Set<string>;
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

  const scheduleQuery = loadSchedules<{ hari_kerja: number[] | null }>(
    db,
    "hari_kerja",
    branchId ? [branchId] : undefined,
  );

  let employeeQuery = db.from("employees").select("id, branch_id, department_id").eq("status", "aktif");
  if (branchId) employeeQuery = employeeQuery.eq("branch_id", branchId);

  // national (branch_id is null) OR the specific branch's holiday for today
  let holidayQuery = db.from("holidays").select("branch_id").eq("tanggal", today);
  if (branchId) holidayQuery = holidayQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`);

  const leaveQuery = branchId
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

  const [schedRes, holRes, leaveRes, empRes] = await Promise.all([
    scheduleQuery,
    holidayQuery,
    leaveQuery,
    employeeQuery,
  ]);
  const err = schedRes.error ?? holRes.error ?? leaveRes.error ?? empRes.error;
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

  const worksToday = (s: { branch_id: string; hari_kerja: number[] | null }) =>
    (s.hari_kerja ?? []).includes(dow) && !nationalHoliday && !branchHoliday.has(s.branch_id);

  const workingByBranch = new Map<string, boolean>();
  for (const s of schedRes.data) {
    workingByBranch.set(s.branch_id, (workingByBranch.get(s.branch_id) ?? false) || worksToday(s));
  }

  // No schedule at all => not "off" (unchanged from the branch-only behaviour).
  const offToday = new Set<string>();
  const todayEmployees = (empRes.data ?? []) as { id: string; branch_id: string; department_id: string | null }[];
  const assigned = await loadScheduleAssignments(db, todayEmployees.map((e) => e.id));
  for (const e of todayEmployees) {
    const schedule = pickSchedule(schedRes.data, e.branch_id, e.department_id, assigned.get(e.id));
    if (schedule && !worksToday(schedule)) offToday.add(e.id);
  }

  const onLeave = new Set(
    (leaveRes.data ?? []).map((r) => r.employee_id as string),
  );

  return { ok: true, ctx: { today, workingByBranch, offToday, onLeave } };
}
