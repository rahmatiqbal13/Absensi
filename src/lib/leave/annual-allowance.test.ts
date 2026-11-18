import { describe, it, expect } from "vitest";
import { annualAllowance } from "./balance-lookup";

describe("annualAllowance", () => {
  it("is 0 for interns whatever the stored row says", () => {
    expect(annualAllowance(12, true)).toBe(0);
    expect(annualAllowance(null, true)).toBe(0);
  });
  it("uses the stored row, else 12, for everyone else", () => {
    expect(annualAllowance(null, false)).toBe(12);
    expect(annualAllowance("10.00", false)).toBe(10);
  });
});
