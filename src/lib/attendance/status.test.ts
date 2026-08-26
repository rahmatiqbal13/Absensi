import { describe, it, expect } from "vitest";
import { resolveClockInStatus, resolveClockOutStatus, mergeAttendanceStatus } from "./status";

describe("resolveClockInStatus", () => {
  it("returns tepat_waktu when clocking in before the scheduled start, within radius", () => {
    const clockInTime = new Date("2026-09-01T08:55:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: true,
    });
    expect(result).toBe("tepat_waktu");
  });

  it("returns tepat_waktu when clocking in within the tolerance window", () => {
    const clockInTime = new Date("2026-09-01T09:10:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: true,
    });
    expect(result).toBe("tepat_waktu");
  });

  it("returns terlambat when clocking in past the tolerance window", () => {
    const clockInTime = new Date("2026-09-01T09:16:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: true,
    });
    expect(result).toBe("terlambat");
  });

  it("returns di_luar_lokasi when outside radius, even if on time", () => {
    const clockInTime = new Date("2026-09-01T08:55:00+07:00");
    const result = resolveClockInStatus({
      clockInTime,
      scheduledStart: "09:00",
      toleranceMinutes: 15,
      withinRadius: false,
    });
    expect(result).toBe("di_luar_lokasi");
  });
});

describe("resolveClockOutStatus", () => {
  it("returns tepat_waktu when clocking out at or after the scheduled end, within radius", () => {
    const clockOutTime = new Date("2026-09-01T17:05:00+07:00");
    const result = resolveClockOutStatus({
      clockOutTime,
      scheduledEnd: "17:00",
      withinRadius: true,
    });
    expect(result).toBe("tepat_waktu");
  });

  it("returns pulang_cepat when clocking out before the scheduled end", () => {
    const clockOutTime = new Date("2026-09-01T16:30:00+07:00");
    const result = resolveClockOutStatus({
      clockOutTime,
      scheduledEnd: "17:00",
      withinRadius: true,
    });
    expect(result).toBe("pulang_cepat");
  });

  it("returns di_luar_lokasi when outside radius, even if on time", () => {
    const clockOutTime = new Date("2026-09-01T17:05:00+07:00");
    const result = resolveClockOutStatus({
      clockOutTime,
      scheduledEnd: "17:00",
      withinRadius: false,
    });
    expect(result).toBe("di_luar_lokasi");
  });
});

describe("mergeAttendanceStatus", () => {
  it("prioritizes di_luar_lokasi over everything else", () => {
    expect(mergeAttendanceStatus("di_luar_lokasi", "tepat_waktu")).toBe("di_luar_lokasi");
    expect(mergeAttendanceStatus("tepat_waktu", "di_luar_lokasi")).toBe("di_luar_lokasi");
    expect(mergeAttendanceStatus("terlambat", "di_luar_lokasi")).toBe("di_luar_lokasi");
  });

  it("prioritizes terlambat over pulang_cepat and tepat_waktu", () => {
    expect(mergeAttendanceStatus("terlambat", "pulang_cepat")).toBe("terlambat");
    expect(mergeAttendanceStatus("terlambat", "tepat_waktu")).toBe("terlambat");
  });

  it("prioritizes pulang_cepat over tepat_waktu", () => {
    expect(mergeAttendanceStatus("tepat_waktu", "pulang_cepat")).toBe("pulang_cepat");
  });

  it("returns tepat_waktu when both are tepat_waktu", () => {
    expect(mergeAttendanceStatus("tepat_waktu", "tepat_waktu")).toBe("tepat_waktu");
  });
});
