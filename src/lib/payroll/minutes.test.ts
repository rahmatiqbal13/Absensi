import { describe, it, expect } from "vitest";
import { jakartaMinutesOfDay, scheduleMinutes } from "./minutes";

describe("jakartaMinutesOfDay", () => {
  it("reads the wall-clock minute in Asia/Jakarta regardless of the offset in the string", () => {
    // 02:05Z == 09:05 WIB
    expect(jakartaMinutesOfDay("2026-08-14T02:05:00Z")).toBe(9 * 60 + 5);
    // same instant, written with the +07:00 offset
    expect(jakartaMinutesOfDay("2026-08-14T09:05:00+07:00")).toBe(9 * 60 + 5);
  });

  it("is independent of the executing process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(jakartaMinutesOfDay("2026-08-14T02:05:00Z")).toBe(9 * 60 + 5);
      process.env.TZ = "Pacific/Kiritimati";
      expect(jakartaMinutesOfDay("2026-08-14T02:05:00Z")).toBe(9 * 60 + 5);
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("scheduleMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(scheduleMinutes("09:00")).toBe(540);
    expect(scheduleMinutes("17:30:00")).toBe(1050);
  });
});
