// tests/integration/purge-expired-photos.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL; // https://<ref>.supabase.co/functions/v1
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const suffix = Date.now();

// Partial-failure contract (verified by reading index.ts, not exercised here —
// it needs Storage mocking): when a storage `remove()` fails for a path, the
// row that owns it is NOT nulled, so it still matches the `.or()` filter and is
// retried on the next run. `deletedPhotos` counts objects Storage actually
// removed (`remove()` data length), not the batch size. If either DB null-out
// errors, the function returns 500.

describe.skipIf(!FUNCTIONS_URL)("purge-expired-photos", () => {
  let branchId: string;
  let employeeId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db.from("branches").insert({ nama: `Cabang Purge ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = branch!.id;
    const { data: u } = await db.auth.admin.createUser({ email: `purge.${suffix}@test.local`, password: "TestPassword123!", email_confirm: true });
    employeeId = u!.user!.id;
    await db.from("employees").insert({
      id: employeeId, nama: "Purge", email: `purge.${suffix}@test.local`, branch_id: branchId,
      jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: "karyawan",
    });
  });

  it("deletes an expired photo and nulls its columns, leaving a future-dated one alone", async () => {
    const db = createServiceRoleSupabaseClient();
    const expiredPath = `${employeeId}/masuk-${suffix}.jpg`;
    const freshPath = `${employeeId}/pulang-${suffix}.jpg`;
    await db.storage.from("attendance-photos").upload(expiredPath, new Blob(["x"], { type: "image/jpeg" }));
    await db.storage.from("attendance-photos").upload(freshPath, new Blob(["y"], { type: "image/jpeg" }));

    const { data: att } = await db.from("attendances").insert({
      employee_id: employeeId, tanggal: "2026-05-01", status: "tepat_waktu",
      foto_masuk_url: expiredPath, foto_masuk_expires_at: "2020-01-01T00:00:00Z",
      foto_pulang_url: freshPath, foto_pulang_expires_at: "2099-01-01T00:00:00Z",
    }).select().single();

    const res = await fetch(`${FUNCTIONS_URL}/purge-expired-photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedPhotos).toBeGreaterThanOrEqual(1);

    const { data: row } = await db.from("attendances").select("foto_masuk_url, foto_masuk_expires_at, foto_pulang_url").eq("id", att!.id).single();
    expect(row!.foto_masuk_url).toBeNull();
    expect(row!.foto_masuk_expires_at).toBeNull();
    expect(row!.foto_pulang_url).toBe(freshPath); // untouched

    const { data: listExpired } = await db.storage.from("attendance-photos").list(employeeId);
    expect(listExpired?.some((f) => f.name === `masuk-${suffix}.jpg`)).toBe(false);
    expect(listExpired?.some((f) => f.name === `pulang-${suffix}.jpg`)).toBe(true);
  });

  it("rejects a call without the service key", async () => {
    const res = await fetch(`${FUNCTIONS_URL}/purge-expired-photos`, { method: "POST" });
    expect(res.status).toBe(403);
  });
});
