import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleSupabaseClient: vi.fn(() => ({})) }));
const createRecoveryLink = vi.fn();
const sendPasswordResetEmail = vi.fn();
vi.mock("@/lib/auth/password-reset", () => ({
  createRecoveryLink: (...a: unknown[]) => createRecoveryLink(...a),
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
}));

import { requestPasswordReset } from "./actions";

function fd(email: string) {
  const f = new FormData();
  f.set("email", email);
  return f;
}

beforeEach(() => {
  createRecoveryLink.mockReset();
  sendPasswordResetEmail.mockReset();
  sendPasswordResetEmail.mockResolvedValue({ sent: true });
});

describe("requestPasswordReset", () => {
  it("emails the link to a known account and shows the generic confirmation", async () => {
    createRecoveryLink.mockResolvedValue({ ok: true, url: "https://x/r", email: "a@b.id", nama: "A" });
    await expect(requestPasswordReset(fd("a@b.id"))).rejects.toThrow("REDIRECT:/lupa-password?terkirim=1");
    expect(createRecoveryLink).toHaveBeenCalledWith({}, { email: "a@b.id" }, { throttle: true });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.id" }), "https://x/r");
  });

  it("shows the same confirmation for an unknown email (no account enumeration)", async () => {
    createRecoveryLink.mockResolvedValue({ ok: false, reason: "not-found" });
    await expect(requestPasswordReset(fd("nobody@b.id"))).rejects.toThrow("REDIRECT:/lupa-password?terkirim=1");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before touching the database", async () => {
    await expect(requestPasswordReset(fd("bukan-email"))).rejects.toThrow(/REDIRECT:\/lupa-password\?error=/);
    expect(createRecoveryLink).not.toHaveBeenCalled();
  });
});
