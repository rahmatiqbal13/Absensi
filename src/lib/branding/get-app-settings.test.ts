import { describe, it, expect, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("../supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  }),
}));

import { getAppSettingsUncached, APP_SETTINGS_DEFAULTS } from "./get-app-settings";

describe("getAppSettings", () => {
  it("maps a row to camelCase and resolves the logo public URL", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        nama_instansi: "PT Contoh", nama_singkat: "Contoh", tagline: "Hadir tepat waktu",
        logo_url: "logo-123.png", alamat: "Jl. Mawar 1", telepon: "021-1", email: "hi@contoh.id",
        warna_aksen: "#0F766E",
      },
      error: null,
    });
    const s = await getAppSettingsUncached();
    expect(s.namaInstansi).toBe("PT Contoh");
    expect(s.namaSingkat).toBe("Contoh");
    expect(s.logoUrl).toBe("https://cdn.test/logo-123.png");
    expect(s.warnaAksen).toBe("#0F766E");
  });

  it("returns defaults (never throws) on a query error", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const s = await getAppSettingsUncached();
    expect(s).toEqual(APP_SETTINGS_DEFAULTS);
  });

  it("returns defaults when the row is missing", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const s = await getAppSettingsUncached();
    expect(s.namaInstansi).toBe(APP_SETTINGS_DEFAULTS.namaInstansi);
    expect(s.logoUrl).toBeNull();
  });
});
