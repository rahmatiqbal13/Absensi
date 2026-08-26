import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ mocked: true })),
}));

describe("createBrowserSupabaseClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns a client with the configured URL and anon key", async () => {
    const { createBrowserClient } = await import("@supabase/ssr");
    const { createBrowserSupabaseClient } = await import("./client");
    const client = createBrowserSupabaseClient();
    expect(client).toBeDefined();
    expect(createBrowserClient).toHaveBeenCalledWith(
      "http://localhost:54321",
      "test-anon-key",
    );
  });
});
