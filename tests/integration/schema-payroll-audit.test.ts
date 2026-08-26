import { describe, it, expect } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("payroll & audit schema", () => {
  it("rejects a duplicate payroll period for the same branch/month/year", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang Payroll", lat: -6.2, long: 106.8 })
      .select()
      .single();

    const { error: firstErr } = await db
      .from("payroll_periods")
      .insert({ branch_id: branch.id, bulan: 9, tahun: 2026 });
    expect(firstErr).toBeNull();

    const { error: dupErr } = await db
      .from("payroll_periods")
      .insert({ branch_id: branch.id, bulan: 9, tahun: 2026 });
    expect(dupErr).not.toBeNull();
  });

  it("stores audit log details as jsonb", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db
      .from("audit_logs")
      .insert({ aksi: "test.aksi", detail: { before: 1, after: 2 } })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.detail).toEqual({ before: 1, after: 2 });
  });
});
