import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

// cancel_leave_request (migration 0040).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

async function signInAs(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInAs(${email}) failed: ${error.message}`);
  return client;
}

function isoDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD
}

describe("cancel_leave_request RPC", () => {
  let karyawan: { id: string; email: string };
  let atasan: { id: string; email: string };
  let other: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang Leave Cancel", lat: -6.2, long: 106.8 })
      .select()
      .single();

    const seeds = [
      { key: "atasan", email: `atasan.cancel.${suffix}@test.local`, role: "atasan" },
      { key: "karyawan", email: `karyawan.cancel.${suffix}@test.local`, role: "karyawan" },
      { key: "other", email: `other.cancel.${suffix}@test.local`, role: "karyawan" },
    ] as const;
    const ids: Record<string, string> = {};
    for (const seed of seeds) {
      const { data } = await db.auth.admin.createUser({ email: seed.email, password, email_confirm: true });
      ids[seed.key] = data!.user!.id;
    }
    for (const seed of seeds) {
      await db.from("employees").insert({
        id: ids[seed.key],
        nama: seed.key,
        email: seed.email,
        branch_id: branch!.id,
        jabatan: "Staff",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2020-01-01",
        role: seed.role,
        atasan_id: seed.key === "atasan" ? null : ids.atasan,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    karyawan = { id: ids.karyawan, email: seeds[1].email };
    other = { id: ids.other, email: seeds[2].email };
  });

  async function insertLeave(fields: { jenis: string; mulai: string; selesai: string }) {
    const db = createServiceRoleSupabaseClient();
    const { data } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawan.id,
        jenis: fields.jenis,
        tanggal_mulai: fields.mulai,
        tanggal_selesai: fields.selesai,
        approver_id: atasan.id,
      })
      .select()
      .single();
    return data!.id as string;
  }

  it("cancels the owner's pending request and writes an audit row", async () => {
    const id = await insertLeave({ jenis: "sakit", mulai: isoDaysFromNow(5), selesai: isoDaysFromNow(5) });
    const client = await signInAs(karyawan.email);
    const { error } = await client.rpc("cancel_leave_request", { p_request_id: id });
    expect(error).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db.from("leave_requests").select("status").eq("id", id).single();
    expect(row!.status).toBe("dibatalkan");
    const { data: audit } = await db
      .from("audit_logs")
      .select("aksi")
      .eq("aksi", "leave_cancelled")
      .eq("target_employee_id", karyawan.id);
    expect(audit!.length).toBeGreaterThan(0);
  });

  it("refunds annual leave when an approved, future request is cancelled", async () => {
    const mulai = isoDaysFromNow(10);
    const selesai = isoDaysFromNow(12); // 3 calendar days
    const id = await insertLeave({ jenis: "tahunan", mulai, selesai });
    const atasanClient = await signInAs(atasan.email);
    const { error: apErr } = await atasanClient.rpc("approve_leave_request", { p_request_id: id, p_catatan: null });
    expect(apErr).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const tahun = Number(mulai.slice(0, 4));
    const before = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", karyawan.id)
      .eq("tahun", tahun)
      .single();

    const client = await signInAs(karyawan.email);
    const { error } = await client.rpc("cancel_leave_request", { p_request_id: id });
    expect(error).toBeNull();

    const after = await db
      .from("leave_balances")
      .select("saldo_terpakai")
      .eq("employee_id", karyawan.id)
      .eq("tahun", tahun)
      .single();
    expect(Number(after.data!.saldo_terpakai)).toBe(Number(before.data!.saldo_terpakai) - 3);
  });

  it("refuses to cancel approved leave that has already started", async () => {
    const id = await insertLeave({ jenis: "sakit", mulai: isoDaysFromNow(-1), selesai: isoDaysFromNow(1) });
    const atasanClient = await signInAs(atasan.email);
    await atasanClient.rpc("approve_leave_request", { p_request_id: id, p_catatan: null });

    const client = await signInAs(karyawan.email);
    const { error } = await client.rpc("cancel_leave_request", { p_request_id: id });
    expect(error?.message).toContain("leave has already started");
  });

  it("refuses to cancel someone else's request", async () => {
    const id = await insertLeave({ jenis: "sakit", mulai: isoDaysFromNow(20), selesai: isoDaysFromNow(20) });
    const client = await signInAs(other.email);
    const { error } = await client.rpc("cancel_leave_request", { p_request_id: id });
    expect(error?.message).toContain("leave request not found");

    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db.from("leave_requests").select("status").eq("id", id).single();
    expect(row!.status).toBe("pending");
  });

  it("denies an unauthenticated anon-key caller", async () => {
    const id = await insertLeave({ jenis: "sakit", mulai: isoDaysFromNow(25), selesai: isoDaysFromNow(25) });
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anon.rpc("cancel_leave_request", { p_request_id: id });
    expect(error).not.toBeNull();
  });
});
