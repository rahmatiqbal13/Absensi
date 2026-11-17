import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleSupabaseClient: () => ({ service: true }),
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a), getUser: async () => ({ data: {} }) },
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => ({ id: "e1" }) }));

const withinRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  clientIp: async () => "9.9.9.9",
  withinRateLimit: (...a: unknown[]) => withinRateLimit(...a),
  RATE_LIMITED_MESSAGE: "Terlalu banyak percobaan.",
}));

import { login } from "./actions";

function fd(email: string, password = "rahasia") {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  return f;
}

beforeEach(() => {
  signInWithPassword.mockReset();
  signInWithPassword.mockResolvedValue({ error: null });
  withinRateLimit.mockReset();
  withinRateLimit.mockResolvedValue(true);
});

describe("login rate limiting", () => {
  it("counts the attempt per IP and per (normalized) email, then signs in", async () => {
    await expect(login(fd("  Ani@Kantor.id "))).rejects.toThrow("REDIRECT:/absen");
    expect(withinRateLimit).toHaveBeenCalledWith({ service: true }, [
      { key: "login:ip:9.9.9.9", max: 20, windowSeconds: 900 },
      { key: "login:email:ani@kantor.id", max: 10, windowSeconds: 900 },
    ]);
    expect(signInWithPassword).toHaveBeenCalled();
  });

  it("refuses without calling Supabase Auth once the limit is hit", async () => {
    withinRateLimit.mockResolvedValue(false);
    await expect(login(fd("ani@kantor.id"))).rejects.toThrow(/REDIRECT:\/login\?error=Terlalu/);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
