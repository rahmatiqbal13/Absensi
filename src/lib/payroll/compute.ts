import { effectiveWorkDays } from "./effective-days";
import { dailyWage } from "./daily-wage";
import { round2 } from "./round";
import {
  dayDeduction,
  leaveCoversDate,
  type RincianHarianEntry,
  type AttendanceRowLite,
} from "./deduction";

export type PayrollEmployee = {
  id: string;
  gajiPokok: number;
  tanggalMulaiKerja: string | null;
};

export type PayrollSchedule = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: number[];
};

export type ApprovedLeave = { tanggalMulai: string; tanggalSelesai: string; jenis: string };

export type PayslipRow = {
  employee_id: string;
  gaji_pokok: number;
  hari_kerja_efektif: number;
  gaji_harian: number;
  total_potongan_absensi: number;
  gaji_akhir: number;
  rincian_harian: RincianHarianEntry[];
};

export function computePayrollForBranch(input: {
  year: number;
  month: number;
  employees: PayrollEmployee[];
  schedule: PayrollSchedule;
  holidayDates: string[];
  attendancesByEmployee: Map<string, Map<string, AttendanceRowLite>>;
  approvedLeavesByEmployee: Map<string, ApprovedLeave[]>;
}): PayslipRow[] {
  const { year, month, employees, schedule, holidayDates, attendancesByEmployee, approvedLeavesByEmployee } = input;

  return employees.map((emp) => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year,
      month,
      hariKerja: schedule.hariKerja,
      holidayDates,
      joinDate: emp.tanggalMulaiKerja,
    });
    const wage = dailyWage(emp.gajiPokok, fullMonthDays.length);
    const attendance = attendancesByEmployee.get(emp.id) ?? new Map<string, AttendanceRowLite>();
    const leaves = approvedLeavesByEmployee.get(emp.id) ?? [];

    const rincian_harian = accrualDays.map((tanggal) =>
      dayDeduction({
        tanggal,
        attendanceRow: attendance.get(tanggal) ?? null,
        schedule,
        dailyWage: wage,
        leave: leaveCoversDate(leaves, tanggal),
      }),
    );

    const total_potongan_absensi = round2(
      rincian_harian.reduce((sum, r) => sum + r.potongan, 0),
    );
    const gaji_akhir = Math.max(0, round2(emp.gajiPokok - total_potongan_absensi));

    return {
      employee_id: emp.id,
      gaji_pokok: emp.gajiPokok,
      hari_kerja_efektif: accrualDays.length,
      gaji_harian: wage,
      total_potongan_absensi,
      gaji_akhir,
      rincian_harian,
    };
  });
}
