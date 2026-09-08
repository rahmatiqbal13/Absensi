import { describe, it, expect, vi, beforeEach } from "vitest";

// One branch row keyed by kiosk_key. `maybeSingle` returns null for anything else,
// mirroring Supabase's behavior for a no-match `.eq().maybeSingle()`.
const branches: Record<string, { id: string; qr_enabled: boolean; qr_secret: string | null }> = {
  "good-key": { id: "branch-1", qr_enabled: true, qr_secret: "s3cr3t-abc" },
  "disabled-key": { id: "branch-2", qr_enabled: false, qr_secret: "s3cr3t-def" },
  "no-secret-key": { id: "branch-3", qr_enabled: true, qr_secret: null },
};

const maybeSingleError: { value: unknown } = { value: null };

const fromMock = vi.fn((table: string) => {
  if (table !== "branches") throw new Error(`unexpected table ${table}`);
  return {
    select: () => ({
      eq: (_col: string, key: string) => ({
        maybeSingle: () =>
          Promise.resolve({
            data: maybeSingleError.value ? null : (branches[key] ?? null),
            error: maybeSingleError.value,
          }),
      }),
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleSupabaseClient: () => ({ from: fromMock }),
}));

import { getKioskQr } from "./actions";
import { QR_WINDOW_MS } from "@/lib/attendance/qr-token";

beforeEach(() => {
  maybeSingleError.value = null;
  fromMock.mockClear();
});

describe("getKioskQr", () => {
  it("returns { ok: false } for an empty key without touching the database", async () => {
    expect(await getKioskQr("")).toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns { ok: false } for an unknown kiosk key", async () => {
    expect(await getKioskQr("nope")).toEqual({ ok: false });
  });

  it("returns { ok: false } when the branch has qr_enabled = false", async () => {
    expect(await getKioskQr("disabled-key")).toEqual({ ok: false });
  });

  it("returns { ok: false } when the branch has no qr_secret", async () => {
    expect(await getKioskQr("no-secret-key")).toEqual({ ok: false });
  });

  it("returns { ok: false } when the query errors", async () => {
    maybeSingleError.value = { message: "boom" };
    expect(await getKioskQr("good-key")).toEqual({ ok: false });
  });

  it("returns a PNG data URL and a remainingMs in (0, QR_WINDOW_MS] for a valid key", async () => {
    const r = await getKioskQr("good-key");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(r.remainingMs).toBeGreaterThan(0);
    expect(r.remainingMs).toBeLessThanOrEqual(QR_WINDOW_MS);
  });

  it("never leaks the secret or the kiosk key in its result", async () => {
    const r = await getKioskQr("good-key");
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("s3cr3t-abc");
    expect(serialized).not.toContain("good-key");
  });
});
