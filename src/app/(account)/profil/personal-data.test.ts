import { describe, it, expect, vi, beforeEach } from "vitest";

let before: { nomor_pegawai: string | null } | null = { nomor_pegawai: null };
let after: { nomor_pegawai: string | null }[] = [{ nomor_pegawai: "19950412202307001" }];
const update = vi.fn();
function q() {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = async () => ({ data: before, error: null });
  b.update = (v: unknown) => {
    update(v);
    return { eq: () => ({ select: async () => ({ data: after, error: null }) }) };
  };
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ from: () => q() }),
  createServiceRoleSupabaseClient: () => ({}),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => ({ id: "e1", email: "e1@x" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePersonalData } from "./actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => update.mockReset());

describe("updatePersonalData", () => {
  it("saves data diri and reports a freshly assigned nomor pegawai", async () => {
    before = { nomor_pegawai: null };
    after = [{ nomor_pegawai: "19950412202307001" }];
    const r = await updatePersonalData(fd({ tempat_lahir: "Surabaya", tanggal_lahir: "1995-04-12", jenis_kelamin: "L" }));
    expect(r).toEqual({ ok: true, nomorPegawai: "19950412202307001", nomorBaru: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ tempat_lahir: "Surabaya", tanggal_lahir: "1995-04-12" }));
    // Never sends a nomor itself: the database assigns it.
    expect(update.mock.calls[0][0]).not.toHaveProperty("nomor_pegawai");
  });

  it("does not announce a number the employee already had", async () => {
    before = { nomor_pegawai: "19950412202307001" };
    after = [{ nomor_pegawai: "19950412202307001" }];
    expect(await updatePersonalData(fd({ agama: "Islam" }))).toMatchObject({ ok: true, nomorBaru: false });
  });

  it("rejects invalid input before writing", async () => {
    expect((await updatePersonalData(fd({ tanggal_lahir: "2999-01-01" }))).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
