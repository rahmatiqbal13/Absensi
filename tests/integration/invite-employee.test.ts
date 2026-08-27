import { describe, it, expect, beforeAll } from "vitest";
import { inviteEmployee } from "../../src/lib/employees/invite";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const suffix = Date.now();

describe("inviteEmployee (live)", () => {
  let branchId: string;
  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches").insert({ nama: `Cabang Invite ${suffix}`, lat: -6.2, long: 106.8 })
      .select().single();
    branchId = branch!.id;
    process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  });

  it("creates an auth user + employees row and returns a usable link", async () => {
    const db = createServiceRoleSupabaseClient();
    const result = await inviteEmployee({
      nama: "Invite Test", email: `invite.${suffix}@test.local`, jabatan: "Staff",
      statusKontrak: "tetap", tanggalMulaiKerja: "2026-02-01", gajiPokok: 8_000_000,
      role: "karyawan", branchId, departmentId: null, atasanId: null, designatedApproverId: null,
    }, db);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.setPasswordUrl).toContain("set-password");

    const { data: emp } = await db.from("employees").select("id, email").eq("id", result.employeeId).single();
    expect(emp!.email).toBe(`invite.${suffix}@test.local`);
    const { data: authUser } = await db.auth.admin.getUserById(result.employeeId);
    expect(authUser.user?.email).toBe(`invite.${suffix}@test.local`);
  });

  it("rolls back the auth user when the employees insert fails (bad branch_id)", async () => {
    const db = createServiceRoleSupabaseClient();
    // A well-formed but non-existent branch_id -> employees.branch_id FK violation
    // -> insert fails after the auth user is created -> rollback path.
    const badBranchId = "00000000-0000-0000-0000-000000000000";
    const result = await inviteEmployee({
      nama: "Rollback Test", email: `invite.rollback.${suffix}@test.local`, jabatan: "Staff",
      statusKontrak: "tetap", tanggalMulaiKerja: "2026-02-01", gajiPokok: 0, role: "karyawan",
      branchId: badBranchId, departmentId: null, atasanId: null, designatedApproverId: null,
    }, db);

    expect(result).toEqual({ ok: false, error: "Gagal menyimpan data karyawan." });

    // The auth user generateLink created must have been deleted again.
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const stillThere = users.users.some(
      (u) => u.email === `invite.rollback.${suffix}@test.local`,
    );
    expect(stillThere).toBe(false);
  });
});
