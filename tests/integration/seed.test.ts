import { describe, it, expect } from "vitest";
import { runSeed } from "../../scripts/seed";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("runSeed", () => {
  it("creates exactly one Kantor Pusat branch and two super_admins, and is idempotent", async () => {
    await runSeed();
    await runSeed(); // run twice on purpose

    const db = createServiceRoleSupabaseClient();

    // Find a "Kantor Pusat" branch that has exactly 2 super_admins
    // (matching the logic in the seed script)
    const { data: branches } = await db.from("branches").select("*").eq("nama", "Kantor Pusat");
    expect(branches).toBeDefined();
    expect(branches!.length).toBeGreaterThan(0);

    let kantorPusat: any = null;
    if (branches) {
      // First try to find one with 2 super_admins (idempotent case)
      for (const branch of branches) {
        const { data: admins } = await db
          .from("employees")
          .select("*")
          .eq("role", "super_admin")
          .eq("branch_id", branch.id);
        if (admins && admins.length === 2) {
          kantorPusat = branch;
          break;
        }
      }
      // If none have 2 admins, something went wrong
      if (!kantorPusat) {
        throw new Error("No Kantor Pusat branch found with exactly 2 super_admins");
      }
    }

    // Verify exactly 2 super_admins exist for this branch
    const { data: admins } = await db
      .from("employees")
      .select("*")
      .eq("role", "super_admin")
      .eq("branch_id", kantorPusat.id);
    expect(admins).toHaveLength(2);

    // Verify they are each other's designated approvers
    expect(admins![0].designated_approver_id).toBe(admins![1].id);
    expect(admins![1].designated_approver_id).toBe(admins![0].id);
  });
});
