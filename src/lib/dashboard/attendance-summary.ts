import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { PRESENT_STATUSES } from "@/lib/attendance/status";
import { getTodayContext, type TodayContext } from "./today-context";

export type AttendanceSummary = {
  hadir: number;
  terlambat: number;
  alpa: number;
  // Rows whose `status` is none of the known buckets (hadir / terlambat /
  // alpa). Kept as its own field so an unexpected value can never silently
  // shrink the alpa figure — see the review's Minor #7.
  other: number;
  total: number;
  // Counts of today's rows with exactly this `status`. These OVERLAP `hadir`
  // (both statuses are in PRESENT_STATUSES) — they are surfaced separately so
  // the dashboard can show a "pulang cepat" / "di luar lokasi" breakdown
  // without changing what `hadir` means.
  pulangCepat: number;
  diLuarLokasi: number;
  // Distinct employees with an `approved` leave_requests row spanning today
  // (branch-scoped when `branchId` is given).
  cuti: number;
};

export type AttendanceSummaryResult =
  | { ok: true; summary: AttendanceSummary }
  | { ok: false; error: string };

export async function getTodaySummary(
  db: SupabaseClient,
  branchId?: string,
  ctx?: TodayContext,
): Promise<AttendanceSummaryResult> {
  const today = toJakartaDateOnly(new Date());

  // Leave + non-working-day context needed to attribute "no attendance row
  // today" correctly for the `alpa` figure (mirrors the precedence in
  // src/lib/laporan/attendance-recap.ts). `hadir`/`terlambat`/`cuti`/etc are
  // unaffected — they come from real rows and the dedicated leave query below.
  let context = ctx;
  if (!context) {
    const ctxRes = await getTodayContext(db, branchId);
    if (!ctxRes.ok) {
      return { ok: false, error: "Gagal memuat data absensi." };
    }
    context = ctxRes.ctx;
  }

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
  // `ctx.onLeave` is already branch-scoped when `branchId` is given. Employees
  // on approved leave today are `cuti`, not `alpa`. When `branchId` is given and
  // that branch is not a working day today, nobody is `alpa`.
  const onLeaveCount = context.onLeave.size;
  const nonWorkingForBranch = branchId
    ? context.workingByBranch.get(branchId) === false
    : false;
  const alpa = nonWorkingForBranch ? 0 : Math.max(alpaRows + noRecord - onLeaveCount, 0);

  const pulangCepat = rows.filter((row) => row.status === "pulang_cepat").length;
  const diLuarLokasi = rows.filter((row) => row.status === "di_luar_lokasi").length;

  // Approved leave that spans today: tanggal_mulai <= today <= tanggal_selesai.
  // `leave_requests` has two FKs to `employees` (`employee_id` and
  // `approver_id`), so the branch-scoped embed needs the explicit
  // `!leave_requests_employee_id_fkey` hint to disambiguate; `!inner` turns it
  // into a filtering join (same pattern as the attendances query above). The
  // unscoped path needs no join at all — just the `employee_id` column.
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

  const { data: leaveRows, error: leaveError } = await leaveQuery;
  if (leaveError) {
    console.error("getTodaySummary: leave_requests query failed", leaveError);
    return { ok: false, error: "Gagal memuat data absensi." };
  }
  const cuti = new Set(
    ((leaveRows ?? []) as { employee_id: string }[]).map((row) => row.employee_id),
  ).size;

  return {
    ok: true,
    summary: { hadir, terlambat, alpa, other, total: totalCount, pulangCepat, diLuarLokasi, cuti },
  };
}
