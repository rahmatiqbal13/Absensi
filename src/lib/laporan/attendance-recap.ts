// src/lib/laporan/attendance-recap.ts
import { jakartaMinutesOfDay, scheduleMinutes } from "@/lib/payroll/minutes";

export type RecapEmployee = { id: string; nama: string; tanggalMulaiKerja: string | null };
export type RecapAttendanceRow = { tanggal: string; status: string; jam_masuk: string | null };
export type RecapLeave = { employeeId: string; tanggalMulai: string; tanggalSelesai: string };
export type RecapSchedule = { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[] };

export type RecapRow = {
  employeeId: string;
  nama: string;
  hadir: number;
  terlambat: number;
  pulangCepat: number;
  diLuarLokasi: number;
  alpa: number;
  cuti: number;
  lain: number;
  totalMenitTerlambat: number;
  hariKerjaEfektif: number;
};

// Every date string in [from, to] inclusive.
function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start.getTime(); d <= end.getTime(); d += 24 * 60 * 60 * 1000) {
    out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

function leaveCovers(leaves: RecapLeave[], tanggal: string): boolean {
  return leaves.some((lv) => tanggal >= lv.tanggalMulai && tanggal <= lv.tanggalSelesai);
}

export function computeAttendanceRecap(input: {
  from: string;
  to: string;
  employees: RecapEmployee[];
  schedule: RecapSchedule;
  holidayDates: string[];
  attendancesByEmployee: Map<string, Map<string, RecapAttendanceRow>>;
  approvedLeavesByEmployee: Map<string, RecapLeave[]>;
}): RecapRow[] {
  const { from, to, employees, schedule, holidayDates, attendancesByEmployee, approvedLeavesByEmployee } = input;
  const holidays = new Set(holidayDates);
  const workingDow = new Set(schedule.hariKerja);
  const lateThreshold = scheduleMinutes(schedule.jamMasuk) + schedule.toleransiMenit;
  const allDates = datesInRange(from, to);

  return employees.map((emp) => {
    const attendance = attendancesByEmployee.get(emp.id) ?? new Map<string, RecapAttendanceRow>();
    const leaves = approvedLeavesByEmployee.get(emp.id) ?? [];

    const row: RecapRow = {
      employeeId: emp.id, nama: emp.nama,
      hadir: 0, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0, alpa: 0, cuti: 0, lain: 0,
      totalMenitTerlambat: 0, hariKerjaEfektif: 0,
    };

    for (const tanggal of allDates) {
      const dow = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
      if (!workingDow.has(dow)) continue;
      if (holidays.has(tanggal)) continue;
      if (emp.tanggalMulaiKerja && tanggal < emp.tanggalMulaiKerja) continue;

      row.hariKerjaEfektif += 1;

      if (leaveCovers(leaves, tanggal)) {
        row.cuti += 1;
        continue;
      }
      const att = attendance.get(tanggal);
      if (!att) {
        row.alpa += 1;
        continue;
      }
      switch (att.status) {
        case "tepat_waktu":
          row.hadir += 1;
          break;
        case "terlambat":
          row.terlambat += 1;
          if (att.jam_masuk) {
            row.totalMenitTerlambat += Math.max(0, jakartaMinutesOfDay(att.jam_masuk) - lateThreshold);
          }
          break;
        case "pulang_cepat":
          row.pulangCepat += 1;
          break;
        case "di_luar_lokasi":
          row.diLuarLokasi += 1;
          break;
        case "alpa":
          row.alpa += 1;
          break;
        default:
          row.lain += 1;
      }
    }

    return row;
  });
}
