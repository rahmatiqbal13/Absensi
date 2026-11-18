import { describe, it, expect, vi, beforeEach } from "vitest";

const updateUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { updateUser: (...a: unknown[]) => updateUser(...a) } }),
  createServiceRoleSupabaseClient: () => ({ service: true }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => ({ id: "e1", email: "e1@contoh.id" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const withinRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({ withinRateLimit: (...a: unknown[]) => withinRateLimit(...a) }));
const signInWithPassword = vi.fn();
const signOut = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a), signOut: (...a: unknown[]) => signOut(...a) } }),
}));

import { changePassword } from "./actions";

const fd = (current: string, next: string, confirm = next) => {
  const f = new FormData();
  f.set("current", current);
  f.set("next", next);
  f.set("confirm", confirm);
  return f;
};

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null });
  withinRateLimit.mockReset().mockResolvedValue(true);
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
});

describe("changePassword", () => {
  it("re-checks the current password, then updates it", async () => {
    expect(await changePassword(fd("lama-rahasia", "baru-rahasia"))).toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "e1@contoh.id", password: "lama-rahasia" });
    expect(updateUser).toHaveBeenCalledWith({ password: "baru-rahasia" });
    // Never "global": that would sign the user out of their live session.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refuses a wrong current password without changing anything", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    expect(await changePassword(fd("salah-salah", "baru-rahasia"))).toEqual({ ok: false, error: "Kata sandi saat ini salah." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("is rate-limited per employee", async () => {
    withinRateLimit.mockResolvedValue(false);
    expect((await changePassword(fd("lama-rahasia", "baru-rahasia"))).ok).toBe(false);
    expect(withinRateLimit).toHaveBeenCalledWith(expect.anything(), [{ key: "pwchange:emp:e1", max: 5, windowSeconds: 900 }]);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("validates before touching auth", async () => {
    expect((await changePassword(fd("lama-rahasia", "pendek"))).ok).toBe(false);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
