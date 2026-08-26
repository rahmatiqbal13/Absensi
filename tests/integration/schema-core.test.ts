import { describe, it, expect } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("core entity schema", () => {
  it("creates a branch, department, and work schedule with FK integrity", async () => {
    const db = createServiceRoleSupabaseClient();

    const { data: branch, error: branchErr } = await db
      .from("branches")
      .insert({ nama: "Kantor Pusat", lat: -6.2, long: 106.8 })
      .select()
      .single();
    expect(branchErr).toBeNull();
    expect(branch.radius_geofencing_meter).toBe(100);

    const { data: dept, error: deptErr } = await db
      .from("departments")
      .insert({ branch_id: branch.id, nama: "Engineering" })
      .select()
      .single();
    expect(deptErr).toBeNull();
    expect(dept.branch_id).toBe(branch.id);

    const { error: scheduleErr } = await db.from("work_schedules").insert({
      branch_id: branch.id,
      jam_masuk: "09:00",
      jam_pulang: "17:00",
      hari_kerja: [1, 2, 3, 4, 5],
      toleransi_terlambat_menit: 15,
    });
    expect(scheduleErr).toBeNull();

    const { error: fkErr } = await db
      .from("departments")
      .insert({ branch_id: "00000000-0000-0000-0000-000000000000", nama: "Ghost" });
    expect(fkErr).not.toBeNull();
  });
});
