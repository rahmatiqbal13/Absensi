// tests/integration/app-settings-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

describe("app_settings RLS (0026)", () => {
  let branchId: string;
  let superEmail: string;
  let hrEmail: string;

  type BrandingRow = {
    nama_instansi: string; nama_singkat: string; tagline: string | null;
    logo_url: string | null; alamat: string | null; telepon: string | null;
    email: string | null; warna_aksen: string;
  };
  let original: BrandingRow;

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: b } = await db.from("branches")
      .insert({ nama: `Cabang AppSettings ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = b!.id;
    const seeds = [
      { key: "s", email: `super.appset.${suffix}@test.local`, role: "super_admin" },
      { key: "h", email: `hr.appset.${suffix}@test.local`, role: "hr_admin" },
    ] as const;
    for (const s of seeds) {
      const { data: u } = await db.auth.admin.createUser({ email: s.email, password, email_confirm: true });
      await db.from("employees").insert({
        id: u!.user!.id, nama: s.key, email: s.email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role: s.role,
      });
    }
    superEmail = seeds[0].email;
    hrEmail = seeds[1].email;
    const { data: row } = await db
      .from("app_settings")
      .select("nama_instansi, nama_singkat, tagline, logo_url, alamat, telepon, email, warna_aksen")
      .eq("id", 1)
      .single();
    original = row as BrandingRow;
  });

  afterAll(async () => {
    const db = createServiceRoleSupabaseClient();
    await db.from("app_settings").update({
      nama_instansi: original.nama_instansi, nama_singkat: original.nama_singkat,
      tagline: original.tagline, logo_url: original.logo_url, alamat: original.alamat,
      telepon: original.telepon, email: original.email, warna_aksen: original.warna_aksen,
    }).eq("id", 1);
  });

  it("rejects a second row (PK) and id != 1 (check)", async () => {
    const db = createServiceRoleSupabaseClient();
    const dup = await db.from("app_settings").insert({ id: 1 });
    expect(dup.error?.code).toBe("23505");
    const bad = await db.from("app_settings").insert({ id: 2 });
    expect(bad.error?.code).toBe("23514");
  });

  it("blocks an hr_admin from updating branding (RLS-filtered no-op)", async () => {
    const client = await signInAs(hrEmail);
    const { data: updated, error } = await client.from("app_settings")
      .update({ nama_instansi: "HR Tried This" }).eq("id", 1).select();
    expect(error).toBeNull();
    expect(updated ?? []).toHaveLength(0);
    const db = createServiceRoleSupabaseClient();
    const { data: row } = await db.from("app_settings").select("nama_instansi").eq("id", 1).single();
    expect(row!.nama_instansi).not.toBe("HR Tried This");
  });

  it("lets a super_admin update branding", async () => {
    const client = await signInAs(superEmail);
    const { data: updated, error } = await client.from("app_settings")
      .update({ nama_instansi: `Instansi ${suffix}` }).eq("id", 1).select();
    expect(error).toBeNull();
    expect(updated ?? []).toHaveLength(1);
  });

  it("lets anyone read branding (public select)", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.from("app_settings").select("nama_instansi").eq("id", 1).single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("blocks an hr_admin from uploading to the branding bucket", async () => {
    const client = await signInAs(hrEmail);
    const { error } = await client.storage.from("branding")
      .upload(`test-${suffix}.png`, new Blob(["x"], { type: "image/png" }));
    expect(error).not.toBeNull();
  });

  it("lets a super_admin upload to and delete from the branding bucket", async () => {
    const client = await signInAs(superEmail);
    const path = `test-super-${suffix}.png`;
    const up = await client.storage.from("branding")
      .upload(path, new Blob(["x"], { type: "image/png" }), { upsert: true });
    expect(up.error).toBeNull();
    const del = await client.storage.from("branding").remove([path]);
    expect(del.error).toBeNull();
  });
});
