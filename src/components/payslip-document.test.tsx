import { describe, it, expect } from "vitest";
import { Image } from "@react-pdf/renderer";
import { PayslipDocument } from "./payslip-document";
import { treeText, treeHasType } from "./pdf-tree-helper";

const base = {
  nama: "Budi", branchNama: "Kantor Pusat", periodeLabel: "Januari 2026",
  gajiPokok: 5000000, hariKerjaEfektif: 22, gajiHarian: 227272,
  totalPotongan: 100000, gajiAkhir: 4900000,
};

describe("PayslipDocument", () => {
  it("puts the org name in the header", () => {
    const tree = PayslipDocument({ data: { ...base, orgNama: "PT Contoh", orgLogoUrl: null } });
    expect(treeText(tree)).toContain("PT Contoh");
  });

  it("renders no Image when orgLogoUrl is null", () => {
    const tree = PayslipDocument({ data: { ...base, orgNama: "PT Contoh", orgLogoUrl: null } });
    expect(treeHasType(tree, Image)).toBe(false);
  });

  it("renders an Image when orgLogoUrl is set", () => {
    const tree = PayslipDocument({
      data: { ...base, orgNama: "PT Contoh", orgLogoUrl: "data:image/png;base64,AAAA" },
    });
    expect(treeHasType(tree, Image)).toBe(true);
  });
});
