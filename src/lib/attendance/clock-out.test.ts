import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clockOut } from "./clock-out";
import { qrToken } from "./qr-token";

const BASE_EMPLOYEE = { id: "employee-1", branch_id: "branch-1" };
const BASE_BRANCH = {
  id: "branch-1",
  lat: -6.2,
  long: 106.8,
  radius_geofencing_meter: 100,
  qr_enabled: false,
  qr_secret: null,
};
const BASE_SCHEDULE = { branch_id: "branch-1", jam_masuk: "09:00:00", jam_pulang: "17:00:00" };

type QueryResult = { data: any; error: { message: string; code?: string } | null };

const UPDATE_OK: QueryResult = {
  data: { id: "attendance-1", status: "tepat_waktu" },
  error: null,
};
// What PostgREST returns when a filtered `.update(...).select().single()`
// matches zero rows — here, because `jam_pulang is null` no longer holds.
const UPDATE_ZERO_ROWS: QueryResult = {
  data: null,
  error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
};

function makeMockDb(
  opts: {
    todaysAttendance?: any;
    todaysAttendanceError?: { message: string; code?: string } | null;
    updateError?: { message: string; code?: string } | null;
    /** Successive results for repeated update() calls; the last one repeats. */
    updateResults?: QueryResult[];
    branch?: any;
    /** Error from the separate qr_enabled/qr_secret lookup — pre-migration. */
    qrColumnsError?: { message: string; code?: string } | null;
  } = {},
) {
  const {
    todaysAttendance = { id: "attendance-1", status: "tepat_waktu", jam_pulang: null },
    todaysAttendanceError = todaysAttendance
      ? null
      : { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    updateError = null,
    updateResults = [updateError ? { data: null, error: updateError } : UPDATE_OK],
    branch = BASE_BRANCH,
    qrColumnsError = null,
  } = opts;

  // Spies for the chain steps whose arguments/payloads the tests assert on.
  const todaySingleMock = vi
    .fn()
    .mockResolvedValue({ data: todaysAttendance, error: todaysAttendanceError });
  const todayTanggalEqMock = vi.fn().mockReturnValue({ single: todaySingleMock });
  const todayEmployeeEqMock = vi.fn().mockReturnValue({ eq: todayTanggalEqMock });
  const attendancesSelectMock = vi.fn().mockReturnValue({ eq: todayEmployeeEqMock });

  let updateCall = 0;
  const updateSingleMock = vi.fn(() =>
    Promise.resolve(updateResults[Math.min(updateCall++, updateResults.length - 1)]),
  );
  const updateSelectMock = vi.fn().mockReturnValue({ single: updateSingleMock });
  const updateIsMock = vi.fn().mockReturnValue({ select: updateSelectMock });
  const updateEqMock = vi.fn().mockReturnValue({ is: updateIsMock });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  const scheduleMaybeSingleMock = vi.fn().mockResolvedValue({ data: BASE_SCHEDULE, error: null });
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
        eq: () => ({
          single: () => Promise.resolve({ data: branch, error: null }),
          maybeSingle: () =>
            Promise.resolve(
              qrColumnsError
                ? { data: null, error: qrColumnsError }
                : { data: branch, error: null },
            ),
        }),
      }),
    },
    work_schedules: {
      select: vi.fn().mockReturnValue({ eq: scheduleEqMock }),
    },
    attendances: {
      select: attendancesSelectMock,
      update: updateMock,
    },
  };

  return {
    from: vi.fn((table: string) => tables[table]),
    __attendancesSelectMock: attendancesSelectMock,
    __todayEmployeeEqMock: todayEmployeeEqMock,
    __todayTanggalEqMock: todayTanggalEqMock,
    __updateMock: updateMock,
    __updateEqMock: updateEqMock,
    __updateIsMock: updateIsMock,
    __scheduleEqMock: scheduleEqMock,
    __scheduleLimitMock: scheduleLimitMock,
    __scheduleMaybeSingleMock: scheduleMaybeSingleMock,
  };
}

