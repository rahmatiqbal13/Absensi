import { describe, it, expect } from "vitest";
import { effectiveWorkDays } from "./effective-days";

const MON_FRI = [1, 2, 3, 4, 5];

describe("effectiveWorkDays", () => {
  it("lists every Mon-Fri in a month with no holidays", () => {
    const { fullMonthDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: [],
    });
    // August 2026: 1st is a Saturday. 21 weekdays.
    expect(fullMonthDays).toHaveLength(21);
    expect(fullMonthDays[0]).toBe("2026-08-03");
    expect(fullMonthDays.at(-1)).toBe("2026-08-31");
  });

  it("excludes holiday dates", () => {
    const { fullMonthDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: ["2026-08-17"],
    });
    expect(fullMonthDays).toHaveLength(20);
    expect(fullMonthDays).not.toContain("2026-08-17");
  });

  it("handles a leap-year February", () => {
    const { fullMonthDays } = effectiveWorkDays({
      year: 2028, month: 2, hariKerja: MON_FRI, holidayDates: [],
    });
    expect(fullMonthDays).toContain("2028-02-29");
  });

  it("accrualDays drops days before joinDate but fullMonthDays keeps them", () => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: [], joinDate: "2026-08-17",
    });
    expect(fullMonthDays).toHaveLength(21);
    expect(accrualDays[0]).toBe("2026-08-17");
    expect(accrualDays.every((d) => d >= "2026-08-17")).toBe(true);
  });

  it("a joinDate before the month has no effect", () => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: MON_FRI, holidayDates: [], joinDate: "2026-01-01",
    });
    expect(accrualDays).toEqual(fullMonthDays);
  });

  it("returns empty arrays when hariKerja is empty", () => {
    const { fullMonthDays, accrualDays } = effectiveWorkDays({
      year: 2026, month: 8, hariKerja: [], holidayDates: [],
    });
    expect(fullMonthDays).toEqual([]);
    expect(accrualDays).toEqual([]);
  });
});
