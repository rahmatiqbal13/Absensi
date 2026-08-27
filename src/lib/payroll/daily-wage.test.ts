import { describe, it, expect } from "vitest";
import { dailyWage } from "./daily-wage";

describe("dailyWage", () => {
  it("divides gaji pokok by full-month effective days", () => {
    expect(dailyWage(10_000_000, 20)).toBe(500_000);
  });
  it("rounds to 2 decimals", () => {
    expect(dailyWage(10_000_000, 22)).toBe(454_545.45);
  });
  it("returns 0 when there are no effective days", () => {
    expect(dailyWage(10_000_000, 0)).toBe(0);
    expect(dailyWage(10_000_000, -1)).toBe(0);
  });
});
