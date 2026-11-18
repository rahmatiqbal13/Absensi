import { describe, it, expect } from "vitest";
import { Image } from "@react-pdf/renderer";
import { RecapDocument, type RecapDocData } from "./recap-document";
import { treeText, treeHasType } from "./pdf-tree-helper";
import type { DailyRow } from "@/lib/laporan/employee-daily";
import type { RecapRow } from "@/lib/laporan/attendance-recap";

const ROW: RecapRow = {
  employeeId: "e1", nama: "Ayub Baharuddin", hadir: 1, terlambat: 0, pulangCepat: 0, diLuarLokasi: 0,
  alpa: 0, cuti: 0, lain: 0, totalMenitTerlambat: 0, menitLembur: 0, hariKerjaEfektif: 1,
};
const DAY: DailyRow = {
  tanggal: "2026-11-03", kind: "hadir", status: "tepat_waktu",
  jamMasuk: "2026-11-03T00:55:00Z", jamPulang: "2026-11-03T09:05:00Z", durasiMenit: 490,
  menitTerlambat: 0, menitPulangCepat: 0, menitLembur: 0, keterangan: null, catatan: null, flagLokasi: [],
};

const base: RecapDocData = {
  branchNama: "Kantor Pusat", from: "2026-11-01", to: "2026-11-30",
  rows: [ROW], daily: { e1: [DAY] }, jadwal: { e1: "08:00–16:00, Sen, Sel" },
  org: { nama: "PT Contoh", alamat: "Jl. Ketintang, Surabaya", logoUrl: null },
  dicetak: "18 Nov 2026 09:00",
};

describe("RecapDocument", () => {
  it("puts the org name and address in the letterhead", () => {
    const text = treeText(RecapDocument({ data: base }));
    expect(text).toContain("PT Contoh");
    expect(text).toContain("Jl. Ketintang, Surabaya");
  });

  it("shows total working hours in the summary", () => {
    expect(treeText(RecapDocument({ data: base }))).toContain("8j 10m");
  });

  it("appends each employee's day-by-day page with jam masuk and pulang in WIB", () => {
    const text = treeText(RecapDocument({ data: base }));
    expect(text).toMatch(/Kehadiran Harian — +Ayub Baharuddin/);
    expect(text).toContain("Sel, 03 Nov");
    expect(text).toContain("07:55");
    expect(text).toContain("16:05");
    expect(text).toContain("Jadwal 08:00–16:00, Sen, Sel");
  });

  it("renders the logo only when one is set", () => {
    expect(treeHasType(RecapDocument({ data: base }), Image)).toBe(false);
    expect(
      treeHasType(RecapDocument({ data: { ...base, org: { ...base.org, logoUrl: "data:image/png;base64,AAAA" } } }), Image),
    ).toBe(true);
  });
});
