// tests/integration/employee-authz-audit.test.ts
import { describe, it, expect, beforeAll } from "vitest";
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

describe("employee authz + audit triggers (0018)", () => {
  let branchId: string;
  let atasan: { id: string; email: string };
  let hrAdmin: { id: string; email: string };
  let worker: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: `Cabang AuthzAudit ${suffix}`, lat: -6.2, long: 106.8 })
      .select().single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.aa.${suffix}@test.local`, role: "atasan" },
      { key: "hrAdmin", email: `hradmin.aa.${suffix}@test.local`, role: "hr_admin" },
      { key: "worker", email: `worker.aa.${suffix}@test.local`, role: "karyawan" },
    ] as const;
    const ids: Record<string, string> = {};
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      ids[s.key] = u!.user!.id;
      await db.from("employees").insert({
        id: ids[s.key], nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
        atasan_id: s.key === "worker" ? ids.atasan : null,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    hrAdmin = { id: ids.hrAdmin, email: seeds[1].email };
    worker = { id: ids.worker, email: seeds[2].email };
  });

  it("blocks an atasan from changing another employee's gaji_pokok", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("employees")
      .update({ gaji_pokok: 99_000_000 }).eq("id", worker.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("not allowed to change protected employee fields");
  });

  it("blocks an atasan from changing another employee's role", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("employees")
      .update({ role: "hr_admin" }).eq("id", worker.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("not allowed to change protected employee fields");
  });

  it("lets an hr_admin change a protected field, and audits it", async () => {
    const client = await signInAs(hrAdmin.email);
    const { error } = await client.from("employees")
      .update({ gaji_pokok: 12_000_000 }).eq("id", worker.id);
    expect(error).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: logs } = await db.from("audit_logs")
      .select("aksi, actor_id, target_employee_id, is_self_action")
      .eq("target_employee_id", worker.id).order("waktu", { ascending: false }).limit(1);
    expect(logs![0].aksi).toBe("employee_updated");
    expect(logs![0].actor_id).toBe(hrAdmin.id);
    expect(logs![0].is_self_action).toBe(false);
  });

  it("audits a deactivation as employee_deactivated with is_self_action false", async () => {
    const client = await signInAs(hrAdmin.email);
    await client.from("employees").update({ status: "nonaktif" }).eq("id", worker.id);

    const db = createServiceRoleSupabaseClient();
    const { data: logs } = await db.from("audit_logs")
      .select("aksi, is_self_action").eq("target_employee_id", worker.id)
      .order("waktu", { ascending: false }).limit(1);
    expect(logs![0].aksi).toBe("employee_deactivated");
    expect(logs![0].is_self_action).toBe(false);
  });

  it("records employee_created + is_self_action true when hr_admin edits their own row", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: created } = await db.from("audit_logs")
      .select("aksi").eq("target_employee_id", hrAdmin.id).eq("aksi", "employee_created");
    expect(created!.length).toBeGreaterThanOrEqual(1);

    const client = await signInAs(hrAdmin.email);
    await client.from("employees").update({ jabatan: "Manajer HR" }).eq("id", hrAdmin.id);
    const { data: logs } = await db.from("audit_logs")
      .select("aksi, is_self_action").eq("target_employee_id", hrAdmin.id)
      .order("waktu", { ascending: false }).limit(1);
    expect(logs![0].aksi).toBe("employee_updated");
    expect(logs![0].is_self_action).toBe(true);
  });

  it("blocks an atasan from changing holidays now that holidays_write is hr_admin only", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.from("holidays")
      .insert({ tanggal: "2026-12-31", nama: `sneaky ${suffix}` });
    expect(error).not.toBeNull();
  });
});
