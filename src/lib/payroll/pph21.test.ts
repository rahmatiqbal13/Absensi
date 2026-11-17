import { describe, it, expect } from "vitest";
import { pph21, formatPersen } from "./pph21";
import { computePayrollForBranch } from "./compute";

describe("pph21", () => {
  it("withholds the flat rate", () => {
    expect(pph21(5_000_000, 1)).toBe(50_000);
    expect(pph21(4_761_904.76, 1)).toBe(47_619.05);
  });
  it("is zero for a zero rate or no earnings", () => {
    expect(pph21(5_000_000, 0)).toBe(0);
    expect(pph21(0, 1)).toBe(0);
    expect(pph21(-10, 1)).toBe(0);
  });
});

describe("formatPersen", () => {
  it("uses an Indonesian decimal comma", () => {
    expect(formatPersen(1)).toBe("1%");
    expect(formatPersen(0.5)).toBe("0,5%");
    expect(formatPersen(2.25)).toBe("2,25%");
  });
});

describe("computePayrollForBranch with PPh 21", () => {
  const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5], potongTerlambat: false };

  it("taxes the wage after attendance deductions, and gaji_akhir is net of both", () => {
    // August 2026: 21 working days; no attendance at all, alpa deducted.
    const [row] = computePayrollForBranch({
      year: 2026, month: 8,
      employees: [{ id: "e1", gajiPokok: 10_500_000, tanggalMulaiKerja: "2026-01-01", potongAlpa: true }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map([
        ["e1", [{ tanggalMulai: "2026-08-03", tanggalSelesai: "2026-08-07", jenis: "tahunan" }]],
      ]),
      tarifPph21Persen: 1,
    });
    // 16 alpa days × 500.000 = 8.000.000 → earned 2.500.000 → PPh 25.000.
    expect(row.total_potongan_absensi).toBe(8_000_000);
    expect(row.potongan_pph21).toBe(25_000);
    expect(row.tarif_pph21).toBe(1);
    expect(row.gaji_akhir).toBe(2_475_000);
  });
});

import { terRate, computePph21, validateTerBrackets, type TerBracket } from "./pph21";

const BRACKETS: TerBracket[] = [
  { kategori: "A", batasBawah: 0, tarifPersen: 0 },
  { kategori: "A", batasBawah: 5_400_001, tarifPersen: 0.25 },
  { kategori: "A", batasBawah: 6_750_001, tarifPersen: 1.25 },
  { kategori: "B", batasBawah: 0, tarifPersen: 0 },
  { kategori: "B", batasBawah: 6_200_001, tarifPersen: 0.25 },
];

describe("TER", () => {
  it("picks the bracket by monthly gross", () => {
    expect(terRate(BRACKETS, "A", 5_400_000)).toBe(0);
    expect(terRate(BRACKETS, "A", 5_400_001)).toBe(0.25);
    expect(terRate(BRACKETS, "A", 7_000_000)).toBe(1.25);
    expect(terRate(BRACKETS, "B", 6_000_000)).toBe(0);
  });

  it("maps PTKP status to its category and withholds rate × gross", () => {
    const cfg = { metode: "ter" as const, brackets: BRACKETS, kategoriByPtkp: { "TK/0": "A" as const, "K/1": "B" as const } };
    expect(computePph21(cfg, 7_000_000, "TK/0")).toEqual({ tarifPersen: 1.25, kategori: "A", amount: 87_500 });
    expect(computePph21(cfg, 6_500_000, "K/1")).toEqual({ tarifPersen: 0.25, kategori: "B", amount: 16_250 });
  });

  it("still supports the flat-rate method", () => {
    expect(computePph21({ metode: "tarif_tetap", tarifPersen: 1 }, 5_000_000, "K/3")).toEqual({
      tarifPersen: 1,
      kategori: null,
      amount: 50_000,
    });
  });

  it("validates edited tables", () => {
    expect(validateTerBrackets([{ batasBawah: 100, tarifPersen: 1 }])).toMatchObject({ ok: false });
    expect(validateTerBrackets([{ batasBawah: 0, tarifPersen: 101 }])).toMatchObject({ ok: false });
    expect(
      validateTerBrackets([
        { batasBawah: 5_000_001, tarifPersen: 1 },
        { batasBawah: 0, tarifPersen: 0 },
      ]),
    ).toEqual({ ok: true, rows: [{ batasBawah: 0, tarifPersen: 0 }, { batasBawah: 5_000_001, tarifPersen: 1 }] });
  });
});
