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
  let hrAdmin: { id: string; email: string };

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
      { key: "hrAdmin", email: `hradmin.leave.${suffix}@test.local`, role: "hr_admin" },
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
    hrAdmin = { id: ids.hrAdmin, email: seeds[3].email };
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
    expect((approved as { status: string } | null)?.status).toBe("approved");

    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", karyawan.id)
      .eq("tahun", 2026)
      .single();
    expect(Number(balance!.saldo_terpakai)).toBe(3);

    const { data: auditRows } = await db
      .from("audit_logs")
      .select("aksi, target_employee_id, is_self_action")
      .eq("aksi", "leave_approved")
      .eq("target_employee_id", karyawan.id)
      .order("waktu", { ascending: false })
      .limit(1);
    expect(auditRows![0].aksi).toBe("leave_approved");
    expect(auditRows![0].is_self_action).toBe(false);
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

  // C1 regression. Before 0014 the RPCs carried the default EXECUTE grant to
  // PUBLIC *and* an explicit grant to `anon`, so an unauthenticated caller
  // holding only the public anon key could approve any request whose UUID they
  // knew: SECURITY DEFINER bypassed RLS for the internal writes, and the
  // internal `auth.uid() is not null` guard -- written to exempt the service
  // role -- exempted the anonymous caller for the same reason (auth.uid() is
  // NULL for both). Postgres now denies EXECUTE to `anon` before the body runs.
  it("blocks an UNAUTHENTICATED anon-key caller from approving any request", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-25",
        tanggal_selesai: "2026-11-25",
        approver_id: atasan.id,
      })
      .select()
      .single();

    // No signInWithPassword: this client has no session at all.
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anonClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "pwned",
    });

    expect(error).not.toBeNull();

    // And the request must be untouched.
    const { data: after } = await db
      .from("leave_requests")
      .select("status")
      .eq("id", leave!.id)
      .single();
    expect(after!.status).toBe("pending");
  });

  it("blocks an UNAUTHENTICATED anon-key caller from rejecting any request", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "sakit",
        tanggal_mulai: "2026-11-26",
        tanggal_selesai: "2026-11-26",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anonClient.rpc("reject_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "pwned",
    });

    expect(error).not.toBeNull();

    const { data: after } = await db
      .from("leave_requests")
      .select("status")
      .eq("id", leave!.id)
      .single();
    expect(after!.status).toBe("pending");
  });

  // I2 regression. An hr_admin's own request is escalated to a designated
  // approver, so approver_id <> employee_id and the old approver_id-based
  // self-approval check passed; is_hr_admin_role() then exempted them from the
  // "assigned approver" check. They could approve their own leave.
  it("blocks an hr_admin from approving their OWN escalated request", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: hrAdmin.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-12-01",
        tanggal_selesai: "2026-12-02",
        approver_id: atasan.id, // escalated elsewhere, NOT to self
        is_self_request: true,
      })
      .select()
      .single();

    const hrClient = await signInAs(hrAdmin.email);
    const { error } = await hrClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "self approve",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  });

  // I3 regression: reject had no self-approval check at all.
  it("blocks an hr_admin from rejecting their OWN escalated request", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: hrAdmin.id,
        jenis: "sakit",
        tanggal_mulai: "2026-12-05",
        tanggal_selesai: "2026-12-05",
        approver_id: atasan.id,
        is_self_request: true,
      })
      .select()
      .single();

    const hrClient = await signInAs(hrAdmin.email);
    const { error } = await hrClient.rpc("reject_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "self reject",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  });

  // I1 regression: a second approval of an already-approved request must fail
  // rather than crediting leave_balances a second time.
  it("does not double-credit leave_balances when a request is approved twice", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: outsider.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-12-10",
        tanggal_selesai: "2026-12-12",
        approver_id: atasan.id,
      })
      .select()
      .single();

    const atasanClient = await signInAs(atasan.email);
    const first = await atasanClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "ok",
    });
    expect(first.error).toBeNull();

    const second = await atasanClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "ok again",
    });
    expect(second.error).not.toBeNull();
    expect(second.error!.message).toContain("not pending");

    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", outsider.id)
      .eq("tahun", 2026)
      .single();
    expect(Number(balance!.saldo_terpakai)).toBe(3);
  });

  // Plan 3 I2 regression: approval must re-check the leave balance. A pending
  // `tahunan` request that would push saldo_terpakai past saldo_awal is
  // refused at approval time, the request stays pending, and saldo_terpakai is
  // untouched.
  it("refuses to approve a tahunan request that would overdraw the leave balance", async () => {
    const db = createServiceRoleSupabaseClient();

    // Seed a balance row near its limit for a year not used by other tests.
    await db.from("leave_balances").insert({
      employee_id: karyawan.id,
      tahun: 2028,
      saldo_awal: 12,
      saldo_terpakai: 11,
    });

    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: "tahunan",
        tanggal_mulai: "2028-01-06",
        tanggal_selesai: "2028-01-08", // 3 days; 11 + 3 = 14 > 12
        approver_id: atasan.id,
      })
      .select()
      .single();

    const atasanClient = await signInAs(atasan.email);
    const { error } = await atasanClient.rpc("approve_leave_request", {
      p_request_id: leave!.id,
      p_catatan: "ok",
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("insufficient leave balance");

    const { data: after } = await db
      .from("leave_requests")
      .select("status")
      .eq("id", leave!.id)
      .single();
    expect(after!.status).toBe("pending");

    const { data: balance } = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", karyawan.id)
      .eq("tahun", 2028)
      .single();
    expect(Number(balance!.saldo_terpakai)).toBe(11);
  });

  // I4 regression: a reversed date range used to yield a negative day count
  // that DECREASED saldo_terpakai on approval.
  it("refuses to store a leave request whose tanggal_selesai precedes tanggal_mulai", async () => {
    const db = createServiceRoleSupabaseClient();
    const { error } = await db.from("leave_requests").insert({
      employee_id: karyawan.id,
      jenis: "tahunan",
      tanggal_mulai: "2026-12-20",
      tanggal_selesai: "2026-12-15",
      approver_id: atasan.id,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("leave_requests_date_order_check");
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

  it("writes a leave_rejected audit row on reject", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db.from("leave_requests").insert({
      employee_id: karyawan.id, jenis: "sakit",
      tanggal_mulai: "2026-11-25", tanggal_selesai: "2026-11-25", approver_id: atasan.id,
    }).select().single();

    const atasanClient = await signInAs(atasan.email);
    await atasanClient.rpc("reject_leave_request", { p_request_id: leave!.id, p_catatan: "Tidak lengkap" });

    const { data: rows } = await db.from("audit_logs")
      .select("aksi").eq("aksi", "leave_rejected").eq("target_employee_id", karyawan.id)
      .order("waktu", { ascending: false }).limit(1);
    expect(rows![0].aksi).toBe("leave_rejected");
  });
});
