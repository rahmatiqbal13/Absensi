import { describe, it, expect, vi } from "vitest";
import { profilePhotoPath, signProfilePhotoUrl, signProfilePhotoUrls } from "./photo";

function db(over: { createSignedUrl?: unknown; createSignedUrls?: unknown }) {
  return {
    storage: {
      from: () => ({
        createSignedUrl: over.createSignedUrl ?? vi.fn(),
        createSignedUrls: over.createSignedUrls ?? vi.fn(),
      }),
    },
  } as never;
}

describe("profilePhotoPath", () => {
  it("is <id>/avatar.jpg", () => {
    expect(profilePhotoPath("abc")).toBe("abc/avatar.jpg");
  });
});

describe("signProfilePhotoUrl", () => {
  it("returns null for a null path without calling storage", async () => {
    const createSignedUrl = vi.fn();
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), null)).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it("returns the signed url on success", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://s/x" }, error: null });
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), "a/avatar.jpg")).toBe("https://s/x");
  });
  it("returns null on a storage error", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: "no" } });
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), "a/avatar.jpg")).toBeNull();
  });
  it("returns null (no throw) when storage throws", async () => {
    const createSignedUrl = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await signProfilePhotoUrl(db({ createSignedUrl }), "a/avatar.jpg")).toBeNull();
  });
});

describe("signProfilePhotoUrls", () => {
  it("batches only the non-null paths and preserves order", async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "a/avatar.jpg", signedUrl: "https://s/a", error: null },
        { path: "b/avatar.jpg", signedUrl: "https://s/b", error: null },
      ],
      error: null,
    });
    const out = await signProfilePhotoUrls(db({ createSignedUrls }), ["a/avatar.jpg", null, "b/avatar.jpg"]);
    expect(createSignedUrls).toHaveBeenCalledWith(["a/avatar.jpg", "b/avatar.jpg"], 3600);
    expect(out).toEqual(["https://s/a", null, "https://s/b"]);
  });
  it("maps a per-item error to null", async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{ path: "a/avatar.jpg", signedUrl: null, error: "denied" }],
      error: null,
    });
    expect(await signProfilePhotoUrls(db({ createSignedUrls }), ["a/avatar.jpg"])).toEqual([null]);
  });
  it("returns all-null and makes no storage call for all-null input", async () => {
    const createSignedUrls = vi.fn();
    expect(await signProfilePhotoUrls(db({ createSignedUrls }), [null, null])).toEqual([null, null]);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
