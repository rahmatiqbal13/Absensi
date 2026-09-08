import { describe, it, expect } from "vitest";
import { qrToken, verifyQrToken, windowRemainingMs, QR_WINDOW_MS } from "./qr-token";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const T0 = 1_700_000_010_000; // exactly on a 30s window boundary (T0 % 30_000 === 0)

describe("qrToken", () => {
  it("is 16 lowercase hex chars", () => {
    expect(qrToken(SECRET, T0)).toMatch(/^[0-9a-f]{16}$/);
  });
  it("is stable within a 30s window", () => {
    expect(qrToken(SECRET, T0)).toBe(qrToken(SECRET, T0 + 5_000));
  });
  it("changes across windows", () => {
    expect(qrToken(SECRET, T0)).not.toBe(qrToken(SECRET, T0 + QR_WINDOW_MS));
  });
  it("depends on the secret", () => {
    expect(qrToken(SECRET, T0)).not.toBe(qrToken(SECRET.replace("0", "1"), T0));
  });
});

describe("verifyQrToken", () => {
  it("accepts the current window", () => {
    expect(verifyQrToken(SECRET, qrToken(SECRET, T0), T0)).toBe(true);
  });
  it("accepts the previous window (≈60s tolerance)", () => {
    const old = qrToken(SECRET, T0);
    expect(verifyQrToken(SECRET, old, T0 + QR_WINDOW_MS)).toBe(true);
  });
  it("rejects two windows old", () => {
    const old = qrToken(SECRET, T0);
    expect(verifyQrToken(SECRET, old, T0 + 2 * QR_WINDOW_MS)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyQrToken(SECRET, qrToken("deadbeef".repeat(8), T0), T0)).toBe(false);
  });
  it("rejects malformed input without throwing", () => {
    expect(verifyQrToken(SECRET, "", T0)).toBe(false);
    expect(verifyQrToken(SECRET, "not-hex-not-hex!", T0)).toBe(false);
    expect(verifyQrToken(SECRET, "abcd", T0)).toBe(false);
    expect(verifyQrToken(SECRET, "ABCDEF0123456789", T0)).toBe(false); // uppercase
  });
});

describe("windowRemainingMs", () => {
  it("is within (0, 30000]", () => {
    const r = windowRemainingMs(T0);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(QR_WINDOW_MS);
  });
  it("is full at a window boundary", () => {
    expect(windowRemainingMs(T0)).toBe(QR_WINDOW_MS);
  });
});
