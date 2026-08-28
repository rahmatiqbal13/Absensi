import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

async function signInAs(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  return client;
}

describe("reporting-config RLS (0024)", () => {
  let branchId: string;
  let atasan: { id: string; email: string };
  let hrAdmin: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches").insert({ nama: `Cabang Config ${suffix}`, lat: -6.2, long: 106.8 })
      .select().single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.cfg.${suffix}@test.local`, role: "atasan" },
      { key: "hrAdmin", email: `hradmin.cfg.${suffix}@test.local`, role: "hr_admin" },
    ] as const;
    const ids: Record<string, string> = {};
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      ids[s.key] = u!.user!.id;
      await db.from("employees").insert({
        id: ids[s.key], nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    hrAdmin = { id: ids.hrAdmin, email: seeds[1].email };
  });

  // Keep the shared cloud DB clean: without the unique constraint (RED state)
  // the "second work_schedules row" case would otherwise leave a permanent
  // duplicate for this test branch and block the constraint on the next push.
  afterAll(async () => {
    const db = createServiceRoleSupabaseClient();
    await db.from("work_schedules").delete().eq("branch_id", branchId);
    await db.from("departments").delete().eq("branch_id", branchId);
  });

  it("blocks an atasan from inserting a department", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("departments").insert({ branch_id: branchId, nama: `Dept ${suffix}` });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("lets an hr_admin insert a department", async () => {
    const client = await signInAs(hrAdmin.email);
    const { error } = await client.from("departments").insert({ branch_id: branchId, nama: `Dept HR ${suffix}` });
    expect(error).toBeNull();
  });

  it("blocks an atasan from updating a work schedule", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.from("work_schedules").insert({
      branch_id: branchId, jam_masuk: "09:00", jam_pulang: "17:00", hari_kerja: [1, 2, 3, 4, 5], toleransi_terlambat_menit: 15,
    });
    const client = await signInAs(atasan.email);
    // The work_schedules_write USING clause (is_hr_admin_role()) filters the
    // row out of the UPDATE for an atasan, so PostgREST returns no error and
    // zero affected rows — a silent no-op, the same shape as an RLS-filtered
    // DELETE (Plan 5 M1). Assert the row is genuinely unchanged rather than
    // expecting a 42501 (which only fires on a WITH CHECK violation, i.e. INSERT).
    const { data: updated, error } = await client
      .from("work_schedules")
      .update({ toleransi_terlambat_menit: 99 })
      .eq("branch_id", branchId)
      .select();
    expect(error).toBeNull();
    expect(updated ?? []).toHaveLength(0);

    const { data: row } = await db
      .from("work_schedules")
      .select("toleransi_terlambat_menit")
      .eq("branch_id", branchId)
      .single();
    expect(row!.toleransi_terlambat_menit).toBe(15);
  });

  it("lets an hr_admin update a work schedule", async () => {
    const client = await signInAs(hrAdmin.email);
    const { data: updated, error } = await client
      .from("work_schedules")
      .update({ toleransi_terlambat_menit: 20 })
      .eq("branch_id", branchId)
      .select();
    expect(error).toBeNull();
    expect(updated ?? []).toHaveLength(1);
  });

  it("rejects a second work_schedules row for the same branch", async () => {
    const db = createServiceRoleSupabaseClient();
    const { error } = await db.from("work_schedules").insert({
      branch_id: branchId, jam_masuk: "08:00", jam_pulang: "16:00", hari_kerja: [1], toleransi_terlambat_menit: 0,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505"); // unique_violation
  });
});
