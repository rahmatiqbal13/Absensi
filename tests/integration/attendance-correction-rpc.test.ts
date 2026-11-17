import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

// apply_attendance_correction + attendance_corrections RLS (migration 0041).
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

describe("attendance corrections", () => {
  let branchId: string;
  let karyawan: { id: string; email: string };
  let atasan: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang Koreksi", lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.koreksi.${suffix}@test.local`, role: "atasan" },
      { key: "karyawan", email: `karyawan.koreksi.${suffix}@test.local`, role: "karyawan" },
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
        branch_id: branchId,
        jabatan: "Staff",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2020-01-01",
        role: seed.role,
        atasan_id: seed.key === "karyawan" ? ids.atasan : null,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    karyawan = { id: ids.karyawan, email: seeds[1].email };
  });

  async function newCorrection(tanggal: string) {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db
      .from("attendance_corrections")
      .insert({
        employee_id: karyawan.id,
        tanggal,
        jam_masuk: `${tanggal}T01:00:00Z`, // 08:00 WIB
        jam_pulang: `${tanggal}T10:00:00Z`, // 17:00 WIB
        alasan: "Lupa absen",
        approver_id: atasan.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id as string;
  }

  it("approving creates the missing attendance row, marked as koreksi, and audits", async () => {
    const db = createServiceRoleSupabaseClient();
    const id = await newCorrection("2025-03-03");
    const { error } = await db.rpc("apply_attendance_correction", {
      p_correction_id: id,
      p_decider_id: atasan.id,
      p_approve: true,
      p_status: "tepat_waktu",
      p_catatan: null,
    });
    expect(error).toBeNull();

    const { data: att } = await db
      .from("attendances")
      .select("jam_masuk, jam_pulang, status, metode_masuk, metode_pulang")
      .eq("employee_id", karyawan.id)
      .eq("tanggal", "2025-03-03")
      .single();
    expect(att!.status).toBe("tepat_waktu");
    expect(att!.metode_masuk).toBe("koreksi");
    expect(att!.metode_pulang).toBe("koreksi");

    const { data: corr } = await db.from("attendance_corrections").select("status, decided_by").eq("id", id).single();
    expect(corr).toEqual({ status: "approved", decided_by: atasan.id });

    const { data: audit } = await db
      .from("audit_logs")
      .select("aksi")
      .eq("aksi", "attendance_correction_approved")
      .eq("target_employee_id", karyawan.id);
    expect(audit!.length).toBeGreaterThan(0);
  });

  it("updates an existing row and only marks the half that changed", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.from("attendances").insert({
      employee_id: karyawan.id,
      tanggal: "2025-03-04",
      jam_masuk: "2025-03-04T01:00:00Z",
      status: "tepat_waktu",
      metode_masuk: "gps",
    });
    const id = await newCorrection("2025-03-04"); // same masuk, adds pulang
    const { error } = await db.rpc("apply_attendance_correction", {
      p_correction_id: id,
      p_decider_id: atasan.id,
      p_approve: true,
      p_status: "tepat_waktu",
      p_catatan: null,
    });
    expect(error).toBeNull();
    const { data: att } = await db
      .from("attendances")
      .select("metode_masuk, metode_pulang, jam_pulang")
      .eq("employee_id", karyawan.id)
      .eq("tanggal", "2025-03-04")
      .single();
    expect(att!.metode_masuk).toBe("gps");
    expect(att!.metode_pulang).toBe("koreksi");
    expect(att!.jam_pulang).not.toBeNull();
  });

  it("refuses self-approval and a second decision", async () => {
    const db = createServiceRoleSupabaseClient();
    const id = await newCorrection("2025-03-05");
    const self = await db.rpc("apply_attendance_correction", {
      p_correction_id: id,
      p_decider_id: karyawan.id,
      p_approve: true,
      p_status: "tepat_waktu",
      p_catatan: null,
    });
    expect(self.error?.message).toContain("self-approval is not allowed");

    await db.rpc("apply_attendance_correction", {
      p_correction_id: id,
      p_decider_id: atasan.id,
      p_approve: false,
      p_status: null,
      p_catatan: "Tidak sesuai",
    });
    const again = await db.rpc("apply_attendance_correction", {
      p_correction_id: id,
      p_decider_id: atasan.id,
      p_approve: true,
      p_status: "tepat_waktu",
      p_catatan: null,
    });
    expect(again.error?.message).toContain("correction is not pending");
  });

  it("refuses to touch a day inside a finalized payroll period", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: period } = await db
      .from("payroll_periods")
      .insert({ branch_id: branchId, bulan: 2, tahun: 2025, status: "final" })
      .select("id")
      .single();
    let error: { message: string } | null = null;
    try {
      const id = await newCorrection("2025-02-10");
      ({ error } = await db.rpc("apply_attendance_correction", {
        p_correction_id: id,
        p_decider_id: atasan.id,
        p_approve: true,
        p_status: "tepat_waktu",
        p_catatan: null,
      }));
    } finally {
      // A payroll period keeps the test branch alive past teardown; remove it.
      await db.from("payroll_periods").delete().eq("id", period!.id);
    }
    expect(error?.message).toContain("payroll period is finalized");
    const { data: att } = await db
      .from("attendances")
      .select("id")
      .eq("employee_id", karyawan.id)
      .eq("tanggal", "2025-02-10");
    expect(att).toEqual([]);
  });

  it("allows only one pending request per employee per day", async () => {
    await newCorrection("2025-03-06");
    await expect(newCorrection("2025-03-06")).rejects.toMatchObject({ code: "23505" });
  });

  it("is not callable by signed-in users, and they cannot write corrections directly", async () => {
    const id = await newCorrection("2025-03-07");
    const atasanClient = await signInAs(atasan.email);
    const rpc = await atasanClient.rpc("apply_attendance_correction", {
      p_correction_id: id,
      p_decider_id: atasan.id,
      p_approve: true,
      p_status: "tepat_waktu",
      p_catatan: null,
    });
    expect(rpc.error).not.toBeNull();

    const karyawanClient = await signInAs(karyawan.email);
    const ins = await karyawanClient.from("attendance_corrections").insert({
      employee_id: karyawan.id,
      tanggal: "2025-03-08",
      jam_masuk: "2025-03-08T01:00:00Z",
      alasan: "x",
    });
    expect(ins.error).not.toBeNull();

    // But they can read their own.
    const { data: mine } = await karyawanClient.from("attendance_corrections").select("id").eq("id", id);
    expect(mine).toHaveLength(1);
  });
});
