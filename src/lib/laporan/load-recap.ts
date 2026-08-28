// src/lib/laporan/load-recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAttendanceRecap,
  type RecapRow,
  type RecapAttendanceRow,
  type RecapLeave,
} from "./attendance-recap";

export type RecapFilters = {
  branchId: string;
  departmentId?: string | null;
  from: string;
  to: string;
};

export type LoadRecapResult =
  | { ok: true; rows: RecapRow[]; branchNama: string }
  | { ok: false; error: string };

export async function loadRecap(
  db: SupabaseClient,
  filters: RecapFilters,
): Promise<LoadRecapResult> {
  const { branchId, departmentId, from, to } = filters;

  const { data: branch, error: branchErr } = await db
    .from("branches").select("nama").eq("id", branchId).maybeSingle();
  if (branchErr) {
    console.error("loadRecap: branch lookup failed", branchErr);
    return { ok: false, error: "Gagal memuat data laporan." };
  }
  if (!branch) return { ok: false, error: "Cabang tidak ditemukan." };

  let employeeQuery = db
    .from("employees")
    .select("id, nama, tanggal_mulai_kerja")
    .eq("branch_id", branchId)
    .eq("status", "aktif")
    .order("nama");
  if (departmentId) employeeQuery = employeeQuery.eq("department_id", departmentId);

  const [scheduleRes, employeesRes, holidaysRes] = await Promise.all([
    db.from("work_schedules")
      .select("jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja")
      .eq("branch_id", branchId).limit(1).maybeSingle(),
    employeeQuery,
    db.from("holidays").select("tanggal")
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .gte("tanggal", from).lte("tanggal", to),
  ]);

  if (scheduleRes.error || employeesRes.error || holidaysRes.error) {
    console.error("loadRecap: reference data query failed", {
      schedule: scheduleRes.error, employees: employeesRes.error, holidays: holidaysRes.error,
    });
    return { ok: false, error: "Gagal memuat data laporan." };
  }
  if (!scheduleRes.data) return { ok: false, error: "Cabang ini belum punya jadwal kerja." };

  const employees = (employeesRes.data ?? []) as { id: string; nama: string; tanggal_mulai_kerja: string | null }[];
  const employeeIds = employees.map((e) => e.id);

  const [attendanceRes, leaveRes] = await Promise.all([
    employeeIds.length
      ? db.from("attendances")
          .select("employee_id, tanggal, status, jam_masuk")
          .in("employee_id", employeeIds).gte("tanggal", from).lte("tanggal", to)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? db.from("leave_requests")
          .select("employee_id, tanggal_mulai, tanggal_selesai")
          .eq("status", "approved").in("employee_id", employeeIds)
          .lte("tanggal_mulai", to).gte("tanggal_selesai", from)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (attendanceRes.error || leaveRes.error) {
    console.error("loadRecap: attendance/leave query failed", {
      attendance: attendanceRes.error, leave: leaveRes.error,
    });
    return { ok: false, error: "Gagal memuat data laporan." };
  }

  const attendancesByEmployee = new Map<string, Map<string, RecapAttendanceRow>>();
  for (const r of (attendanceRes.data ?? []) as { employee_id: string; tanggal: string; status: string; jam_masuk: string | null }[]) {
    const m = attendancesByEmployee.get(r.employee_id) ?? new Map();
    m.set(r.tanggal, { tanggal: r.tanggal, status: r.status, jam_masuk: r.jam_masuk });
    attendancesByEmployee.set(r.employee_id, m);
  }

  const approvedLeavesByEmployee = new Map<string, RecapLeave[]>();
  for (const r of (leaveRes.data ?? []) as { employee_id: string; tanggal_mulai: string; tanggal_selesai: string }[]) {
    const list = approvedLeavesByEmployee.get(r.employee_id) ?? [];
    list.push({ employeeId: r.employee_id, tanggalMulai: r.tanggal_mulai, tanggalSelesai: r.tanggal_selesai });
    approvedLeavesByEmployee.set(r.employee_id, list);
  }

  const rows = computeAttendanceRecap({
    from, to,
    employees: employees.map((e) => ({ id: e.id, nama: e.nama, tanggalMulaiKerja: e.tanggal_mulai_kerja })),
    schedule: {
      jamMasuk: scheduleRes.data.jam_masuk,
      jamPulang: scheduleRes.data.jam_pulang,
      toleransiMenit: scheduleRes.data.toleransi_terlambat_menit,
      hariKerja: scheduleRes.data.hari_kerja,
    },
    holidayDates: ((holidaysRes.data ?? []) as { tanggal: string }[]).map((h) => h.tanggal),
    attendancesByEmployee,
    approvedLeavesByEmployee,
  });

  return { ok: true, rows, branchNama: (branch as { nama: string }).nama };
}
