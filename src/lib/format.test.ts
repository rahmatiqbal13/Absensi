import { describe, it, expect } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("formats whole numbers as Indonesian Rupiah without decimals", () => {
    expect(formatRupiah(4500000)).toBe("Rp4.500.000");
  });

  it("rounds fractional amounts to the nearest Rupiah", () => {
    expect(formatRupiah(1000.6)).toBe("Rp1.001");
  });

  it("formats zero", () => {
    expect(formatRupiah(0)).toBe("Rp0");
  });
});
