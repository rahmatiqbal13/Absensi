import { describe, it, expect } from "vitest";
import {
  calculateLeaveDays,
  requiresBalanceCheck,
  hasSufficientBalance,
  LEAVE_TYPES_WITH_BALANCE_CHECK,
} from "./balance";

describe("calculateLeaveDays", () => {
  it("counts a single day as 1", () => {
    expect(calculateLeaveDays("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("counts a range inclusively", () => {
    expect(calculateLeaveDays("2026-10-01", "2026-10-05")).toBe(5);
  });

  it("counts across a month boundary correctly", () => {
    expect(calculateLeaveDays("2026-10-30", "2026-11-02")).toBe(4);
  });
});

describe("requiresBalanceCheck", () => {
  it("returns true only for tahunan", () => {
    expect(requiresBalanceCheck("tahunan")).toBe(true);
    expect(LEAVE_TYPES_WITH_BALANCE_CHECK).toEqual(["tahunan"]);
  });

  it("returns false for sakit and other types", () => {
    expect(requiresBalanceCheck("sakit")).toBe(false);
    expect(requiresBalanceCheck("menikah")).toBe(false);
    expect(requiresBalanceCheck("lainnya")).toBe(false);
  });
});

describe("hasSufficientBalance", () => {
  it("returns true when requested days is within the remaining balance", () => {
    expect(hasSufficientBalance(12, 5)).toBe(true);
    expect(hasSufficientBalance(5, 5)).toBe(true);
  });

  it("returns false when requested days exceeds the remaining balance", () => {
    expect(hasSufficientBalance(3, 5)).toBe(false);
  });
});
