import { describe, it, expect, vi, beforeEach } from "vitest";

const headerMap = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerMap.get(k) ?? null }),
}));

import { clientIp, withinRateLimit } from "./rate-limit";

beforeEach(() => headerMap.clear());

describe("clientIp", () => {
  it("prefers x-real-ip", async () => {
    headerMap.set("x-real-ip", "1.1.1.1");
    headerMap.set("x-forwarded-for", "2.2.2.2, 3.3.3.3");
    expect(await clientIp()).toBe("1.1.1.1");
  });

  it("falls back to the first x-forwarded-for entry", async () => {
    headerMap.set("x-forwarded-for", " 2.2.2.2 , 3.3.3.3");
    expect(await clientIp()).toBe("2.2.2.2");
  });

  it("returns 'unknown' without proxy headers", async () => {
    expect(await clientIp()).toBe("unknown");
  });
});

describe("withinRateLimit", () => {
  function service(results: Record<string, { data: boolean | null; error: unknown }>) {
    return {
      rpc: vi.fn((_fn: string, args: { p_key: string }) => Promise.resolve(results[args.p_key])),
    } as never;
  }
  const rule = (key: string) => ({ key, max: 5, windowSeconds: 60 });

  it("passes when every rule is within its limit, recording each", async () => {
    const svc = service({ a: { data: true, error: null }, b: { data: true, error: null } });
    expect(await withinRateLimit(svc, [rule("a"), rule("b")])).toBe(true);
    expect((svc as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "a",
      p_max: 5,
      p_window_seconds: 60,
    });
  });

  it("blocks when any rule is over", async () => {
    const svc = service({ a: { data: true, error: null }, b: { data: false, error: null } });
    expect(await withinRateLimit(svc, [rule("a"), rule("b")])).toBe(false);
  });

  it("fails open when the limiter errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = service({ a: { data: null, error: { message: "boom" } } });
    expect(await withinRateLimit(svc, [rule("a")])).toBe(true);
  });
});
