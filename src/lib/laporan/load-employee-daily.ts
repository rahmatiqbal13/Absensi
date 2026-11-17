import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentEmployee } from "@/lib/auth/session";
import { loadEmployeeSchedule } from "@/lib/schedule/resolve";
import { isMissingColumn, logOptionalLookup } from "@/lib/supabase/missing-column";
import { buildEmployeeDaily, type DailyAttendance, type DailyRow, type DailySchedule } from "./employee-daily";

export type EmployeeDailyReport = {
  employee: {
    id: string;
    nama: string;
    jabatan: string;
    cabang: string;
    departemen: string | null;
    tanggalMulaiKerja: string | null;
  };
  schedule: DailySchedule | null;
  rows: DailyRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Daily attendance (clock-in / clock-out) for one employee. HR / super admin
 * may open anyone; an atasan only their direct reports (PRD §6).
 */
export async function loadEmployeeDailyReport(
  db: SupabaseClient,
  viewer: CurrentEmployee,
  employeeId: string,
  from: string,
  to: string,
): Promise<{ ok: true; report: EmployeeDailyReport } | { ok: false; status: 403 | 404 | 500; error: string }> {
  if (!UUID_RE.test(employeeId)) return { ok: false, status: 404, error: "Karyawan tidak ditemukan." };

  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, nama, jabatan, branch_id, department_id, atasan_id, tanggal_mulai_kerja, branches(nama), departments(nama)")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) {
    console.error("loadEmployeeDailyReport: employee lookup failed", empErr);
    return { ok: false, status: 500, error: "Gagal memuat data karyawan." };
  }
  if (!emp) return { ok: false, status: 404, error: "Karyawan tidak ditemukan." };

  const isHr = viewer.role === "hr_admin" || viewer.role === "super_admin";
  const isOwnTeam = viewer.role === "atasan" && emp.atasan_id === viewer.id;
  if (!isHr && !isOwnTeam) return { ok: false, status: 404, error: "Karyawan tidak ditemukan." };

  const branchId = emp.branch_id as string;
  const cols = "jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja";
  let sched = await loadEmployeeSchedule<{
    jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number; hari_kerja: number[]; hitung_lembur?: boolean;
  }>(db, `${cols}, hitung_lembur`, branchId, emp.department_id as string | null);
  if (sched.error && isMissingColumn(sched.error)) {
    logOptionalLookup("loadEmployeeDailyReport: hitung_lembur", sched.error, "0039");
    sched = await loadEmployeeSchedule(db, cols, branchId, emp.department_id as string | null);
  }

  const [attRes, holRes, leaveRes] = await Promise.all([
    db
      .from("attendances")
      .select("tanggal, status, jam_masuk, jam_pulang, catatan")
      .eq("employee_id", employeeId)
      .gte("tanggal", from)
      .lte("tanggal", to),
    db
      .from("holidays")
      .select("tanggal, nama")
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .gte("tanggal", from)
      .lte("tanggal", to),
    db
      .from("leave_requests")
      .select("tanggal_mulai, tanggal_selesai, jenis")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("tanggal_mulai", to)
      .gte("tanggal_selesai", from),
  ]);
  const err = sched.error ?? attRes.error ?? holRes.error ?? leaveRes.error;
  if (err) {
    console.error("loadEmployeeDailyReport: query failed", err);
    return { ok: false, status: 500, error: "Gagal memuat laporan kehadiran." };
  }

  const s = sched.data;
  const schedule: DailySchedule | null = s
    ? {
        jamMasuk: s.jam_masuk.slice(0, 5),
        jamPulang: s.jam_pulang.slice(0, 5),
        toleransiMenit: Number(s.toleransi_terlambat_menit),
        hariKerja: s.hari_kerja,
        hitungLembur: s.hitung_lembur === true,
      }
    : null;

  const rows = buildEmployeeDaily({
    from,
    to,
    schedule,
    holidays: new Map(((holRes.data ?? []) as { tanggal: string; nama: string }[]).map((h) => [h.tanggal, h.nama])),
    attendance: new Map(
      ((attRes.data ?? []) as (DailyAttendance & { tanggal: string })[]).map((a) => [a.tanggal, a]),
    ),
    leaves: ((leaveRes.data ?? []) as { tanggal_mulai: string; tanggal_selesai: string; jenis: string }[]).map((l) => ({
      tanggalMulai: l.tanggal_mulai,
      tanggalSelesai: l.tanggal_selesai,
      jenis: l.jenis,
    })),
    joinDate: (emp.tanggal_mulai_kerja as string | null) ?? null,
  });

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  return {
    ok: true,
    report: {
      employee: {
        id: emp.id as string,
        nama: emp.nama as string,
        jabatan: emp.jabatan as string,
        cabang: one(emp.branches as { nama: string } | { nama: string }[] | null)?.nama ?? "-",
        departemen: one(emp.departments as { nama: string } | { nama: string }[] | null)?.nama ?? null,
        tanggalMulaiKerja: (emp.tanggal_mulai_kerja as string | null) ?? null,
      },
      schedule,
      rows,
    },
  };
}
