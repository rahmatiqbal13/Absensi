import { describe, it, expect } from "vitest";
import { approvedOvertimeMinutes, overtimeMinutes, overtimePay, restDayOvertimeMinutes } from "./overtime";

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


describe("approvedOvertimeMinutes", () => {
  // Clocked out 19:30 WIB, schedule ends 17:00.
  const OUT = "2026-11-18T12:30:00Z";
  it("pays nothing without an approval", () => {
    expect(approvedOvertimeMinutes(OUT, "17:00", [])).toBe(0);
    expect(approvedOvertimeMinutes(OUT, "17:00", undefined)).toBe(0);
  });
  it("caps by the real clock-out", () => {
    expect(approvedOvertimeMinutes(OUT, "17:00", [{ jamMulai: "17:00", jamSelesai: "21:00" }])).toBe(150);
  });
  it("caps by the approved window", () => {
    expect(approvedOvertimeMinutes(OUT, "17:00", [{ jamMulai: "17:00", jamSelesai: "18:00" }])).toBe(60);
  });
  it("never counts time before the scheduled end", () => {
    expect(approvedOvertimeMinutes(OUT, "17:00", [{ jamMulai: "16:00", jamSelesai: "18:00" }])).toBe(60);
  });
  it("keeps the 30-minute floor and 4-hour cap", () => {
    expect(approvedOvertimeMinutes("2026-11-18T10:20:00Z", "17:00", [{ jamMulai: "17:00", jamSelesai: "20:00" }])).toBe(0);
    expect(approvedOvertimeMinutes("2026-11-18T16:00:00Z", "17:00", [{ jamMulai: "17:00", jamSelesai: "23:30" }])).toBe(240);
  });
});

describe("restDayOvertimeMinutes", () => {
  const iso = (hhmm: string) => `2026-11-01T${hhmm}:00+07:00`;
  const win = [{ jamMulai: "08:00", jamSelesai: "16:00" }];

  it("counts the approved window the employee was clocked in, from the window's start", () => {
    expect(restDayOvertimeMinutes(iso("07:23"), iso("17:09"), win)).toBe(480);
    expect(restDayOvertimeMinutes(iso("09:30"), iso("12:00"), win)).toBe(150);
  });

  it("is zero without an approval or without both clock times", () => {
    expect(restDayOvertimeMinutes(iso("07:00"), iso("17:00"), undefined)).toBe(0);
    expect(restDayOvertimeMinutes(iso("07:00"), null, win)).toBe(0);
  });
});