const BASE_INPUT = {
  employeeId: "employee-1",
  lat: -6.2,
  long: 106.8,
  photoPath: "employee-1/pulang-1.jpg",
  photoExpiresAt: "2026-12-01T00:00:00.000Z",
};

describe("clockOut", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("updates the attendance row with tepat_waktu when on time and within radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T17:05:00+07:00");

    const result = await clockOut(db as any, { ...BASE_INPUT, now });

    expect(result).toEqual({ ok: true, status: "tepat_waktu" });

    // The today lookup must be scoped to this employee and the Jakarta date.
    expect(db.__attendancesSelectMock).toHaveBeenCalledWith("id, status, jam_pulang, catatan");
    expect(db.__todayEmployeeEqMock).toHaveBeenCalledWith("employee_id", "employee-1");
    expect(db.__todayTanggalEqMock).toHaveBeenCalledWith("tanggal", "2026-09-01");

    // The persisted payload, not just the returned status.
    expect(db.__updateMock).toHaveBeenCalledTimes(1);
    expect(db.__updateMock).toHaveBeenCalledWith({
      jam_pulang: now.toISOString(),
      lokasi_pulang: "(-6.2,106.8)",
      foto_pulang_url: "employee-1/pulang-1.jpg",
      foto_pulang_expires_at: "2026-12-01T00:00:00.000Z",
      status: "tepat_waktu",
      metode_pulang: "gps",
    });
    expect(db.__updateEqMock).toHaveBeenCalledWith("id", "attendance-1");
    // The atomic compare-and-set that backstops the double clock-out race.
    expect(db.__updateIsMock).toHaveBeenCalledWith("jam_pulang", null);
  });

  it("keys the today lookup to the Asia/Jakarta calendar date, not the UTC date", async () => {
    const db = makeMockDb();
    // 2026-09-01T20:00:00Z is 2026-09-02T03:00:00+07:00 — the Jakarta date
    // (2026-09-02) differs from the UTC date (2026-09-01).
    const now = new Date("2026-09-01T20:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-09-01");

    await clockOut(db as any, { ...BASE_INPUT, now });

    expect(db.__todayTanggalEqMock).toHaveBeenCalledWith("tanggal", "2026-09-02");
  });

  it("rejects when there is no clock-in record for today", async () => {
    const db = makeMockDb({ todaysAttendance: null });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda belum absen masuk hari ini." });
    expect(db.__updateMock).not.toHaveBeenCalled();
  });

  it("distinguishes a failed today lookup from a genuine missing clock-in", async () => {
    const db = makeMockDb({
      todaysAttendance: null,
      todaysAttendanceError: { message: "connection reset" },
    });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Gagal memeriksa absensi hari ini." });
    expect(db.__updateMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
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
      ...BASE_INPUT,
      photoPath: "employee-1/pulang-2.jpg",
      now: new Date("2026-09-01T18:00:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Anda sudah absen pulang hari ini." });
    expect(db.__updateMock).not.toHaveBeenCalled();
  });

  it("rejects the losing request when two concurrent clock-outs pass the pre-check", async () => {
    // Both requests read jam_pulang as NULL (the read-then-write race), so both
    // reach the update. The `.is("jam_pulang", null)` filter makes the second
    // one match zero rows instead of overwriting the first one's status.
    const db = makeMockDb({ updateResults: [UPDATE_OK, UPDATE_ZERO_ROWS] });
    const now = new Date("2026-09-01T17:05:00+07:00");

    const first = await clockOut(db as any, { ...BASE_INPUT, now });
    const second = await clockOut(db as any, {
      ...BASE_INPUT,
      photoPath: "employee-1/pulang-2.jpg",
      now,
    });

    expect(first).toEqual({ ok: true, status: "tepat_waktu" });
    expect(second).toEqual({ ok: false, error: "Anda sudah absen pulang hari ini." });
    expect(db.__updateMock).toHaveBeenCalledTimes(2);
    expect(db.__updateIsMock).toHaveBeenNthCalledWith(2, "jam_pulang", null);
  });

  it("merges pulang_cepat over an existing tepat_waktu clock-in status", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T16:00:00+07:00");

    const result = await clockOut(db as any, { ...BASE_INPUT, now });

    expect(result).toEqual({ ok: true, status: "pulang_cepat" });
    expect(db.__updateMock).toHaveBeenCalledTimes(1);
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pulang_cepat" }),
    );
  });

  it("keeps terlambat from clock-in even when clocking out on time", async () => {
    const db = makeMockDb({
      todaysAttendance: { id: "attendance-1", status: "terlambat", jam_pulang: null },
    });
    const now = new Date("2026-09-01T17:05:00+07:00");

    const result = await clockOut(db as any, { ...BASE_INPUT, now });

    expect(result).toEqual({ ok: true, status: "terlambat" });
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "terlambat" }),
    );
  });

  it("records di_luar_lokasi when clocking out beyond the branch geofence radius", async () => {
    const db = makeMockDb();
    const now = new Date("2026-09-01T17:05:00+07:00");

    // Bandung — far outside branch-1's 100 m radius around (-6.2, 106.8).
    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      lat: -6.9175,
      long: 107.6191,
      catatan: "Kunjungan klien di luar kota",
      now,
    });

    expect(result).toEqual({ ok: true, status: "di_luar_lokasi" });
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "di_luar_lokasi",
        lokasi_pulang: "(-6.9175,107.6191)",
      }),
    );
  });

  it("requires a reason when configured and out of radius", async () => {
    const db = makeMockDb(); // BASE_BRANCH configured
    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      lat: -6.9,
      long: 107.6,
      now: new Date("2026-09-07T10:00:00Z"),
    });
    expect(result).toEqual({
      ok: false,
      error: "Anda berada di luar radius kantor. Wajib isi catatan/alasan.",
    });
    expect(db.__updateMock).not.toHaveBeenCalled();
  });

  it("allows an out-of-radius clock-out with a reason and persists it", async () => {
    const db = makeMockDb();
    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      lat: -6.9,
      long: 107.6,
      catatan: "Meeting klien di luar",
      now: new Date("2026-09-07T10:00:00Z"),
    });
    expect(result.ok).toBe(true);
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ catatan: "Meeting klien di luar" }),
    );
  });

  it("appends the clock-out reason to a pre-existing clock-in reason instead of overwriting it", async () => {
    const db = makeMockDb({
      todaysAttendance: {
        id: "attendance-1",
        status: "tepat_waktu",
        jam_pulang: null,
        catatan: "Masuk dari lokasi klien",
      },
    });
    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      lat: -6.9,
      long: 107.6,
      catatan: "Pulang dari lokasi klien",
      now: new Date("2026-09-07T10:00:00Z"),
    });
    expect(result.ok).toBe(true);
    expect(db.__updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        catatan: "Masuk dari lokasi klien | Pulang dari lokasi klien",
      }),
    );
  });

  it("does not force a reason when the geofence is unconfigured", async () => {
    const db = makeMockDb({
      branch: { id: "branch-1", lat: 0, long: 0, radius_geofencing_meter: 100 },
    });
    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      lat: -6.9,
      long: 107.6,
      now: new Date("2026-09-07T10:00:00Z"),
    });
    expect(result.ok).toBe(true);
  });

  it("never nulls out an existing clock-in reason when no clock-out reason is given", async () => {
    const db = makeMockDb();
    await clockOut(db as any, { ...BASE_INPUT, now: new Date("2026-09-01T17:05:00+07:00") });
    expect(db.__updateMock).toHaveBeenCalledTimes(1);
    expect(db.__updateMock.mock.calls[0][0]).not.toHaveProperty("catatan");
  });

  it("takes the first work schedule row rather than erroring when a branch has several", async () => {
    const db = makeMockDb();

    await clockOut(db as any, { ...BASE_INPUT, now: new Date("2026-09-01T17:05:00+07:00") });

    expect(db.__scheduleEqMock).toHaveBeenCalledWith("branch_id", "branch-1");
    expect(db.__scheduleLimitMock).toHaveBeenCalledWith(1);
    expect(db.__scheduleMaybeSingleMock).toHaveBeenCalled();
  });

  describe("QR path", () => {
    const QR_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const QR_NOW = new Date("2026-09-01T17:05:00+07:00");
    // Real branch ids are uuids; the QR payload validator requires that shape.
    const QR_BRANCH_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const QR_BRANCH = { ...BASE_BRANCH, id: QR_BRANCH_ID, qr_enabled: true, qr_secret: QR_SECRET };
    const FAR = { lat: -6.9175, long: 107.6191 };

    it("accepts a valid scanned QR with far coords, no geofence gate, and records metode_pulang qr", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockOut(db as any, {
        ...BASE_INPUT,
        lat: FAR.lat,
        long: FAR.long,
        qrToken: `${QR_BRANCH_ID}|${token}`,
        now: QR_NOW,
      });

      expect(result).toEqual({ ok: true, status: "tepat_waktu" });
      expect(db.__updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_pulang: "qr", status: "tepat_waktu" }),
      );
    });

    it("accepts a valid scanned QR with absent coords and stores lokasi_pulang null", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockOut(db as any, {
        ...BASE_INPUT,
        lat: undefined,
        long: undefined,
        qrToken: `${QR_BRANCH_ID}|${token}`,
        now: QR_NOW,
      });

      expect(result.ok).toBe(true);
      expect(db.__updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_pulang: "qr", lokasi_pulang: null }),
      );
    });

    it("rejects an expired/garbage QR token without updating", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });

      const result = await clockOut(db as any, {
        ...BASE_INPUT,
        lat: FAR.lat,
        long: FAR.long,
        qrToken: `${QR_BRANCH_ID}|deadbeefdeadbeef`,
        now: QR_NOW,
      });

      expect(result).toEqual({
        ok: false,
        error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang.",
      });
      expect(db.__updateMock).not.toHaveBeenCalled();
    });

    it("rejects a QR token minted for a different branch id", async () => {
      const db = makeMockDb({ branch: QR_BRANCH });
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockOut(db as any, {
        ...BASE_INPUT,
        lat: FAR.lat,
        long: FAR.long,
        qrToken: `99999999-8888-7777-6666-555555555555|${token}`,
        now: QR_NOW,
      });

      expect(result).toEqual({
        ok: false,
        error: "QR tidak valid atau sudah kedaluwarsa. Coba scan ulang.",
      });
      expect(db.__updateMock).not.toHaveBeenCalled();
    });

    it("ignores qrToken when the branch has QR disabled and runs the GPS path", async () => {
      const db = makeMockDb();
      const token = qrToken(QR_SECRET, QR_NOW.getTime());

      const result = await clockOut(db as any, {
        ...BASE_INPUT,
        lat: -6.2,
        long: 106.8,
        qrToken: `${QR_BRANCH_ID}|${token}`,
        now: QR_NOW,
      });

      expect(result.ok).toBe(true);
      expect(db.__updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_pulang: "gps" }),
      );
    });

    it("records metode_pulang gps on the plain GPS path (no qrToken)", async () => {
      const db = makeMockDb();

      const result = await clockOut(db as any, { ...BASE_INPUT, now: QR_NOW });

      expect(result.ok).toBe(true);
      expect(db.__updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ metode_pulang: "gps" }),
      );
    });

    it("pre-migration (qr columns missing): GPS path still succeeds and omits metode_pulang", async () => {
      const db = makeMockDb({
        qrColumnsError: { message: "column branches.qr_enabled does not exist" },
      });

      const result = await clockOut(db as any, { ...BASE_INPUT, now: QR_NOW });

      expect(result).toEqual({ ok: true, status: "tepat_waktu" });
      const payload = db.__updateMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("metode_pulang");
      expect(payload.lokasi_pulang).toBe("(-6.2,106.8)");
    });
  });

  it("returns a generic Indonesian message and logs the raw error when the update fails", async () => {
    const db = makeMockDb({ updateError: { message: "deadlock detected" } });

    const result = await clockOut(db as any, {
      ...BASE_INPUT,
      now: new Date("2026-09-01T17:05:00+07:00"),
    });

    expect(result).toEqual({ ok: false, error: "Gagal menyimpan absen pulang." });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
