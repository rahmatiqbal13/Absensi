import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PRESENT_STATUSES } from "@/lib/attendance/status";

export type AttendanceSummary = {
  hadir: number;
  terlambat: number;
  alpa: number;
  // Rows whose `status` is none of the known buckets (hadir / terlambat /
  // alpa). Kept as its own field so an unexpected value can never silently
  // shrink the alpa figure — see the review's Minor #7.
  other: number;
  total: number;
};

export type AttendanceSummaryResult =
  | { ok: true; summary: AttendanceSummary }
  | { ok: false; error: string };

export async function getTodaySummary(
  db: SupabaseClient,
  branchId?: string,
): Promise<AttendanceSummaryResult> {
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

  const { data: attendanceRows, error: attendanceError } = await attendanceQuery;
  if (attendanceError) {
    console.error("getTodaySummary: attendances query failed", attendanceError);
    return { ok: false, error: "Gagal memuat data absensi." };
  }

  let employeeQuery = db
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("status", "aktif");
  if (branchId) {
    employeeQuery = employeeQuery.eq("branch_id", branchId);
  }
  const { count: total, error: employeeError } = await employeeQuery;
  if (employeeError) {
    console.error("getTodaySummary: employees count query failed", employeeError);
    return { ok: false, error: "Gagal memuat data absensi." };
  }

  const rows = (attendanceRows ?? []) as { status: string }[];
  const totalCount = total ?? 0;

  // Explicit bucketing: every row is attributed to exactly one bucket by its
  // actual status value. `alpa` = employees with an explicit `alpa` row PLUS
  // employees with no attendance row at all today. `other` catches any
  // unexpected status so it cannot leak into `alpa`.
  const hadir = rows.filter((row) => PRESENT_STATUSES.includes(row.status)).length;
  const terlambat = rows.filter((row) => row.status === "terlambat").length;
  const alpaRows = rows.filter((row) => row.status === "alpa").length;
  const other = rows.length - hadir - terlambat - alpaRows;
  const noRecord = Math.max(totalCount - rows.length, 0);
  const alpa = alpaRows + noRecord;

  return { ok: true, summary: { hadir, terlambat, alpa, other, total: totalCount } };
}
