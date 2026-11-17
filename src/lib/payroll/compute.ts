import { effectiveWorkDays } from "./effective-days";
import { dailyWage } from "./daily-wage";
import { round2 } from "./round";
import { computePph21, type Pph21Config, type TerKategori } from "./pph21";
import { overtimeMinutes, overtimePay } from "./overtime";
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
  /** TK/0 … K/3 — selects the TER category. */
  statusPtkp?: string | null;
};

export type PayrollSchedule = {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: number[];
  potongTerlambat: boolean;
  /** Pay workday overtime past jamPulang (migration 0039). Default false. */
  hitungLembur?: boolean;
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
  menit_lembur: number;
  upah_lembur: number;
  /** Gross for the month: gaji pokok − attendance deductions + overtime pay. */
  penghasilan_bruto: number;
  tarif_pph21: number;
  kategori_ter: TerKategori | null;
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
  /** Flat PPh 21 rate in percent; used when `pph21` is not given. Default 0. */
  tarifPph21Persen?: number;
  /** PPh 21 method + tables (TER or flat). Overrides tarifPph21Persen. */
  pph21?: Pph21Config;
}): PayslipRow[] {
  const { year, month, employees, schedule, holidayDates, attendancesByEmployee, approvedLeavesByEmployee } = input;
  const pph21Config: Pph21Config = input.pph21 ?? { metode: "tarif_tetap", tarifPersen: input.tarifPph21Persen ?? 0 };

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

    // Workday overtime, only on days the employee actually worked.
    let menit_lembur = 0;
    let upah_lembur = 0;
    if (schedule.hitungLembur) {
      for (const r of rincian_harian) {
        if (r.jenis !== "kerja" && r.jenis !== "luar_kantor") continue;
        const m = overtimeMinutes(attendance.get(r.tanggal)?.jam_pulang ?? null, schedule.jamPulang);
        if (m > 0) {
          r.menit_lembur = m;
          menit_lembur += m;
          upah_lembur += overtimePay(m, emp.gajiPokok);
        }
      }
      upah_lembur = round2(upah_lembur);
    }

    const penghasilan_bruto = round2(Math.max(0, emp.gajiPokok - total_potongan_absensi) + upah_lembur);
    const tax = computePph21(pph21Config, penghasilan_bruto, emp.statusPtkp);
    const potongan_pph21 = tax.amount;
    const gaji_akhir = Math.max(0, round2(penghasilan_bruto - potongan_pph21));

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
      menit_lembur,
      upah_lembur,
      penghasilan_bruto,
      tarif_pph21: tax.tarifPersen,
      kategori_ter: tax.kategori,
      potongan_pph21,
      gaji_akhir,
      rincian_harian,
    };
  });
}
