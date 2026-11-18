// src/lib/laporan/load-recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSchedules, pickSchedule } from "@/lib/schedule/resolve";
import { logOptionalLookup } from "@/lib/supabase/missing-column";
import {
  computeAttendanceRecap,
  type RecapRow,
  type RecapAttendanceRow,
  type RecapLeave,
} from "./attendance-recap";
import { buildEmployeeDaily, jadwalLabel, type DailyAttendance, type DailyRow } from "./employee-daily";

export type RecapFilters = {
  branchId: string;
  departmentId?: string | null;
  /** Only this atasan's direct reports (PRD §6: atasan sees their own team). */
  atasanId?: string | null;
  from: string;
  to: string;
};

export type LoadRecapResult =
  | {
      ok: true;
      rows: RecapRow[];
      branchNama: string;
      /**
       * Day-by-day rows per employee id (jam masuk/pulang, durasi, ...), built
       * with the same rules as the per-employee report, for the PDF appendix
       * and the "total jam" column.
       */
      daily: Record<string, DailyRow[]>;
      /** Each employee's schedule as text, e.g. "08:00–16:00, Sen, Sel, ...". */
      jadwal: Record<string, string>;
    }
  | { ok: false; error: string };

export async function loadRecap(
  db: SupabaseClient,
  filters: RecapFilters,
): Promise<LoadRecapResult> {
  const { branchId, departmentId, from, to } = filters;

  if (!/^[0-9a-f-]{36}$/i.test(branchId)) {
    return { ok: false, error: "Cabang tidak valid." };
  }
  if (departmentId && !/^[0-9a-f-]{36}$/i.test(departmentId)) {
    return { ok: false, error: "Departemen tidak valid." };
  }

  const { data: branch, error: branchErr } = await db
    .from("branches").select("nama").eq("id", branchId).maybeSingle();
  if (branchErr) {
    console.error("loadRecap: branch lookup failed", branchErr);
    return { ok: false, error: "Gagal memuat data laporan." };
  }
  if (!branch) return { ok: false, error: "Cabang tidak ditemukan." };

  let employeeQuery = db
    .from("employees")
    .select("id, nama, slug, tanggal_mulai_kerja, department_id")
    .eq("branch_id", branchId)
    .eq("status", "aktif")
    .order("nama");
  if (departmentId) employeeQuery = employeeQuery.eq("department_id", departmentId);
  if (filters.atasanId) employeeQuery = employeeQuery.eq("atasan_id", filters.atasanId);

  const [scheduleRes, lemburRes, employeesRes, holidaysRes] = await Promise.all([
    // Branch default + department schedules; each employee picks theirs.
    loadSchedules<{
      id: string; jam_masuk: string; jam_pulang: string; toleransi_terlambat_menit: number; hari_kerja: number[];
    }>(db, "id, jam_masuk, jam_pulang, toleransi_terlambat_menit, hari_kerja", [branchId]),
    // Overtime toggle (0039), tolerant: unreadable => no overtime column values.
    db.from("work_schedules").select("id, hitung_lembur").eq("branch_id", branchId),
    employeeQuery,
    db.from("holidays").select("tanggal, nama")
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .gte("tanggal", from).lte("tanggal", to),
  ]);

  if (scheduleRes.error || employeesRes.error || holidaysRes.error) {
    console.error("loadRecap: reference data query failed", {
      schedule: scheduleRes.error, employees: employeesRes.error, holidays: holidaysRes.error,
    });
    return { ok: false, error: "Gagal memuat data laporan." };
  }
  if (scheduleRes.data.length === 0) return { ok: false, error: "Cabang ini belum punya jadwal kerja." };

  const employees = (employeesRes.data ?? []) as {
    id: string; nama: string; slug: string; tanggal_mulai_kerja: string | null; department_id: string | null;
  }[];

  if (lemburRes.error) logOptionalLookup("loadRecap: hitung_lembur", lemburRes.error, "0039");
  const lemburById = new Map(
    (lemburRes.error ? [] : (lemburRes.data ?? [])).map((r) => [r.id as string, r.hitung_lembur === true]),
  );

  type Schedule = (typeof scheduleRes.data)[number];
  const groups = new Map<string, { schedule: Schedule; employees: typeof employees }>();
  for (const e of employees) {
    const schedule = pickSchedule(scheduleRes.data, branchId, e.department_id);
    if (!schedule) {
      return { ok: false, error: "Sebagian karyawan belum punya jadwal kerja. Atur jadwal cabang atau departemennya dulu." };
    }
    const g = groups.get(schedule.id) ?? { schedule, employees: [] };
    g.employees.push(e);
    groups.set(schedule.id, g);
  }
  const employeeIds = employees.map((e) => e.id);

  const [attendanceRes, leaveRes] = await Promise.all([
    employeeIds.length
      ? db.from("attendances")
          .select("employee_id, tanggal, status, jam_masuk, jam_pulang, catatan")
          .in("employee_id", employeeIds).gte("tanggal", from).lte("tanggal", to)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? db.from("leave_requests")
          .select("employee_id, tanggal_mulai, tanggal_selesai, jenis")
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
  for (const r of (attendanceRes.data ?? []) as { employee_id: string; tanggal: string; status: string; jam_masuk: string | null; jam_pulang?: string | null }[]) {
    const m = attendancesByEmployee.get(r.employee_id) ?? new Map();
    m.set(r.tanggal, { tanggal: r.tanggal, status: r.status, jam_masuk: r.jam_masuk, jam_pulang: r.jam_pulang ?? null });
    attendancesByEmployee.set(r.employee_id, m);
  }

  const approvedLeavesByEmployee = new Map<string, RecapLeave[]>();
  for (const r of (leaveRes.data ?? []) as { employee_id: string; tanggal_mulai: string; tanggal_selesai: string }[]) {
    const list = approvedLeavesByEmployee.get(r.employee_id) ?? [];
    list.push({ employeeId: r.employee_id, tanggalMulai: r.tanggal_mulai, tanggalSelesai: r.tanggal_selesai });
    approvedLeavesByEmployee.set(r.employee_id, list);
  }

  const holidayRows = (holidaysRes.data ?? []) as { tanggal: string; nama?: string }[];
  const holidayDates = holidayRows.map((h) => h.tanggal);
  const byId = new Map(
    [...groups.values()]
      .flatMap(({ schedule, employees: members }) =>
        computeAttendanceRecap({
          from, to,
          employees: members.map((e) => ({ id: e.id, nama: e.nama, slug: e.slug, tanggalMulaiKerja: e.tanggal_mulai_kerja })),
          schedule: {
            jamMasuk: schedule.jam_masuk,
            jamPulang: schedule.jam_pulang,
            toleransiMenit: schedule.toleransi_terlambat_menit,
            hariKerja: schedule.hari_kerja,
            hitungLembur: lemburById.get(schedule.id) ?? false,
          },
          holidayDates,
          attendancesByEmployee,
          approvedLeavesByEmployee,
        }),
      )
      .map((r) => [r.employeeId, r]),
  );
  // Keep the employee query's name order across schedule groups.
  const rows = employees.map((e) => byId.get(e.id)).filter((r): r is RecapRow => !!r);

  const holidayNames = new Map(holidayRows.map((h) => [h.tanggal, h.nama ?? "Libur"]));
  const rawAttendance = (attendanceRes.data ?? []) as (DailyAttendance & { employee_id: string; tanggal: string })[];
  const rawLeaves = (leaveRes.data ?? []) as { employee_id: string; tanggal_mulai: string; tanggal_selesai: string; jenis?: string }[];
  const daily: Record<string, DailyRow[]> = {};
  const jadwal: Record<string, string> = {};
  for (const e of employees) {
    const sch = pickSchedule(scheduleRes.data, branchId, e.department_id)!;
    const schedule = {
      jamMasuk: sch.jam_masuk.slice(0, 5),
      jamPulang: sch.jam_pulang.slice(0, 5),
      toleransiMenit: Number(sch.toleransi_terlambat_menit),
      hariKerja: sch.hari_kerja,
      hitungLembur: lemburById.get(sch.id) ?? false,
    };
    jadwal[e.id] = jadwalLabel(schedule);
    daily[e.id] = buildEmployeeDaily({
      from,
      to,
      schedule,
      holidays: holidayNames,
      attendance: new Map(rawAttendance.filter((a) => a.employee_id === e.id).map((a) => [a.tanggal, a])),
      leaves: rawLeaves
        .filter((l) => l.employee_id === e.id)
        .map((l) => ({ tanggalMulai: l.tanggal_mulai, tanggalSelesai: l.tanggal_selesai, jenis: l.jenis ?? "" })),
      joinDate: e.tanggal_mulai_kerja,
    });
  }

  return { ok: true, rows, branchNama: (branch as { nama: string }).nama, daily, jadwal };
}
