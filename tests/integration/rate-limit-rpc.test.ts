import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

// rate_limit_hit + rate_limits (migration 0042).
const key = `test:rl:${Date.now()}`;

describe("rate_limit_hit", () => {
  afterAll(async () => {
    await createServiceRoleSupabaseClient().from("rate_limits").delete().like("key", "test:rl:%");
  });

  it("allows up to max hits in a window, then refuses", async () => {
    const db = createServiceRoleSupabaseClient();
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { data, error } = await db.rpc("rate_limit_hit", { p_key: key, p_max: 3, p_window_seconds: 60 });
      expect(error).toBeNull();
      results.push(data as boolean);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const db = createServiceRoleSupabaseClient();
    const k = `${key}:exp`;
    await db.rpc("rate_limit_hit", { p_key: k, p_max: 1, p_window_seconds: 60 });
    await db.from("rate_limits").update({ window_start: new Date(Date.now() - 120_000).toISOString() }).eq("key", k);
    const { data } = await db.rpc("rate_limit_hit", { p_key: k, p_max: 1, p_window_seconds: 60 });
    expect(data).toBe(true);
  });

  it("is not callable with the anon key", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc("rate_limit_hit", { p_key: `${key}:anon`, p_max: 1000, p_window_seconds: 1 });
    expect(error).not.toBeNull();
    const read = await anon.from("rate_limits").select("key").limit(1);
    expect(read.data ?? []).toEqual([]);
  });
});
