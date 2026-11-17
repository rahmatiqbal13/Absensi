import { describe, it, expect, vi, afterEach } from "vitest";
import { appUrl } from "./app-url";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL, trimming trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://absen.example.test//");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "prod.example.test");
    expect(appUrl()).toBe("https://absen.example.test");
  });

  it("falls back to the Vercel production domain, then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "prod.example.test");
    expect(appUrl()).toBe("https://prod.example.test");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
