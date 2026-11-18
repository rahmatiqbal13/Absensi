import { describe, it, expect } from "vitest";
import { dayPlan, type Roster } from "./roster";

const BASE = { jamMasuk: "08:00", jamPulang: "16:00", toleransiMenit: 15, hariKerja: [1, 2, 3, 4, 5] };
// 2026-11-18 Wednesday, 2026-11-21 Saturday.

describe("dayPlan", () => {
  it("falls back to the regular schedule without a roster entry", () => {
    expect(dayPlan(BASE, "2026-11-18", false)).toMatchObject({ working: true, jamMasuk: "08:00", source: "jadwal" });
    expect(dayPlan(BASE, "2026-11-21", false).working).toBe(false);
    expect(dayPlan(BASE, "2026-11-18", true).working).toBe(false);
  });
  it("uses the rostered shift's times, even on a Saturday or holiday", () => {
    const roster: Roster = new Map([["2026-11-21", { nama: "Siang", jamMasuk: "15:00", jamPulang: "23:00", toleransiMenit: 10 }]]);
    expect(dayPlan(BASE, "2026-11-21", true, roster)).toEqual({
      working: true, jamMasuk: "15:00", jamPulang: "23:00", toleransiMenit: 10, source: "shift", shiftNama: "Siang",
    });
  });
  it("treats a rostered libur as a day off", () => {
    const roster: Roster = new Map([["2026-11-18", null]]);
    expect(dayPlan(BASE, "2026-11-18", false, roster)).toMatchObject({ working: false, source: "libur" });
  });
});
