import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Work schedules are one default per branch (department_id null) plus an
 * optional override per department (migration 0034). An employee follows their
 * department's schedule when it has one, otherwise their branch's default.
 */
export type ScheduleScope = { branch_id: string; department_id: string | null };

export function pickSchedule<T extends ScheduleScope>(
  rows: readonly T[],
  branchId: string,
  departmentId: string | null | undefined,
): T | null {
  if (departmentId) {
    const own = rows.find((r) => r.department_id === departmentId && r.branch_id === branchId);
    if (own) return own;
  }
  return rows.find((r) => r.branch_id === branchId && r.department_id === null) ?? null;
}

// PostgREST surfaces Postgres' undefined_column as code 42703.
const UNDEFINED_COLUMN = "42703";

/**
 * Loads schedule rows (`columns` plus branch_id/department_id) for the given
 * branches, or every branch when `branchIds` is omitted.
 *
 * Migration-tolerant: before 0034 there is no department_id column, so the read
 * falls back to branch-only rows, each treated as a branch default. Clock-in
 * must keep working while code and migration are deployed out of step.
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

  const res = await run(`${columns}, branch_id, department_id`);
  if (!res.error) return { data: (res.data ?? []) as unknown as (T & ScheduleScope)[], error: null };
  if (res.error.code !== UNDEFINED_COLUMN) return { data: [], error: res.error };

  const legacy = await run(`${columns}, branch_id`);
  if (legacy.error) return { data: [], error: legacy.error };
  const rows = (legacy.data ?? []) as unknown as (T & { branch_id: string })[];
  return { data: rows.map((r) => ({ ...r, department_id: null })), error: null };
}

/** The one schedule that applies to an employee, or null when none is set. */
export async function loadEmployeeSchedule<T extends object>(
  db: SupabaseClient,
  columns: string,
  branchId: string,
  departmentId: string | null | undefined,
): Promise<{ data: (T & ScheduleScope) | null; error: { message: string } | null }> {
  const res = await loadSchedules<T>(db, columns, [branchId]);
  if (res.error) return { data: null, error: res.error };
  return { data: pickSchedule(res.data, branchId, departmentId), error: null };
}
