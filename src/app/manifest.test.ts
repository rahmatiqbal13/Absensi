import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/branding/get-app-settings", () => ({
  getAppSettings: async () => ({
    namaInstansi: "PT Maju Jaya",
    namaSingkat: "Maju",
    tagline: null,
    warnaAksen: "#123456",
  }),
}));

import manifest from "./manifest";

describe("web app manifest", () => {
  it("is installable and branded per instansi", async () => {
    const m = await manifest();
    expect(m).toMatchObject({ name: "PT Maju Jaya", short_name: "Maju", display: "standalone", start_url: "/", theme_color: "#123456" });
    const sizes = m.icons!.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  });
});
