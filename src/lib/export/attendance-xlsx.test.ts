import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { attendanceToXlsx, uniqueSheetName, tanggalPanjang, type AttendanceXlsxInput } from "./attendance-xlsx";
import type { DailyRow } from "@/lib/laporan/employee-daily";

function files(buffer: Buffer): Record<string, string> {
  const all = unzipSync(new Uint8Array(buffer));
  return Object.fromEntries(Object.entries(all).filter(([n]) => n.endsWith(".xml")).map(([n, d]) => [n, strFromU8(d)]));
}

const day = (tanggal: string, masuk: string | null, pulang: string | null, kind: DailyRow["kind"] = "hadir"): DailyRow => ({
  tanggal, kind, status: kind === "hadir" ? "tepat_waktu" : kind === "alpa" ? "alpa" : null,
  jamMasuk: masuk && `${tanggal}T${masuk}+07:00`, jamPulang: pulang && `${tanggal}T${pulang}+07:00`,
  durasiMenit: null, menitTerlambat: 0, menitPulangCepat: 0, menitLembur: 0,
  keterangan: kind === "bukan_hari_kerja" ? null : null, catatan: null, flagLokasi: [],
});

const INPUT: AttendanceXlsxInput = {
  org: { nama: "Dinas Contoh", alamat: "Jl. Merdeka No. 1" },
  branchNama: "Kantor Pusat",
  from: "2026-11-02",
  to: "2026-11-04",
  dicetak: "23 Nov 2026 09:45",
  hariIni: "2026-11-23",
  rows: [
    { employeeId: "e1", nama: "Citra Lestari", hadir: 2, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0, alpa: 1, cuti: 0, lain: 0, totalMenitTerlambat: 0, menitLembur: 0, hariKerjaEfektif: 3 },
  ],
  daily: {
    e1: [
      day("2026-11-02", "07:36:21", "16:03:05"), // 8:26:44
      day("2026-11-03", "07:30:00", "16:00:30"), // 8:30:30
      day("2026-11-04", null, null, "alpa"),
    ],
  },
  jadwal: { e1: "08:00–16:00, Sen, Sel, Rab, Kam, Jum" },
  jabatan: { e1: "Staf Umum" },
};

describe("attendanceToXlsx", () => {
  it("writes a recap sheet and one official-format sheet per employee", async () => {
    const f = files(await attendanceToXlsx(INPUT));
    expect(f["xl/workbook.xml"]).toMatch(/name="Rekap Kehadiran"/);
    expect(f["xl/workbook.xml"]).toMatch(/name="Citra Lestari"/);
    const all = Object.values(f).join("\n");
    for (const s of [
      "DINAS CONTOH", "Jl. Merdeka No. 1", "DAFTAR HADIR PEGAWAI", "REKAPITULASI KEHADIRAN PEGAWAI",
      "Periode: 2 November 2026 s.d. 4 November 2026", ": Staf Umum", "Senin", "02/11/2026",
      "07:36:21", "16:03:05", "08:26:44", "16:57:14", "16 jam 57 menit 14 detik",
      "Mengetahui,", "23 November 2026", "Pegawai yang bersangkutan,",
    ]) expect(all).toContain(s);
    expect(all).toContain("<mergeCell"); // letterhead / title spans
  });
});

describe("uniqueSheetName", () => {
  it("dedupes case-insensitively and keeps the 31-char cap", () => {
    const used = new Set(["rekap kehadiran"]);
    expect(uniqueSheetName("Budi", used)).toBe("Budi");
    expect(uniqueSheetName("budi", used)).toBe("budi (2)");
    expect(uniqueSheetName("Rekap Kehadiran", used)).toBe("Rekap Kehadiran (2)");
    const long = "Mellyana Putri Mentari, S.Pd. Panjang Sekali";
    expect(uniqueSheetName(long, used)).toHaveLength(31);
    const second = uniqueSheetName(long, used);
    expect(second).toMatch(/ \(2\)$/);
    expect(second.length).toBeLessThanOrEqual(31);
  });
});

describe("tanggalPanjang", () => {
  it("formats Indonesian long dates", () => {
    expect(tanggalPanjang("2026-11-01")).toBe("1 November 2026");
  });
});
