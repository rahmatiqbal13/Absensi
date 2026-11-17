import { describe, it, expect } from "vitest";
import { overtimeMinutes, overtimePay } from "./overtime";

describe("overtimeMinutes", () => {
  // 17:00 schedule end; times are Jakarta (UTC+7).
  it("ignores leaving on time or under 30 minutes late", () => {
    expect(overtimeMinutes("2026-08-03T10:00:00Z", "17:00")).toBe(0); // 17:00
    expect(overtimeMinutes("2026-08-03T10:29:00Z", "17:00")).toBe(0); // 17:29
    expect(overtimeMinutes(null, "17:00")).toBe(0);
  });
  it("counts from the scheduled end, capped at 4 hours", () => {
    expect(overtimeMinutes("2026-08-03T10:30:00Z", "17:00")).toBe(30);
    expect(overtimeMinutes("2026-08-03T12:15:00Z", "17:00")).toBe(135); // 19:15
    expect(overtimeMinutes("2026-08-03T16:00:00Z", "17:00")).toBe(240); // 23:00
  });
});

describe("overtimePay", () => {
  it("pays the first hour at 1.5x and the rest at 2x of 1/173 monthly wage", () => {
    const g = 5_190_000; // 30,000 / hour
    expect(overtimePay(60, g)).toBe(45_000);
    expect(overtimePay(120, g)).toBe(105_000);
    expect(overtimePay(30, g)).toBe(22_500);
    expect(overtimePay(0, g)).toBe(0);
  });
});
