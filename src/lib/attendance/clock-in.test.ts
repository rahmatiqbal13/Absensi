import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clockIn } from "./clock-in";
import { qrToken } from "./qr-token";

const BASE_EMPLOYEE = {
  id: "employee-1",
  branch_id: "branch-1",
};

const BASE_BRANCH = {
  id: "branch-1",
  lat: -6.2,
  long: 106.8,
  radius_geofencing_meter: 100,
  qr_enabled: false,
  qr_secret: null,
};

const BASE_SCHEDULE = {
  branch_id: "branch-1",
  jam_masuk: "09:00:00",
  jam_pulang: "17:00:00",
  toleransi_terlambat_menit: 15,
};

function makeMockDb(
  opts: {
    existingAttendance?: any[];
    existingAttendanceError?: { message: string; code?: string } | null;
    consentRows?: any[];
    insertError?: { message: string; code?: string } | null;
    branch?: any;
  } = {},
) {
  const {
    existingAttendance = [],
    existingAttendanceError = null,
    consentRows = [{ id: "consent-1" }],
    insertError = null,
    branch = BASE_BRANCH,
  } = opts;

  // Spies for the chain steps whose arguments/payloads the tests assert on.
  const dupLimitMock = vi
    .fn()
    .mockResolvedValue({ data: existingAttendance, error: existingAttendanceError });
  const dupTanggalEqMock = vi.fn().mockReturnValue({ limit: dupLimitMock });
  const dupEmployeeEqMock = vi.fn().mockReturnValue({ eq: dupTanggalEqMock });
  const attendancesSelectMock = vi.fn().mockReturnValue({ eq: dupEmployeeEqMock });

  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        insertError
          ? { data: null, error: insertError }
          : { data: { id: "attendance-1" }, error: null },
      ),
    }),
  });

  const scheduleMaybeSingleMock = vi
    .fn()
    .mockResolvedValue({ data: BASE_SCHEDULE, error: null });
  const scheduleLimitMock = vi.fn().mockReturnValue({ maybeSingle: scheduleMaybeSingleMock });
  const scheduleEqMock = vi.fn().mockReturnValue({ limit: scheduleLimitMock });

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: BASE_EMPLOYEE, error: null }) }),
      }),
    },
    branches: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: branch, error: null }) }),
      }),
    },
    work_schedules: {
      select: vi.fn().mockReturnValue({ eq: scheduleEqMock }),
    },
    consents: {
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: consentRows, error: null }) }) }),
      }),
    },
    attendances: {
      select: attendancesSelectMock,
      insert: insertMock,
    },
  };

  return {
    from: vi.fn((table: string) => tables[table]),
    __attendancesSelectMock: attendancesSelectMock,
    __dupEmployeeEqMock: dupEmployeeEqMock,
    __dupTanggalEqMock: dupTanggalEqMock,
    __dupLimitMock: dupLimitMock,
    __insertMock: insertMock,
    __scheduleEqMock: scheduleEqMock,
    __scheduleLimitMock: scheduleLimitMock,
    __scheduleMaybeSingleMock: scheduleMaybeSingleMock,
  };
}

