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
  if (error || !data.session) {
    throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  }
  return client;
}

describe("leave approval RPC", () => {
  let branchId: string;
  let karyawan: { id: string; email: string };
  let atasan: { id: string; email: string };
  let outsider: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang Leave RPC", lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.leave.${suffix}@test.local`, role: "atasan" },
      { key: "karyawan", email: `karyawan.leave.${suffix}@test.local`, role: "karyawan" },
      { key: "outsider", email: `outsider.leave.${suffix}@test.local`, role: "karyawan" },
    ] as const;

    const ids: Record<string, string> = {};
    for (const seed of seeds) {
      const { data: authUser } = await db.auth.admin.createUser({
        email: seed.email,
        password,
        email_confirm: true,
      });
      ids[seed.key] = authUser!.user!.id;
    }

    for (const seed of seeds) {
      await db.from("employees").insert({
        id: ids[seed.key],
        nama: seed.key,
        email: seed.email,
        branch_id: branchId,
        jabatan: "Staff",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2026-01-01",
        role: seed.role,
        atasan_id: seed.key === "karyawan" ? ids.atasan : null,
      });
    }

    atasan = { id: ids.atasan, email: seeds[0].email };
    karyawan = { id: ids.karyawan, email: seeds[1].email };
    outsider = { id: ids.outsider, email: seeds[2].email };
  });

  it("lets the assigned approver approve a pending request and credits leave_balances atomically", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-11-02",
        tanggal_selesai: "2026-11-04",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const atasanClient = await signInAs(atasan.email);
    const { data: approved, error } = await atasanClient
      .rpc("approve_leave_request", { p_request_id: leave!.id, p_catatan: "Disetujui" })
      .single();

    expect(error).toBeNull();
    expect(approved.status).toBe("approved");

    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", karyawan.id)
      .eq("tahun", 2026)
      .single();
    expect(Number(balance!.saldo_terpakai)).toBe(3);
  });

  it("blocks a non-assigned employee from approving the request", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-10",
        tanggal_selesai: "2026-11-10",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const outsiderClient = await signInAs(outsider.email);
    const { error } = await outsiderClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("only the assigned approver may act on this request");
  });

  it("blocks self-approval even if approver_id was somehow set to the requester", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-15",
        tanggal_selesai: "2026-11-15",
        approver_id: karyawan.id,
        is_self_request: true,
      })
      .select()
      .single();

    const karyawanClient = await signInAs(karyawan.email);
    const { error } = await karyawanClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  });

  it("rejects requires a non-empty catatan", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-20",
        tanggal_selesai: "2026-11-20",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const atasanClient = await signInAs(atasan.email);
    const { error } = await atasanClient.rpc("reject_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("catatan_approval is required");
  });
});
