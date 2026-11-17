import { describe, it, expect } from "vitest";
import { inviteQueryFrom } from "./invite-link-form";

describe("inviteQueryFrom", () => {
  it("extracts ?t= from a full invite link", () => {
    expect(inviteQueryFrom(" https://absen.example.co.id/set-password?t=abc123def456ghi789 ")).toBe(
      "?t=abc123def456ghi789",
    );
  });
  it("accepts legacy ?code= links and #access_token hashes", () => {
    expect(inviteQueryFrom("https://x.id/set-password?code=xyz")).toBe("?code=xyz");
    expect(inviteQueryFrom("https://x.id/set-password#access_token=a&refresh_token=b")).toBe(
      "#access_token=a&refresh_token=b",
    );
  });
  it("accepts a bare token", () => {
    expect(inviteQueryFrom("0123456789abcdef0123")).toBe("?t=0123456789abcdef0123");
  });
  it("rejects anything else", () => {
    expect(inviteQueryFrom("")).toBeNull();
    expect(inviteQueryFrom("https://x.id/login")).toBeNull();
    expect(inviteQueryFrom("halo HR")).toBeNull();
  });
});
