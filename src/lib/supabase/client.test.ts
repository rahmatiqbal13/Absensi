import { describe, it, expect, vi, beforeEach } from "vitest";

describe("createBrowserSupabaseClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("returns a client with the configured URL", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    const client = createBrowserSupabaseClient();
    expect(client).toBeDefined();
  });
});
