import { describe, it, expect } from "vitest";
import { centerCropRect, resizeToSquareJpeg } from "./image";

describe("centerCropRect", () => {
  it("crops the wider axis for a landscape image", () => {
    expect(centerCropRect(100, 60)).toEqual({ sx: 20, sy: 0, size: 60 });
  });
  it("crops the taller axis for a portrait image", () => {
    expect(centerCropRect(60, 100)).toEqual({ sx: 0, sy: 20, size: 60 });
  });
  it("is a no-op offset for a square image", () => {
    expect(centerCropRect(80, 80)).toEqual({ sx: 0, sy: 0, size: 80 });
  });
  it("floors an odd overhang", () => {
    expect(centerCropRect(101, 60)).toEqual({ sx: 20, sy: 0, size: 60 });
  });
});

describe("resizeToSquareJpeg", () => {
  it("rejects a non-image file with an Indonesian message", async () => {
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    await expect(resizeToSquareJpeg(file)).rejects.toThrow(/JPG, PNG, atau WEBP/);
  });
  // The canvas path (createImageBitmap / canvas.toBlob) is not available in
  // jsdom and is verified manually in a browser. Only the validation branch
  // is unit-tested here.
});
