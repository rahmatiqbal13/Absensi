import type { SupabaseClient } from "@supabase/supabase-js";
import { toJakartaDateOnly } from "@/lib/attendance/jakarta-date";

type ExceptionStatus = "terlambat" | "alpa" | "di_luar_lokasi" | "pulang_cepat";
type ExceptionRow = {
  employeeId: string;
  nama: string;
  status: ExceptionStatus;
};
type Result = { ok: true; rows: ExceptionRow[] } | { ok: false; error: string };

const SORT_ORDER: Record<ExceptionStatus, number> = {
  alpa: 0,
  terlambat: 1,
  di_luar_lokasi: 2,
  pulang_cepat: 3,
};

export async function getTodayExceptions(
  db: SupabaseClient,
  branchId?: string,
): Promise<Result> {
  const today = toJakartaDateOnly(new Date());

  let employeeQuery = db
    .from("employees")
    .select("id, nama, branch_id")
    .eq("status", "aktif");
  if (branchId) employeeQuery = employeeQuery.eq("branch_id", branchId);

  let attendanceQuery = branchId
    ? db
        .from("attendances")
        .select("employee_id, status, employees!inner(branch_id)")
        .eq("tanggal", today)
        .eq("employees.branch_id", branchId)
    : db.from("attendances").select("employee_id, status").eq("tanggal", today);

  const [employeesRes, attendancesRes] = await Promise.all([employeeQuery, attendanceQuery]);
  const err = employeesRes.error ?? attendancesRes.error;
  if (err) {
    console.error("getTodayExceptions: query failed", err);
    return { ok: false, error: "Gagal memuat daftar perlu perhatian." };
  }

  const byEmployee = new Map<string, string>();
  for (const a of attendancesRes.data ?? []) {
    byEmployee.set(a.employee_id as string, a.status as string);
  }

  const rows: ExceptionRow[] = [];
  for (const e of employeesRes.data ?? []) {
    const id = e.id as string;
    const status = byEmployee.get(id);
    if (status === undefined || status === "alpa") {
      rows.push({ employeeId: id, nama: e.nama as string, status: "alpa" });
    } else if (
      status === "terlambat" ||
      status === "di_luar_lokasi" ||
      status === "pulang_cepat"
    ) {
      rows.push({ employeeId: id, nama: e.nama as string, status });
    }
  }

  rows.sort((a, b) => {
    const d = SORT_ORDER[a.status] - SORT_ORDER[b.status];
    return d !== 0 ? d : a.nama.localeCompare(b.nama);
  });

  return { ok: true, rows };
}
