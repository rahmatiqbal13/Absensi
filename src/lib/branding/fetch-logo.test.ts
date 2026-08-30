import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLogoDataUrl } from "./fetch-logo";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchLogoDataUrl", () => {
  it("returns null for a null input without fetching", async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchLogoDataUrl(null)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns a data URL for a 200 image response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "3" },
      }),
    ) as unknown as typeof fetch;
    const out = await fetchLogoDataUrl("https://cdn.test/logo.png");
    expect(out).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null on a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchLogoDataUrl("https://cdn.test/missing.png")).toBeNull();
  });

  it("returns null on an oversized response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(5 * 1024 * 1024) },
      }),
    ) as unknown as typeof fetch;
    expect(await fetchLogoDataUrl("https://cdn.test/huge.png")).toBeNull();
  });

  it("returns null (no throw) when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(await fetchLogoDataUrl("https://cdn.test/logo.png")).toBeNull();
  });
});