describe("clockIn", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

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

    // The duplicate pre-check must be scoped to this employee and this day.
    expect(db.__attendancesSelectMock).toHaveBeenCalledWith("id");
    expect(db.__dupEmployeeEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__dupTanggalEqMock).toHaveBeenCalledWith("tanggal", "2026-09-01");
    expect(db.__dupLimitMock).toHaveBeenCalledWith(1);

    // The persisted payload, not just the returned status.
    expect(db.__insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: "employee-1",
        tanggal: "2026-09-01",
        status: "tepat_waktu",
        catatan: null,
        lokasi_masuk: "(-6.2,106.8)",
        jam_masuk: now.toISOString(),
        foto_masuk_url: "employee-1/masuk-1.jpg",
        foto_masuk_expires_at: "2026-12-01T00:00:00.000Z",
      }),
    );
  });

  it("keys tanggal to the Asia/Jakarta calendar date, not the UTC date", async () => {
    const db = makeMockDb();
    // 2026-09-01T20:00:00Z is 2026-09-02T03:00:00+07:00 — an early-morning
    // clock-in whose Jakarta date (2026-09-02) differs from its UTC date
    // (2026-09-01). Using the UTC date here would file the row under the
    // previous workday, defeating the unique (employee_id, tanggal) guard.
    const now = new Date("2026-09-01T20:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-09-01");

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now,
    });

    expect(result.ok).toBe(true);
    expect(db.__dupTanggalEqMock).toHaveBeenCalledWith("tanggal", "2026-09-02");
    expect(db.__insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ tanggal: "2026-09-02" }),
    );
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
    expect(db.__insertMock).not.toHaveBeenCalled();
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
    expect(db.__insertMock).not.toHaveBeenCalled();
  });

  it("fails closed when the duplicate pre-check query itself errors", async () => {
    const db = makeMockDb({ existingAttendanceError: { message: "connection reset" } });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Gagal memeriksa absensi hari ini." });
    expect(db.__insertMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
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

  it("rejects a whitespace-only catatan when outside the geofence radius", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9175,
      long: 107.6191,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      catatan: "   ",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({
      ok: false,
      error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
    });
    expect(db.__insertMock).not.toHaveBeenCalled();
  });

  it("accepts clocking in outside the geofence radius when catatan is provided, with di_luar_lokasi status", async () => {
    const db = makeMockDb();

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9175,
      long: 107.6191,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      catatan: "  Kunjungan klien di luar kota  ",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "di_luar_lokasi" });
    // Stored trimmed, not with the surrounding whitespace.
    expect(db.__insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "di_luar_lokasi",
        catatan: "Kunjungan klien di luar kota",
        lokasi_masuk: "(-6.9175,107.6191)",
      }),
    );
  });

  it("allows clock-in without a reason when the branch geofence is unconfigured", async () => {
    const db = makeMockDb({ branch: { id: "branch-1", lat: 0, long: 0, radius_geofencing_meter: 100 } });
    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "p",
      photoExpiresAt: new Date().toISOString(),
      now: new Date("2026-09-07T02:00:00Z"), // 09:00 WIB
    });
    expect(result.ok).toBe(true);
  });

  it("still requires a reason when configured and out of radius", async () => {
    const db = makeMockDb(); // BASE_BRANCH at -6.2,106.8 r=100
    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.9,
      long: 107.6, // far
      photoPath: "p",
      photoExpiresAt: new Date().toISOString(),
      now: new Date("2026-09-07T02:00:00Z"),
    });
    expect(result).toEqual({
      ok: false,
      error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
    });
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
    expect(db.__insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "terlambat" }),
    );
  });

  it("takes the first work schedule row rather than erroring when a branch has several", async () => {
    const db = makeMockDb();

    await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(db.__scheduleEqMock).toHaveBeenCalledWith("branch_id", "branch-1");
    expect(db.__scheduleLimitMock).toHaveBeenCalledWith(1);
    expect(db.__scheduleMaybeSingleMock).toHaveBeenCalled();
  });

  it("returns a generic Indonesian message and logs the raw error when the insert fails", async () => {
    const db = makeMockDb({ insertError: { message: "null value in column violates not-null" } });

    const result = await clockIn(db as any, {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Gagal menyimpan absensi." });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  describe("QR path", () => {
    const QR_SECRET = "kiosk-secret-branch-1";
    const QR_NOW = new Date("2026-09-01T08:58:00+07:00");
    const QR_BRANCH = { ...BASE_BRANCH, qr_enabled: true, qr_secret: QR_SECRET };
    const FAR = { lat: -6.9175, long: 107.6191 };

    it("accepts a valid scanned QR with far coords, no geofence gate, and records metode_masuk qr", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: FAR.lat,
        long: FAR.long,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: `branch-1|${token}`,
        now: QR_NOW,
      });

      expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_masuk: "qr", status: "tepat_waktu" }),
      );
    });

    it("accepts a valid scanned QR even with absent (zero) coords", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: 0,
        long: 0,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: `branch-1|${token}`,
        now: QR_NOW,
      });

      expect(result.ok).toBe(true);
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_masuk: "qr" }),
      );
    });

    it("rejects an expired/garbage QR token without inserting", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: FAR.lat,
        long: FAR.long,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: "branch-1|deadbeefdeadbeef",
        now: QR_NOW,
      });

      expect(result).toEqual({
        ok: false,
        error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang.",
      });
      expect(db.__insertMock).not.toHaveBeenCalled();
    });

    it("rejects a QR token minted for a different branch id", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: FAR.lat,
        long: FAR.long,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: `branch-999|${token}`,
        now: QR_NOW,
      });

      expect(result).toEqual({
        ok: false,
        error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang.",
      });
      expect(db.__insertMock).not.toHaveBeenCalled();
    });

    it("ignores qrToken when the branch has QR disabled and runs the GPS path", async () => {
      const db = makeMockDb(); // BASE_BRANCH: qr_enabled false
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: -6.2,
        long: 106.8,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: `branch-1|${token}`,
        now: QR_NOW,
      });

      expect(result.ok).toBe(true);
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_masuk: "gps" }),
      );
    });

    it("records metode_masuk gps on the plain GPS path (no qrToken)", async () => {
      const db = makeMockDb();

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: -6.2,
        long: 106.8,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        now: QR_NOW,
      });

      expect(result.ok).toBe(true);
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_masuk: "gps" }),
      );
    });
  });

  it("maps a unique-violation insert error to the duplicate clock-in message", async () => {
    const db = makeMockDb({
      insertError: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "attendances_employee_id_tanggal_key"',
      },
    });

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
});
