import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type Session } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

// This test hits the running dev server's route handlers. Skip unless set.
const BASE_URL = process.env.LAPORAN_BASE_URL; // e.g. http://localhost:3000

// @supabase/ssr stores the session in a `sb-<ref>-auth-token` cookie as a
// `base64-`-prefixed JSON blob, chunked at ~3180 chars. Mirrors payslip-pdf.test.ts.
function sessionCookie(session: Session): string {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const payload = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const chunkSize = 3180;
  if (payload.length <= chunkSize) return `sb-${ref}-auth-token=${payload}`;
  const parts: string[] = [];
  for (let i = 0, n = 0; i < payload.length; i += chunkSize, n += 1) {
    parts.push(`sb-${ref}-auth-token.${n}=${payload.slice(i, i + chunkSize)}`);
  }
  return parts.join("; ");
}

describe.skipIf(!BASE_URL)("laporan export routes", () => {
  let adminCookie: string;
  let branchId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: `Cabang Export ${suffix}`, lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch!.id;
    await db.from("work_schedules").insert({
      branch_id: branchId,
      jam_masuk: "09:00",
      jam_pulang: "17:00",
      hari_kerja: [1, 2, 3, 4, 5],
      toleransi_terlambat_menit: 15,
    });
    const { data: u } = await db.auth.admin.createUser({
      email: `admin.export.${suffix}@test.local`,
      password,
      email_confirm: true,
    });
    await db.from("employees").insert({
      id: u!.user!.id,
      nama: "Admin Export",
      email: `admin.export.${suffix}@test.local`,
      branch_id: branchId,
      jabatan: "HR",
      status_kontrak: "tetap",
      tanggal_mulai_kerja: "2026-01-01",
      role: "hr_admin",
    });
    const c = createClient(SUPABASE_URL, ANON_KEY);
    const { data } = await c.auth.signInWithPassword({
      email: `admin.export.${suffix}@test.local`,
      password,
    });
    adminCookie = sessionCookie(data.session!);
  });

  it("serves CSV for an admin", async () => {
    const res = await fetch(
      `${BASE_URL}/laporan/csv?cabang=${branchId}&dari=2026-08-01&sampai=2026-08-31`,
      { headers: { cookie: adminCookie } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("Nama,Hadir,Terlambat");
  });

  it("serves PDF for an admin", async () => {
    const res = await fetch(
      `${BASE_URL}/laporan/pdf?cabang=${branchId}&dari=2026-08-01&sampai=2026-08-31`,
      { headers: { cookie: adminCookie } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);
  });

  it("400s without cabang", async () => {
    const res = await fetch(
      `${BASE_URL}/laporan/csv?dari=2026-08-01&sampai=2026-08-31`,
      { headers: { cookie: adminCookie } },
    );
    expect(res.status).toBe(400);
  });
});
