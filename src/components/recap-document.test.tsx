import { describe, it, expect } from "vitest";
import { RecapDocument } from "./recap-document";
import { treeText } from "./pdf-tree-helper";

describe("RecapDocument", () => {
  it("puts the org name in the header", () => {
    const tree = RecapDocument({
      data: {
        branchNama: "Kantor Pusat", from: "2026-01-01", to: "2026-01-31",
        rows: [], orgNama: "PT Contoh", orgLogoUrl: null,
      },
    });
    expect(treeText(tree)).toContain("PT Contoh");
  });
});
