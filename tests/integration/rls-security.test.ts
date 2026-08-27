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
  let atasanD: { id: string; email: string };
  let hrAdminE: { id: string; email: string };
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

    // D is an `atasan` with no direct reports: since 0009 made `atasan` a full
    // admin at the DB layer (is_admin_role()), D's admin reach must come from
    // the role alone and not from any atasan_id link.
    for (const [key, email, role] of [
      ["A", `karyawan.a+${suffix}@test.local`, "karyawan"],
      ["B", `karyawan.b+${suffix}@test.local`, "karyawan"],
      ["C", `karyawan.c+${suffix}@test.local`, "karyawan"],
      ["D", `atasan.d+${suffix}@test.local`, "atasan"],
      ["E", `hr.e+${suffix}@test.local`, "hr_admin"],
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
          role,
        })
        .select()
        .single();
      if (key === "A") karyawanA = { id: employee!.id, email };
      else if (key === "B") karyawanB = { id: employee!.id, email };
      else if (key === "C") karyawanC = { id: employee!.id, email };
      else if (key === "D") atasanD = { id: employee!.id, email };
      else hrAdminE = { id: employee!.id, email };
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
    // gaji_pokok is numeric(14,2) with default 0 (see 0001_core_entities.sql).
    // Verified against the live API: PostgREST returns it as a JSON number
    // (0), not the "0.00" string form, so assert the numeric value.
    expect(row).toMatchObject({
      role: "karyawan",
      gaji_pokok: 0,
      branch_id: branchId,
      department_id: null,
      atasan_id: null,
      designated_approver_id: null,
      status: "aktif",
    });
  }, 30_000);

  it("blocks a non-admin from changing fields the old denylist missed (allowlist guard, 0009)", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    // None of these five were in the seven-field denylist that 0005 shipped.
    const attempts: Array<{ field: string; value: unknown }> = [
      { field: "tanggal_mulai_kerja", value: "2020-01-01" },
      { field: "status_kontrak", value: "kontrak" },
      { field: "email", value: `hijacked+${suffix}@test.local` },
      { field: "nama", value: "Nama Palsu" },
      { field: "jabatan", value: "Direktur" },
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

    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db
      .from("employees")
      .select("tanggal_mulai_kerja, status_kontrak, email, nama, jabatan")
      .eq("id", karyawanA.id)
      .single();
    expect(row).toMatchObject({
      tanggal_mulai_kerja: "2026-01-01",
      status_kontrak: "tetap",
      email: karyawanA.email,
      nama: "Karyawan A",
      jabatan: "Staff",
    });
  }, 30_000);

  it("still lets a non-admin update the two allowlisted fields on their own row", async () => {
    const clientA = await signInAs(karyawanA.email, password);
    const { error } = await clientA
      .from("employees")
      .update({ no_telp: "08123456789", foto_profil_url: "https://example.test/a.jpg" })
      .eq("id", karyawanA.id);
    expect(error).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db
      .from("employees")
      .select("no_telp, foto_profil_url")
      .eq("id", karyawanA.id)
      .single();
    expect(row).toMatchObject({
      no_telp: "08123456789",
      foto_profil_url: "https://example.test/a.jpg",
    });
  }, 30_000);

  it("lets an atasan read an unrelated employee's row (atasan is an admin since 0009)", async () => {
    // D is not B's atasan, so the `atasan_id = auth.uid()` clause of
    // employees_select does not apply: this read can only succeed through
    // is_admin_role(), which is exactly what 0009 changed.
    const clientD = await signInAs(atasanD.email, password);
    const { data, error } = await clientD
      .from("employees")
      .select("id, gaji_pokok")
      .eq("id", karyawanB.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(karyawanB.id);
  }, 30_000);

  it("lets an atasan read payroll_periods, which is is_admin_role()-only", async () => {
    // PostgREST answers 200/[]/error:null whether a read is allowed and empty
    // or denied by RLS, so asserting `error === null` alone proves nothing.
    // Seed a row first and assert the atasan actually sees THAT row.
    const db = createServiceRoleSupabaseClient();
    const { data: period, error: seedError } = await db
      .from("payroll_periods")
      .insert({ branch_id: branchId, bulan: 6, tahun: 2026 })
      .select()
      .single();
    expect(seedError).toBeNull();

    const clientD = await signInAs(atasanD.email, password);
    const { data, error } = await clientD
      .from("payroll_periods")
      .select("id")
      .eq("id", period!.id);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data![0].id).toBe(period!.id);
  }, 30_000);

  it("blocks an atasan from escalating their OWN gaji_pokok (anti-fraud triggers are hr_admin-only since 0010)", async () => {
    // Upper bound of the power 0009 granted: `atasan` is an admin for
    // route/read access via is_admin_role(), but the three anti-fraud triggers
    // now gate on the stricter is_hr_admin_role(), which excludes `atasan`.
    // The employees_update policy still lets D through (id = auth.uid()), so
    // the trigger is the only thing that can stop this.
    const clientD = await signInAs(atasanD.email, password);
    const { error } = await clientD
      .from("employees")
      .update({ gaji_pokok: 99_000_000 })
      .eq("id", atasanD.id);
    expect(error, "expected the atasan self-raise to be rejected").not.toBeNull();
    expect(error!.message).toContain(
      "not allowed to change protected fields on own employee record",
    );

    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db
      .from("employees")
      .select("gaji_pokok, role")
      .eq("id", atasanD.id)
      .single();
    expect(row).toMatchObject({ gaji_pokok: 0, role: "atasan" });
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

  // 0014 (I2) regression, exercised at the trigger's DIRECT-WRITE path rather
  // than through approve_leave_request(). Unlike the test above, approver_id
  // here is a DIFFERENT employee (a designated_approver_id-style escalation),
  // so the trigger's FIRST self-approval disjunct
  // (`new.approver_id = new.employee_id`) does NOT fire. hr_admin's
  // is_admin_role() already satisfies leave_requests_update's RLS
  // (`approver_id = auth.uid() or is_admin_role()`), so this direct UPDATE
  // reaches the trigger at all -- for a non-admin the same write would be
  // filtered out by RLS before the trigger ever ran (see the karyawan/atasan
  // "not the assigned approver" tests below). The only thing left to stop the
  // hr_admin here is the trigger's `auth.uid() = new.employee_id` disjunct
  // that 0014 added; the RPC-level equivalent of this check lives in
  // tests/integration/leave-approval-rpc.test.ts and cannot reach this clause
  // at all, since approve_leave_request() raises its own
  // "self-approval is not allowed" before the UPDATE it issues would ever hit
  // this trigger.
  it("blocks an hr_admin from self-approving their OWN escalated request via a DIRECT table update (0014 trigger disjunct)", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: hrAdminE.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-15",
        tanggal_selesai: "2026-10-16",
        approver_id: karyawanB.id, // designated approver -- NOT hrAdminE itself
        is_self_request: true,
      })
      .select()
      .single();
    expect(leave!.approver_id).not.toBe(leave!.employee_id);

    const clientE = await signInAs(hrAdminE.email, password);
    const { error } = await clientE
      .from("leave_requests")
      .update({ status: "approved" }) // direct write; approve_leave_request() RPC is never called
      .eq("id", leave.id);
    expect(error, "expected the hr_admin's direct self-approval to be rejected").not.toBeNull();
    expect(error!.message).toContain("self-approval is not allowed");

    const { data: after } = await db
      .from("leave_requests")
      .select("status")
      .eq("id", leave.id)
      .single();
    expect(after!.status).toBe("pending");
  }, 30_000);

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

  it("blocks an atasan who is not the assigned approver from approving (anti-fraud triggers are hr_admin-only since 0010)", async () => {
    // Unlike karyawanA above, D's is_admin_role() (atasan is an admin since
    // 0009) lets this UPDATE pass the leave_requests_update RLS policy's USING
    // clause, so the row is actually reached. Only the trigger's stricter
    // is_hr_admin_role() check (0010) can stop it.
    const db = createServiceRoleSupabaseClient();
    const { data: leave } = await db
      .from("leave_requests")
      .insert({
        employee_id: karyawanA.id,
        jenis: "tahunan",
        tanggal_mulai: "2026-10-11",
        tanggal_selesai: "2026-10-12",
        approver_id: karyawanB.id,
      })
      .select()
      .single();

    const clientD = await signInAs(atasanD.email, password);
    const { error } = await clientD
      .from("leave_requests")
      .update({ status: "approved" })
      .eq("id", leave.id);
    expect(error, "expected the atasan approval to be rejected").not.toBeNull();
    expect(error!.message).toContain(
      "only the assigned approver may act on this request",
    );

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

  // --- attendances: direct client writes (C1, migration 0011) --------------

  it("blocks a karyawan from INSERTing a fabricated attendances row directly", async () => {
    // The core anti-fraud claim of the attendance module: status is never
    // trusted from the client. Before 0011, attendances_insert only required
    // `employee_id = auth.uid()`, so any karyawan holding a session JWT plus
    // the public anon key could POST this straight to PostgREST from the
    // browser -- a perfect attendance record with a self-chosen status, no
    // geofence check, no selfie, no mobile-lock and no consent. 0011 restricts
    // INSERT to is_hr_admin_role(), so the WITH CHECK now fails outright.
    const clientA = await signInAs(karyawanA.email, password);
    const { error } = await clientA.from("attendances").insert({
      employee_id: karyawanA.id,
      tanggal: "2026-12-10",
      jam_masuk: "2026-12-10T02:00:00Z",
      lokasi_masuk: "(-6.2,106.8)",
      foto_masuk_url: "fabricated.jpg",
      status: "tepat_waktu",
    });
    expect(error, "expected the direct attendances insert to be rejected").not.toBeNull();
    // 42501 = insufficient_privilege, i.e. "new row violates row-level
    // security policy". A WITH CHECK failure is a hard error, unlike a USING
    // failure which silently matches zero rows.
    expect(error!.code, `unexpected error: ${error!.message}`).toBe("42501");

    // ...and nothing was written.
    const db = createServiceRoleSupabaseClient();
    const { data: rows } = await db
      .from("attendances")
      .select("id")
      .eq("employee_id", karyawanA.id)
      .eq("tanggal", "2026-12-10");
    expect(rows).toEqual([]);
  }, 30_000);

  it("blocks a karyawan from UPDATEing their own OPEN attendances row directly", async () => {
    // The pre-clock-out window used to be completely unguarded: the
    // prevent_attendance_status_backdating trigger only fires once
    // `old.jam_pulang is not null`, so while a record was open an employee
    // could rewrite `status` at will through attendances_update's
    // `employee_id = auth.uid()` clause. 0011 removes that clause.
    const db = createServiceRoleSupabaseClient();
    const { data: attendance } = await db
      .from("attendances")
      .insert({
        employee_id: karyawanA.id,
        tanggal: "2026-12-11",
        jam_masuk: "2026-12-11T03:00:00Z",
        status: "terlambat",
      })
      .select()
      .single();

    const clientA = await signInAs(karyawanA.email, password);
    // A USING-clause rejection filters the row out before it is reached, so
    // PostgREST answers 200 with zero affected rows rather than an error.
    // `.select()` is what makes that observable.
    const { data: updated, error } = await clientA
      .from("attendances")
      .update({ status: "tepat_waktu" })
      .eq("id", attendance.id)
      .select();
    expect(error).toBeNull();
    expect(updated, "expected the update to match zero rows under RLS").toEqual([]);

    const { data: after } = await db
      .from("attendances")
      .select("status")
      .eq("id", attendance.id)
      .single();
    expect(after!.status).toBe("terlambat");
  }, 30_000);

  it("blocks a karyawan from writing a clock-out (jam_pulang + status) directly", async () => {
    // Same row shape the real clockOut() writes. Before 0011 this was the
    // legitimate client path; now it is only reachable via the service role.
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
    const { data: updated, error } = await clientA
      .from("attendances")
      .update({ jam_pulang: "2026-12-01T10:00:00Z", status: "pulang_cepat" })
      .eq("id", attendance.id)
      .select();
    expect(error).toBeNull();
    expect(updated).toEqual([]);

    const { data: after } = await db
      .from("attendances")
      .select("status, jam_pulang")
      .eq("id", attendance.id)
      .single();
    expect(after!.status).toBe("terlambat");
    expect(after!.jam_pulang).toBeNull();
  }, 30_000);

  it("blocks an atasan from writing attendances directly (0011 uses the hr_admin tier, not is_admin_role)", async () => {
    // 0009 made `atasan` an admin via is_admin_role(), which is what the old
    // attendances_update policy checked. 0011 deliberately gates on the
    // stricter is_hr_admin_role() -- direct attendance writes are exactly the
    // anti-fraud-sensitive class 0010 already carved out for HR only.
    const db = createServiceRoleSupabaseClient();
    const { data: attendance } = await db
      .from("attendances")
      .insert({
        employee_id: atasanD.id,
        tanggal: "2026-12-03",
        jam_masuk: "2026-12-03T01:00:00Z",
        jam_pulang: "2026-12-03T10:00:00Z",
        status: "pulang_cepat",
      })
      .select()
      .single();

    const clientD = await signInAs(atasanD.email, password);
    const { data: updated, error } = await clientD
      .from("attendances")
      .update({ status: "tepat_waktu" })
      .eq("id", attendance.id)
      .select();
    expect(error).toBeNull();
    expect(updated, "expected the atasan update to match zero rows under RLS").toEqual([]);

    const { error: insertError } = await clientD.from("attendances").insert({
      employee_id: atasanD.id,
      tanggal: "2026-12-12",
      jam_masuk: "2026-12-12T02:00:00Z",
      status: "tepat_waktu",
    });
    expect(insertError, "expected the atasan insert to be rejected").not.toBeNull();
    expect(insertError!.code).toBe("42501");

    const { data: after } = await db
      .from("attendances")
      .select("status")
      .eq("id", attendance.id)
      .single();
    expect(after!.status).toBe("pulang_cepat");
  }, 30_000);

  it("still lets a karyawan READ their own attendances (0011 left attendances_select untouched)", async () => {
    // Positive control: 0011 removed only the write path. absen/page.tsx and
    // riwayat/page.tsx read with the user-scoped client and must keep working.
    const db = createServiceRoleSupabaseClient();
    const { data: attendance } = await db
      .from("attendances")
      .insert({
        employee_id: karyawanA.id,
        tanggal: "2026-12-13",
        jam_masuk: "2026-12-13T02:00:00Z",
        status: "tepat_waktu",
      })
      .select()
      .single();

    const clientA = await signInAs(karyawanA.email, password);
    const { data, error } = await clientA
      .from("attendances")
      .select("id, status")
      .eq("id", attendance.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("tepat_waktu");
  }, 30_000);

  it("lets the service role insert AND clock out an attendance row (clockIn/clockOut are unaffected by 0011)", async () => {
    // The service role bypasses RLS entirely, which is why 0011 is invisible
    // to clockIn()/clockOut(): both are only ever called with
    // createServiceRoleSupabaseClient() from the Server Actions in
    // src/app/(employee)/absen/actions.ts. This test is the standing proof
    // that locking the client out did not lock the app out.
    const db = createServiceRoleSupabaseClient();
    const { data: attendance, error: insertError } = await db
      .from("attendances")
      .insert({
        employee_id: karyawanA.id,
        tanggal: "2026-12-14",
        jam_masuk: "2026-12-14T02:00:00Z",
        lokasi_masuk: "(-6.2,106.8)",
        foto_masuk_url: `${karyawanA.id}/masuk-1.jpg`,
        status: "tepat_waktu",
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    // The single atomic clock-out UPDATE clockOut() performs, including the
    // `.is("jam_pulang", null)` compare-and-set guard.
    const { data: updated, error: updateError } = await db
      .from("attendances")
      .update({
        jam_pulang: "2026-12-14T11:00:00Z",
        lokasi_pulang: "(-6.2,106.8)",
        foto_pulang_url: `${karyawanA.id}/pulang-1.jpg`,
        status: "tepat_waktu",
      })
      .eq("id", attendance!.id)
      .is("jam_pulang", null)
      .select()
      .single();
    expect(updateError).toBeNull();
    expect(updated!.jam_pulang).not.toBeNull();
  }, 30_000);
});
