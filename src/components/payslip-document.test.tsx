import { describe, it, expect } from "vitest";
import { Image } from "@react-pdf/renderer";
import { PayslipDocument, type PayslipOrg } from "./payslip-document";
import { treeText, treeHasType } from "./pdf-tree-helper";
import type { PayslipDetail } from "@/lib/payroll/payslip-detail";

const slip: PayslipDetail = {
  id: "s1",
  periode: { bulan: 8, tahun: 2026, label: "Agustus 2026", status: "final" },
  karyawan: {
    nama: "Budi Santoso", jabatan: "Staf Gudang", email: "budi@x.id", departemen: "Gudang",
    cabang: "Kantor Pusat", statusKontrak: "PKWT", tanggalMulaiKerja: "2025-03-01",
  },
  gajiPokok: 5_000_000, hariKerjaEfektif: 21, gajiHarian: 238_095.24,
  totalPotonganAbsensi: 238_095.24, tarifPph21: 1, potonganPph21: 47_619.05, gajiAkhir: 4_714_285.71,
  ringkasan: {
    hariDinilai: 21, hadir: 20, terlambat: 2, pulangCepat: 0, luarKantor: 0, alpa: 1, cuti: 0,
    menitTerlambat: 25, menitPulangCepat: 0, potonganAlpa: 238_095.24, potonganKeterlambatan: 0,
  },
};
const org: PayslipOrg = { nama: "PT Contoh", alamat: "Jl. Merdeka 1", telepon: null, email: null, logoUrl: null, aksen: "#C63B22" };
const render = (o: Partial<PayslipOrg> = {}, sl: Partial<PayslipDetail> = {}) =>
  PayslipDocument({ slip: { ...slip, ...sl }, org: { ...org, ...o }, printedAt: new Date("2026-11-17T02:52:00Z") });

describe("PayslipDocument", () => {
  it("has the org letterhead, employee data and period", () => {
    const text = treeText(render());
    for (const t of ["PT Contoh", "Jl. Merdeka 1", "SLIP GAJI", "Agustus 2026", "Budi Santoso", "Staf Gudang", "Gudang"]) {
      expect(text).toContain(t);
    }
  });

  it("itemises deductions, including PPh 21, and states the net in words", () => {
    const text = treeText(render());
    expect(text).toContain("Alpa (1 hari)");
    expect(text).toContain("PPh 21 (1%)");
    expect(text).toContain("Gaji bersih diterima");
    expect(text).toContain("Empat juta tujuh ratus empat belas ribu dua ratus delapan puluh enam rupiah");
  });

  it("marks a draft and shows the print time in WIB", () => {
    const text = treeText(render({}, { periode: { ...slip.periode, status: "draft" } }));
    expect(text).toContain("DRAF");
    expect(text).toMatch(/09[.:]52 WIB/);
  });

  it("renders the logo only when there is one", () => {
    expect(treeHasType(render(), Image)).toBe(false);
    expect(treeHasType(render({ logoUrl: "data:image/png;base64,AAAA" }), Image)).toBe(true);
  });
});
