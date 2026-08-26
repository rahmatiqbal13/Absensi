import { describe, it, expect, vi } from "vitest";
import { clockIn } from "./clock-in";

const BASE_EMPLOYEE = {
  id: "employee-1",
  branch_id: "branch-1",
};

const BASE_BRANCH = {
  id: "branch-1",
  lat: -6.2,
  long: 106.8,
  radius_geofencing_meter: 100,
};

const BASE_SCHEDULE = {
  branch_id: "branch-1",
  jam_masuk: "09:00:00",
  jam_pulang: "17:00:00",
  toleransi_terlambat_menit: 15,
};

function makeMockDb(opts: {
  existingAttendance?: any[];
  consentRows?: any[];
  insertError?: { message: string } | null;
} = {}) {
  const {
    existingAttendance = [],
    consentRows = [{ id: "consent-1" }],
    insertError = null,
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
    consents: {
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: consentRows, error: null }) }) }),
      }),
    },
    attendances: {
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: existingAttendance, error: null }) }) }),
      }),
      insert: () => ({
        select: () => ({
          single: () =>
            insertError
              ? Promise.resolve({ data: null, error: insertError })
              : Promise.resolve({ data: { id: "attendance-1" }, error: null }),
        }),
      }),
    },
  };

  return {
    from: vi.fn((table: string) => tables[table]),
  };
}

describe("clockIn", () => {
  it("creates an attendance row with tepat_waktu when on time and within radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T08:58:00+07:00");

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now,
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
  });

  it("rejects when the employee has not given consent", async () => {
    const db = makeMockDb({ consentRows: [] });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Persetujuan pemrosesan data lokasi/foto diperlukan sebelum absen.",
    });
  });

  it("rejects a duplicate clock-in for the same day", async () => {
    const db = makeMockDb({ existingAttendance: [{ id: "attendance-existing" }] });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda sudah absen masuk hari ini." });
  });

  it("requires catatan when clocking in outside the geofence radius", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9175,
      long: 107.6191,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
    });
  });

  it("accepts clocking in outside the geofence radius when catatan is provided, with di_luar_lokasi status", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9175,
      long: 107.6191,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      catatan: "Kunjungan klien di luar kota",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "di_luar_lokasi" });
  });

  it("returns terlambat status when clocking in past the tolerance window", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T09:30:00+07:00"),
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "terlambat" });
  });

  it("returns an error when the insert fails", async () => {
    const db = makeMockDb({ insertError: { message: "duplicate key" } });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "duplicate key" });
  });
});
