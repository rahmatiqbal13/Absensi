import { describe, it, expect } from "vitest";
import { validatePasswordChange } from "./change-password";

describe("validatePasswordChange", () => {
  const ok = { current: "lama-rahasia", next: "baru-rahasia", confirm: "baru-rahasia" };
  it("accepts a valid change", () => expect(validatePasswordChange(ok)).toEqual({ ok: true }));
  it("needs the current password", () => expect(validatePasswordChange({ ...ok, current: "" }).ok).toBe(false));
  it("enforces 8 characters", () =>
    expect(validatePasswordChange({ ...ok, next: "pendek", confirm: "pendek" })).toEqual({
      ok: false,
      error: "Kata sandi baru minimal 8 karakter.",
    }));
  it("requires a matching confirmation", () => expect(validatePasswordChange({ ...ok, confirm: "lain-lain" }).ok).toBe(false));
  it("rejects reusing the current password", () =>
    expect(validatePasswordChange({ ...ok, next: ok.current, confirm: ok.current }).ok).toBe(false));
});
