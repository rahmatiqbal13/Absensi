import { describe, it, expect } from "vitest";
import { compressPhoto, needsCompression, scaledSize, SKIP_BELOW_BYTES } from "./compress-photo";

const fileOf = (bytes: number) => new File([new Uint8Array(bytes)], "IMG_1234.jpg", { type: "image/jpeg" });

describe("compressPhoto", () => {
  it("leaves small photos alone", async () => {
    const f = fileOf(100 * 1024);
    expect(needsCompression(f)).toBe(false);
    expect(await compressPhoto(f)).toBe(f);
  });

  it("flags camera-sized photos for compression", () => {
    expect(needsCompression(fileOf(SKIP_BELOW_BYTES + 1))).toBe(true);
  });

  it("returns the original when the browser cannot decode it (never blocks a clock-in)", async () => {
    // jsdom has no createImageBitmap / canvas encoder.
    const f = fileOf(3 * 1024 * 1024);
    expect(await compressPhoto(f)).toBe(f);
  });
});

describe("scaledSize", () => {
  it("fits a phone selfie into 800 px on its longer side, keeping the aspect ratio", () => {
    expect(scaledSize(3024, 4032)).toEqual({ width: 600, height: 800 }); // 12 MP portrait
    expect(scaledSize(4000, 3000)).toEqual({ width: 800, height: 600 });
  });

  it("never upscales a photo that is already small", () => {
    expect(scaledSize(640, 480)).toEqual({ width: 640, height: 480 });
  });
});
