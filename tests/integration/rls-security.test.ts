// tests/integration/rls-security.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signInAs(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  }
  return client;
}

describe("RLS & anti-fraud triggers", () => {
  let branchId: string;
  let otherBranchId: string;
  let departmentId: string;
  let karyawanA: { id: string; email: string };
  let karyawanB: { id: string; email: string };
  let karyawanC: { id: string; email: string };
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

    const { data: otherBranch } = await db
      .from("branches")
      .insert({ nama: "Cabang RLS Lain", lat: -6.3, long: 106.9 })
      .select()
      .single();
    otherBranchId = otherBranch.id;

    const { data: department } = await db
      .from("departments")
      .insert({ branch_id: branchId, nama: "Dept RLS" })
      .select()
      .single();
    departmentId = department.id;

    for (const [key, email] of [
      ["A", `karyawan.a+${suffix}@test.local`],
      ["B", `karyawan.b+${suffix}@test.local`],
      ["C", `karyawan.c+${suffix}@test.local`],
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
      else if (key === "B") karyawanB = { id: employee!.id, email };
      else karyawanC = { id: employee!.id, email };
    }
  }, 60_000);

  // --- employees -----------------------------------------------------------

  it("lets a karyawan read their OWN employee row (positive control)", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { data, error } = await clientA
      .from("employees")
      .select("*")
      .eq("id", karyawanA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(karyawanA.id);
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

  it("blocks a non-admin from changing any protected field on their own row", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const attempts: Array<{ field: string; value: unknown }> = [
      { field: "role", value: "hr_admin" },
      { field: "gaji_pokok", value: 99_000_000 },
      { field: "branch_id", value: otherBranchId },
      { field: "department_id", value: departmentId },
      { field: "atasan_id", value: karyawanB.id },
      { field: "designated_approver_id", value: karyawanB.id },
      { field: "status", value: "nonaktif" },
    ];

    for (const { field, value } of attempts) {
      const { error } = await clientA
        .from("employees")
        .update({ [field]: value })
        .eq("id", karyawanA.id);
      expect(error, `expected ${field} update to be rejected`).not.toBeNull();
      expect(
        error!.message,
        `unexpected error for ${field}: ${error!.message}`,
      ).toContain("not allowed to change protected fields");
    }

    // and nothing actually changed
    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db
      .from("employees")
      .select("role, gaji_pokok, branch_id, department_id, atasan_id, designated_approver_id, status")
      .eq("id", karyawanA.id)
      .single();
    expect(row).toMatchObject({
      role: "karyawan",
      branch_id: branchId,
      department_id: null,
      atasan_id: null,
      designated_approver_id: null,
      status: "aktif",
    });
  }, 30_000);

  // --- leave_requests: self-approval ---------------------------------------

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

  // --- leave_requests: "only the assigned approver may act" -----------------

  it("blocks a karyawan who is not the assigned approver from approving", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-05",
        tanggal_selesai: "2026-10-06",
        approver_id: karyawanB.id,
      })
      .select()
      .single();

    // A is the requester, not the approver: the UPDATE policy's USING clause
    // filters the row out entirely, so the update silently matches 0 rows.
    const clientA = await signInAs(karyawanA.email, password);
    const { data: updated, error } = await clientA
      .from("leave_requests")
      .update({ status: "approved", approver_id: karyawanA.id })
      .eq("id", leave.id)
      .select();
    expect(error).toBeNull();
    expect(updated).toEqual([]);

    const { data: after } = await db
      .from("leave_requests")
      .select("status, approver_id")
      .eq("id", leave.id)
      .single();
    expect(after!.status).toBe("pending");
    expect(after!.approver_id).toBe(karyawanB.id);
  }, 30_000);

  it("raises 'only the assigned approver may act' when the approver reassigns approver_id while deciding", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-07",
        tanggal_selesai: "2026-10-08",
        approver_id: karyawanB.id,
      })
      .select()
      .single();

    // B passes the UPDATE policy (approver_id = auth.uid()) but tries to decide
    // the request in the name of C. The trigger is the only thing that stops it.
    const clientB = await signInAs(karyawanB.email, password);
    const { error } = await clientB
      .from("leave_requests")
      .update({ status: "approved", approver_id: karyawanC.id })
      .eq("id", leave.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain(
      "only the assigned approver may act on this request",
    );
  }, 30_000);

  // --- leave_requests: service-role approval path must work -----------------

  it("lets the service role approve a pending request on behalf of the system", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-09",
        tanggal_selesai: "2026-10-10",
        approver_id: karyawanB.id,
      })
      .select()
      .single();

    const { data: updated, error } = await db
      .from("leave_requests")
      .update({ status: "approved" })
      .eq("id", leave.id)
      .select()
      .single();
    expect(error).toBeNull();
    expect(updated!.status).toBe("approved");
  }, 30_000);

  // --- leave_requests: closed bypasses -------------------------------------

  it("blocks Bypass 1: inserting an already-approved leave_request as the requester", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { error } = await clientA.from("leave_requests").insert({
      employee_id: karyawanA.id,
      jenis: "tahunan",
      tanggal_mulai: "2026-11-01",
      tanggal_selesai: "2026-11-02",
      approver_id: karyawanA.id,
      status: "approved",
    });
    expect(error).not.toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: rows } = await db
      .from("leave_requests")
      .select("id")
      .eq("employee_id", karyawanA.id)
      .eq("tanggal_mulai", "2026-11-01");
    expect(rows).toEqual([]);
  }, 30_000);

  it("blocks Bypass 1 at the trigger level too (service-role insert, already approved, self as approver)", async () => {
    const db = createServiceRoleSupabaseClient();
    const { error } = await db.from("leave_requests").insert({
      employee_id: karyawanA.id,
      jenis: "tahunan",
      tanggal_mulai: "2026-11-03",
      tanggal_selesai: "2026-11-04",
      approver_id: karyawanA.id,
      status: "approved",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");
  }, 30_000);

  it("blocks Bypass 2: changing employee_id after the request was approved", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-11-05",
        tanggal_selesai: "2026-11-06",
        approver_id: karyawanB.id,
      })
      .select()
      .single();

    // Legitimate approval by B.
    const clientB = await signInAs(karyawanB.email, password);
    const { error: approveError } = await clientB
      .from("leave_requests")
      .update({ status: "approved" })
      .eq("id", leave.id);
    expect(approveError).toBeNull();

    // Now B tries to launder the approved row onto themselves.
    const { error } = await clientB
      .from("leave_requests")
      .update({ employee_id: karyawanB.id })
      .eq("id", leave.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("employee_id is immutable");

    const { data: after } = await db
      .from("leave_requests")
      .select("employee_id")
      .eq("id", leave.id)
      .single();
    expect(after!.employee_id).toBe(karyawanA.id);
  }, 30_000);

  // --- attendances: status backdating --------------------------------------

  it("allows clock-out but blocks a later status rewrite by the employee", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: attendance } = await db
      .from("attendances")
      .insert({
        employee_id: karyawanA.id,
        tanggal: "2026-12-01",
        jam_masuk: "2026-12-01T01:00:00Z",
        status: "terlambat",
      })
      .select()
      .single();

    const clientA = await signInAs(karyawanA.email, password);

    // Legitimate clock-out: jam_pulang was NULL, so status may still be set.
    const { error: clockOutError } = await clientA
      .from("attendances")
      .update({ jam_pulang: "2026-12-01T10:00:00Z", status: "pulang_cepat" })
      .eq("id", attendance.id);
    expect(clockOutError).toBeNull();

    // Retroactive tampering after the record is closed.
    const { error } = await clientA
      .from("attendances")
      .update({ status: "tepat_waktu" })
      .eq("id", attendance.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain(
      "not allowed to change status after clock-out is recorded",
    );

    const { data: after } = await db
      .from("attendances")
      .select("status")
      .eq("id", attendance.id)
      .single();
    expect(after!.status).toBe("pulang_cepat");
  }, 30_000);
});
