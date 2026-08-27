import { describe, it, expect } from "vitest";
import { formatRupiah } from "./rupiah";

describe("formatRupiah", () => {
  it("formats whole rupiah with a grouping separator and no decimals", () => {
    const s = formatRupiah(10_500_000);
    expect(s).toContain("10.500.000");
    expect(s).toContain("Rp");
    expect(s).not.toContain(",00");
  });
  it("rounds fractional input", () => {
    expect(formatRupiah(454_545.45)).toContain("454.545");
  });
});
