import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ sent: true })),
}));

import { sendEmail } from "@/lib/email/send";
import { createRecoveryLink, sendPasswordResetEmail, RESET_THROTTLE_MS } from "./password-reset";

const ACTIVE = { id: "u1", nama: "Sari", email: "Sari@Contoh.co.id", status: "aktif" };

function makeDb(opts: { employee?: unknown; recoverySentAt?: string | null; linkError?: unknown } = {}) {
  const maybeSingle = vi.fn(async () => ({ data: "employee" in opts ? opts.employee : ACTIVE, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const ilike = vi.fn(() => ({ maybeSingle }));
  const generateLink = vi.fn(async () =>
    opts.linkError
      ? { data: null, error: opts.linkError }
      : { data: { properties: { hashed_token: "hash123" } }, error: null },
  );
  const getUserById = vi.fn(async () => ({
    data: { user: { recovery_sent_at: opts.recoverySentAt ?? null } },
    error: null,
  }));
  const db = {
    from: vi.fn(() => ({ select: () => ({ eq, ilike }) })),
    auth: { admin: { generateLink, getUserById } },
  };
  return { db: db as any, eq, ilike, generateLink, getUserById };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://absen.example.test");
});

describe("createRecoveryLink", () => {
  it("builds an own-domain recovery link for an active employee", async () => {
    const { db, generateLink } = makeDb();
    const r = await createRecoveryLink(db, { email: "sari@contoh.co.id" }, { throttle: true });
    expect(r).toEqual({
      ok: true,
      url: "https://absen.example.test/set-password?t=hash123&type=recovery",
      email: ACTIVE.email,
      nama: "Sari",
    });
    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recovery", email: ACTIVE.email }),
    );
  });

  it("matches email case-insensitively and escapes LIKE wildcards", async () => {
    const { db, ilike } = makeDb();
    await createRecoveryLink(db, { email: " a_b%c@x.id " }, { throttle: false });
    expect(ilike).toHaveBeenCalledWith("email", "a\\_b\\%c@x.id");
  });

  it("looks up by id for the HR flow", async () => {
    const { db, eq, getUserById } = makeDb();
    await createRecoveryLink(db, { employeeId: "u1" }, { throttle: false });
    expect(eq).toHaveBeenCalledWith("id", "u1");
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("reports unknown and inactive accounts without generating a link", async () => {
    const missing = makeDb({ employee: null });
    expect(await createRecoveryLink(missing.db, { email: "x@y.id" }, { throttle: true })).toEqual({
      ok: false,
      reason: "not-found",
    });
    const inactive = makeDb({ employee: { ...ACTIVE, status: "nonaktif" } });
    expect(await createRecoveryLink(inactive.db, { email: "x@y.id" }, { throttle: true })).toEqual({
      ok: false,
      reason: "inactive",
    });
    expect(missing.generateLink).not.toHaveBeenCalled();
    expect(inactive.generateLink).not.toHaveBeenCalled();
  });

  it("throttles a second request within the window", async () => {
    const recent = new Date(Date.now() - RESET_THROTTLE_MS / 2).toISOString();
    const { db, generateLink } = makeDb({ recoverySentAt: recent });
    expect(await createRecoveryLink(db, { email: "x@y.id" }, { throttle: true })).toEqual({
      ok: false,
      reason: "throttled",
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("allows a new request once the window has passed", async () => {
    const old = new Date(Date.now() - RESET_THROTTLE_MS * 2).toISOString();
    const { db } = makeDb({ recoverySentAt: old });
    expect((await createRecoveryLink(db, { email: "x@y.id" }, { throttle: true })).ok).toBe(true);
  });

  it("returns an error when generateLink fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = makeDb({ linkError: { message: "boom" } });
    expect(await createRecoveryLink(db, { email: "x@y.id" }, { throttle: false })).toEqual({
      ok: false,
      reason: "error",
    });
  });
});

describe("sendPasswordResetEmail", () => {
  it("sends the link and escapes the name in HTML", async () => {
    await sendPasswordResetEmail({ email: "a@b.id", nama: "<Sari>" }, "https://x/set-password?t=1&type=recovery");
    const msg = vi.mocked(sendEmail).mock.calls.at(-1)![0];
    expect(msg.to).toBe("a@b.id");
    expect(msg.text).toContain("https://x/set-password?t=1&type=recovery");
    expect(msg.html).toContain("&lt;Sari&gt;");
    expect(msg.html).not.toContain("<Sari>");
  });
});
