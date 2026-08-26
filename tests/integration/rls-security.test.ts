// tests/integration/rls-security.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signInAs(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  await client.auth.signInWithPassword({ email, password });
  return client;
}

describe("RLS & anti-fraud triggers", () => {
  let branchId: string;
  let karyawanA: { id: string; email: string };
  let karyawanB: { id: string; email: string };
  const password = "TestPassword123!";
  const suffix = Date.now();

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang RLS", lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch.id;

    for (const [key, email] of [
      ["A", `karyawan.a+${suffix}@test.local`],
      ["B", `karyawan.b+${suffix}@test.local`],
    ] as const) {
      const { data: authUser } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      const { data: employee } = await db
        .from("employees")
        .insert({
          id: authUser.user!.id,
          nama: `Karyawan ${key}`,
          email,
          branch_id: branchId,
          jabatan: "Staff",
          status_kontrak: "tetap",
          tanggal_mulai_kerja: "2026-01-01",
          role: "karyawan",
        })
        .select()
        .single();
      if (key === "A") karyawanA = { id: employee!.id, email };
      else karyawanB = { id: employee!.id, email };
    }
  });

  it("blocks a karyawan from reading another employee's row", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { data, error } = await clientA
      .from("employees")
      .select("*")
      .eq("id", karyawanB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("blocks a non-admin from changing their own role via UPDATE", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { error } = await clientA
      .from("employees")
      .update({ role: "hr_admin" })
      .eq("id", karyawanA.id);
    expect(error).not.toBeNull();
  });

  it("blocks self-approval on leave_requests at the trigger level", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-01",
        tanggal_selesai: "2026-10-02",
        approver_id: karyawanA.id,
        is_self_request: true,
      })
      .select()
      .single();

    const { error } = await db
      .from("leave_requests")
      .update({ status: "approved" })
      .eq("id", leave.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  });
});
