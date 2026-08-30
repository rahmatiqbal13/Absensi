// @vitest-environment node
// Real Supabase Storage integration: needs native (undici) Blob/FormData/fetch so
// an uploaded blob's `image/jpeg` type survives into the multipart part. Under the
// default jsdom environment the type is dropped and the 0030 `allowed_mime_types`
// guard rejects every upload as `text/plain;charset=UTF-8`.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "../../src/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = "TestPassword123!";
const suffix = Date.now();
const BUCKET = "profile-photos";

async function signInAs(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signInAs(${email}) failed: ${error?.message}`);
  return client;
}

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/jpeg" });

describe("profile-photos RLS (0029 + 0030)", () => {
  let branchId: string;
  const ids: Record<string, string> = {};
  const emails: Record<string, string> = {};

  beforeAll(async () => {
    const db = createServiceRoleSupabaseClient();
    const { data: b } = await db.from("branches")
      .insert({ nama: `Cabang Foto ${suffix}`, lat: -6.2, long: 106.8 }).select().single();
    branchId = b!.id;
    for (const [key, role] of [["a", "karyawan"], ["b", "karyawan"], ["hr", "hr_admin"], ["atasan", "atasan"]] as const) {
      const email = `${key}.foto.${suffix}@test.local`;
      const { data: u } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      ids[key] = u!.user!.id;
      emails[key] = email;
      await db.from("employees").insert({
        id: ids[key], nama: key, email, branch_id: branchId,
        jabatan: "Staff", status_kontrak: "tetap", tanggal_mulai_kerja: "2026-01-01", role,
      });
    }
  });

  afterAll(async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).remove([
      `${ids.a}/avatar.jpg`, `${ids.b}/avatar.jpg`, `${ids.a}/junk.bin`,
    ]);
  });

  it("lets a karyawan upload, read, and delete their own avatar", async () => {
    const client = await signInAs(emails.a);
    const path = `${ids.a}/avatar.jpg`;
    const up = await client.storage.from(BUCKET).upload(path, png(), { contentType: "image/jpeg", upsert: true });
    expect(up.error).toBeNull();
    const dl = await client.storage.from(BUCKET).download(path);
    expect(dl.error).toBeNull();
    const del = await client.storage.from(BUCKET).remove([path]);
    expect(del.error).toBeNull();
  });

  it("blocks a karyawan from uploading under another employee's prefix", async () => {
    const client = await signInAs(emails.a);
    const { error } = await client.storage.from(BUCKET)
      .upload(`${ids.b}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    expect(error).not.toBeNull();
  });

  it("blocks a karyawan from uploading a non-avatar object name under their own prefix", async () => {
    const client = await signInAs(emails.a);
    const { error } = await client.storage.from(BUCKET)
      .upload(`${ids.a}/junk.bin`, png(), { contentType: "image/jpeg", upsert: true });
    expect(error).not.toBeNull();
  });

  it("blocks a karyawan from reading another employee's avatar", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).upload(`${ids.b}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    const client = await signInAs(emails.a);
    const { data } = await client.storage.from(BUCKET).createSignedUrl(`${ids.b}/avatar.jpg`, 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });

  it("blocks an atasan from signing another employee's avatar", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).upload(`${ids.a}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    const client = await signInAs(emails.atasan);
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(`${ids.a}/avatar.jpg`, 60);
    expect(error ?? data === null).toBeTruthy();
  });

  it("lets an hr_admin read any employee's avatar", async () => {
    const db = createServiceRoleSupabaseClient();
    await db.storage.from(BUCKET).upload(`${ids.a}/avatar.jpg`, png(), { contentType: "image/jpeg", upsert: true });
    const client = await signInAs(emails.hr);
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(`${ids.a}/avatar.jpg`, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });
});
