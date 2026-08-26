import { describe, it, expect } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("attendance-photos storage bucket", () => {
  it("exists and is private", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db.storage.getBucket("attendance-photos");
    expect(error).toBeNull();
    expect(data!.public).toBe(false);
  });
});
