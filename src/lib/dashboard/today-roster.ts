import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";
import { getTodayContext, type TodayContext } from "./today-context";

/** One exclusive bucket per person, in board order. */
export const ROSTER_BUCKETS = ["tepat", "terlambat", "pulangCepat", "diLuarLokasi", "alpa", "cuti"] as const;
export type RosterBucket = (typeof ROSTER_BUCKETS)[number];

export type RosterPerson = {
  employeeId: string;
  nama: string;
  bucket: RosterBucket;
  /** ISO timestamp of clock-in, null when not clocked in. */
  jamMasuk: string | null;
  /** True when there is no attendance row at all (vs an explicit `alpa` row). */
  belumAbsen: boolean;
};

export type RosterBranch = { branchId: string; nama: string; people: RosterPerson[] };

type Result = { ok: true; branches: RosterBranch[] } | { ok: false; error: string };

const ERROR = "Gagal memuat papan kehadiran.";

/**
 * Today's attendance per named employee, grouped by branch, for the dashboard
 * board. Uses the same precedence as today-exceptions / attendance-recap:
 * non-working branch or own day off => not on the board; approved leave =>
 * cuti; no row or `alpa` row => alpa; otherwise the row's status.
 */
export async function getTodayRoster(
  db: SupabaseClient,
  branchId?: string,
  ctx?: TodayContext,
  /** Limit to these employees (an atasan's team, PRD §6). */
  employeeIds?: string[],
): Promise<Result> {
  if (employeeIds && employeeIds.length === 0) return { ok: true, branches: [] };

  let context = ctx;
  if (!context) {
    const res = await getTodayContext(db, branchId);
    if (!res.ok) return { ok: false, error: ERROR };
    context = res.ctx;
  }

  const today = toJakartaDateOnly(new Date());
  let employeeQuery = db
    .from("employees")
    .select("id, nama, branch_id, branches(nama)")
    .eq("status", "aktif")
    .order("nama");
  if (branchId) employeeQuery = employeeQuery.eq("branch_id", branchId);
  if (employeeIds) employeeQuery = employeeQuery.in("id", employeeIds);

  let attendanceQuery = db
    .from("attendances")
    .select("employee_id, status, jam_masuk")
    .eq("tanggal", today);
  if (employeeIds) attendanceQuery = attendanceQuery.in("employee_id", employeeIds);

  const [employeesRes, attendancesRes] = await Promise.all([employeeQuery, attendanceQuery]);
  const err = employeesRes.error ?? attendancesRes.error;
  if (err) {
    console.error("getTodayRoster: query failed", err);
    return { ok: false, error: ERROR };
  }

  const att = new Map<string, { status: string; jam_masuk: string | null }>();
  for (const a of (attendancesRes.data ?? []) as { employee_id: string; status: string; jam_masuk: string | null }[]) {
    att.set(a.employee_id, a);
  }

  const groups = new Map<string, RosterBranch>();
  for (const e of (employeesRes.data ?? []) as unknown as {
    id: string;
    nama: string;
    branch_id: string;
    branches: { nama: string } | null;
  }[]) {
    if (context.workingByBranch.get(e.branch_id) === false) continue;
    if (context.offToday.has(e.id) && !context.onLeave.has(e.id)) continue;

    const row = att.get(e.id);
    let bucket: RosterBucket;
    if (context.onLeave.has(e.id)) bucket = "cuti";
    else if (!row || row.status === "alpa") bucket = "alpa";
    else if (row.status === "terlambat") bucket = "terlambat";
    else if (row.status === "pulang_cepat") bucket = "pulangCepat";
    else if (row.status === "di_luar_lokasi") bucket = "diLuarLokasi";
    else bucket = "tepat";

    let g = groups.get(e.branch_id);
    if (!g) {
      g = { branchId: e.branch_id, nama: e.branches?.nama ?? "-", people: [] };
      groups.set(e.branch_id, g);
    }
    g.people.push({
      employeeId: e.id,
      nama: e.nama,
      bucket,
      jamMasuk: bucket === "cuti" ? null : (row?.jam_masuk ?? null),
      belumAbsen: bucket === "alpa" && !row,
    });
  }

  const order = (b: RosterBucket) => ROSTER_BUCKETS.indexOf(b);
  const branches = [...groups.values()].sort((a, b) => a.nama.localeCompare(b.nama));
  for (const g of branches) {
    g.people.sort(
      (a, b) =>
        order(a.bucket) - order(b.bucket) ||
        (a.jamMasuk ?? "").localeCompare(b.jamMasuk ?? "") ||
        a.nama.localeCompare(b.nama),
    );
  }
  return { ok: true, branches };
}
