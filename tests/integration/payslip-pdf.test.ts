import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type Session } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();

// This test hits the running dev server's route handler. Skip unless BASE_URL is set.
const BASE_URL = process.env.PAYSLIP_PDF_BASE_URL; // e.g. http://localhost:3000

// @supabase/ssr stores the session in a `sb-<ref>-auth-token` cookie as a
// `base64-`-prefixed JSON blob, chunked at ~3180 chars. The route handler's
// server client reads it back through that same convention.
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

describe.skipIf(!BASE_URL)("payslip PDF route", () => {
  let ownerCookie: string;
  let strangerCookie: string;
  let payslipId: string;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db.from("branches").insert({ nama: `PDF ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    const mk = async (role: string, key: string) => {
      const { data: u } = await db.auth.admin.createUser({ email: `${key}.pdf.${suffix}@test.local`, password, email_confirm: true });
      await db.from("employees").insert({
        id: u!.user!.id, nama: key, email: `${key}.pdf.${suffix}@test.local`, branch_id: branch!.id,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role,
      });
      return u!.user!.id;
    };
    const ownerId = await mk("karyawan", "owner");
    await mk("karyawan", "stranger");

    const { data: period } = await db.from("payroll_periods").insert({ branch_id: branch!.id, bulan: 8, tahun: 2026 }).select().single();
    const { data: slip } = await db.from("payslips").insert({
      payroll_period_id: period!.id, employee_id: ownerId, gaji_pokok: 10_000_000,
      hari_kerja_efektif: 20, gaji_harian: 500_000, total_potongan_absensi: 0, gaji_akhir: 10_000_000, rincian_harian: [],
    }).select().single();
    payslipId = slip!.id;

    const login = async (key: string) => {
      const c = createClient(SUPABASE_URL, ANON_KEY);
      const { data } = await c.auth.signInWithPassword({ email: `${key}.pdf.${suffix}@test.local`, password });
      return sessionCookie(data.session!);
    };
    ownerCookie = await login("owner");
    strangerCookie = await login("stranger");
  });

  it("returns a document for the payslip owner", async () => {
    const res = await fetch(`${BASE_URL}/slip-gaji/${payslipId}/pdf`, { headers: { cookie: ownerCookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(500);
  });

  it("returns 404 for a stranger (RLS hides the row)", async () => {
    const res = await fetch(`${BASE_URL}/slip-gaji/${payslipId}/pdf`, { headers: { cookie: strangerCookie } });
    expect(res.status).toBe(404);
  });
});
