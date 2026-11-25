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
  department_id: null,
  jam_masuk: "09:00:00",
  jam_pulang: "17:00:00",
  toleransi_terlambat_menit: 15,
};

function makeMockDb(
  opts: {
    employee?: { id: string; branch_id: string; department_id?: string | null };
    schedules?: any[];
    /** departments row for the employee's department pin (0037); null = none set. */
    departmentPin?: { lat: number | null; long: number | null; radius_geofencing_meter: number | null; branch_id: string } | null;
    existingAttendance?: any[];
    existingAttendanceError?: { message: string; code?: string } | null;
    consentRows?: any[];
    insertError?: { message: string; code?: string } | null;
    /** Errors for successive insert() calls (null = success); overrides insertError. */
    insertErrors?: ({ message: string; code?: string } | null)[];
    branch?: any;
    /** Error from the separate qr_enabled/qr_secret lookup — pre-migration. */
    qrColumnsError?: { message: string; code?: string } | null;
  } = {},
) {
  const {
    existingAttendance = [],
    existingAttendanceError = null,
    consentRows = [{ id: "consent-1" }],
    insertError = null,
    insertErrors = [insertError],
    branch = BASE_BRANCH,
    qrColumnsError = null,
    employee = BASE_EMPLOYEE,
    schedules = [BASE_SCHEDULE],
    departmentPin = null,
  } = opts;

  // Spies for the chain steps whose arguments/payloads the tests assert on.
  const dupLimitMock = vi
    .fn()
    .mockResolvedValue({ data: existingAttendance, error: existingAttendanceError });
  const dupTanggalEqMock = vi.fn().mockReturnValue({ limit: dupLimitMock });
  const dupEmployeeEqMock = vi.fn().mockReturnValue({ eq: dupTanggalEqMock });
  const attendancesSelectMock = vi.fn().mockReturnValue({ eq: dupEmployeeEqMock });

  let insertCall = 0;
  const insertMock = vi.fn((_payload: Record<string, unknown>) => {
    const err = insertErrors[Math.min(insertCall++, insertErrors.length - 1)];
    return {
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(err ? { data: null, error: err } : { data: { id: "attendance-1" }, error: null }),
      }),
    };
  });

  // loadSchedules: .select(...).in("branch_id", [...]) -> every schedule row of the branch.
  const scheduleInMock = vi.fn().mockResolvedValue({ data: schedules, error: null });

  const tables: Record<string, any> = {
    employees: {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: employee, error: null }) }),
      }),
    },
    branches: {
      select: () => ({
        eq: () => ({
          // Main branch query (id, lat, long, radius_geofencing_meter).
          single: () => Promise.resolve({ data: branch, error: null }),
          // Separate migration-tolerant qr_enabled/qr_secret lookup.
          maybeSingle: () =>
            Promise.resolve(
              qrColumnsError
                ? { data: null, error: qrColumnsError }
                : { data: branch, error: null },
            ),
        }),
      }),
    },
    departments: {
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: departmentPin, error: null }) }),
      }),
    },
    work_schedules: {
      select: vi.fn().mockReturnValue({ in: scheduleInMock }),
    },
    consents: {
      select: () => ({
        eq: () => ({
          eq: () => {
            const limit = () => Promise.resolve({ data: consentRows, error: null });
            return { limit, is: () => ({ limit }) };
          },
        }),
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
    __scheduleInMock: scheduleInMock,
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

  it("uses the employee's department schedule over the branch default", async () => {
    const input = {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    };
    const schedules = [
      BASE_SCHEDULE,
      { ...BASE_SCHEDULE, department_id: "dept-gudang", jam_masuk: "07:00:00", jam_pulang: "15:00:00" },
    ];

    // 08:58 is on time for the 09:00 branch default...
    const office = makeMockDb({ schedules, employee: { ...BASE_EMPLOYEE, department_id: "dept-kantor" } });
    expect(await clockIn(office as any, input)).toMatchObject({ ok: true, status: "tepat_waktu" });
    expect(office.__scheduleInMock).toHaveBeenCalledWith("branch_id", ["branch-1"]);

    // ...but late for the warehouse department's own 07:00 start.
    const gudang = makeMockDb({ schedules, employee: { ...BASE_EMPLOYEE, department_id: "dept-gudang" } });
    expect(await clockIn(gudang as any, input)).toMatchObject({ ok: true, status: "terlambat" });
  });

  describe("department location pin", () => {
    // Branch office at (-6.2, 106.8); the warehouse department sits ~5.5 km away.
    const WAREHOUSE = { lat: -6.25, long: 106.8, radius_geofencing_meter: 150, branch_id: "branch-1" };
    const input = (lat: number, long: number) => ({
      employeeId: "employee-1",
      lat,
      long,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    });
    const warehouseEmployee = { ...BASE_EMPLOYEE, department_id: "dept-gudang" };

    it("accepts a clock-in at the department's own pin, far from the branch office", async () => {
      const db = makeMockDb({ employee: warehouseEmployee, departmentPin: WAREHOUSE });
      expect(await clockIn(db as any, input(-6.25, 106.8))).toMatchObject({ ok: true, status: "tepat_waktu" });
    });

    it("treats the branch office as outside the radius for that department", async () => {
      const db = makeMockDb({ employee: warehouseEmployee, departmentPin: WAREHOUSE });
      const r = await clockIn(db as any, input(-6.2, 106.8));
      expect(r.ok).toBe(false); // out of radius with no catatan
    });

    it("uses the branch pin when the department has none", async () => {
      const db = makeMockDb({
        employee: warehouseEmployee,
        departmentPin: { lat: null, long: null, radius_geofencing_meter: null, branch_id: "branch-1" },
      });
      expect(await clockIn(db as any, input(-6.2, 106.8))).toMatchObject({ ok: true, status: "tepat_waktu" });
    });
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
    const QR_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const QR_NOW = new Date("2026-09-01T08:58:00+07:00");
    // Real branch ids are uuids; the QR payload validator requires that shape.
    const QR_BRANCH_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const QR_BRANCH = { ...BASE_BRANCH, id: QR_BRANCH_ID, qr_enabled: true, qr_secret: QR_SECRET };
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
        qrToken: `${QR_BRANCH_ID}|${token}`,
        accuracyMeters: 900,
        fixAgeSeconds: 900,
        now: QR_NOW,
      });

      expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_masuk: "qr", status: "tepat_waktu" }),
      );
      // A verified QR proves presence (no geofence gate), but a phone this far
      // from the office suggests a forwarded photo of the kiosk QR: flagged for HR.
      expect((db.__insertMock.mock.calls[0] as any[])[0]).toMatchObject({ flag_lokasi_masuk: ["qr_jauh"] });
    });

    it("accepts a valid scanned QR with absent coords and stores lokasi_masuk null", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: undefined,
        long: undefined,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: `${QR_BRANCH_ID}|${token}`,
        now: QR_NOW,
      });

      expect(result.ok).toBe(true);
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_masuk: "qr", lokasi_masuk: null }),
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
        qrToken: `${QR_BRANCH_ID}|deadbeefdeadbeef`,
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
        qrToken: `99999999-8888-7777-6666-555555555555|${token}`,
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

    it("still gates on a reason when QR is disabled, a qrToken is present, and there is no GPS fix", async () => {
      const db = makeMockDb(); // BASE_BRANCH: qr_enabled false, geofence configured
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        // no lat/long — a stale-QR scan where getPosition() threw
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        qrToken: `branch-1|${token}`,
        now: QR_NOW,
      });

      expect(result).toEqual({
        ok: false,
        error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
      });
      expect(db.__insertMock).not.toHaveBeenCalled();
    });

    it("pre-migration (qr columns missing): GPS path still succeeds and omits metode_masuk", async () => {
      const db = makeMockDb({
        qrColumnsError: { message: 'column branches.qr_enabled does not exist' },
      });

      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: -6.2,
        long: 106.8,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        now: QR_NOW,
      });

      expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
      const payload = db.__insertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("metode_masuk");
      expect(payload.lokasi_masuk).toBe("(-6.2,106.8)");
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

  describe("GPS quality flags (0046)", () => {
    const INPUT = {
      employeeId: "employee-1",
      lat: -6.2,
      long: 106.8,
      photoPath: "employee-1/masuk-1.jpg",
      photoExpiresAt: "2026-12-01T00:00:00.000Z",
      now: new Date("2026-09-01T08:58:00+07:00"),
    };

    it("records accuracy and flags a poor, stale fix without changing the status", async () => {
      const db = makeMockDb();
      const result = await clockIn(db as any, { ...INPUT, accuracyMeters: 250, fixAgeSeconds: 400 });
      expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          akurasi_masuk_meter: 250,
          flag_lokasi_masuk: ["akurasi_rendah", "lokasi_basi"],
        }),
      );
    });

    it("stores accuracy but no flag column for a good fix", async () => {
      const db = makeMockDb();
      await clockIn(db as any, { ...INPUT, accuracyMeters: 12, fixAgeSeconds: 3 });
      const payload = (db.__insertMock.mock.calls[0] as any[])[0];
      expect(payload.akurasi_masuk_meter).toBe(12);
      expect(payload).not.toHaveProperty("flag_lokasi_masuk");
    });

    it("retries without the audit columns before migration 0046 is applied", async () => {
      const db = makeMockDb({
        insertErrors: [{ code: "PGRST204", message: "Could not find the 'akurasi_masuk_meter' column" }, null],
      });
      const result = await clockIn(db as any, { ...INPUT, accuracyMeters: 250 });
      expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
      expect(db.__insertMock).toHaveBeenCalledTimes(2);
      const retry = (db.__insertMock.mock.calls[1] as any[])[0];
      expect(retry).not.toHaveProperty("akurasi_masuk_meter");
      expect(retry).not.toHaveProperty("flag_lokasi_masuk");
    });
  });

  describe("dinas luar (0058)", () => {
    it("treats a far-away clock-in as in place and notes the destination", async () => {
      const db = makeMockDb();
      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: -7.25,
        long: 112.75,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        dinasLuar: { tujuan: "Kampus Ketintang" },
        now: new Date("2026-09-01T08:58:00+07:00"),
      });
      expect(result).toEqual({ ok: true, attendanceId: "attendance-1", status: "tepat_waktu" });
      expect(db.__insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "tepat_waktu", catatan: "Dinas luar: Kampus Ketintang" }),
      );
    });

    it("still applies lateness on dinas luar", async () => {
      const db = makeMockDb();
      const result = await clockIn(db as any, {
        employeeId: "employee-1",
        lat: -7.25,
        long: 112.75,
        photoPath: "employee-1/masuk-1.jpg",
        photoExpiresAt: "2026-12-01T00:00:00.000Z",
        dinasLuar: { tujuan: "Kampus Ketintang" },
        now: new Date("2026-09-01T09:40:00+07:00"),
      });
      expect(result).toMatchObject({ ok: true, status: "terlambat" });
    });
  });
});
