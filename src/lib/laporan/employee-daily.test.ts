import { describe, it, expect } from "vitest";
import { buildEmployeeDaily, summarizeDaily, formatJamWib, employeeDailyToCsv, dailyStatusLabel, sumberLabel, sumberSingkat } from "./employee-daily";

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
  // Tuesday's overtime was approved beforehand (0058).
  approvedOvertime: new Map([["2026-08-04", [{ jamMulai: "17:00", jamSelesai: "19:00" }]]]),
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
    expect(formatJamWib(tue.jamMasuk)).toBe("09:40:00");
    expect(formatJamWib(tue.jamPulang)).toBe("18:30:00");
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

describe("buildEmployeeDaily lembur on a day off", () => {
  const build = (attendance: Map<string, never> | Map<string, unknown>) =>
    buildEmployeeDaily({
      from: "2026-08-08",
      to: "2026-08-09",
      schedule: { ...SCHEDULE, hitungLembur: false },
      holidays: new Map(),
      attendance: attendance as never,
      leaves: [],
      joinDate: null,
      approvedOvertime: new Map([
        ["2026-08-08", [{ jamMulai: "08:00", jamSelesai: "16:00" }]],
        ["2026-08-09", [{ jamMulai: "08:00", jamSelesai: "12:00" }]],
      ]),
    });

  it("records the approved minutes actually worked, from the window's start, even when overtime pay is off", () => {
    const [sat] = build(new Map([at("08", "07:23", "17:09")]));
    expect(sat).toMatchObject({ kind: "hadir", menitLembur: 8 * 60, lemburDisetujui: true });
    expect(sat.keterangan).toContain("Lembur hari libur");
  });

  it("flags approved lembur without a clock-in", () => {
    const [, sun] = build(new Map());
    expect(sun).toMatchObject({ kind: "bukan_hari_kerja", menitLembur: 0, keterangan: "Lembur disetujui, tidak ada absen" });
  });
});

describe("employeeDailyToCsv", () => {
  it("writes an Excel-friendly CSV with times in WIB", () => {
    const csv = employeeDailyToCsv(rows.slice(0, 2));
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Tanggal,Status,Jam Masuk,Sumber Masuk,Jam Pulang,Sumber Pulang,Durasi (menit),Terlambat (menit),Pulang Cepat (menit),Lembur (menit),Keterangan,Catatan,Peringatan Lokasi");
    expect(lines[2]).toBe("2026-08-04,Terlambat,09:40:00,Aplikasi (GPS),18:30:00,Aplikasi (GPS),530,25,0,90,,,");
  });

  it("lists the day's GPS warnings, merged from clock-in and clock-out", () => {
    const [r] = buildEmployeeDaily({
      from: "2026-08-03", to: "2026-08-03", schedule: SCHEDULE, holidays: new Map(), leaves: [], joinDate: null,
      attendance: new Map([
        ["2026-08-03", {
          status: "tepat_waktu", jam_masuk: "2026-08-03T09:00:00+07:00", jam_pulang: null, catatan: null,
          flag_lokasi_masuk: ["akurasi_rendah"], flag_lokasi_pulang: ["akurasi_rendah", "lokasi_basi", "bogus"],
        }],
      ]),
    });
    expect(r.flagLokasi).toEqual(["akurasi_rendah", "lokasi_basi"]);
    expect(employeeDailyToCsv([r]).split("\r\n")[1]).toMatch(/,Akurasi GPS rendah; Lokasi GPS lama$/);
  });
});

describe("buildEmployeeDaily with a shift roster (0059)", () => {
  it("uses shift times, counts a rostered Saturday as a working day and a rostered libur as off", () => {
    const rows = buildEmployeeDaily({
      from: "2026-08-03",
      to: "2026-08-08",
      schedule: SCHEDULE,
      holidays: new Map(),
      attendance: new Map([at("08", "13:05", "21:00")]),
      leaves: [],
      joinDate: null,
      roster: new Map([
        ["2026-08-03", null],
        ["2026-08-08", { nama: "Siang", jamMasuk: "13:00", jamPulang: "21:00", toleransiMenit: 15 }],
      ]),
    });
    const sat = rows.find((r) => r.tanggal === "2026-08-08")!;
    expect(sat).toMatchObject({ kind: "hadir", shift: "Siang", menitTerlambat: 0, menitPulangCepat: 0, keterangan: null });
    expect(rows.find((r) => r.tanggal === "2026-08-03")).toMatchObject({ kind: "bukan_hari_kerja", keterangan: "Libur (roster)" });
    // Tue–Fri regular (alpa, no attendance) + rostered Saturday = 5 working days.
    expect(summarizeDaily(rows).hariKerja).toBe(5);
  });
});

describe("durasi to the second", () => {
  it("measures and formats jam:menit:detik", async () => {
    const { durasiDetik, formatDurasiJms, formatDurasiPanjang } = await import("./employee-daily");
    const d = durasiDetik({ jamMasuk: "2026-11-02T07:36:21+07:00", jamPulang: "2026-11-02T16:03:05+07:00" });
    expect(d).toBe(8 * 3600 + 26 * 60 + 44);
    expect(formatDurasiJms(d!)).toBe("08:26:44");
    expect(formatDurasiJms(169 * 3600 + 12 * 60 + 30)).toBe("169:12:30");
    expect(formatDurasiPanjang(d!)).toBe("8 jam 26 menit 44 detik");
    expect(durasiDetik({ jamMasuk: "2026-11-02T07:36:21+07:00", jamPulang: null })).toBeNull();
  });
});

describe("sumber absen", () => {
  it("carries each half's source onto the row (missing metode = GPS, from before 0031)", () => {
    const [r] = buildEmployeeDaily({
      from: "2026-08-03", to: "2026-08-03", schedule: SCHEDULE, holidays: new Map(), leaves: [], joinDate: null,
      attendance: new Map([
        ["2026-08-03", {
          status: "tepat_waktu", jam_masuk: "2026-08-03T07:55:00+07:00", jam_pulang: "2026-08-03T16:05:00+07:00", catatan: null,
          metode_masuk: "mesin", metode_pulang: null,
        }],
      ]),
    });
    expect(r).toMatchObject({ metodeMasuk: "mesin", metodePulang: "gps" });
    expect(employeeDailyToCsv([r]).split("\r\n")[1]).toContain(",Mesin finger,16:05:00,Aplikasi (GPS),");
  });

  it("labels every source, and nothing without a time", () => {
    expect(["mesin", "qr", "koreksi", "gps"].map((m) => sumberLabel(m, "x"))).toEqual(["Mesin finger", "Aplikasi (QR)", "Koreksi HR", "Aplikasi (GPS)"]);
    expect(["mesin", "qr", "koreksi", null].map((m) => sumberSingkat(m, "x"))).toEqual(["Mesin", "QR", "Koreksi", "GPS"]);
    expect(sumberLabel("mesin", null)).toBe(null);
  });
});
