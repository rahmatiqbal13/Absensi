import { describe, it, expect } from "vitest";
import { computePayrollForBranch } from "./compute";

const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5] };

describe("computePayrollForBranch", () => {
  it("pays a full month with perfect attendance in full", () => {
    // August 2026: 21 working days.
    const attendance = new Map<string, { status: string; jam_masuk: string | null; jam_pulang: string | null }>();
    // no rows -> every day would be alpa; instead give perfect rows for all 21 days
    const days = [
      "03", "04", "05", "06", "07", "10", "11", "12", "13", "14",
      "17", "18", "19", "20", "21", "24", "25", "26", "27", "28", "31",
    ];
    for (const d of days) {
      attendance.set(`2026-08-${d}`, {
        status: "tepat_waktu",
        jam_masuk: `2026-08-${d}T02:00:00Z`, // 09:00 WIB
        jam_pulang: `2026-08-${d}T10:00:00Z`, // 17:00 WIB
      });
    }

    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map([["e1", attendance]]),
      approvedLeavesByEmployee: new Map(),
    });

    expect(row.hari_kerja_efektif).toBe(21);
    expect(row.gaji_harian).toBe(500_000); // 10_500_000 / 21
    expect(row.total_potongan_absensi).toBe(0);
    expect(row.gaji_akhir).toBe(10_500_000);
    expect(row.rincian_harian).toHaveLength(21);
  });

  it("deducts alpa days, leaves approved-leave days untouched, and never goes negative", () => {
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(), // no rows at all -> every non-leave day is alpa
      approvedLeavesByEmployee: new Map([
        ["e1", [{ tanggalMulai: "2026-08-03", tanggalSelesai: "2026-08-07", jenis: "tahunan" }]],
      ]),
    });

    // 5 leave days (Aug 3-7) at 0, 16 alpa days at 500_000 each = 8_000_000
    const cuti = row.rincian_harian.filter((r) => r.jenis === "cuti");
    expect(cuti).toHaveLength(5);
    expect(row.total_potongan_absensi).toBe(8_000_000);
    expect(row.gaji_akhir).toBe(2_500_000);
  });

  it("floors gaji_akhir at 0 when deductions exceed gaji pokok", () => {
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 1_000_000, tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map(),
    });
    expect(row.gaji_akhir).toBe(0);
  });

  it("pays a mid-month joiner the FULL month when they attend every post-join day", () => {
    // Present every post-join working day -> no deductions -> full gaji_pokok.
    const attendance = new Map<string, { status: string; jam_masuk: string | null; jam_pulang: string | null }>();
    for (const d of ["17", "18", "19", "20", "21", "24", "25", "26", "27", "28", "31"]) {
      attendance.set(`2026-08-${d}`, {
        status: "tepat_waktu",
        jam_masuk: `2026-08-${d}T02:00:00Z`,
        jam_pulang: `2026-08-${d}T10:00:00Z`,
      });
    }
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-08-17" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map([["e1", attendance]]),
      approvedLeavesByEmployee: new Map(),
    });
    expect(row.gaji_harian).toBe(500_000); // 10_500_000 / 21
    expect(row.hari_kerja_efektif).toBe(21); // full-month effective days, consistent with gaji_harian
    expect(row.rincian_harian).toHaveLength(11); // only the 11 post-join days are assessed
    expect(row.total_potongan_absensi).toBe(0);
    expect(row.gaji_akhir).toBe(10_500_000); // full month, not prorated
  });

  it("deducts a mid-month joiner only for the post-join days they miss", () => {
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-08-17" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(), // absent every post-join day
      approvedLeavesByEmployee: new Map(),
    });
    expect(row.hari_kerja_efektif).toBe(21);
    // Aug 17..31 working days = 11; all alpa -> potongan 5_500_000
    expect(row.total_potongan_absensi).toBe(5_500_000);
    expect(row.gaji_akhir).toBe(5_000_000);
  });
});
