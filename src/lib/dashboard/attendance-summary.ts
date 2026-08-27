import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

export type AttendanceSummary = {
  hadir: number;
  terlambat: number;
  alpa: number;
  total: number;
};

const PRESENT_STATUSES = ["tepat_waktu", "pulang_cepat", "di_luar_lokasi"];

export async function getTodaySummary(
  db: SupabaseClient,
  branchId?: string,
): Promise<AttendanceSummary> {
  const today = toJakartaDateOnly(new Date());

  // `attendances` has no `branch_id` column of its own — it only carries
  // `employee_id` (see supabase/migrations/0002_attendance_leave.sql); the
  // branch is reachable only via `employees.branch_id`. Filtering with a
  // plain `.eq("branch_id", branchId)` on `attendances` would silently do
  // nothing useful (or error), because that column doesn't exist there.
  // Branch-scoping instead uses PostgREST's embedded-resource filter
  // syntax: select the related `employees` row with `!inner` (which turns
  // the embed into an actual join, so the filter below excludes
  // non-matching rows instead of just attaching null on a mismatch) and
  // filter on the dotted `employees.branch_id` path. `attendances
  // .employee_id` carries exactly one foreign key to `employees` — unlike
  // `leave_requests`, which has two (`employee_id` and `approver_id`) and
  // therefore needs an explicit `!leave_requests_employee_id_fkey` hint to
  // disambiguate — so no such hint is needed here.
  const attendanceQuery = branchId
    ? db
        .from("attendances")
        .select("status, employees!inner(branch_id)")
        .eq("tanggal", today)
        .eq("employees.branch_id", branchId)
    : db.from("attendances").select("status").eq("tanggal", today);

  const { data: attendanceRows } = await attendanceQuery;

  let employeeQuery = db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "aktif");
  if (branchId) {
    employeeQuery = employeeQuery.eq("branch_id", branchId);
  }
  const { count: total } = await employeeQuery;

  const rows = (attendanceRows ?? []) as { status: string }[];
  const hadir = rows.filter((row) => PRESENT_STATUSES.includes(row.status)).length;
  const terlambat = rows.filter((row) => row.status === "terlambat").length;
  const totalCount = total ?? 0;
  const alpa = Math.max(totalCount - rows.length, 0);

  return { hadir, terlambat, alpa, total: totalCount };
}
