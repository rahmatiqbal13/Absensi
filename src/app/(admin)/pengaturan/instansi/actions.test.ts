import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { role: string } = { role: "super_admin" };
const updateResult = { error: null as unknown };
const upsertSpy = vi.fn((_v?: unknown) => Promise.resolve(updateResult));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ update: (v: unknown) => { upsertSpy(v); return { eq: () => Promise.resolve(updateResult) }; } }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: "logo-1.png" }, error: null }),
        remove: () => Promise.resolve({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      }),
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentEmployee: async () => (state.role ? { id: "u1", role: state.role } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveAppSettings, uploadLogo } from "./actions";

function fd(entries: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => { state.role = "super_admin"; upsertSpy.mockClear(); });

describe("saveAppSettings", () => {
  it("refuses a non-super_admin before writing", async () => {
    state.role = "hr_admin";
    const r = await saveAppSettings(fd({ nama_instansi: "X", nama_singkat: "X", warna_aksen: "#2563EB" }));
    expect(r).toEqual({ ok: false, error: "Tidak diizinkan." });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed accent hex", async () => {
    const r = await saveAppSettings(fd({ nama_instansi: "X", nama_singkat: "X", warna_aksen: "blue" }));
    expect(r).toEqual({ ok: false, error: "Format warna aksen harus #RRGGBB." });
  });

  it("rejects an empty nama_instansi", async () => {
    const r = await saveAppSettings(fd({ nama_instansi: "  ", nama_singkat: "X", warna_aksen: "#2563EB" }));
    expect(r.ok).toBe(false);
  });

  it("normalizes the hex and updates on a valid payload", async () => {
    const r = await saveAppSettings(fd({ nama_instansi: "PT Contoh", nama_singkat: "Contoh", warna_aksen: "#2563eb" }));
    expect(r).toEqual({ ok: true });
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ warna_aksen: "#2563EB", nama_instansi: "PT Contoh" }));
  });
});

describe("uploadLogo", () => {
  it("rejects a non-image file", async () => {
    const r = await uploadLogo(fd({ logo: new File(["x"], "a.txt", { type: "text/plain" }) }));
    expect(r).toEqual({ ok: false, error: "Logo harus PNG, JPG, WEBP, atau SVG." });
  });
  it("rejects a file over 512 KB", async () => {
    const big = new File([new Uint8Array(520 * 1024)], "a.png", { type: "image/png" });
    const r = await uploadLogo(fd({ logo: big }));
    expect(r).toEqual({ ok: false, error: "Ukuran logo maksimal 512 KB." });
  });
});
