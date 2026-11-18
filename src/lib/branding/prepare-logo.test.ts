import { describe, it, expect, vi } from "vitest";
import { LOGO_MAX_BYTES, needsLogoProcessing, prepareLogo } from "./prepare-logo";

const fileOf = (bytes: number, type: string, name = "logo") => new File([new Uint8Array(bytes)], name, { type });

describe("prepareLogo", () => {
  it("uploads a small PNG or JPG untouched", async () => {
    for (const type of ["image/png", "image/jpeg"]) {
      const f = fileOf(100 * 1024, type);
      expect(needsLogoProcessing(f)).toBe(false);
      expect(await prepareLogo(f)).toEqual({ ok: true, file: f, compressed: false });
    }
  });

  it("processes anything too big, and WEBP/SVG of any size", () => {
    expect(needsLogoProcessing(fileOf(LOGO_MAX_BYTES + 1, "image/png"))).toBe(true);
    expect(needsLogoProcessing(fileOf(10, "image/webp"))).toBe(true);
    expect(needsLogoProcessing(fileOf(10, "image/svg+xml"))).toBe(true);
  });

  it("falls back to the original when the browser can't redraw it but it still fits", async () => {
    // jsdom can't decode images.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fileOf(50 * 1024, "image/webp");
    expect(await prepareLogo(f)).toEqual({ ok: true, file: f, compressed: false });
  });

  it("explains when a too-big file can't be compressed here", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await prepareLogo(fileOf(3 * 1024 * 1024, "image/png"));
    expect(res.ok).toBe(false);
  });
});
