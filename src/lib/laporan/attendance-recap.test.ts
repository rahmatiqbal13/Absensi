// src/lib/laporan/attendance-recap.test.ts
import { describe, it, expect } from "vitest";
import { computeAttendanceRecap, type RecapAttendanceRow } from "./attendance-recap";

const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5] };

function attMap(rows: (RecapAttendanceRow & { employee_id: string })[]) {
  const byEmp = new Map<string, Map<string, RecapAttendanceRow>>();
  for (const r of rows) {
    const m = byEmp.get(r.employee_id) ?? new Map();
    m.set(r.tanggal, r);
    byEmp.set(r.employee_id, m);
  }
  return byEmp;
}

describe("computeAttendanceRecap", () => {
  it("counts each status into its bucket and sums late minutes (Jakarta-pinned)", () => {
    // 2026-08-03..2026-08-07 = Mon..Fri = 5 working days.
    const rows = [
      { employee_id: "e1", tanggal: "2026-08-03", status: "tepat_waktu", jam_masuk: "2026-08-03T02:00:00Z" },
      { employee_id: "e1", tanggal: "2026-08-04", status: "terlambat", jam_masuk: "2026-08-04T02:25:00Z" }, // 09:25 WIB -> 10 late min past tolerance
      { employee_id: "e1", tanggal: "2026-08-05", status: "pulang_cepat", jam_masuk: "2026-08-05T02:00:00Z" },
      { employee_id: "e1", tanggal: "2026-08-06", status: "di_luar_lokasi", jam_masuk: "2026-08-06T02:00:00Z" },
      // 2026-08-07 has no row -> alpa
    ];
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-07",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: attMap(rows),
      approvedLeavesByEmployee: new Map(),
    });
    expect(recap).toMatchObject({
      employeeId: "e1", nama: "Budi",
      hadir: 1, terlambat: 1, pulangCepat: 1, diLuarLokasi: 1, alpa: 1, cuti: 0, lain: 0,
      totalMenitTerlambat: 10, hariKerjaEfektif: 5,
    });
    expect(recap.hadir + recap.terlambat + recap.pulangCepat + recap.diLuarLokasi + recap.alpa + recap.cuti + recap.lain)
      .toBe(recap.hariKerjaEfektif);
  });

  it("excludes holidays and pre-join days from hariKerjaEfektif", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-07",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-08-05" }],
      schedule: SCHEDULE,
      holidayDates: ["2026-08-06"],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map(),
    });
    // Aug 5, 7 are the only counted days (6 = holiday, 3-4 = pre-join). Both alpa.
    expect(recap.hariKerjaEfektif).toBe(2);
    expect(recap.alpa).toBe(2);
  });

  it("counts approved-leave days as cuti, not alpa", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-07",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE,
      holidayDates: [],
      attendancesByEmployee: new Map(),
      approvedLeavesByEmployee: new Map([["e1", [{ employeeId: "e1", tanggalMulai: "2026-08-03", tanggalSelesai: "2026-08-04" }]]]),
    });
    expect(recap.cuti).toBe(2);
    expect(recap.alpa).toBe(3);
  });

  it("routes an unknown status to `lain`, never to alpa", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-03", to: "2026-08-03",
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE, holidayDates: [],
      attendancesByEmployee: attMap([{ employee_id: "e1", tanggal: "2026-08-03", status: "cuti_massal", jam_masuk: null }]),
      approvedLeavesByEmployee: new Map(),
    });
    expect(recap.lain).toBe(1);
    expect(recap.alpa).toBe(0);
  });

  it("is timezone-independent for late minutes", () => {
    const original = process.env.TZ;
    try {
      const run = () => computeAttendanceRecap({
        from: "2026-08-04", to: "2026-08-04",
        employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
        schedule: SCHEDULE, holidayDates: [],
        attendancesByEmployee: attMap([{ employee_id: "e1", tanggal: "2026-08-04", status: "terlambat", jam_masuk: "2026-08-04T02:25:00Z" }]),
        approvedLeavesByEmployee: new Map(),
      })[0].totalMenitTerlambat;
      process.env.TZ = "America/New_York";
      expect(run()).toBe(10);
      process.env.TZ = "Pacific/Kiritimati";
      expect(run()).toBe(10);
    } finally {
      process.env.TZ = original;
    }
  });

  it("returns an empty-but-shaped row for an employee with no data and no working days", () => {
    const [recap] = computeAttendanceRecap({
      from: "2026-08-01", to: "2026-08-02", // Sat, Sun
      employees: [{ id: "e1", nama: "Budi", tanggalMulaiKerja: "2026-01-01" }],
      schedule: SCHEDULE, holidayDates: [],
      attendancesByEmployee: new Map(), approvedLeavesByEmployee: new Map(),
    });
    expect(recap).toMatchObject({ hariKerjaEfektif: 0, hadir: 0, alpa: 0, cuti: 0, totalMenitTerlambat: 0 });
  });
});
