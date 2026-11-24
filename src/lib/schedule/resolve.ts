import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which work schedule applies to an employee (the shift roster, 0059, still
 * overrides per date on top of this):
 *
 *   1. their own jadwal khusus  — employees.work_schedule_id → a named row (0065)
 *   2. their department's schedule (0034)
 *   3. the branch default (department_id null, no name)
 */
export type ScheduleScope = { branch_id: string; department_id: string | null; id?: string; nama?: string | null };

export function pickSchedule<T extends ScheduleScope>(
  rows: readonly T[],
  branchId: string,
  departmentId: string | null | undefined,
  /** The employee's jadwal khusus (employees.work_schedule_id), if any. */
  scheduleId?: string | null,
): T | null {
  if (scheduleId) {
    const own = rows.find((r) => r.id === scheduleId && r.branch_id === branchId);
    if (own) return own;
  }
  if (departmentId) {
    const dept = rows.find((r) => r.department_id === departmentId && r.branch_id === branchId);
    if (dept) return dept;
  }
  return rows.find((r) => r.branch_id === branchId && r.department_id === null && !r.nama) ?? null;
}

// PostgREST surfaces Postgres' undefined_column as code 42703.
const UNDEFINED_COLUMN = "42703";

const withCols = (columns: string, extra: string[]) => {
  const have = new Set(columns.split(",").map((c) => c.trim()).filter(Boolean));
  return [...have, ...extra.filter((c) => !have.has(c))].join(", ");
};

/**
 * Loads schedule rows (`columns` plus id/branch_id/department_id/nama) for the
 * given branches, or every branch when `branchIds` is omitted.
 *
 * Migration-tolerant, newest first: without 0065 there is no `nama` (no jadwal
 * khusus yet); before 0034 no department_id either, so every row is a branch
 * default. Clock-in must keep working while code and migration are deployed
 * out of step.
 */
export async function loadSchedules<T extends object>(
  db: SupabaseClient,
  columns: string,
  branchIds?: readonly string[],
): Promise<{ data: (T & ScheduleScope)[]; error: { message: string } | null }> {
  const run = (cols: string) => {
    let q = db.from("work_schedules").select(cols);
    if (branchIds) q = q.in("branch_id", [...branchIds]);
    return q;
  };

  const res = await run(withCols(columns, ["id", "branch_id", "department_id", "nama"]));
  if (!res.error) return { data: (res.data ?? []) as unknown as (T & ScheduleScope)[], error: null };
  if (res.error.code !== UNDEFINED_COLUMN) return { data: [], error: res.error };

  const pre0065 = await run(withCols(columns, ["id", "branch_id", "department_id"]));
  if (!pre0065.error) return { data: (pre0065.data ?? []) as unknown as (T & ScheduleScope)[], error: null };
  if (pre0065.error.code !== UNDEFINED_COLUMN) return { data: [], error: pre0065.error };

  const legacy = await run(withCols(columns, ["id", "branch_id"]));
  if (legacy.error) return { data: [], error: legacy.error };
  const rows = (legacy.data ?? []) as unknown as (T & { branch_id: string })[];
  return { data: rows.map((r) => ({ ...r, department_id: null })), error: null };
}

/**
 * employee id → their jadwal khusus id, for employees that have one. Before
 * migration 0065 the column does not exist and everyone simply has none.
 */
export async function loadScheduleAssignments(
  db: SupabaseClient,
  employeeIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(employeeIds)].filter(Boolean);
  // Fail soft: an unreadable assignment means "no jadwal khusus", never a
  // blocked clock-in or report.
  try {
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db
        .from("employees")
        .select("id, work_schedule_id")
        .in("id", ids.slice(i, i + 300))
        .not("work_schedule_id", "is", null);
      if (error) {
        if (error.code !== UNDEFINED_COLUMN) console.error("loadScheduleAssignments: lookup failed", error);
        return out;
      }
      for (const r of (data ?? []) as { id: string; work_schedule_id: string }[]) out.set(r.id, r.work_schedule_id);
    }
  } catch (e) {
    console.error("loadScheduleAssignments: lookup threw", e);
  }
  return out;
}

/** The one schedule that applies to an employee, or null when none is set. */
export async function loadEmployeeSchedule<T extends object>(
  db: SupabaseClient,
  columns: string,
  branchId: string,
  departmentId: string | null | undefined,
  /** Pass it so the employee's own jadwal khusus (0065) is honoured. */
  employeeId?: string | null,
): Promise<{ data: (T & ScheduleScope) | null; error: { message: string } | null }> {
  const [res, assigned] = await Promise.all([
    loadSchedules<T>(db, columns, [branchId]),
    employeeId ? loadScheduleAssignments(db, [employeeId]) : Promise.resolve(new Map<string, string>()),
  ]);
  if (res.error) return { data: null, error: res.error };
  return { data: pickSchedule(res.data, branchId, departmentId, employeeId ? assigned.get(employeeId) : null), error: null };
}
