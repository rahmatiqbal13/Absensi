import { describe, it, expect, vi } from "vitest";
import { clockOut } from "./clock-out";

const BASE_EMPLOYEE = { id: "employee-1", branch_id: "branch-1" };
const BASE_BRANCH = { id: "branch-1", lat: -6.2, long: 106.8, radius_geofencing_meter: 100 };
const BASE_SCHEDULE = { branch_id: "branch-1", jam_masuk: "09:00:00", jam_pulang: "17:00:00" };

function makeMockDb(opts: {
  todaysAttendance?: any;
  updateError?: { message: string } | null;
} = {}) {
  const {
    todaysAttendance = { id: "attendance-1", status: "tepat_waktu", jam_pulang: null },
    updateError = null,
  } = opts;

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    branches: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_BRANCH, error: null }) }),
      }),
    },
    work_schedules: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_SCHEDULE, error: null }) }),
      }),
    },
    attendances: {
      select: () => ({
        eq: () => ({
          eq: () =>
            todaysAttendance
              ? { single: () => Promise.resolve({ data: todaysAttendance, error: null }) }
              : { single: () => Promise.resolve({ data: null, error: { message: "not found" } }) },
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              updateError
                ? Promise.resolve({ data: null, error: updateError })
                : Promise.resolve({
                    data: { id: "attendance-1", status: "tepat_waktu" },
                    error: null,
                  }),
          }),
        }),
      }),
    },
  };

  return { from: vi.fn((table: string) => tables[table]) };
}

describe("clockOut", () => {
  it("updates the attendance row with tepat_waktu when on time and within radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T17:05:00+07:00");

    const result = await clockOut(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/pulang-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now,
    });

    expect(result).toEqual({ ok: true, status: "tepat_waktu" });
  });

  it("rejects when there is no clock-in record for today", async () => {
    const db = makeMockDb({ todaysAttendance: null });

    const result = await clockOut(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/pulang-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda belum absen masuk hari ini." });
  });

  it("rejects a second clock-out attempt on an already-closed record", async () => {
    const db = makeMockDb({
      todaysAttendance: {
        id: "attendance-1",
        status: "tepat_waktu",
        jam_pulang: "2026-09-01T17:05:00.000Z",
      },
    });

    const result = await clockOut(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/pulang-2.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T18:00:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda sudah absen pulang hari ini." });
  });

  it("merges pulang_cepat over an existing tepat_waktu clock-in status", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T16:00:00+07:00");

    const result = await clockOut(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/pulang-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now,
    });

    expect(result.ok).toBe(true);
  });

  it("keeps terlambat from clock-in even when clocking out on time", async () => {
    const db = makeMockDb({
      todaysAttendance: { id: "attendance-1", status: "terlambat", jam_pulang: null },
    });
    const now = new Date("2026-09-01T17:05:00+07:00");

    const result = await clockOut(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/pulang-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now,
    });

    expect(result).toEqual({ ok: true, status: "terlambat" });
  });

  it("returns an error when the update fails", async () => {
    const db = makeMockDb({ updateError: { message: "update failed" } });

    const result = await clockOut(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/pulang-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "update failed" });
  });
});
