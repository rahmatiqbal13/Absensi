import { describe, it, expect, vi } from "vitest";

let me: unknown = { id: "e1" };
const tables: Record<string, unknown> = {
  employees: { nama: "Budi" },
  attendances: [{ tanggal: "2026-11-18", status: "tepat_waktu", foto_masuk_url: "e1/masuk-1.jpg", foto_pulang_url: null }],
};
function q(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve({ data: tables[table] ?? null, error: null });
  b.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(r);
  return b;
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: (t: string) => q(t) }) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentEmployee: async () => me }));

import { GET } from "./route";

describe("GET /profil/data-saya", () => {
  it("refuses without a session", async () => {
    me = null;
    expect((await GET()).status).toBe(401);
    me = { id: "e1" };
  });

  it("returns the employee's own data as a JSON download, without photo paths", async () => {
    const res = await GET();
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="data-saya-/);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.profil).toEqual({ nama: "Budi" });
    expect(body.absensi[0]).toMatchObject({ tanggal: "2026-11-18", foto_masuk: expect.stringMatching(/tersimpan/) });
    expect(text).not.toContain("e1/masuk-1.jpg");
    for (const k of ["persetujuan", "kontrak", "cuti", "koreksi_absensi", "slip_gaji"]) expect(body).toHaveProperty(k);
  });
});
