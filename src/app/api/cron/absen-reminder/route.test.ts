import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleSupabaseClient: () => ({ service: true }) }));
const sendAttendanceReminders = vi.fn();
vi.mock("@/lib/attendance/send-reminders", () => ({
  sendAttendanceReminders: (...a: unknown[]) => sendAttendanceReminders(...a),
}));

import { GET } from "./route";

const req = (auth?: string) =>
  new NextRequest("https://tapabsen.vercel.app/api/cron/absen-reminder", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  sendAttendanceReminders.mockReset();
  sendAttendanceReminders.mockResolvedValue({ ok: true, tanggal: "2026-11-18", due: 0, sent: 0, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/absen-reminder", () => {
  it("rejects a missing or wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(sendAttendanceReminders).not.toHaveBeenCalled();
  });

  it("rejects everything when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
  });

  it("runs a reminder pass with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(sendAttendanceReminders).toHaveBeenCalledWith({ service: true });
  });
});
