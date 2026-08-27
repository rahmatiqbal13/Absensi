// tests/integration/payroll-rpc.test.ts
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
  if (error || !data.session) throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  return client;
}

function payslipRows(employeeId: string) {
  return [
    {
      employee_id: employeeId,
      gaji_pokok: 10_000_000,
      hari_kerja_efektif: 20,
      gaji_harian: 500_000,
      total_potongan_absensi: 0,
      gaji_akhir: 10_000_000,
      rincian_harian: [],
    },
  ];
}

describe("payroll RPC", () => {
  let branchId: string;
  let periodId: string;
  let karyawan: { id: string; email: string };
  let atasan: { id: string; email: string };
  let hrAdmin: { id: string; email: string };

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: branch } = await db
      .from("branches")
      .insert({ nama: `Cabang Payroll ${suffix}`, lat: -6.2, long: 106.8 })
      .select()
      .single();
    branchId = branch!.id;

    const seeds = [
      { key: "atasan", email: `atasan.payroll.${suffix}@test.local`, role: "atasan" },
      { key: "karyawan", email: `karyawan.payroll.${suffix}@test.local`, role: "karyawan" },
      { key: "hrAdmin", email: `hradmin.payroll.${suffix}@test.local`, role: "hr_admin" },
    ] as const;

    const ids: Record<string, string> = {};
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      ids[s.key] = u!.user!.id;
      await db.from("employees").insert({
        id: ids[s.key], nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
      });
    }
    atasan = { id: ids.atasan, email: seeds[0].email };
    karyawan = { id: ids.karyawan, email: seeds[1].email };
    hrAdmin = { id: ids.hrAdmin, email: seeds[2].email };

    const { data: period } = await db
      .from("payroll_periods")
      .insert({ branch_id: branchId, bulan: 8, tahun: 2026 })
      .select()
      .single();
    periodId = period!.id;
  });

  it("lets an hr_admin generate payslips and regenerate without duplicating", async () => {
    const client = await signInAs(hrAdmin.email);

    const { data: count1, error: e1 } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(e1).toBeNull();
    expect(count1).toBe(1);

    // regenerate -> still exactly one row (delete + reinsert)
    const { error: e2 } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(e2).toBeNull();

    const db = createServiceRoleSupabaseClient();
    const { data: slips } = await db.from("payslips").select("id").eq("payroll_period_id", periodId);
    expect(slips).toHaveLength(1);
  });

  it("blocks a non-hr-admin (atasan) from generating", async () => {
    const client = await signInAs(atasan.email);
    const { error } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("only hr admin may run payroll");
  });

  it("finalizes a draft period with payslips, then blocks a second finalize and any regenerate", async () => {
    const client = await signInAs(hrAdmin.email);
    await client.rpc("generate_payroll", { p_period_id: periodId, p_rows: payslipRows(karyawan.id) });

    const { error: finErr } = await client.rpc("finalize_payroll", { p_period_id: periodId });
    expect(finErr).toBeNull();

    const { error: fin2 } = await client.rpc("finalize_payroll", { p_period_id: periodId });
    expect(fin2!.message).toContain("already finalized");

    const { error: regen } = await client.rpc("generate_payroll", {
      p_period_id: periodId,
      p_rows: payslipRows(karyawan.id),
    });
    expect(regen!.message).toContain("payroll period is finalized");
  });

  it("refuses to finalize a period with no payslips", async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: emptyPeriod } = await db
      .from("payroll_periods")
      .insert({ branch_id: branchId, bulan: 9, tahun: 2026 })
      .select()
      .single();

    const client = await signInAs(hrAdmin.email);
    const { error } = await client.rpc("finalize_payroll", { p_period_id: emptyPeriod!.id });
    expect(error!.message).toContain("no payslips");
  });

  it("denies both RPCs to an unauthenticated anon-key caller", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY); // no session
    const gen = await anon.rpc("generate_payroll", { p_period_id: periodId, p_rows: [] });
    const fin = await anon.rpc("finalize_payroll", { p_period_id: periodId });
    expect(gen.error).not.toBeNull();
    expect(fin.error).not.toBeNull();
    // With EXECUTE revoked from anon, PostgREST cannot see the function for this
    // role: PGRST202 ("Could not find the function"), or a 42501 permission error.
    for (const err of [gen.error!, fin.error!]) {
      const m = err.message.toLowerCase();
      expect(err.code === "PGRST202" || m.includes("permission") || m.includes("not find")).toBe(true);
    }
  });
});
