import { describe, it, expect } from "vitest";
import { isMobileUserAgent } from "./mobile-detect";

describe("isMobileUserAgent", () => {
  it("returns true for a typical Android Chrome user agent", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
    expect(isMobileUserAgent(ua)).toBe(true);
  });

  it("returns true for a typical iPhone Safari user agent", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(isMobileUserAgent(ua)).toBe(true);
  });

  it("returns false for a typical desktop Chrome user agent", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(isMobileUserAgent(ua)).toBe(false);
  });

  it("returns false for a typical desktop Windows Firefox user agent", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(isMobileUserAgent(ua)).toBe(false);
  });

  it("returns false when the user agent is null or missing", () => {
    expect(isMobileUserAgent(null)).toBe(false);
  });

  it("returns true for an iPad user agent (tablet counts as mobile for this app)", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(isMobileUserAgent(ua)).toBe(true);
  });
});
