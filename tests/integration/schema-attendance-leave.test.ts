import { describe, it, expect, beforeAll } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

describe("attendance & leave schema", () => {
  let employeeId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: "Cabang A", lat: -6.2, long: 106.8 })
      .select()
      .single();
    const uniqueEmail = `karyawan.schema+${Date.now()}@test.local`;
    const { data: authUser } = await db.auth.admin.createUser({
      email: uniqueEmail,
      password: "TestPassword123!",
      email_confirm: true,
    });
    const { data: employee } = await db
      .from("employees")
      .insert({
        id: authUser.user!.id,
        nama: "Test Karyawan",
        email: uniqueEmail,
        branch_id: branch.id,
        jabatan: "Staff",
        status_kontrak: "tetap",
        tanggal_mulai_kerja: "2026-01-01",
        role: "karyawan",
      })
      .select()
      .single();
    employeeId = employee!.id;
  });

  it("enforces one attendance row per employee per day", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: first, error: firstErr } = await db
      .from("attendances")
      .insert({
        employee_id: employeeId,
        tanggal: "2026-09-01",
        status: "tepat_waktu",
        metode_masuk: "qr",
        metode_pulang: "gps",
      })
      .select()
      .single();
    expect(firstErr).toBeNull();
    expect(first.metode_masuk).toBe("qr");
    expect(first.metode_pulang).toBe("gps");

    const { error: dupErr } = await db.from("attendances").insert({
      employee_id: employeeId,
      tanggal: "2026-09-01",
      status: "terlambat",
    });
    expect(dupErr).not.toBeNull();
  });

  it("rejects an attendance metode outside ('gps','qr')", async () => {
    const db = createServiceRoleSupabaseClient();
    const { error } = await db.from("attendances").insert({
      employee_id: employeeId,
      tanggal: "2026-09-02",
      status: "tepat_waktu",
      metode_masuk: "manual",
    });
    expect(error).not.toBeNull();
  });

  it("computes saldo_sisa as a generated column", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data, error } = await db
      .from("leave_balances")
      .insert({ employee_id: employeeId, tahun: 2026, saldo_awal: 12, saldo_terpakai: 3 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(Number(data.saldo_sisa)).toBe(9);
  });
});
