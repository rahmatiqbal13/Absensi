import { effectiveWorkDays } from "./effective-days";
import { dailyWage } from "./daily-wage";
import { round2 } from "./round";
import { pph21 } from "./pph21";
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
  /** Deduct a day's wage per alpa day — see shouldDeductAlpa(). Default false. */
  potongAlpa?: boolean;
};

export type PayrollSchedule = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: number[];
  potongTerlambat: boolean;
};

// PP 36/2021 caps the total of wage deductions (pemotongan) at 50% of each wage
// payment. An unworked day (alpa) is unpaid wage, not a pemotongan, so only the
// late / early-leave fines draw from this budget.
export const MAX_FINE_RATIO = 0.5;
const CAPPED_NOTE = "potongan dibatasi 50% upah";

// Clamp the fine-type entries (jenis "kerja") against a running budget so the
// per-day rincian still sums to the capped total.
function capFines(rincian: RincianHarianEntry[], gajiPokok: number): RincianHarianEntry[] {
  let budget = round2(gajiPokok * MAX_FINE_RATIO);
  return rincian.map((r) => {
    if (r.jenis !== "kerja" || r.potongan <= 0) return r;
    if (r.potongan <= budget) {
      budget = round2(budget - r.potongan);
      return r;
    }
    const potongan = budget;
    budget = 0;
    return { ...r, potongan, catatan: r.catatan ? `${r.catatan}; ${CAPPED_NOTE}` : CAPPED_NOTE };
  });
}

export type ApprovedLeave = { tanggalMulai: string; tanggalSelesai: string; jenis: string };

export type PayslipRow = {
  employee_id: string;
  gaji_pokok: number;
  hari_kerja_efektif: number;
  gaji_harian: number;
  total_potongan_absensi: number;
  tarif_pph21: number;
  potongan_pph21: number;
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
  /** PPh 21 rate in percent, withheld from the earned wage. Default 0. */
  tarifPph21Persen?: number;
}): PayslipRow[] {
  const { year, month, employees, schedule, holidayDates, attendancesByEmployee, approvedLeavesByEmployee } = input;
  const tarifPph21 = input.tarifPph21Persen ?? 0;

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

    const rincian_harian = capFines(
      accrualDays.map((tanggal) =>
        dayDeduction({
          tanggal,
          attendanceRow: attendance.get(tanggal) ?? null,
          schedule,
          dailyWage: wage,
          leave: leaveCoversDate(leaves, tanggal),
          potongAlpa: emp.potongAlpa ?? false,
        }),
      ),
      emp.gajiPokok,
    );

    const total_potongan_absensi = round2(
      rincian_harian.reduce((sum, r) => sum + r.potongan, 0),
    );
    const penghasilanBruto = Math.max(0, round2(emp.gajiPokok - total_potongan_absensi));
    const potongan_pph21 = pph21(penghasilanBruto, tarifPph21);
    const gaji_akhir = Math.max(0, round2(penghasilanBruto - potongan_pph21));

    return {
      employee_id: emp.id,
      gaji_pokok: emp.gajiPokok,
      // Full-month effective days — must stay consistent with gaji_harian
      // (gaji_harian = gaji_pokok / hari_kerja_efektif). A mid-month joiner is
      // still paid the full month (only post-join days are deduction-assessed),
      // so this is NOT accrualDays.length.
      hari_kerja_efektif: fullMonthDays.length,
      gaji_harian: wage,
      total_potongan_absensi,
      tarif_pph21: tarifPph21,
      potongan_pph21,
      gaji_akhir,
      rincian_harian,
    };
  });
}
