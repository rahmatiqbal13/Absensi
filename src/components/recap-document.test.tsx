import { describe, it, expect } from "vitest";
import { Image } from "@react-pdf/renderer";
import { RecapDocument } from "./recap-document";
import { treeText, treeHasType } from "./pdf-tree-helper";

const base = {
  branchNama: "Kantor Pusat", from: "2026-01-01", to: "2026-01-31",
  rows: [], orgNama: "PT Contoh",
};

describe("RecapDocument", () => {
  it("puts the org name in the header", () => {
    const tree = RecapDocument({ data: { ...base, orgLogoUrl: null } });
    expect(treeText(tree)).toContain("PT Contoh");
  });

  it("renders no Image when orgLogoUrl is null", () => {
    const tree = RecapDocument({ data: { ...base, orgLogoUrl: null } });
    expect(treeHasType(tree, Image)).toBe(false);
  });

  it("renders an Image when orgLogoUrl is set", () => {
    const tree = RecapDocument({
      data: { ...base, orgLogoUrl: "data:image/png;base64,AAAA" },
    });
    expect(treeHasType(tree, Image)).toBe(true);
  });
});
