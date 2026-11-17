import { describe, it, expect } from "vitest";
import { isUuid, parsePeriodeSlug, paths, periodeSlug } from "./paths";

describe("readable paths", () => {
  it("formats and parses the period segment", () => {
    expect(periodeSlug(3, 2026)).toBe("2026-03");
    expect(parsePeriodeSlug("2026-11")).toEqual({ bulan: 11, tahun: 2026 });
    expect(parsePeriodeSlug("2026-13")).toBeNull();
    expect(parsePeriodeSlug("slip")).toBeNull();
  });

  it("builds name-based URLs", () => {
    const p = { branchSlug: "kantor-pusat", bulan: 11, tahun: 2026 };
    expect(paths.payrollPeriod(p)).toBe("/payroll/kantor-pusat/2026-11");
    expect(paths.payrollSlip(p, "rahmat-iqbal")).toBe("/payroll/kantor-pusat/2026-11/rahmat-iqbal");
    expect(paths.payrollSlipPdf(p, "rahmat-iqbal")).toBe("/payroll/kantor-pusat/2026-11/rahmat-iqbal/pdf");
    expect(paths.slipGaji(1, 2027)).toBe("/slip-gaji/2027-01");
    expect(paths.karyawan("budi")).toBe("/karyawan/budi");
    expect(paths.laporanKaryawan("budi")).toBe("/laporan/karyawan/budi");
  });

  it("tells legacy UUID links apart from slugs", () => {
    expect(isUuid("c9e81899-7e70-459b-ad3b-53e13050339e")).toBe(true);
    expect(isUuid("kantor-pusat")).toBe(false);
    expect(isUuid("2026-11")).toBe(false);
  });
});
