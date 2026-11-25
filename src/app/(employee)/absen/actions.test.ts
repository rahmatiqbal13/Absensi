import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36" }),
}));
// Today's attendance row as the employee's own client sees it (clock-out pre-check).
let todayRow: { jam_pulang: string | null } | null = { jam_pulang: null };
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: todayRow, error: null });
    return { authed: true, from: () => q };
  },
  createServiceRoleSupabaseClient: () => ({ service: true }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => ({ id: "emp-1" }) }));
let consented = true;
vi.mock("@/lib/consent/consent", () => ({ hasActiveConsent: async () => consented }));

const uploadAttendancePhoto = vi.fn();
vi.mock("@/lib/attendance/photo-upload", () => ({
  uploadAttendancePhoto: (...a: unknown[]) => uploadAttendancePhoto(...a),
}));
const clockIn = vi.fn();
const clockOut = vi.fn();
vi.mock("@/lib/attendance/clock-in", () => ({ clockIn: (...a: unknown[]) => clockIn(...a) }));
vi.mock("@/lib/attendance/clock-out", () => ({
  clockOut: (...a: unknown[]) => clockOut(...a),
  CONSENT_REQUIRED_MESSAGE: "consent",
  NO_CLOCK_IN_MESSAGE: "belum masuk",
  DUPLICATE_CLOCK_OUT_MESSAGE: "sudah pulang",
}));

vi.mock("@/lib/requests/service", () => ({ activeDinasLuar: async () => null }));
const withinRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  withinRateLimit: (...a: unknown[]) => withinRateLimit(...a),
}));

import { submitClockIn, submitClockOut } from "./actions";

function fd() {
  const f = new FormData();
  f.set("lat", "-6.2");
  f.set("long", "106.8");
  f.set("photo", new File(["x"], "selfie.jpg", { type: "image/jpeg" }));
  return f;
}

beforeEach(() => {
  todayRow = { jam_pulang: null };
  consented = true;
  withinRateLimit.mockReset();
  withinRateLimit.mockResolvedValue(true);
  uploadAttendancePhoto.mockReset();
  uploadAttendancePhoto.mockResolvedValue({ ok: true, path: "emp-1/x.jpg", expiresAt: "2026-12-01T00:00:00Z" });
  clockIn.mockReset();
  clockIn.mockResolvedValue({ ok: true, attendanceId: "a1", status: "tepat_waktu" });
  clockOut.mockReset();
  clockOut.mockResolvedValue({ ok: true, status: "tepat_waktu" });
});

describe("absen rate limiting", () => {
  it("counts clock-in and clock-out against one per-employee bucket", async () => {
    await submitClockIn(fd());
    await submitClockOut(fd());
    const rule = [{ key: "absen:emp:emp-1", max: 10, windowSeconds: 600 }];
    expect(withinRateLimit).toHaveBeenNthCalledWith(1, expect.anything(), rule);
    expect(withinRateLimit).toHaveBeenNthCalledWith(2, expect.anything(), rule);
  });

  it("rejects before uploading the selfie when over the limit", async () => {
    withinRateLimit.mockResolvedValue(false);
    for (const submit of [submitClockIn, submitClockOut]) {
      const res = await submit(fd());
      expect(res).toEqual({ ok: false, error: expect.stringMatching(/terlalu banyak percobaan absen/i) });
    }
    expect(uploadAttendancePhoto).not.toHaveBeenCalled();
    expect(clockIn).not.toHaveBeenCalled();
    expect(clockOut).not.toHaveBeenCalled();
  });

  it("lets a submit within the limit through", async () => {
    expect(await submitClockIn(fd())).toEqual({ ok: true, attendanceId: "a1", status: "tepat_waktu" });
    expect(uploadAttendancePhoto).toHaveBeenCalledTimes(1);
  });
});

describe("clock-out before the selfie is stored", () => {
  it("does not upload a photo when the clock-out is bound to be refused", async () => {
    for (const [setup, error] of [
      [() => (todayRow = null), "belum masuk"],
      [() => (todayRow = { jam_pulang: "2026-11-25T09:00:00Z" }), "sudah pulang"],
      [() => (consented = false), "consent"],
    ] as const) {
      todayRow = { jam_pulang: null };
      consented = true;
      setup();
      expect(await submitClockOut(fd())).toEqual({ ok: false, error });
    }
    expect(uploadAttendancePhoto).not.toHaveBeenCalled();
    expect(clockOut).not.toHaveBeenCalled();
  });
});
