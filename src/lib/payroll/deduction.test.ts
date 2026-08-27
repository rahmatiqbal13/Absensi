import { describe, it, expect } from "vitest";
import { dayDeduction, leaveCoversDate } from "./deduction";

const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15 }; // 480 work minutes
const WAGE = 480_000; // -> Rp 1_000 per work minute

describe("leaveCoversDate", () => {
  it("matches an inclusive range", () => {
    const leaves = [{ tanggalMulai: "2026-08-10", tanggalSelesai: "2026-08-12", jenis: "tahunan" }];
    expect(leaveCoversDate(leaves, "2026-08-11")).toEqual({ covered: true, jenis: "tahunan" });
    expect(leaveCoversDate(leaves, "2026-08-12")).toEqual({ covered: true, jenis: "tahunan" });
    expect(leaveCoversDate(leaves, "2026-08-13")).toEqual({ covered: false });
  });
});

describe("dayDeduction", () => {
  const base = { tanggal: "2026-08-14", schedule: SCHEDULE, dailyWage: WAGE };

  it("approved leave -> zero, labelled", () => {
    const r = dayDeduction({ ...base, attendanceRow: null, leave: { covered: true, jenis: "sakit" } });
    expect(r).toMatchObject({ jenis: "cuti", status: null, potongan: 0, catatan: "cuti_sakit" });
  });

  it("no attendance row -> full-day deduction", () => {
    const r = dayDeduction({ ...base, attendanceRow: null, leave: { covered: false } });
    expect(r).toMatchObject({ jenis: "alpa", status: "alpa", potongan: WAGE });
  });

  it("di_luar_lokasi -> zero", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "di_luar_lokasi", jam_masuk: "2026-08-14T03:00:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r).toMatchObject({ jenis: "luar_kantor", potongan: 0 });
  });

  it("explicit alpa row -> full-day deduction", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "alpa", jam_masuk: null, jam_pulang: null },
      leave: { covered: false },
    });
    expect(r.potongan).toBe(WAGE);
  });

  it("late but within tolerance -> zero", () => {
    // scheduled 09:00, tolerance 15m; arrive 09:10 WIB (02:10Z)
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "tepat_waktu", jam_masuk: "2026-08-14T02:10:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r.menit_terlambat).toBe(0);
    expect(r.potongan).toBe(0);
  });

  it("late past tolerance -> deduction counted from scheduled + tolerance", () => {
    // arrive 09:25 WIB (02:25Z): 25 - 15 = 10 late minutes
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "terlambat", jam_masuk: "2026-08-14T02:25:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r.menit_terlambat).toBe(10);
    expect(r.potongan).toBe(10_000); // 1_000/min * 10
  });

  it("early leave -> deduction from scheduled end", () => {
    // leave 16:30 WIB (09:30Z): 30 early minutes
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "pulang_cepat", jam_masuk: "2026-08-14T02:00:00Z", jam_pulang: "2026-08-14T09:30:00Z" },
      leave: { covered: false },
    });
    expect(r.menit_pulang_cepat).toBe(30);
    expect(r.potongan).toBe(30_000);
  });

  it("missing clock-out -> leave side zero, flagged", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "terlambat", jam_masuk: "2026-08-14T02:25:00Z", jam_pulang: null },
      leave: { covered: false },
    });
    expect(r.menit_pulang_cepat).toBe(0);
    expect(r.catatan).toBe("pulang tidak tercatat");
    expect(r.potongan).toBe(10_000); // only the late side
  });

  it("inverted schedule -> zero deduction, flagged as invalid", () => {
    const r = dayDeduction({
      ...base,
      schedule: { jamMasuk: "17:00", jamPulang: "09:00", toleransiMenit: 15 },
      attendanceRow: { status: "terlambat", jam_masuk: "2026-08-14T12:00:00Z", jam_pulang: "2026-08-14T13:00:00Z" },
      leave: { covered: false },
    });
    expect(r.potongan).toBe(0);
    expect(r.catatan).toContain("jadwal kerja tidak valid");
  });

  it("on time both ends -> zero", () => {
    const r = dayDeduction({
      ...base,
      attendanceRow: { status: "tepat_waktu", jam_masuk: "2026-08-14T02:00:00Z", jam_pulang: "2026-08-14T10:00:00Z" },
      leave: { covered: false },
    });
    expect(r.potongan).toBe(0);
  });
});
