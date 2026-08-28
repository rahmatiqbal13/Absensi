import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/branding/get-app-settings", () => ({
  getAppSettings: async () => ({
    namaInstansi: "X", namaSingkat: "X", tagline: null, logoUrl: null,
    alamat: null, telepon: null, email: null, warnaAksen: "#0F766E",
  }),
}));

import { BrandStyle } from "./brand-style";

describe("BrandStyle", () => {
  it("emits a style tag setting --primary from the derived accent", async () => {
    const ui = await BrandStyle();
    const { container } = render(ui);
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("--primary: #0F766E");
    expect(style!.textContent).toContain(":root");
    expect(style!.textContent).toContain(".dark");
    // #0F766E is dark -> white foreground
    expect(style!.textContent).toContain("--primary-foreground: #FFFFFF");
  });
});
