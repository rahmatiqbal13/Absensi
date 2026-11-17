import { describe, it, expect } from "vitest";
import { buildEmployeeDaily, summarizeDaily, formatJamWib, employeeDailyToCsv, dailyStatusLabel } from "./employee-daily";

// Mon 3 Aug – Sun 9 Aug 2026; schedule 09:00–17:00, 15 min tolerance, Mon–Fri.
const SCHEDULE = { jamMasuk: "09:00", jamPulang: "17:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5], hitungLembur: true };
const at = (d: string, masuk: string | null, pulang: string | null, status = "tepat_waktu", catatan: string | null = null) => [
  `2026-08-${d}`,
  {
    status,
    // WIB = UTC+7
    jam_masuk: masuk ? `2026-08-${d}T${masuk}:00+07:00` : null,
    jam_pulang: pulang ? `2026-08-${d}T${pulang}:00+07:00` : null,
    catatan,
  },
] as const;

const rows = buildEmployeeDaily({
  from: "2026-08-03",
  to: "2026-08-09",
  schedule: SCHEDULE,
  holidays: new Map([["2026-08-07", "Cuti bersama"]]),
  attendance: new Map([
    at("03", "08:55", "17:05"),
    at("04", "09:40", "18:30", "terlambat"),
    at("08", "10:00", "12:00", "tepat_waktu", "Lembur stok"),
  ]),
  leaves: [{ tanggalMulai: "2026-08-05", tanggalSelesai: "2026-08-05", jenis: "sakit" }],
  joinDate: "2026-01-01",
});

describe("buildEmployeeDaily", () => {
  it("emits one row per day with the right kind", () => {
    expect(rows.map((r) => [r.tanggal.slice(8), r.kind])).toEqual([
      ["03", "hadir"], ["04", "hadir"], ["05", "cuti"], ["06", "alpa"],
      ["07", "libur"], ["08", "hadir"], ["09", "bukan_hari_kerja"],
    ]);
  });

  it("derives times, lateness, early leave and overtime on scheduled days", () => {
    const tue = rows[1];
    expect(formatJamWib(tue.jamMasuk)).toBe("09:40");
    expect(formatJamWib(tue.jamPulang)).toBe("18:30");
    expect(tue).toMatchObject({ durasiMenit: 530, menitTerlambat: 25, menitPulangCepat: 0, menitLembur: 90 });
    expect(rows[0]).toMatchObject({ menitTerlambat: 0, menitLembur: 0, durasiMenit: 490 });
  });

  it("shows weekend work with its times but no lateness or overtime", () => {
    expect(rows[5]).toMatchObject({ kind: "hadir", keterangan: "Di luar hari kerja", durasiMenit: 120, menitTerlambat: 0, menitLembur: 0, catatan: "Lembur stok" });
  });

  it("labels leave and holidays", () => {
    expect(rows[2].keterangan).toBe("Sakit");
    expect(rows[4].keterangan).toBe("Cuti bersama");
    expect(dailyStatusLabel(rows[3])).toBe("Alpa");
  });

  it("summarizes the period", () => {
    expect(summarizeDaily(rows)).toMatchObject({
      hariKerja: 4, hadir: 3, tepatWaktu: 2, terlambat: 1, alpa: 1, cuti: 1,
      menitTerlambat: 25, menitLembur: 90, menitKerja: 490 + 530 + 120,
    });
  });

  it("marks days before the join date", () => {
    const r = buildEmployeeDaily({
      from: "2026-08-03", to: "2026-08-03", schedule: SCHEDULE, holidays: new Map(),
      attendance: new Map(), leaves: [], joinDate: "2026-08-10",
    });
    expect(r[0].kind).toBe("belum_bekerja");
  });
});

describe("employeeDailyToCsv", () => {
  it("writes an Excel-friendly CSV with times in WIB", () => {
    const csv = employeeDailyToCsv(rows.slice(0, 2));
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Tanggal,Status,Jam Masuk,Jam Pulang,Durasi (menit),Terlambat (menit),Pulang Cepat (menit),Lembur (menit),Keterangan,Catatan");
    expect(lines[2]).toBe("2026-08-04,Terlambat,09:40,18:30,530,25,0,90,,");
  });
});
