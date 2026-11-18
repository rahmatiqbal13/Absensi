import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

const SUBS = [
  { id: "s1", employee_id: "e1", endpoint: "https://push.example/1", p256dh: "k1", auth: "a1" },
  { id: "s2", employee_id: "e1", endpoint: "https://push.example/2", p256dh: "k2", auth: "a2" },
  { id: "s3", employee_id: "e2", endpoint: "https://push.example/3", p256dh: "k3", auth: "a3" },
];

function makeDb() {
  const del = vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) }));
  const db = {
    from: () => ({
      select: () => ({ in: async () => ({ data: SUBS, error: null }) }),
      delete: del,
    }),
  };
  return { db: db as never, del };
}

const MSG = { employeeId: "e1", title: "Anda belum absen", body: "Jadwal 08:00", link: "/absen", tag: "lupa_absen:2026-11-18" };

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("sendPush", () => {
  it("does nothing without VAPID keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    const { sendPush } = await import("./push");
    expect(await sendPush(makeDb().db, [MSG])).toEqual({ sent: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every device of the employee and drops subscriptions that are gone", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    sendNotification.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    const { sendPush } = await import("./push");
    const { db, del } = makeDb();
    expect(await sendPush(db, [MSG])).toEqual({ sent: 1, failed: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(2); // e1's two devices, not e2's
    const [sub, payload] = sendNotification.mock.calls[0] as [{ endpoint: string }, string];
    expect(sub.endpoint).toBe("https://push.example/1");
    expect(JSON.parse(payload)).toEqual({ title: MSG.title, body: MSG.body, link: "/absen", tag: MSG.tag });
    expect(del).toHaveBeenCalled();
  });
});
